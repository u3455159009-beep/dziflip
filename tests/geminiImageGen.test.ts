import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

// photoGeneration.ts now saves every GENERATED result's real bytes to
// Vercel Blob (item 7 of the production-fix — never a base64 data: URI in
// the database) — @vercel/blob's put() uses its own internal undici fetch,
// not the global one, so the module itself is mocked, the same way
// tests/photoUpload.test.ts mocks it.
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));

import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requestPhotoGeneration } from "@/lib/photoGeneration";
import { editImageWithGemini, getGeminiApiKey } from "@/lib/imageGen/gemini/client";
import { geminiImageGenProvider } from "@/lib/imageGen/gemini/provider";
import { buildGeminiEditPrompt, deriveChangeDetection, detectStructuralChange } from "@/lib/imageGen/gemini/prompt";
import { computeRequestSignature } from "@/lib/imageGen/cache";

const originalKey = process.env.IMAGE_GEN_API_KEY;
const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
const originalFetch = global.fetch;
const putMock = vi.mocked(put);

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

function mockGeminiHttpError(status: number, message: string) {
  return {
    ok: false,
    status,
    headers: { get: (): string => "application/json" },
    json: async () => ({ error: { message } })
  };
}

// Routes based on URL: the photo URL vs. the Gemini generateContent endpoint.
function makeRouterFetch(geminiResponse: any) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("generativelanguage.googleapis.com")) return geminiResponse;
    return mockPhotoResponse();
  }) as any;
}

function mockBlobSuccess(url = "https://abc123.public.blob.vercel-storage.com/projects/x/generations/after.png") {
  putMock.mockResolvedValueOnce({ url, downloadUrl: `${url}?download=1`, pathname: url.split("/").slice(3).join("/"), contentType: "image/png" } as any);
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
    putMock.mockReset();
  });
  afterEach(() => {
    process.env.IMAGE_GEN_API_KEY = originalKey;
    process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
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

  it("2. successful image edit downloads the ORIGINAL, calls Gemini, saves the AFTER image to Vercel Blob (never a data: URI), and records the real model", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch(mockGeminiOkResponse());
    const afterUrl = "https://abc123.public.blob.vercel-storage.com/projects/x/generations/kitchen-after.png";
    mockBlobSuccess(afterUrl);

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("GENERATED");
    expect(generation.generatedUrl).toBe(afterUrl);
    expect(generation.generatedUrl).not.toMatch(/^data:/);
    expect(generation.provider).toBe("GEMINI");
    expect(generation.model).toBe("gemini-2.5-flash-image");

    // The bytes handed to Blob are the real decoded Gemini image, not a
    // re-encoding of the ORIGINAL or anything fabricated.
    const [, buffer, opts] = putMock.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect((buffer as Buffer).toString("base64")).toBe("ZmFrZS1nZW5lcmF0ZWQtaW1hZ2U=");
    expect((opts as any).contentType).toBe("image/png");
  });

  it("3. the ORIGINAL photo's real bytes are fetched and passed to Gemini as base64 inlineData", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;
    mockBlobSuccess();

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
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const { photo } = await createProjectWithPlanAndPhoto({ flooring: "vinylová podlaha, dub", kitchen: "bílá lesklá kuchyňská linka" });
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;
    mockBlobSuccess();

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

  it("5. a malformed Gemini response (no candidates) never crashes the app — recorded as FAILED with code GEMINI_RESPONSE_INVALID", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ nonsense: true }) });

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.generatedUrl).toBeNull();
    expect(generation.failureReason).toBeTruthy();
    expect(generation.failureCode).toBe("GEMINI_RESPONSE_INVALID");
    expect(putMock).not.toHaveBeenCalled(); // never even attempts a Blob save without a real image
  });

  it("6. Gemini returning text instead of an image is reported as FAILED (code GEMINI_RESPONSE_INVALID), never as a fabricated success", async () => {
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
    expect(generation.failureCode).toBe("GEMINI_RESPONSE_INVALID");
  });

  it("7. an API timeout (AbortError) is caught and recorded as FAILED with code GEMINI_TIMEOUT, never left hanging or crashing", async () => {
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
    expect(generation.failureCode).toBe("GEMINI_TIMEOUT");
  });

  it("8. HTTP 401/403 from Gemini is reported as GEMINI_AUTH_FAILED, never retried, never crashes", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    for (const status of [401, 403]) {
      const { photo } = await createProjectWithPlanAndPhoto();
      const fetchMock = makeRouterFetch(mockGeminiHttpError(status, "API key not valid"));
      global.fetch = fetchMock;

      const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
      expect(generation.status).toBe("FAILED");
      expect(generation.failureCode).toBe("GEMINI_AUTH_FAILED");
      expect(generation.failureReason).toMatch(new RegExp(String(status)));

      const geminiCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
      expect(geminiCalls.length).toBe(1); // never retried on an auth error
    }
  });

  it("9. HTTP 429 (rate limit) is reported as GEMINI_RATE_LIMITED and never retried — avoids uncontrolled repeated paid calls", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiHttpError(429, "Quota exceeded"));
    global.fetch = fetchMock;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureCode).toBe("GEMINI_RATE_LIMITED");
    expect(generation.failureReason).toMatch(/429|rate limit/i);

    const geminiCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect(geminiCalls.length).toBe(1);
  });

  it("9b. HTTP 400 (bad request) is reported as GEMINI_BAD_REQUEST and never retried", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiHttpError(400, "Invalid inlineData"));
    global.fetch = fetchMock;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureCode).toBe("GEMINI_BAD_REQUEST");

    const geminiCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect(geminiCalls.length).toBe(1);
  });

  it("9c. HTTP 404 / an explicit 'model not found' error is reported as GEMINI_MODEL_NOT_AVAILABLE, never retried, never silently swapped to a guessed model", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiHttpError(404, "models/gemini-2.5-flash-image is not found for API version v1beta"));
    global.fetch = fetchMock;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureCode).toBe("GEMINI_MODEL_NOT_AVAILABLE");
    expect(generation.failureReason).toMatch(/gemini-2\.5-flash-image/);

    const geminiCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect(geminiCalls.length).toBe(1);
  });

  it("10. a safety rejection (blockReason / SAFETY finishReason) is recorded as FAILED with code GEMINI_SAFETY_BLOCKED, never faked as a real visualization", async () => {
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
    expect(generation.failureCode).toBe("GEMINI_SAFETY_BLOCKED");
    expect(generation.failureReason).toMatch(/bezpečnostních/i);
  });

  it("11. requesting the same visualization twice (same photo, style, prompt, plan) reuses the cached result — no second paid call, no second Blob upload", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;
    mockBlobSuccess();

    const first = await requestPhotoGeneration(photo.id, "MODERNI", null);
    const callCountAfterFirst = fetchMock.mock.calls.length;
    expect(callCountAfterFirst).toBeGreaterThan(0);
    expect(putMock).toHaveBeenCalledTimes(1);

    const second = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(second.id).toBe(first.id);
    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst); // no new network calls at all
    expect(putMock).toHaveBeenCalledTimes(1); // no new Blob upload either
  });

  it("12. changing the RenovationPlan invalidates the cache and triggers a fresh (paid) generation", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const { photo, plan } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;
    mockBlobSuccess();

    const first = await requestPhotoGeneration(photo.id, "MODERNI", null);
    const callCountAfterFirst = fetchMock.mock.calls.length;

    await prisma.renovationPlan.update({ where: { id: plan.id }, data: { flooring: "laminátová podlaha, šedá" } });
    mockBlobSuccess();

    const second = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(second.id).not.toBe(first.id);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
  });

  it("13. the API key is never exposed — not in the prompt, not in stored failureReason/generatedUrl/model, not in thrown errors, not in Blob upload metadata", async () => {
    const secretKey = "AIzaSy-THIS-IS-THE-SECRET-KEY-12345";
    process.env.IMAGE_GEN_API_KEY = secretKey;
    const { photo } = await createProjectWithPlanAndPhoto();

    // Force an auth-error path so we can inspect exactly what gets persisted.
    const fetchMock = makeRouterFetch(mockGeminiHttpError(401, "API key not valid"));
    global.fetch = fetchMock;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.failureReason).not.toContain(secretKey);
    expect(generation.generatedUrl ?? "").not.toContain(secretKey);
    expect(generation.model ?? "").not.toContain(secretKey);
    expect(generation.prompt ?? "").not.toContain(secretKey);
    expect(generation.failureCode ?? "").not.toContain(secretKey);

    // The key must be sent as a request header, never in the JSON body.
    const geminiCall = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect((geminiCall as any)[1].body).not.toContain(secretKey);
    expect((geminiCall as any)[1].headers["x-goog-api-key"]).toBe(secretKey);

    const errorLog = await prisma.providerErrorLog.findFirst({ where: { provider: "GEMINI" } });
    expect(errorLog?.errorMessage ?? "").not.toContain(secretKey);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("14. the original Photo row remains completely unchanged after a generation failure", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch(mockGeminiHttpError(500, "internal"));

    await requestPhotoGeneration(photo.id, "MODERNI", null);

    const unchanged = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(unchanged.url).toBe(photo.url);
    expect(unchanged.roomType).toBe(photo.roomType);
  });

  it("14b. the original Photo row remains completely unchanged even after a SUCCESSFUL generation — only PhotoGeneration/Blob get new data", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch(mockGeminiOkResponse());
    mockBlobSuccess();

    await requestPhotoGeneration(photo.id, "MODERNI", null);

    const unchanged = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(unchanged.url).toBe(photo.url); // still the ORIGINAL's own URL, never overwritten with the AFTER's
  });

  it("15. a DNS/network failure (fetch() throws before any HTTP response) is reported as FAILED with code GEMINI_DNS_OR_NETWORK_FAILED — this is the real root cause this fix targets", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        const cause: any = new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com");
        cause.code = "ENOTFOUND";
        const err: any = new TypeError("fetch failed");
        err.cause = cause;
        throw err;
      }
      return mockPhotoResponse();
    }) as any;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureCode).toBe("GEMINI_DNS_OR_NETWORK_FAILED");
    expect(generation.failureReason).toMatch(/síťový požadavek selhal/i);
  });

  it("16. an ORIGINAL photo download failure is reported as FAILED with code DOWNLOAD_ORIGINAL_FAILED — never reaches Gemini at all", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === photo.url) return { ok: false, status: 404, headers: { get: (): null => null }, arrayBuffer: async () => new ArrayBuffer(0) };
      return mockGeminiOkResponse();
    }) as any;
    global.fetch = fetchMock;

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureCode).toBe("DOWNLOAD_ORIGINAL_FAILED");
    expect(generation.failureReason).toMatch(/nepodařilo stáhnout/i);

    const geminiCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect(geminiCalls.length).toBe(0); // never wastes a paid call when there's no real photo to edit
  });

  it("17. a successful Gemini call whose AFTER image can't be saved to Blob is reported as FAILED with code BLOB_SAVE_FAILED — never a fabricated success, and the ORIGINAL is untouched", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch(mockGeminiOkResponse());
    putMock.mockRejectedValueOnce(new Error("Vercel Blob: simulated outage"));

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureCode).toBe("BLOB_SAVE_FAILED");
    expect(generation.generatedUrl).toBeNull();

    const unchanged = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(unchanged.url).toBe(photo.url);
  });

  it("18. without BLOB_READ_WRITE_TOKEN configured, a successful Gemini call still fails cleanly with code BLOB_SAVE_FAILED rather than falling back to a data: URI", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { photo } = await createProjectWithPlanAndPhoto();
    global.fetch = makeRouterFetch(mockGeminiOkResponse());

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("FAILED");
    expect(generation.failureCode).toBe("BLOB_SAVE_FAILED");
    expect(generation.failureReason).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("19. a trailing newline/space on IMAGE_GEN_API_KEY (a common Vercel env var paste artifact) is trimmed and the request still succeeds", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key\n";
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const { photo } = await createProjectWithPlanAndPhoto();
    const fetchMock = makeRouterFetch(mockGeminiOkResponse());
    global.fetch = fetchMock;
    mockBlobSuccess();

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("GENERATED");

    const geminiCall = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("generativelanguage.googleapis.com"));
    expect((geminiCall as any)[1].headers["x-goog-api-key"]).toBe("test-gemini-key"); // sent trimmed, no trailing newline
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

  it("editImageWithGemini returns AUTH_ERROR (code GEMINI_AUTH_FAILED) without ever calling fetch when no key is set", async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    expect(getGeminiApiKey()).toBeUndefined();
    global.fetch = vi.fn() as any;
    const outcome = await editImageWithGemini({ imageBase64: "abc", imageMimeType: "image/jpeg", prompt: "test" });
    expect(outcome.status).toBe("AUTH_ERROR");
    expect((outcome as any).code).toBe("GEMINI_AUTH_FAILED");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("getGeminiApiKey trims surrounding whitespace/newlines — the real root cause of the reported production bug", () => {
    process.env.IMAGE_GEN_API_KEY = "  test-key-with-padding  \n";
    expect(getGeminiApiKey()).toBe("test-key-with-padding");
  });

  it("an API key that still contains an internal invalid header character after trimming is reported as GEMINI_AUTH_FAILED without ever calling fetch", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-gemini-key\nwith-injected-newline";
    global.fetch = vi.fn() as any; // must never be called — caught before any network attempt

    const outcome = await editImageWithGemini({ imageBase64: "abc", imageMimeType: "image/jpeg", prompt: "test" });
    expect(outcome.status).toBe("AUTH_ERROR");
    expect((outcome as any).code).toBe("GEMINI_AUTH_FAILED");
    expect((outcome as any).detail).toMatch(/neplatné řídicí znaky/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
