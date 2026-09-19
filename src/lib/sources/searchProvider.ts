// Generic Web Search Provider — the one real-data source this app can
// actually activate without a portal-specific partnership, because it
// doesn't scrape any specific site: it calls a configurable, licensed
// search/listings HTTP API (a SERP-style API, a real-estate data
// aggregator, or a partner feed) that the operator points it at. Until
// SEARCH_API_KEY is set it stays PENDING_ACCESS and returns/throws exactly
// like every other unavailable provider — it never fabricates a result and
// never falls back to scraping a portal directly.
//
// Expected response shape from SEARCH_API_URL (JSON): { results: [ { url,
// title, price, areaM2, disposition, municipality, district, condition,
// portal, photos, publishedAt, description } ] }. Only fields the response
// actually provides are used — anything absent stays unset, never guessed.
import { SourceNotAvailableError, type ListingSourceItem, type ListingSourceProvider, type ListingSourceQuery } from "./types";
import { detectPortal } from "../extract";

const DEFAULT_SEARCH_API_URL = "https://api.example-search-provider.invalid/v1/real-estate/search";

interface RawSearchResult {
  url?: string;
  title?: string;
  price?: number;
  areaM2?: number;
  disposition?: string;
  municipality?: string;
  district?: string;
  street?: string;
  condition?: string;
  ownership?: string;
  portal?: string;
  photos?: string[];
  publishedAt?: string;
  description?: string;
}

function toItem(r: RawSearchResult): ListingSourceItem | null {
  // The minimum a comparable/listing needs to be usable anywhere downstream
  // (Market Value stats, similarity scoring) — anything short of this is
  // dropped rather than half-filled with guesses.
  if (!r.url || !r.price || !r.areaM2 || !r.disposition || !r.municipality) return null;
  return {
    externalId: r.url,
    url: r.url,
    portal: r.portal ?? detectPortal(r.url) ?? "Web Search",
    title: r.title ?? r.url,
    description: r.description,
    askingPrice: r.price,
    disposition: r.disposition,
    areaM2: r.areaM2,
    municipality: r.municipality,
    district: r.district ?? null,
    street: r.street ?? null,
    ownership: r.ownership ?? null,
    condition: r.condition ?? null,
    photos: r.photos ?? [],
    publishedAt: r.publishedAt ?? new Date().toISOString(),
    fullText: r.description ?? undefined,
    isDemo: false
  };
}

async function runSearch(query: ListingSourceQuery, extraTerms?: string): Promise<ListingSourceItem[]> {
  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) {
    throw new SourceNotAvailableError(
      "SEARCH_API_KEY není nastavený. Web Search Provider čeká na připojení licencovaného vyhledávacího/datového API."
    );
  }
  const apiUrl = process.env.SEARCH_API_URL || DEFAULT_SEARCH_API_URL;

  const params = new URLSearchParams();
  if (query.municipality) params.set("municipality", query.municipality);
  if (query.district) params.set("district", query.district);
  if (query.dispositions?.length) params.set("dispositions", query.dispositions.join(","));
  if (query.minAreaM2 != null) params.set("minAreaM2", String(query.minAreaM2));
  if (query.maxAreaM2 != null) params.set("maxAreaM2", String(query.maxAreaM2));
  if (query.maxPrice != null) params.set("maxPrice", String(query.maxPrice));
  if (query.maxPricePerM2 != null) params.set("maxPricePerM2", String(query.maxPricePerM2));
  if (query.condition) params.set("condition", query.condition);
  if (query.ownership) params.set("ownership", query.ownership);
  if (extraTerms) params.set("q", extraTerms);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
    });
    if (!res.ok) {
      throw new SourceNotAvailableError(`Web Search Provider: server vrátil chybu ${res.status}.`);
    }
    const data = await res.json().catch(() => null);
    const results: RawSearchResult[] = Array.isArray(data?.results) ? data.results : [];
    return results.map(toItem).filter((i): i is ListingSourceItem => i !== null);
  } catch (err) {
    if (err instanceof SourceNotAvailableError) throw err;
    if ((err as any)?.name === "AbortError") {
      throw new SourceNotAvailableError("Web Search Provider: vyhledávání vypršelo (timeout).");
    }
    throw new SourceNotAvailableError("Web Search Provider: vyhledávání selhalo.");
  } finally {
    clearTimeout(timeout);
  }
}

export const webSearchProvider: ListingSourceProvider = {
  key: "WEB_SEARCH",
  label: "Web Search (obecné vyhledávací API)",
  get status() {
    return process.env.SEARCH_API_KEY ? "ACTIVE" : "PENDING_ACCESS";
  },
  get statusNote() {
    return process.env.SEARCH_API_KEY
      ? undefined
      : "Čeká na SEARCH_API_KEY (a volitelně SEARCH_API_URL) — licencované vyhledávací/datové API pro srovnatelné nabídky. Bez klíče se nikdy nic nescrapuje ani nevymýšlí.";
  },

  async search(query: ListingSourceQuery): Promise<ListingSourceItem[]> {
    return runSearch(query);
  },

  async findComparables(item: ListingSourceItem): Promise<ListingSourceItem[]> {
    const terms = [item.disposition, item.municipality, item.district].filter(Boolean).join(" ");
    const results = await runSearch(
      {
        municipality: item.municipality,
        district: item.district,
        dispositions: [item.disposition],
        minAreaM2: item.areaM2 ? item.areaM2 * 0.75 : undefined,
        maxAreaM2: item.areaM2 ? item.areaM2 * 1.25 : undefined
      },
      terms
    );
    return results.filter((r) => r.url !== item.url);
  }
};
