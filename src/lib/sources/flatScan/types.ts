// Raw FlatScan Data API response shapes. Only the fields named in the
// integration brief are typed as guaranteed-present; everything else
// (condition, construction, floor, elevator, balcony/terrace, parking,
// ownership — needed for Comparable Engine V2 scoring, item 4) is typed as
// optional/unknown-shaped, because the documented example lists only a
// minimum field set ("obsahuje minimálně"). The mapper (mapping.ts) reads
// these defensively — a field FlatScan doesn't actually return is left
// null, never guessed. Verify the exact optional-field names against the
// real API docs once FLATSCAN_API_KEY is available and adjust mapping.ts;
// nothing else in the app needs to change.

export interface FlatScanPrice {
  original?: number | null;
  current?: number | null;
  per_meter?: number | null;
  current_per_meter?: number | null;
  on_request?: boolean | null;
}

export interface FlatScanDates {
  created?: string | null;
  deleted?: string | null;
}

export interface FlatScanListing {
  id: string | number;
  name: string;
  disposition: string;
  area: number;
  city: string;
  locality?: string | null;
  server: string; // the original portal, e.g. "Sreality.cz"
  link: string;
  price: FlatScanPrice;
  seller?: string | null;
  days_on_market?: number | null;
  discount_percent?: number | null;
  lat?: number | null;
  lng?: number | null;
  active?: boolean | null;
  dates?: FlatScanDates | null;

  // Not in the documented minimal example — read defensively if present.
  district?: string | null;
  street?: string | null;
  property_type?: string | null;
  condition?: string | null;
  construction?: string | null;
  ownership?: string | null;
  floor?: string | number | null;
  total_floors?: string | number | null;
  elevator?: boolean | null;
  balcony?: boolean | null;
  terrace?: boolean | null;
  loggia?: boolean | null;
  parking?: boolean | null;
  description?: string | null;
  photos?: string[] | null;
}

export interface FlatScanListingsResponse {
  results?: FlatScanListing[];
  items?: FlatScanListing[]; // some FlatScan-style APIs use "items" instead of "results" — read defensively
  total?: number;
}

export interface FlatScanPriceHistoryPoint {
  price: number;
  date?: string | null;
  recorded_at?: string | null;
  timestamp?: string | null;
}

export interface FlatScanPriceHistoryResponse {
  history?: FlatScanPriceHistoryPoint[];
  price_history?: FlatScanPriceHistoryPoint[];
}

export interface FlatScanDistrict {
  name: string;
  city?: string | null;
  median_price_per_meter?: number | null;
  avg_price_per_meter?: number | null;
  active_listings?: number | null;
  trend_pct?: number | null;
}

export interface FlatScanLocality {
  name: string;
  city?: string | null;
  district?: string | null;
  median_price_per_meter?: number | null;
  avg_price_per_meter?: number | null;
  active_listings?: number | null;
  trend_pct?: number | null;
}

export interface FlatScanStats {
  city?: string | null;
  district?: string | null;
  locality?: string | null;
  median_price_per_meter?: number | null;
  avg_price_per_meter?: number | null;
  active_listings?: number | null;
  trend_pct?: number | null;
}

export interface FlatScanListingsQuery {
  city?: string;
  district?: string;
  disposition?: string;
  price_min?: number;
  price_max?: number;
  area_min?: number;
  area_max?: number;
  ownership_type?: string;
  server?: string;
}
