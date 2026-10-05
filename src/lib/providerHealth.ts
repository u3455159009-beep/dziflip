// Shared, pure Provider Health state machine (Request E, item 6) used by
// every provider family (sources, image-gen, vision, products,
// notifications). A provider is never reported CONNECTED purely because an
// API key/env var exists — that claim requires at least one real, observed
// successful call. Six precise states only:
//
// - PENDING_ACCESS: not configured at all (no key/credentials present).
// - UNVERIFIED: configured, but no real attempt — success or failure —
//   has ever been recorded. Existing is not evidence of working.
// - UNAVAILABLE: configured, but every real attempt on record has failed
//   (never once succeeded), OR the most recent failure indicates a
//   structural problem (missing/invalid key, billing required) rather
//   than a transient one.
// - ERROR: the most recent real attempt failed, but it's a one-off against
//   a provider that has succeeded before — not a sustained outage.
// - DEGRADED: the most recent real attempt failed specifically because of
//   rate limiting/quota — the provider fundamentally works, it's just
//   being throttled right now.
// - CONNECTED: the most recent real attempt succeeded.
export type ProviderHealthStatus = "CONNECTED" | "DEGRADED" | "UNVERIFIED" | "PENDING_ACCESS" | "UNAVAILABLE" | "ERROR";

export interface ProviderHealthInput {
  configured: boolean;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  /** Classification of the most recent error message, if any. */
  lastErrorRateLimited?: boolean;
  lastErrorAuthOrBilling?: boolean;
}

export function deriveProviderHealthStatus(input: ProviderHealthInput): ProviderHealthStatus {
  if (!input.configured) return "PENDING_ACCESS";
  if (!input.lastSuccessAt && !input.lastErrorAt) return "UNVERIFIED";

  const lastErrorIsNewest = Boolean(
    input.lastErrorAt && (!input.lastSuccessAt || input.lastErrorAt > input.lastSuccessAt)
  );

  if (!lastErrorIsNewest) return "CONNECTED";

  // The newest real event is a failure.
  if (!input.lastSuccessAt) {
    // Never once worked despite being configured — a key existing didn't
    // make it functional. This is the honest "structurally broken" state.
    return "UNAVAILABLE";
  }
  if (input.lastErrorAuthOrBilling) return "UNAVAILABLE";
  if (input.lastErrorRateLimited) return "DEGRADED";
  return "ERROR";
}

/** Classifies a real thrown error's own message — never guesses beyond what the message says. */
export function classifyProviderErrorMessage(message: string): { rateLimited: boolean; authOrBilling: boolean } {
  return {
    rateLimited: /rate limit|kvót|too many requests|\b429\b/i.test(message),
    authOrBilling: /autentizace|unauthorized|forbidden|billing|platb|\b401\b|\b403\b/i.test(message)
  };
}

export interface ProviderHealthSummary {
  healthStatus: ProviderHealthStatus;
  lastSuccessAt: string | null;
  lastSuccessResultCount: number | null;
  lastSuccessLatencyMs: number | null;
  lastError: { message: string; occurredAt: string } | null;
  lastErrorLatencyMs: number | null;
  rateLimitEncountered: boolean;
  keyOrBillingRequired: boolean;
}

/**
 * Builds the full Provider Health summary for one provider from its real,
 * logged success/error rows (ProviderSuccessLog / ProviderErrorLog) — the
 * one shared shape every health route (/api/sources, /api/image-gen,
 * /api/products) renders into its provider list.
 */
export function buildProviderHealthSummary(input: {
  configured: boolean;
  lastSuccess: { occurredAt: Date; resultCount: number | null; latencyMs: number | null } | null;
  lastError: { occurredAt: Date; errorMessage: string; latencyMs: number | null } | null;
  anyErrorEverRateLimited: boolean;
}): ProviderHealthSummary {
  const lastErrorClass = input.lastError ? classifyProviderErrorMessage(input.lastError.errorMessage) : null;

  const healthStatus = deriveProviderHealthStatus({
    configured: input.configured,
    lastSuccessAt: input.lastSuccess?.occurredAt ?? null,
    lastErrorAt: input.lastError?.occurredAt ?? null,
    lastErrorRateLimited: lastErrorClass?.rateLimited ?? false,
    lastErrorAuthOrBilling: lastErrorClass?.authOrBilling ?? false
  });

  return {
    healthStatus,
    lastSuccessAt: input.lastSuccess ? input.lastSuccess.occurredAt.toISOString() : null,
    lastSuccessResultCount: input.lastSuccess?.resultCount ?? null,
    lastSuccessLatencyMs: input.lastSuccess?.latencyMs ?? null,
    lastError: input.lastError ? { message: input.lastError.errorMessage, occurredAt: input.lastError.occurredAt.toISOString() } : null,
    lastErrorLatencyMs: input.lastError?.latencyMs ?? null,
    rateLimitEncountered: input.anyErrorEverRateLimited || (lastErrorClass?.rateLimited ?? false),
    keyOrBillingRequired: !input.configured || (lastErrorClass?.authOrBilling ?? false)
  };
}
