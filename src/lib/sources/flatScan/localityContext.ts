// District/locality context (item 9) — GET /districts, /localities, /stats.
// Cached far less aggressively than individual listings (locality-level
// aggregates move slowly) and only ever shown in the UI when the API
// actually returns a real number — never computed or guessed locally.
import { prisma } from "@/lib/prisma";
import { flatScanGet } from "./client";
import type { FlatScanDistrict, FlatScanLocality, FlatScanStats } from "./types";

// Locality aggregates change slowly — cache far longer than individual
// listings regardless of the (listing-focused) Settings TTL.
const LOCALITY_CACHE_TTL_HOURS = 24 * 7;

function normKey(municipality: string | null, district: string | null): string {
  return `${(municipality ?? "").trim().toLowerCase()}|${(district ?? "").trim().toLowerCase()}`;
}

export interface LocalityContext {
  municipality: string | null;
  district: string | null;
  medianPricePerM2: number | null;
  avgPricePerM2: number | null;
  activeListingCount: number | null;
  trendPct: number | null;
  fetchedAt: Date;
}

function isFresh(fetchedAt: Date): boolean {
  return (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60) < LOCALITY_CACHE_TTL_HOURS;
}

async function fetchFromLocalities(municipality: string, district: string | null): Promise<LocalityContext | null> {
  const data = await flatScanGet<{ results?: FlatScanLocality[]; localities?: FlatScanLocality[] }>("/localities", {
    city: municipality,
    district: district ?? undefined
  });
  const list = data.results ?? data.localities ?? [];
  const match = district ? list.find((l) => l.name?.toLowerCase() === district.toLowerCase()) ?? list[0] : list[0];
  if (!match) return null;
  return {
    municipality,
    district,
    medianPricePerM2: match.median_price_per_meter ?? null,
    avgPricePerM2: match.avg_price_per_meter ?? null,
    activeListingCount: match.active_listings ?? null,
    trendPct: match.trend_pct ?? null,
    fetchedAt: new Date()
  };
}

async function fetchFromDistricts(municipality: string, district: string | null): Promise<LocalityContext | null> {
  const data = await flatScanGet<{ results?: FlatScanDistrict[]; districts?: FlatScanDistrict[] }>("/districts", {
    city: municipality
  });
  const list = data.results ?? data.districts ?? [];
  const match = district ? list.find((d) => d.name?.toLowerCase() === district.toLowerCase()) : list[0];
  if (!match) return null;
  return {
    municipality,
    district,
    medianPricePerM2: match.median_price_per_meter ?? null,
    avgPricePerM2: match.avg_price_per_meter ?? null,
    activeListingCount: match.active_listings ?? null,
    trendPct: match.trend_pct ?? null,
    fetchedAt: new Date()
  };
}

/** Raw /stats fetch — exposed separately since its exact scope (city-wide vs. locality-specific) isn't confirmed by the brief; not part of the main orchestration below to conserve API budget. */
export async function fetchFlatScanStats(municipality: string, district?: string | null): Promise<FlatScanStats | null> {
  const data = await flatScanGet<{ results?: FlatScanStats[] } | FlatScanStats>("/stats", {
    city: municipality,
    district: district ?? undefined
  });
  if (Array.isArray((data as any).results)) return (data as any).results[0] ?? null;
  return data as FlatScanStats;
}

/**
 * Returns cached locality context if fresh; otherwise tries /localities
 * (most specific) then falls back to /districts. Returns null — never a
 * fabricated number — if FlatScan isn't configured, both calls fail, or
 * neither endpoint has data for this area.
 */
export async function getFlatScanLocalityContext(municipality: string | null, district: string | null): Promise<LocalityContext | null> {
  if (!municipality) return null;
  const key = normKey(municipality, district);

  const cached = await prisma.flatScanLocalityStats.findUnique({ where: { key } });
  if (cached && isFresh(cached.fetchedAt)) {
    return {
      municipality: cached.municipality,
      district: cached.district,
      medianPricePerM2: cached.medianPricePerM2,
      avgPricePerM2: cached.avgPricePerM2,
      activeListingCount: cached.activeListingCount,
      trendPct: cached.trendPct,
      fetchedAt: cached.fetchedAt
    };
  }

  let context: LocalityContext | null = null;
  try {
    context = await fetchFromLocalities(municipality, district);
  } catch {
    context = null;
  }
  if (!context || (context.medianPricePerM2 == null && context.avgPricePerM2 == null)) {
    try {
      context = await fetchFromDistricts(municipality, district);
    } catch {
      context = context; // keep whatever /localities gave us, even if empty
    }
  }

  if (!context) return null;

  await prisma.flatScanLocalityStats.upsert({
    where: { key },
    create: {
      key,
      municipality: context.municipality,
      district: context.district,
      medianPricePerM2: context.medianPricePerM2,
      avgPricePerM2: context.avgPricePerM2,
      activeListingCount: context.activeListingCount,
      trendPct: context.trendPct,
      fetchedAt: context.fetchedAt
    },
    update: {
      medianPricePerM2: context.medianPricePerM2,
      avgPricePerM2: context.avgPricePerM2,
      activeListingCount: context.activeListingCount,
      trendPct: context.trendPct,
      fetchedAt: context.fetchedAt
    }
  });

  return context;
}

export interface LocalityDeviation {
  listingPricePerM2: number;
  localityPricePerM2: number;
  diffAbs: number;
  diffPct: number;
}

/** Pure comparison of the analyzed listing's Kč/m² against the locality median — only called when both numbers are real. */
export function computeLocalityDeviation(listingPricePerM2: number, localityPricePerM2: number): LocalityDeviation {
  const diffAbs = listingPricePerM2 - localityPricePerM2;
  const diffPct = localityPricePerM2 > 0 ? diffAbs / localityPricePerM2 : 0;
  return { listingPricePerM2, localityPricePerM2, diffAbs, diffPct };
}
