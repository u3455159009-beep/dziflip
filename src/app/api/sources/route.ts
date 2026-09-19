// Provider Health (item 16) — a provider's status alone doesn't tell the
// user whether it's actually working. This computes real, queryable
// evidence (last successful discovery, how many real listings/comparables
// it has actually produced, its most recent logged error) straight from
// the database — never a fabricated "looks fine" indicator.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SOURCE_PROVIDERS } from "@/lib/sources/registry";

export type ProviderHealthStatus = "CONNECTED" | "PENDING_ACCESS" | "ERROR" | "DISABLED";

export async function GET() {
  const providers = await Promise.all(
    SOURCE_PROVIDERS.map(async (p) => {
      // `status` (ACTIVE | PENDING_ACCESS) is the original field consumed by
      // WatcherForm's "which sources can this watcher use" checklist — kept
      // unchanged so that UI keeps working. `healthStatus` below is the
      // richer, additive Provider Health diagnostic (item 16).
      if (p.status === "PENDING_ACCESS") {
        return {
          key: p.key,
          label: p.label,
          status: p.status,
          statusNote: p.statusNote ?? null,
          healthStatus: "PENDING_ACCESS" as ProviderHealthStatus,
          lastSuccessAt: null as string | null,
          totalFound: 0,
          lastError: null as { message: string; occurredAt: string } | null
        };
      }

      const [lastComparable, lastListing, comparableCount, listingCount, lastErrorLog] = await Promise.all([
        prisma.comparable.findFirst({ where: { sourceProvider: p.key }, orderBy: { lastSeenAt: "desc" } }),
        prisma.project.findFirst({ where: { portal: p.label, sourceWatcherId: { not: null } }, orderBy: { lastSeenAt: "desc" } }),
        prisma.comparable.count({ where: { sourceProvider: p.key } }),
        prisma.project.count({ where: { portal: p.label, sourceWatcherId: { not: null } } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } })
      ]);

      const lastSuccessAt = [lastComparable?.lastSeenAt, lastListing?.lastSeenAt]
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      const totalFound = comparableCount + listingCount;

      // An ACTIVE provider that has logged an error more recently than its
      // last real success is reporting trouble, not silently "fine."
      const healthStatus: ProviderHealthStatus =
        lastErrorLog && (!lastSuccessAt || lastErrorLog.occurredAt > lastSuccessAt) ? "ERROR" : "CONNECTED";

      return {
        key: p.key,
        label: p.label,
        status: p.status,
        statusNote: p.statusNote ?? null,
        healthStatus,
        lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
        totalFound,
        lastError: lastErrorLog ? { message: lastErrorLog.errorMessage, occurredAt: lastErrorLog.occurredAt.toISOString() } : null
      };
    })
  );

  return NextResponse.json(providers);
}
