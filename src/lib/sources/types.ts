// Provider interface for Deal Radar listing sources. Every implementation
// must either return real, verifiably-sourced items or refuse to run —
// never synthesize data to look like a live feed. CAPTCHA bypass, anti-bot
// circumvention, or scraping behind login walls is explicitly out of scope;
// a provider without an approved/stable data access path must report
// status "PENDING_ACCESS" and throw SourceNotAvailableError from search().

export interface ListingSourceQuery {
  municipality?: string | null;
  district?: string | null;
  dispositions?: string[]; // e.g. ["2+1", "2+kk"]
  minAreaM2?: number | null;
  maxAreaM2?: number | null;
  maxPrice?: number | null;
  maxPricePerM2?: number | null;
  condition?: string | null;
  ownership?: string | null; // "OSOBNI" | "DRUZSTEVNI"
  onlyNewListings?: boolean;
}

/**
 * The canonical Listing object every source provider (DEMO, manual URL/text,
 * or a real portal API) must normalize into. Once persisted, a Listing
 * becomes a Project: each field's VALUE is the Project column, its
 * CONFIDENCE lives in Project.fieldMeta, and its SOURCE (which provider or
 * "ruční zadání" supplied it) lives in Project.fieldSource — see
 * src/lib/listing/fieldMeta.ts for the shared helpers that keep those two
 * JSON maps in sync. Fields a provider cannot supply are simply omitted —
 * never filled with a guess.
 */
export interface ListingSourceItem {
  externalId: string; // stable id from the source — used for dedup, must never change between runs
  url: string;
  portal: string;
  title: string;
  description?: string;
  askingPrice: number;
  disposition: string;
  areaM2: number;
  municipality: string;
  district: string | null;
  street?: string | null;
  // Only ever set from real structured source data (e.g. JSON-LD geo
  // coordinates embedded by the site) — never geocoded or guessed.
  latitude?: number | null;
  longitude?: number | null;
  propertyType?: string | null; // maps to Project.buildingType
  ownership: string | null;
  condition: string | null;
  buildingCondition?: string | null;
  buildingType?: string | null;
  construction?: string | null;
  floor?: string | null;
  totalFloors?: string | null;
  elevator?: boolean | null;
  balcony?: boolean | null;
  terrace?: boolean | null;
  loggia?: boolean | null;
  cellar?: boolean | null;
  parking?: boolean | null;
  energyRating?: string | null; // maps to Project.penb
  orientation?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  photos: string[];
  publishedAt: string; // ISO date
  sourceUpdatedAt?: string | null; // ISO date — when the source portal says it last changed
  fullText?: string;
  isDemo: boolean; // true only for the MOCK_DEMO fixture provider
}

export type SourceProviderStatus = "ACTIVE" | "PENDING_ACCESS";

export class SourceNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceNotAvailableError";
  }
}

export interface ListingSourceProvider {
  key: string;
  label: string;
  status: SourceProviderStatus;
  /** Human-readable note explaining why a PENDING_ACCESS provider can't run yet. */
  statusNote?: string;
  search(query: ListingSourceQuery): Promise<ListingSourceItem[]>;
  /** Best-effort comparables for a given item, from the same source only. */
  findComparables?(item: ListingSourceItem): Promise<ListingSourceItem[]>;
}
