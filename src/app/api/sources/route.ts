// Provider Health (Request E, item 6) — a provider's status alone doesn't
// tell the user whether it's actually working. This computes real,
// queryable evidence (last successful call, result count, latency, rate
// limits, auth/billing problems, most recent logged error) straight from
// the database via the shared CONNECTED/DEGRADED/UNVERIFIED/PENDING_ACCESS/
// UNAVAILABLE/ERROR state machine (src/lib/providerHealth.ts) — never a
// fabricated "looks fine" indicator, and never CONNECTED purely because an
// env var exists.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SOURCE_PROVIDERS } from "@/lib/sources/registry";
import { getFlatScanMonthlyRequestCount } from "@/lib/sources/flatScan/client";
import { buildProviderHealthSummary, type ProviderHealthStatus } from "@/lib/providerHealth";

const FLATSCAN_MONTHLY_BUDGET = 1000;

export async function GET() {
  const providers = await Promise.all(
    SOURCE_PROVIDERS.map(async (p) => {
      const configured = p.status === "ACTIVE";

      // FlatScan keeps its own precise request log (FlatScanRequestLog) —
      // a cache hit never adds a row there, so it's the honest source of
      // truth for this provider specifically, distinct from the generic
      // ProviderSuccessLog/ProviderErrorLog every other provider uses.
      if (p.key === "FLATSCAN") {
        const [lastOk, lastErr, comparableCount, monthlyRequestCount] = await Promise.all([
          prisma.flatScanRequestLog.findFirst({ where: { ok: true }, orderBy: { requestedAt: "desc" } }),
          prisma.flatScanRequestLog.findFirst({ where: { ok: false }, orderBy: { requestedAt: "desc" } }),
          prisma.comparable.count({ where: { sourceProvider: "FLATSCAN" } }),
          getFlatScanMonthlyRequestCount()
        ]);
        const health = buildProviderHealthSummary({
          configured,
          lastSuccess: lastOk ? { occurredAt: lastOk.requestedAt, resultCount: comparableCount, latencyMs: null } : null,
          lastError: lastErr ? { occurredAt: lastErr.requestedAt, errorMessage: lastErr.errorMessage ?? `HTTP ${lastErr.statusCode ?? "?"}`, latencyMs: null } : null,
          anyErrorEverRateLimited: false
        });
        return {
          key: p.key,
          label: p.label,
          status: p.status,
          statusNote: p.statusNote ?? null,
          healthStatus: health.healthStatus as ProviderHealthStatus,
          lastSuccessAt: health.lastSuccessAt,
          totalFound: comparableCount,
          lastError: health.lastError,
          lastSuccessLatencyMs: health.lastSuccessLatencyMs,
          lastErrorLatencyMs: health.lastErrorLatencyMs,
          rateLimitEncountered: health.rateLimitEncountered,
          keyOrBillingRequired: health.keyOrBillingRequired,
          monthlyRequestCount,
          monthlyRequestBudget: FLATSCAN_MONTHLY_BUDGET
        };
      }

      const [lastSuccessLog, lastErrorLog, anyRateLimitedError, comparableCount, listingCount] = await Promise.all([
        prisma.providerSuccessLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key, errorMessage: { contains: "rate limit" } } }),
        prisma.comparable.count({ where: { sourceProvider: p.key } }),
        prisma.project.count({ where: { portal: p.label, sourceWatcherId: { not: null } } })
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
        totalFound: comparableCount + listingCount,
        lastError: health.lastError,
        lastSuccessLatencyMs: health.lastSuccessLatencyMs,
        lastErrorLatencyMs: health.lastErrorLatencyMs,
        rateLimitEncountered: health.rateLimitEncountered,
        keyOrBillingRequired: health.keyOrBillingRequired,
        monthlyRequestCount: null as number | null,
        monthlyRequestBudget: null as number | null
      };
    })
  );

  return NextResponse.json(providers);
}
