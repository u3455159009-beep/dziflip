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

export interface ListingSourceItem {
  externalId: string; // stable id from the source — used for dedup, must never change between runs
  url: string;
  portal: string;
  title: string;
  askingPrice: number;
  disposition: string;
  areaM2: number;
  municipality: string;
  district: string | null;
  condition: string | null;
  ownership: string | null;
  photos: string[];
  publishedAt: string; // ISO date
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
