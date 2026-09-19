// FlatScanProvider — the direct FlatScan Data API integration (never routed
// through the generic WEB_SEARCH provider). Fetches a real candidate pool
// from FlatScan scoped to the subject's city/district/disposition/area/
// price range; the EXISTING Comparable Engine V2 scorer
// (comparableEngine.ts, unmodified) does the actual street > immediate
// area > locality > district > city priority ranking and similarity
// scoring once these candidates are persisted via comparableDiscovery.ts —
// FlatScanProvider's only job is supplying a good, real candidate pool.
//
// PENDING_ACCESS until FLATSCAN_API_KEY is set; CONNECTED once a real call
// succeeds; ERROR is surfaced via Provider Health (see /api/sources) from
// FlatScanRequestLog, never from this object's own state.
import { SourceNotAvailableError, type ListingSourceItem, type ListingSourceProvider, type ListingSourceQuery } from "../types";
import { flatScanGet, isFlatScanConfigured } from "./client";
import { getCachedSearchIds, saveSearchCache, getCachedListing, getCachedListingAnyAge, upsertListingCache } from "./cache";
import { flatScanListingId } from "./mapping";
import type { FlatScanListing, FlatScanListingsQuery, FlatScanListingsResponse } from "./types";

function toFlatScanQuery(query: ListingSourceQuery): FlatScanListingsQuery {
  return {
    city: query.municipality ?? undefined,
    district: query.district ?? undefined,
    disposition: query.dispositions?.[0] ?? undefined,
    price_max: query.maxPrice ?? undefined,
    area_min: query.minAreaM2 ?? undefined,
    area_max: query.maxAreaM2 ?? undefined,
    ownership_type: query.ownership ?? undefined
  };
}

/**
 * Runs (or reuses a cached) FlatScan /listings search and returns the
 * mapped ListingSourceItems. This is the single choke point every search
 * goes through, so the read-through cache (item 10) always applies.
 */
async function runSearch(flatScanQuery: FlatScanListingsQuery): Promise<ListingSourceItem[]> {
  const cachedIds = await getCachedSearchIds(flatScanQuery);

  let ids: string[];
  if (cachedIds) {
    ids = cachedIds;
  } else {
    const data = await flatScanGet<FlatScanListingsResponse>("/listings", flatScanQuery as Record<string, string | number | undefined>);
    const raw = data.results ?? data.items ?? [];
    await Promise.all(raw.map((listing) => upsertListingCache(listing).catch(() => null)));
    ids = raw.map((listing) => flatScanListingId(listing));
    await saveSearchCache(flatScanQuery, ids);
  }

  const items: ListingSourceItem[] = [];
  for (const id of ids) {
    const cached = (await getCachedListing(id)) ?? (await getCachedListingAnyAge(id));
    if (!cached || !cached.url || !cached.name || !cached.disposition || !cached.areaM2 || !cached.municipality) continue;
    const price = cached.priceCurrent ?? cached.priceOriginal;
    if (!price && !cached.onRequest) continue;
    items.push({
      externalId: cached.flatScanId,
      url: cached.url,
      portal: cached.portal || "FlatScan",
      title: cached.name,
      askingPrice: price ?? 0,
      disposition: cached.disposition,
      areaM2: cached.areaM2,
      municipality: cached.municipality,
      district: cached.locality ?? null,
      latitude: cached.latitude,
      longitude: cached.longitude,
      ownership: cached.ownership,
      condition: cached.condition,
      construction: cached.construction,
      floor: cached.floor,
      totalFloors: cached.totalFloors,
      elevator: cached.elevator,
      balcony: cached.balcony,
      terrace: cached.terrace,
      loggia: cached.loggia,
      parking: cached.parking,
      daysOnMarket: cached.daysOnMarket,
      discountPercent: cached.discountPercent,
      photos: [],
      publishedAt: (cached.sourceCreatedAt ?? cached.firstSeenAt).toISOString(),
      isDemo: false
    });
  }
  return items;
}

/** Fetches one listing directly by FlatScan id (GET /listings/{id}) — bypasses search caching, used for on-demand refresh (e.g. re-verifying the discovered original listing). */
export async function fetchFlatScanListingById(id: string): Promise<FlatScanListing | null> {
  const data = await flatScanGet<FlatScanListing | { result: FlatScanListing }>(`/listings/${encodeURIComponent(id)}`);
  const listing = "result" in data ? data.result : data;
  if (!listing || !listing.id) return null;
  await upsertListingCache(listing);
  return listing;
}

export const flatScanProvider: ListingSourceProvider = {
  key: "FLATSCAN",
  label: "FlatScan Data API",
  get status() {
    return isFlatScanConfigured() ? "ACTIVE" : "PENDING_ACCESS";
  },
  get statusNote() {
    return isFlatScanConfigured()
      ? undefined
      : "Čeká na FLATSCAN_API_KEY (viz DEPLOY.md). Bez klíče se FlatScan API nikdy nevolá a nic se nevymýšlí.";
  },

  async search(query: ListingSourceQuery): Promise<ListingSourceItem[]> {
    if (!isFlatScanConfigured()) {
      throw new SourceNotAvailableError("FLATSCAN_API_KEY není nastavený.");
    }
    return runSearch(toFlatScanQuery(query));
  },

  async findComparables(item: ListingSourceItem): Promise<ListingSourceItem[]> {
    if (!isFlatScanConfigured()) {
      throw new SourceNotAvailableError("FLATSCAN_API_KEY není nastavený.");
    }
    // A generous candidate pool — the existing Comparable Engine V2 scorer
    // (unchanged) does the real street/locality/district/city priority
    // ranking once these are persisted, so this query only needs to be
    // wide enough to give it real, genuinely comparable candidates.
    const flatScanQuery: FlatScanListingsQuery = {
      city: item.municipality || undefined,
      district: item.district || undefined,
      disposition: item.disposition || undefined,
      area_min: item.areaM2 ? item.areaM2 * 0.7 : undefined,
      area_max: item.areaM2 ? item.areaM2 * 1.3 : undefined,
      price_max: item.askingPrice ? item.askingPrice * 1.5 : undefined,
      ownership_type: item.ownership ?? undefined
    };
    const results = await runSearch(flatScanQuery);
    return results.filter((r) => r.url !== item.url && r.externalId !== item.externalId);
  }
};
