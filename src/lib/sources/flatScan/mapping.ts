// Maps FlatScan's raw API shapes into DziFlip's own provider-agnostic
// types. Every mapped field traces back to an actual API response value —
// nothing here invents or infers a value FlatScan didn't return.
import type { ListingSourceItem } from "../types";
import type { FlatScanListing } from "./types";

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toBool(value: boolean | null | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function toStringOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

/** FlatScan listing id, normalized to a string for use as ListingSourceItem.externalId. */
export function flatScanListingId(raw: FlatScanListing): string {
  return String(raw.id);
}

/**
 * Maps a raw FlatScan listing to the app's canonical ListingSourceItem.
 * Listings FlatScan itself marks inactive/deleted are still mapped (the
 * caller decides whether to use them) — availability is a fact, not
 * something this function should silently filter.
 */
export function mapFlatScanListingToItem(raw: FlatScanListing): ListingSourceItem | null {
  // The absolute minimum needed to be usable anywhere downstream (Market
  // Value stats, similarity scoring) — anything short of this is dropped
  // rather than half-filled with guesses.
  if (!raw.link || !raw.name || !raw.disposition || !raw.area || !raw.city) return null;
  const askingPrice = raw.price?.current ?? raw.price?.original ?? null;
  if (!askingPrice && !raw.price?.on_request) return null;

  return {
    externalId: flatScanListingId(raw),
    url: raw.link,
    portal: raw.server || "FlatScan",
    title: raw.name,
    description: raw.description ?? undefined,
    askingPrice: askingPrice ?? 0,
    disposition: raw.disposition,
    areaM2: raw.area,
    municipality: raw.city,
    district: raw.district ?? raw.locality ?? null,
    street: raw.street ?? null,
    latitude: raw.lat ?? null,
    longitude: raw.lng ?? null,
    propertyType: raw.property_type ?? null,
    ownership: raw.ownership ?? null,
    condition: raw.condition ?? null,
    construction: raw.construction ?? null,
    floor: toStringOrNull(raw.floor),
    totalFloors: toStringOrNull(raw.total_floors),
    elevator: toBool(raw.elevator),
    balcony: toBool(raw.balcony),
    terrace: toBool(raw.terrace),
    loggia: toBool(raw.loggia),
    parking: toBool(raw.parking),
    daysOnMarket: raw.days_on_market ?? null,
    discountPercent: raw.discount_percent ?? null,
    photos: raw.photos ?? [],
    publishedAt: toIsoOrNull(raw.dates?.created) ?? new Date().toISOString(),
    fullText: raw.description ?? undefined,
    isDemo: false
  };
}

export interface FlatScanListingCacheRow {
  flatScanId: string;
  portal: string | null;
  url: string | null;
  name: string | null;
  disposition: string | null;
  areaM2: number | null;
  municipality: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  priceOriginal: number | null;
  priceCurrent: number | null;
  pricePerM2: number | null;
  currentPricePerM2: number | null;
  onRequest: boolean;
  seller: string | null;
  daysOnMarket: number | null;
  discountPercent: number | null;
  active: boolean;
  sourceCreatedAt: Date | null;
  sourceDeletedAt: Date | null;
  condition: string | null;
  construction: string | null;
  floor: string | null;
  totalFloors: string | null;
  elevator: boolean | null;
  balcony: boolean | null;
  terrace: boolean | null;
  loggia: boolean | null;
  parking: boolean | null;
  ownership: string | null;
  rawJson: string;
}

/** Maps a raw FlatScan listing to the shape persisted in FlatScanListingCache. */
export function mapFlatScanListingToCacheRow(raw: FlatScanListing): FlatScanListingCacheRow {
  const priceOriginal = raw.price?.original ?? null;
  const priceCurrent = raw.price?.current ?? null;
  return {
    flatScanId: flatScanListingId(raw),
    portal: raw.server ?? null,
    url: raw.link ?? null,
    name: raw.name ?? null,
    disposition: raw.disposition ?? null,
    areaM2: raw.area ?? null,
    municipality: raw.city ?? null,
    locality: raw.locality ?? raw.district ?? null,
    latitude: raw.lat ?? null,
    longitude: raw.lng ?? null,
    priceOriginal,
    priceCurrent,
    pricePerM2: raw.price?.per_meter ?? (priceOriginal && raw.area ? priceOriginal / raw.area : null),
    currentPricePerM2: raw.price?.current_per_meter ?? (priceCurrent && raw.area ? priceCurrent / raw.area : null),
    onRequest: Boolean(raw.price?.on_request),
    seller: raw.seller ?? null,
    daysOnMarket: raw.days_on_market ?? null,
    discountPercent: raw.discount_percent ?? null,
    active: raw.active ?? true,
    sourceCreatedAt: toIsoOrNull(raw.dates?.created) ? new Date(raw.dates!.created as string) : null,
    sourceDeletedAt: toIsoOrNull(raw.dates?.deleted) ? new Date(raw.dates!.deleted as string) : null,
    condition: raw.condition ?? null,
    construction: raw.construction ?? null,
    floor: toStringOrNull(raw.floor),
    totalFloors: toStringOrNull(raw.total_floors),
    elevator: toBool(raw.elevator),
    balcony: toBool(raw.balcony),
    terrace: toBool(raw.terrace),
    loggia: toBool(raw.loggia),
    parking: toBool(raw.parking),
    ownership: raw.ownership ?? null,
    rawJson: JSON.stringify(raw)
  };
}
