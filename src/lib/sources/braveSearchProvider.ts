// Brave Search Provider — the concrete, currently-obtainable replacement
// for a FlatScan-style listings API (Request D, item 2). FlatScan itself
// never responded to an access request; rather than block the whole app on
// one unresponsive vendor, this calls Brave's own commercial Search API
// (see src/lib/braveSearch/client.ts) restricted to major Czech real-estate
// portal domains via `site:` operators. This is NOT a scraper: no page
// HTML is ever fetched, no anti-bot/CAPTCHA is touched — every field comes
// from what Brave's own API already returns (title, url, description).
//
// A search snippet is not a structured listings feed, so the real
// title/description text returned for each hit is run back through
// extractFromText() — the exact same deterministic, "VERIFIED-or-absent"
// parser used for a pasted listing — rather than a second, parallel
// parser. A result is only ever kept if that real text yields the minimum
// usable fields (price, area, disposition, municipality); anything short
// of that is dropped, never half-filled with a guess.
//
// Until BRAVE_SEARCH_API_KEY is set this stays PENDING_ACCESS like every
// other real-data provider — it never fabricates a result.
import { braveWebSearch, isBraveSearchConfigured, BraveSearchNotAvailableError, type BraveWebResult } from "../braveSearch/client";
import { extractFromText, detectPortal } from "../extract";
import { SourceNotAvailableError, type ListingSourceItem, type ListingSourceProvider, type ListingSourceQuery } from "./types";

// Major Czech real-estate portals to restrict the search to — keeps
// results on-topic and avoids returning unrelated pages that happen to
// mention a price and a city. Extend this list (never remove the `site:`
// restriction) if another portal should be covered.
const REAL_ESTATE_DOMAINS = ["sreality.cz", "bezrealitky.cz", "reality.idnes.cz", "reality.bazos.cz"];

function buildQuery(query: ListingSourceQuery, extraTerms?: string): string {
  const siteFilter = `(${REAL_ESTATE_DOMAINS.map((d) => `site:${d}`).join(" OR ")})`;
  const terms = [
    extraTerms,
    query.municipality,
    query.district,
    query.dispositions?.length ? query.dispositions.join(" OR ") : null,
    "prodej bytu"
  ]
    .filter((t): t is string => Boolean(t))
    .join(" ");
  return `${siteFilter} ${terms}`.trim();
}

/**
 * Turns one real Brave search hit into a ListingSourceItem by re-running
 * its own real title+description text through the same extractFromText()
 * used for a pasted listing. Returns null (dropped, never guessed) if that
 * text doesn't yield the minimum fields anything downstream needs.
 */
function toItem(r: BraveWebResult): ListingSourceItem | null {
  if (!r.url || !r.title) return null;
  const text = [r.title, r.description].filter(Boolean).join("\n");
  const extracted = extractFromText(text, r.url);
  const f = extracted.fields;
  if (!f.askingPrice || !f.areaM2 || !f.disposition || !f.municipality) return null;

  return {
    externalId: r.url,
    url: r.url,
    portal: detectPortal(r.url) ?? "Brave Search",
    title: r.title,
    description: r.description,
    askingPrice: f.askingPrice,
    disposition: f.disposition,
    areaM2: f.areaM2,
    municipality: f.municipality,
    district: f.district ?? null,
    street: f.street ?? null,
    ownership: f.ownership ?? null,
    condition: f.condition ?? null,
    construction: f.construction,
    floor: f.floor,
    totalFloors: f.totalFloors,
    elevator: f.elevator,
    balcony: f.balcony,
    terrace: f.terrace,
    loggia: f.loggia,
    cellar: f.cellar,
    parking: f.parking,
    energyRating: f.penb,
    photos: [],
    // Brave's web results don't carry a reliable structured listing
    // publish date — "now" honestly means "the moment this search found
    // it", the same fallback the existing generic Web Search provider
    // already uses for exactly this reason, never an invented listing date.
    publishedAt: new Date().toISOString(),
    fullText: text,
    isDemo: false
  };
}

async function runSearch(query: ListingSourceQuery, extraTerms?: string): Promise<ListingSourceItem[]> {
  try {
    const results = await braveWebSearch(buildQuery(query, extraTerms));
    return results.map(toItem).filter((i): i is ListingSourceItem => i !== null);
  } catch (err) {
    if (err instanceof BraveSearchNotAvailableError) throw new SourceNotAvailableError(err.message);
    throw err;
  }
}

export const braveSearchProvider: ListingSourceProvider = {
  key: "BRAVE_SEARCH",
  label: "Brave Search (reálné inzeráty z českých realitních portálů)",
  get status() {
    return isBraveSearchConfigured() ? "ACTIVE" : "PENDING_ACCESS";
  },
  get statusNote() {
    return isBraveSearchConfigured()
      ? undefined
      : "Čeká na BRAVE_SEARCH_API_KEY — Brave Search API (brave.com/search/api), samoobslužné vytvoření klíče, reálný dokumentovaný endpoint. Bez klíče se nikdy nic nescrapuje ani nevymýšlí.";
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
        dispositions: [item.disposition]
      },
      terms
    );
    return results.filter((r) => r.url !== item.url);
  }
};
