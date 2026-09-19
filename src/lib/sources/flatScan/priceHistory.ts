// Price history (item 8) — GET /listings/{id}/price-history, cached per
// listing so re-opening a project never re-fetches history that hasn't
// changed. Deliberately NOT fetched eagerly for every comparable (that
// would burn the monthly call budget fast); callers fetch it on demand for
// one listing at a time (e.g. the user expanding a comparable's detail, or
// the discovered original listing).
import { prisma } from "@/lib/prisma";
import { flatScanGet } from "./client";
import { getCacheTtlHours } from "./cache";
import type { FlatScanPriceHistoryResponse, FlatScanPriceHistoryPoint } from "./types";

function parsePoint(p: FlatScanPriceHistoryPoint): { price: number; recordedAt: Date } | null {
  const dateRaw = p.date ?? p.recorded_at ?? p.timestamp;
  if (!dateRaw || typeof p.price !== "number") return null;
  const recordedAt = new Date(dateRaw);
  if (!Number.isFinite(recordedAt.getTime())) return null;
  return { price: p.price, recordedAt };
}

/**
 * Returns the price history for one FlatScan listing, serving from cache
 * when fresh. `listingCacheId` must be an existing FlatScanListingCache row
 * id (see cache.ts) — history is always attached to a cached listing, never
 * stored standalone.
 */
export async function getFlatScanPriceHistory(flatScanId: string, listingCacheId: string) {
  const ttlHours = await getCacheTtlHours();
  const existing = await prisma.flatScanPriceHistoryCache.findMany({
    where: { listingCacheId },
    orderBy: { recordedAt: "asc" }
  });
  const freshest = existing[existing.length - 1];
  if (existing.length > 0 && freshest && (Date.now() - freshest.fetchedAt.getTime()) / (1000 * 60 * 60) < ttlHours) {
    return existing;
  }

  const data = await flatScanGet<FlatScanPriceHistoryResponse>(`/listings/${encodeURIComponent(flatScanId)}/price-history`);
  const points = (data.history ?? data.price_history ?? []).map(parsePoint).filter((p): p is { price: number; recordedAt: Date } => p !== null);

  if (points.length === 0) return existing; // API returned nothing usable — keep whatever we already had, never fabricate

  await prisma.flatScanPriceHistoryCache.deleteMany({ where: { listingCacheId } });
  await prisma.flatScanPriceHistoryCache.createMany({
    data: points.map((p) => ({ listingCacheId, price: p.price, recordedAt: p.recordedAt }))
  });
  return prisma.flatScanPriceHistoryCache.findMany({ where: { listingCacheId }, orderBy: { recordedAt: "asc" } });
}

export interface PriceHistorySummary {
  originalPrice: number | null;
  currentPrice: number | null;
  dropAmount: number | null; // Kč, positive = price dropped
  dropPct: number | null; // 0-1, positive = price dropped
  changeCount: number; // how many times the price actually changed
  daysOnMarket: number | null;
}

/**
 * Pure summary of a price-history series. Never concludes anything about
 * whether the property is "worth buying" — that judgment stays entirely
 * with the app's own math-only economics engine (calc.ts), never FlatScan's
 * own AI deal score, and never this function.
 */
export function computePriceHistorySummary(
  history: Array<{ price: number | null; recordedAt: Date }>,
  daysOnMarket: number | null = null
): PriceHistorySummary {
  const priced = history.filter((h): h is { price: number; recordedAt: Date } => typeof h.price === "number").sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  if (priced.length === 0) {
    return { originalPrice: null, currentPrice: null, dropAmount: null, dropPct: null, changeCount: 0, daysOnMarket };
  }

  const originalPrice = priced[0].price;
  const currentPrice = priced[priced.length - 1].price;
  let changeCount = 0;
  for (let i = 1; i < priced.length; i++) {
    if (priced[i].price !== priced[i - 1].price) changeCount++;
  }

  const dropAmount = originalPrice - currentPrice;
  const dropPct = originalPrice > 0 ? dropAmount / originalPrice : null;

  return { originalPrice, currentPrice, dropAmount, dropPct, changeCount, daysOnMarket };
}
