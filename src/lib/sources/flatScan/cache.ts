// Two-tier read-through cache for the FlatScan Data API (item 10) — the
// Starter tier allows only 1 000 calls/month, so every real HTTP call is
// avoided whenever a fresh-enough cached answer already exists:
//
//   1. FlatScanSearchCache — caches a whole GET /listings result (by
//      normalized query) so overlapping searches from different projects
//      within the TTL window reuse the same id list instead of re-querying.
//   2. FlatScanListingCache — caches each individual listing's detail, so
//      hydrating ids from the search cache costs zero further API calls
//      unless a specific listing's own cache entry has also gone stale.
//
// TTL is configurable via Settings.flatScanCacheTtlHours (default 24h).
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import type { FlatScanListingsQuery } from "./types";
import { mapFlatScanListingToCacheRow, type FlatScanListingCacheRow } from "./mapping";
import type { FlatScanListing } from "./types";

export async function getCacheTtlHours(): Promise<number> {
  const settings = await getSettings();
  return settings.flatScanCacheTtlHours ?? 24;
}

function isFresh(timestamp: Date, ttlHours: number): boolean {
  return (Date.now() - timestamp.getTime()) / (1000 * 60 * 60) < ttlHours;
}

/** Deterministic signature for a search query — same filters always hash the same way. */
export function buildQuerySignature(query: FlatScanListingsQuery): string {
  const sorted = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(sorted);
}

/** Returns cached FlatScan ids for this exact query if the cache entry is still fresh. */
export async function getCachedSearchIds(query: FlatScanListingsQuery): Promise<string[] | null> {
  const signature = buildQuerySignature(query);
  const [cached, ttlHours] = await Promise.all([
    prisma.flatScanSearchCache.findUnique({ where: { querySignature: signature } }),
    getCacheTtlHours()
  ]);
  if (!cached || !isFresh(cached.fetchedAt, ttlHours)) return null;
  try {
    const ids = JSON.parse(cached.flatScanIds);
    return Array.isArray(ids) ? ids : null;
  } catch {
    return null;
  }
}

export async function saveSearchCache(query: FlatScanListingsQuery, flatScanIds: string[]): Promise<void> {
  const signature = buildQuerySignature(query);
  await prisma.flatScanSearchCache.upsert({
    where: { querySignature: signature },
    create: { querySignature: signature, flatScanIds: JSON.stringify(flatScanIds), fetchedAt: new Date() },
    update: { flatScanIds: JSON.stringify(flatScanIds), fetchedAt: new Date() }
  });
}

/** Returns a cached listing row if fresh; null if missing or stale (caller should re-fetch from the API). */
export async function getCachedListing(flatScanId: string) {
  const [cached, ttlHours] = await Promise.all([
    prisma.flatScanListingCache.findUnique({ where: { flatScanId } }),
    getCacheTtlHours()
  ]);
  if (!cached || !isFresh(cached.lastFetchedAt, ttlHours)) return null;
  return cached;
}

/** Returns a cached listing row regardless of freshness — used when hydrating a stale-but-still-useful fallback. */
export async function getCachedListingAnyAge(flatScanId: string) {
  return prisma.flatScanListingCache.findUnique({ where: { flatScanId } });
}

/** Upserts a freshly-fetched FlatScan listing into the cache, preserving firstSeenAt across re-fetches. */
export async function upsertListingCache(raw: FlatScanListing) {
  const row: FlatScanListingCacheRow = mapFlatScanListingToCacheRow(raw);
  const now = new Date();
  return prisma.flatScanListingCache.upsert({
    where: { flatScanId: row.flatScanId },
    create: { ...row, firstSeenAt: now, lastSeenAt: now, lastFetchedAt: now },
    update: { ...row, lastSeenAt: now, lastFetchedAt: now }
  });
}
