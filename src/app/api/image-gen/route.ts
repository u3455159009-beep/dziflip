// Provider Health for the image-generation/visualization pipeline (Request
// E, item 6). Real, verified status only via the shared
// CONNECTED/DEGRADED/UNVERIFIED/PENDING_ACCESS/UNAVAILABLE/ERROR state
// machine (src/lib/providerHealth.ts) — a configured key alone is NEVER
// reported as CONNECTED; that claim requires at least one real, observed
// outcome (real usage, or the on-demand smoke test at POST .../smoke-test).
// lastError only ever carries the sanitized message already produced by
// the provider — never the API key.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IMAGE_GEN_PROVIDERS } from "@/lib/imageGen/registry";
import { buildProviderHealthSummary, type ProviderHealthStatus } from "@/lib/providerHealth";

export async function GET() {
  const providers = await Promise.all(
    IMAGE_GEN_PROVIDERS.map(async (p) => {
      const configured = p.status !== "PENDING_ACCESS";

      const [lastSuccessLog, totalGenerated, lastErrorLog, anyRateLimitedError, lastFailedGeneration] = await Promise.all([
        prisma.providerSuccessLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } }),
        prisma.photoGeneration.count({ where: { provider: p.key, status: "GENERATED" } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key, errorMessage: { contains: "RATE_LIMITED" } } }),
        prisma.photoGeneration.findFirst({ where: { provider: p.key, status: "FAILED" }, orderBy: { createdAt: "desc" } })
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
        totalGenerated,
        lastError: health.lastError,
        lastSuccessLatencyMs: health.lastSuccessLatencyMs,
        lastErrorLatencyMs: health.lastErrorLatencyMs,
        rateLimitEncountered: health.rateLimitEncountered,
        keyOrBillingRequired: health.keyOrBillingRequired,
        lastFailureCode: lastFailedGeneration?.failureCode ?? null
      };
    })
  );

  return NextResponse.json(providers);
}
