// Pure derivation of an image-gen provider's real, verified health status
// (item 5 — "existence of IMAGE_GEN_API_KEY must not automatically mean
// CONNECTED"). Separated from the API route so it's directly unit-testable
// without a database.
export type ImageGenHealthStatus = "CONNECTED" | "PENDING_ACCESS" | "ERROR" | "UNVERIFIED";

/**
 * - PENDING_ACCESS: no key configured at all.
 * - UNVERIFIED: a key is configured, but no real request — success or
 *   failure — has ever been recorded for this provider. A key existing is
 *   not evidence it works; this is the honest default until it's actually
 *   been exercised once (by real usage or a manual smoke test).
 * - ERROR: the most recent real attempt (by generatedAt/occurredAt) failed.
 * - CONNECTED: the most recent real attempt succeeded.
 */
export function deriveImageGenHealthStatus(input: {
  configured: boolean;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
}): ImageGenHealthStatus {
  if (!input.configured) return "PENDING_ACCESS";
  if (!input.lastSuccessAt && !input.lastErrorAt) return "UNVERIFIED";
  if (input.lastErrorAt && (!input.lastSuccessAt || input.lastErrorAt > input.lastSuccessAt)) return "ERROR";
  return "CONNECTED";
}
