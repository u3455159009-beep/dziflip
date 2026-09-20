// Provider Health accuracy (item 5) and the on-demand smoke test (item 6) —
// a configured IMAGE_GEN_API_KEY must never, by itself, be reported as
// "connected"; that claim requires at least one real, observed outcome.
import { describe, it, expect, afterEach, vi } from "vitest";
import { deriveImageGenHealthStatus } from "@/lib/imageGen/health";
import { runGeminiImageSmokeTest } from "@/lib/imageGen/gemini/provider";

describe("deriveImageGenHealthStatus (item 5 — existence of a key is not evidence it works)", () => {
  it("no key configured → PENDING_ACCESS, regardless of any historical data", () => {
    expect(deriveImageGenHealthStatus({ configured: false, lastSuccessAt: new Date(), lastErrorAt: null })).toBe("PENDING_ACCESS");
  });

  it("key configured but never exercised (no success, no error ever recorded) → UNVERIFIED, never CONNECTED", () => {
    expect(deriveImageGenHealthStatus({ configured: true, lastSuccessAt: null, lastErrorAt: null })).toBe("UNVERIFIED");
  });

  it("most recent real attempt succeeded → CONNECTED", () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);
    expect(deriveImageGenHealthStatus({ configured: true, lastSuccessAt: now, lastErrorAt: earlier })).toBe("CONNECTED");
    expect(deriveImageGenHealthStatus({ configured: true, lastSuccessAt: now, lastErrorAt: null })).toBe("CONNECTED");
  });

  it("most recent real attempt failed → ERROR, even if an older attempt once succeeded", () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);
    expect(deriveImageGenHealthStatus({ configured: true, lastSuccessAt: earlier, lastErrorAt: now })).toBe("ERROR");
    expect(deriveImageGenHealthStatus({ configured: true, lastSuccessAt: null, lastErrorAt: now })).toBe("ERROR");
  });
});

const originalKey = process.env.IMAGE_GEN_API_KEY;
const originalFetch = global.fetch;

describe("runGeminiImageSmokeTest (item 6 — a real, on-demand check, never a mocked/fabricated result)", () => {
  afterEach(() => {
    process.env.IMAGE_GEN_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("makes one real call to the exact same image-editing endpoint/model as production generation, and reports OK on a real success", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain("generativelanguage.googleapis.com");
      expect(String(url)).toContain("gemini-2.5-flash-image");
      return {
        ok: true,
        status: 200,
        headers: { get: (): null => null },
        json: async () => ({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "dGVzdA==" } }] }, finishReason: "STOP" }]
        })
      };
    }) as any;
    global.fetch = fetchMock;

    const outcome = await runGeminiImageSmokeTest();
    expect(outcome.status).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the real, classified failure — never fabricates a success — when the key isn't configured", async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    global.fetch = vi.fn() as any;

    const outcome = await runGeminiImageSmokeTest();
    expect(outcome.status).toBe("AUTH_ERROR");
    expect((outcome as any).code).toBe("GEMINI_AUTH_FAILED");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports the real, classified failure when Gemini itself rejects the request", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      headers: { get: (): null => null },
      json: async () => ({ error: { message: "API key not valid" } })
    })) as any;

    const outcome = await runGeminiImageSmokeTest();
    expect(outcome.status).toBe("AUTH_ERROR");
    expect((outcome as any).code).toBe("GEMINI_AUTH_FAILED");
  });
});
