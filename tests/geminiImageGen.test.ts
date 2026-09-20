import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { requestPhotoGeneration } from "@/lib/photoGeneration";
import { editImageWithGemini, getGeminiApiKey } from "@/lib/imageGen/gemini/client";
import { geminiImageGenProvider } from "@/lib/imageGen/gemini/provider";
import { buildGeminiEditPrompt, deriveChangeDetection, detectStructuralChange } from "@/lib/imageGen/gemini/prompt";
import { computeRequestSignature } from "@/lib/imageGen/cache";

const originalKey = process.env.IMAGE_GEN_API_KEY;
const originalFetch = global.fetch;

async function wipeDb() {
  await prisma.productRequirement.deleteMany();
  await prisma.photoGeneration.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.renovationPlan.deleteMany();
  await prisma.providerErrorLog.deleteMany();
  await prisma.project.deleteMany();
}

function fakePhotoBytes(): ArrayBuffer {
  return new TextEncoder().encode("fake-original-photo-bytes").buffer;
}

function mockPhotoResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null) },
    arrayBuffer: async () => fakePhotoBytes(),
    json: async () => ({})
  };
}

function mockGeminiOkResponse(imageBase64 = "ZmFrZS1nZW5lcmF0ZWQtaW1hZ2U=") {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      candidates: [
        {
          content: { parts: [{ inlineData: { mimeType: "image/png", data: imageBase64 } }] },
          finishReason: "STOP"
        }
      ]
    })
  };
}

// Routes based on URL: the photo URL vs. the Gemini generateContent endpoint.
function makeRouterFetch(geminiResponse: any) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("generativelanguage.googleapis.com")) return geminiResponse;
    return mockPhotoResponse();
  }) as any;
}

async function createProjectWithPlanAndPhoto(planOverrides: Record<string, any> = {}) {
  const project = await prisma.project.create({ data: { title: "Gemini test" } });
  const plan = await prisma.renovationPlan.create({
    data: {
      projectId: project.id,
      style: "moderní minimalismus",
      flooring: "vinylová podlaha, světlý dub",
      wallColor: "bílá",
      ...planOverrides
    }
  });
  const photo = await prisma.photo.create({
    data: { projectId: project.id, url: "https://example.test/listing/kitchen.jpg", sortOrder: 0, roomType: "KUCHYN" }
  });
  return { project, plan, photo };
}

describe("Gemini image-to-image provider", () => {
  beforeEach(async () => {
    await wipeDb();
  });
  afterEach(() => {
    process.env.IMAGE_GEN_API_KEY = originalKey;
    global.fetch = originalFetch;
  });
  afterAll(wipeDb);

  it("1. missing key: provider is PENDING_ACCESS and no generation is attempted — request is recorded NOT_CONFIGURED", async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    expect(geminiImageGenProvider.status).toBe("PENDING_ACCESS");

    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = vi.fn() as any; // must never be called

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("NOT_CONFIGURED");
    expect(generation.generatedUrl).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("2. successful image edit produces a GENERATED PhotoGeneration with a data: URI and the real Gemini model recorded", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch(mockGeminiOkResponse());

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("GENERATED");
    expect(generation.generatedUrl).toMatch(/^data:image\/png;base64,/);
    expect(generation.provider).toBe("GEMINI");
    expect(generation.model).toBe("gemini-2.5-flash-image");
  });

  it("3. the ORIGINAL photo's real bytes are fetched and passed to Gemini as base64 inlineData", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;

    await requestPhotoGeneration(photo.id, "MODERNI", null);

    const photoCall = fetchMock.mock.calls.find((c: any) => String(c[0]) === photo.url);
    expect(photoCall).toBeTruthy();

    const geminiCall = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect(geminiCall).toBeTruthy();
    const body = JSON.parse((geminiCall as any)[1].body);
    const expectedBase64 = Buffer.from(fakePhotoBytes()).toString("base64");
    const inlineImagePart = body.contents[0].parts.find((p: any) => p.inlineData);
    expect(inlineImagePart.inlineData.data).toBe(expectedBase64);
    expect(inlineImagePart.inlineData.mimeType).toBe("image/jpeg");
  });

  it("4. the RenovationPlan's real field values are woven into the prompt sent to Gemini, and drive Change Detection", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto({ flooring: "vinylová podlaha, dub", kitchen: "bílá lesklá kuchyňská linka" });
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);

    const geminiCall = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    const body = JSON.parse((geminiCall as any)[1].body);
    const textPart = body.contents[0].parts.find((p: any) => p.text);
    expect(textPart.text).toMatch(/vinylová podlaha, dub/);
    expect(textPart.text).toMatch(/bílá lesklá kuchyňská linka/);
    expect(textPart.text).toMatch(/EXISTING/i);

    const changeDetection = JSON.parse(generation.changeDetection!);
    expect(changeDetection).toContain("PODLAHA");
    expect(changeDetection).toContain("KUCHYNSKA_LINKA");
  });

  it("5. a malformed Gemini response (no candidates) never crashes the app — recorded as FAILED with a clear reason", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ nonsense: true }) });

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.generatedUrl).toBeNull();
    expect(generation.failureReason).toBeTruthy();
  });

  it("6. Gemini returning text instead of an image is reported as FAILED (no image), never as a fabricated success", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ candidates: [{ content: { parts: [{ text: "I cannot edit this image." }] }, finishReason: "STOP" }] })
    });

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureReason).toMatch(/text/i);
  });

  it("7. an API timeout (AbortError) is caught and recorded as FAILED, never left hanging or crashing", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        const err: any = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return mockPhotoResponse();
    }) as any;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureReason).toMatch(/timeout|vypršel/i);
  });

  it("8. HTTP 401/403 from Gemini is reported as an auth error, never retried, never crashes", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    for (const status of [401, 403]) {
      const { photo } = await createProjectWithPlanAndPhoto();
      const fetchMock = makeRouterFetch({
        ok: false,
        status,
        headers: { get: () => null },
        json: async () => ({ error: { message: "API key not valid" } })
      });
      global.fetch = fetchMock;

      const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
      expect(generation.status).toBe("FAILED");
      expect(generation.failureReason).toMatch(new RegExp(String(status)));

      const geminiCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
      expect(geminiCalls.length).toBe(1); // never retried on an auth error
    }
  });

  it("9. HTTP 429 (rate limit) is reported distinctly and never retried — avoids uncontrolled repeated paid calls", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({ error: { message: "Quota exceeded" } }) });
    global.fetch = fetchMock;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureReason).toMatch(/429|rate limit/i);

    const geminiCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect(geminiCalls.length).toBe(1);
  });

  it("10. a safety rejection (blockReason / SAFETY finishReason) is recorded as FAILED, never faked as a real visualization", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ candidates: [], promptFeedback: { blockReason: "SAFETY" } })
    });

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureReason).toMatch(/bezpečnostních/i);
  });

  it("11. requesting the same visualization twice (same photo, style, prompt, plan) reuses the cached result — no second paid call", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;

    const first = await requestPhotoGeneration(photo.id, "MODERNI", null);
    const callCountAfterFirst = fetchMock.mock.calls.length;
    expect(callCountAfterFirst).toBeGreaterThan(0);

    const second = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(second.id).toBe(first.id);
    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst); // no new network calls at all
  });

  it("12. changing the RenovationPlan invalidates the cache and triggers a fresh (paid) generation", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo, plan } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;

    const first = await requestPhotoGeneration(photo.id, "MODERNI", null);
    const callCountAfterFirst = fetchMock.mock.calls.length;

    await prisma.renovationPlan.update({ where: { id: plan.id }, data: { flooring: "laminátová podlaha, šedá" } });

    const second = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(second.id).not.toBe(first.id);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
  });

  it("13. the API key is never exposed — not in the prompt, not in stored failureReason/generatedUrl/model, not in thrown errors", async () => {
    const secretKey = "AIzaSy-THIS-IS-THE-SECRET-KEY-12345";
    process.env.IMAGE_GEN_API_KEY = secretKey;
    const { photo } = await createProjectWithPlanAndPhoto();

    // Force an auth-error path so we can inspect exactly what gets persisted.
    const fetchMock = makeRouterFetch({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({ error: { message: "API key not valid" } }) });
    global.fetch = fetchMock;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.failureReason).not.toContain(secretKey);
    expect(generation.generatedUrl ?? "").not.toContain(secretKey);
    expect(generation.model ?? "").not.toContain(secretKey);
    expect(generation.prompt ?? "").not.toContain(secretKey);

    // The key must be sent as a request header, never in the JSON body.
    const geminiCall = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect((geminiCall as any)[1].body).not.toContain(secretKey);
    expect((geminiCall as any)[1].headers["x-goog-api-key"]).toBe(secretKey);

    const errorLog = await prisma.providerErrorLog.findFirst({ where: { provider: "GEMINI" } });
    expect(errorLog?.errorMessage ?? "").not.toContain(secretKey);
  });

  it("14. the original Photo row remains completely unchanged after a generation failure", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: { message: "internal" } }) });

    await requestPhotoGeneration(photo.id, "MODERNI", null);

    const unchanged = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(unchanged.url).toBe(photo.url);
    expect(unchanged.roomType).toBe(photo.roomType);
  });
});

describe("Gemini prompt/derivation pure functions", () => {
  it("detectStructuralChange finds explicit Czech structural-change keywords, and only those", () => {
    expect(detectStructuralChange("chci bourat příčku mezi kuchyní a obývákem")).toBe(true);
    expect(detectStructuralChange("jen vymalovat a vyměnit podlahu")).toBe(false);
    expect(detectStructuralChange(null)).toBe(false);
  });

  it("deriveChangeDetection maps only the plan fields that are actually set", () => {
    const items = deriveChangeDetection({
      style: null,
      priceLevel: null,
      flooring: "vinyl",
      wallColor: null,
      doors: null,
      handles: null,
      outletsSwitches: null,
      lighting: "LED",
      kitchen: null,
      bathroomFixtures: null,
      tiles: null,
      sanitary: null,
      builtIns: null
    });
    expect(items).toEqual(expect.arrayContaining(["PODLAHA", "SVETLA"]));
    expect(items).not.toContain("KUCHYNSKA_LINKA");
  });

  it("buildGeminiEditPrompt explicitly frames this as editing an existing space, not creating a new one", () => {
    const prompt = buildGeminiEditPrompt({ roomType: "KUCHYN", planContext: null, roomAnalysis: null, userPrompt: null });
    expect(prompt).toMatch(/EXISTING/);
    expect(prompt.toLowerCase()).toMatch(/not.*generate a new/);
  });
});

describe("computeRequestSignature", () => {
  it("is stable for identical inputs and changes when the plan changes", () => {
    const base = { photoUrl: "https://x/a.jpg", style: "MODERNI", prompt: null, providerKey: "GEMINI", planContext: { style: "moderní", priceLevel: null, flooring: "vinyl", wallColor: null, doors: null, handles: null, outletsSwitches: null, lighting: null, kitchen: null, bathroomFixtures: null, tiles: null, sanitary: null, builtIns: null } };
    const sig1 = computeRequestSignature(base);
    const sig2 = computeRequestSignature(base);
    expect(sig1).toBe(sig2);

    const sig3 = computeRequestSignature({ ...base, planContext: { ...base.planContext, flooring: "laminát" } });
    expect(sig3).not.toBe(sig1);
  });
});

describe("Gemini client — key handling", () => {
  afterEach(() => {
    process.env.IMAGE_GEN_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("editImageWithGemini returns AUTH_ERROR without ever calling fetch when no key is set", async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    expect(getGeminiApiKey()).toBeUndefined();
    global.fetch = vi.fn() as any;
    const outcome = await editImageWithGemini({ imageBase64: "abc", imageMimeType: "image/jpeg", prompt: "test" });
    expect(outcome.status).toBe("AUTH_ERROR");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
