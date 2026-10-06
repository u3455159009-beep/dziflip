// Provider Health for product-search providers (Request E, item 6) — same
// shared 6-state machine as /api/sources and /api/image-gen. A provider is
// never CONNECTED purely because it's ACTIVE (a key/URL configured); that
// requires a real, observed successful search (see src/lib/productSearch.ts,
// which logs every attempt to ProviderSuccessLog/ProviderErrorLog).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRODUCT_PROVIDERS } from "@/lib/products/registry";
import { buildProviderHealthSummary, type ProviderHealthStatus } from "@/lib/providerHealth";

export async function GET() {
  const providers = await Promise.all(
    PRODUCT_PROVIDERS.map(async (p) => {
      const configured = p.status === "ACTIVE";

      const [lastSuccessLog, lastErrorLog, anyRateLimitedError, productCount] = await Promise.all([
        prisma.providerSuccessLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key, errorMessage: { contains: "rate limit" } } }),
        prisma.product.count({ where: { provider: p.key } })
      ]);

      const health = buildProviderHealthSummary({
        configured,
        lastSuccess: lastSuccessLog
          ? { occurredAt: lastSuccessLog.occurredAt, resultCount: lastSuccessLog.resultCount, latencyMs: lastSuccessLog.latencyMs }
          : null,
        lastError: lastErrorLog
          ? { occurredAt: lastErrorLog.occurredAt, errorMessage: lastErrorLog.errorMessage, latencyMs: lastErrorLog.latencyMs }
          : null,
        anyErrorEverRateLimited: Boolean(anyRateLimitedError)
      });

      return {
        key: p.key,
        label: p.label,
        status: p.status,
        statusNote: p.statusNote ?? null,
        healthStatus: health.healthStatus as ProviderHealthStatus,
        lastSuccessAt: health.lastSuccessAt,
        totalFound: productCount,
        lastError: health.lastError,
        lastSuccessLatencyMs: health.lastSuccessLatencyMs,
        lastErrorLatencyMs: health.lastErrorLatencyMs,
        rateLimitEncountered: health.rateLimitEncountered,
        keyOrBillingRequired: health.keyOrBillingRequired
      };
    })
  );

  return NextResponse.json(providers);
}
