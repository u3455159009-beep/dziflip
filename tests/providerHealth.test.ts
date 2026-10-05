// Shared Provider Health state machine (Request E, item 6) — the exact
// six states, and that CONNECTED is never claimed from a key merely
// existing.
import { describe, it, expect } from "vitest";
import { deriveProviderHealthStatus, classifyProviderErrorMessage } from "@/lib/providerHealth";

const NOW = new Date("2026-01-01T12:00:00Z");
const EARLIER = new Date("2026-01-01T11:00:00Z");
const LATER = new Date("2026-01-01T13:00:00Z");

describe("deriveProviderHealthStatus", () => {
  it("PENDING_ACCESS when not configured, regardless of any historical logs", () => {
    expect(deriveProviderHealthStatus({ configured: false, lastSuccessAt: NOW, lastErrorAt: LATER })).toBe("PENDING_ACCESS");
    expect(deriveProviderHealthStatus({ configured: false, lastSuccessAt: null, lastErrorAt: null })).toBe("PENDING_ACCESS");
  });

  it("UNVERIFIED when configured but never attempted — existence is not evidence of working", () => {
    expect(deriveProviderHealthStatus({ configured: true, lastSuccessAt: null, lastErrorAt: null })).toBe("UNVERIFIED");
  });

  it("CONNECTED when the most recent real attempt succeeded", () => {
    expect(deriveProviderHealthStatus({ configured: true, lastSuccessAt: LATER, lastErrorAt: EARLIER })).toBe("CONNECTED");
    expect(deriveProviderHealthStatus({ configured: true, lastSuccessAt: NOW, lastErrorAt: null })).toBe("CONNECTED");
  });

  it("ERROR when the most recent attempt failed but the provider has worked before and it's not a rate-limit/auth issue", () => {
    expect(deriveProviderHealthStatus({ configured: true, lastSuccessAt: EARLIER, lastErrorAt: LATER })).toBe("ERROR");
  });

  it("DEGRADED when the most recent failure was specifically a rate limit/quota issue", () => {
    expect(
      deriveProviderHealthStatus({ configured: true, lastSuccessAt: EARLIER, lastErrorAt: LATER, lastErrorRateLimited: true })
    ).toBe("DEGRADED");
  });

  it("UNAVAILABLE when configured but has NEVER once succeeded despite real attempts", () => {
    expect(deriveProviderHealthStatus({ configured: true, lastSuccessAt: null, lastErrorAt: LATER })).toBe("UNAVAILABLE");
  });

  it("UNAVAILABLE when the most recent failure is an auth/billing problem, even if it worked before", () => {
    expect(
      deriveProviderHealthStatus({ configured: true, lastSuccessAt: EARLIER, lastErrorAt: LATER, lastErrorAuthOrBilling: true })
    ).toBe("UNAVAILABLE");
  });
});

describe("classifyProviderErrorMessage", () => {
  it("recognizes a rate-limit/quota message (the exact phrasing thrown by braveSearchProvider etc.)", () => {
    expect(classifyProviderErrorMessage("Brave Search: rate limit nebo vyčerpaná kvóta.").rateLimited).toBe(true);
    expect(classifyProviderErrorMessage("HTTP 429").rateLimited).toBe(true);
  });

  it("recognizes an auth/billing message", () => {
    expect(classifyProviderErrorMessage("Chyba autentizace (401).").authOrBilling).toBe(true);
    expect(classifyProviderErrorMessage("HTTP 403 Forbidden").authOrBilling).toBe(true);
  });

  it("a plain network/timeout message is neither", () => {
    const c = classifyProviderErrorMessage("Vyhledávání vypršelo (timeout).");
    expect(c.rateLimited).toBe(false);
    expect(c.authOrBilling).toBe(false);
  });
});
