// Shared instrumentation for real provider calls (Request E, item 6):
// every call site that invokes a source/image-gen/vision/product provider
// times the call and logs exactly one row — ProviderSuccessLog on success,
// ProviderErrorLog (now with latencyMs) on failure — so Provider Health can
// report real latency, result counts and rate-limit history instead of
// inferring them from a key merely existing.
import { prisma } from "@/lib/prisma";

export async function logProviderSuccess(provider: string, opts: { resultCount?: number; latencyMs?: number } = {}): Promise<void> {
  await prisma.providerSuccessLog
    .create({ data: { provider, resultCount: opts.resultCount ?? null, latencyMs: opts.latencyMs ?? null } })
    .catch(() => {});
}

export async function logProviderError(
  provider: string,
  errorMessage: string,
  opts: { latencyMs?: number; watcherId?: string; externalId?: string } = {}
): Promise<void> {
  await prisma.providerErrorLog
    .create({
      data: {
        provider,
        errorMessage,
        latencyMs: opts.latencyMs ?? null,
        watcherId: opts.watcherId ?? null,
        externalId: opts.externalId ?? null
      }
    })
    .catch(() => {});
}

/**
 * Times `fn()` and logs the outcome (success with a derived result count,
 * or failure with the real error message) under `provider`. Re-throws on
 * failure so existing per-provider try/catch isolation at call sites is
 * unaffected — this only adds observability, it never changes control flow.
 */
export async function withProviderCallLog<T>(
  provider: string,
  fn: () => Promise<T>,
  resultCountOf: (result: T) => number = (r) => (Array.isArray(r) ? r.length : 1)
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    await logProviderSuccess(provider, { resultCount: resultCountOf(result), latencyMs: Date.now() - startedAt });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Neznámá chyba providera.";
    await logProviderError(provider, message, { latencyMs: Date.now() - startedAt });
    throw err;
  }
}
