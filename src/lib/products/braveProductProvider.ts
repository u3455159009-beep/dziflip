// Brave Product Search Provider — real Czech e-shop product search (Request
// D, item 7) using the same Brave Search API as braveSearchProvider.ts (see
// src/lib/braveSearch/client.ts), restricted to major Czech e-shop domains
// via `site:` operators. No page HTML is ever fetched and no anti-bot/
// CAPTCHA is touched — every field comes from what Brave's own API already
// returns for the query (title, url, description).
//
// A search snippet is not a structured product feed, so price is parsed
// from the real returned title/description text with a conservative,
// explicit Czech price regex — never invented. Anything that doesn't yield
// a real product name, a real product URL on one of the allowed domains,
// and a real parsed price is dropped rather than half-filled. Because a
// snippet's price can be stale or a "from" price rather than confirmed at
// the specific product page, results are marked confidence "ESTIMATED",
// never "VERIFIED" — an honest description of how sure this actually is,
// unlike a provider reading a structured, live price field.
//
// Until BRAVE_SEARCH_API_KEY is set this stays PENDING_ACCESS like every
// other real-data provider — it never fabricates a product, price, or URL.
import { braveWebSearch, isBraveSearchConfigured, BraveSearchNotAvailableError, type BraveWebResult } from "../braveSearch/client";
import { ProductNotAvailableError, type ProductCandidate, type ProductProvider, type ProductSearchQuery } from "./types";

// Major Czech e-shops carrying renovation materials/products — restricts
// results to real retailers this app can meaningfully link a buyer to.
const CZ_SHOP_DOMAINS = [
  "alza.cz",
  "mall.cz",
  "hornbach.cz",
  "dek.cz",
  "obi.cz",
  "bauhaus.cz",
  "ikea.com",
  "sanitino.cz",
  "koupelny-ptacek.cz"
];

const RETAILER_LABELS: Record<string, string> = {
  "alza.cz": "Alza.cz",
  "mall.cz": "Mall.cz",
  "hornbach.cz": "Hornbach",
  "dek.cz": "DEK",
  "obi.cz": "OBI",
  "bauhaus.cz": "Bauhaus",
  "ikea.com": "IKEA",
  "sanitino.cz": "Sanitino.cz",
  "koupelny-ptacek.cz": "Koupelny Ptáček"
};

function retailerFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const domain = CZ_SHOP_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`));
    return domain ? RETAILER_LABELS[domain] ?? domain : null;
  } catch {
    return null;
  }
}

// Matches real Czech price formatting actually used on these sites —
// "1 299 Kč", "15999 Kč", "12 990,- Kč", "899,90 Kč" — whether or not the
// thousands are grouped with a space, by capturing the whole digit/space
// run immediately before the currency marker as one token rather than
// assuming exact 3-digit grouping. Deliberately requires a currency marker
// (Kč / ,-) directly after the number, so it never mistakes a bare number
// like a product code, EAN, or a "1200x600 mm" dimension for a price.
const PRICE_RE = /(\d[\d\s ]{0,9})(?:[.,](\d{1,2}))?\s*(?:Kč|,-)/;

function parsePrice(text: string): number | null {
  const m = text.match(PRICE_RE);
  if (!m) return null;
  const integerPart = m[1].replace(/[\s ]/g, "");
  const decimalPart = m[2] ? `.${m[2]}` : "";
  const value = parseFloat(integerPart + decimalPart);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildQuery(query: ProductSearchQuery): string {
  const siteFilter = `(${CZ_SHOP_DOMAINS.map((d) => `site:${d}`).join(" OR ")})`;
  const terms = [query.description, query.style, query.referenceLocality].filter((t): t is string => Boolean(t)).join(" ");
  return `${siteFilter} ${terms}`.trim();
}

function toCandidate(r: BraveWebResult, query: ProductSearchQuery): ProductCandidate | null {
  if (!r.url || !r.title) return null;
  const retailer = retailerFromUrl(r.url);
  if (!retailer) return null; // only ever a real, allow-listed retailer — never an unrelated page

  const text = [r.title, r.description].filter(Boolean).join(" ");
  const price = parsePrice(text);
  if (price === null) return null; // no real price found in the actual returned text — drop, never guess one

  return {
    productId: r.url,
    name: r.title,
    category: query.category,
    description: r.description,
    productUrl: r.url,
    retailer,
    price,
    unitPrice: price,
    availability: "UNKNOWN", // a search snippet never reliably states live stock — honest, not guessed
    lastCheckedAt: new Date().toISOString(),
    source: "BRAVE_PRODUCT_SEARCH",
    confidence: "ESTIMATED"
  };
}

async function runSearch(query: ProductSearchQuery): Promise<ProductCandidate[]> {
  try {
    const results = await braveWebSearch(buildQuery(query));
    return results.map((r) => toCandidate(r, query)).filter((c): c is ProductCandidate => c !== null);
  } catch (err) {
    if (err instanceof BraveSearchNotAvailableError) throw new ProductNotAvailableError(err.message);
    throw err;
  }
}

export const braveProductProvider: ProductProvider = {
  key: "BRAVE_PRODUCT_SEARCH",
  label: "Brave Search (reálné produkty z českých e-shopů)",
  get status() {
    return isBraveSearchConfigured() ? "ACTIVE" : "PENDING_ACCESS";
  },
  get statusNote() {
    return isBraveSearchConfigured()
      ? undefined
      : "Čeká na BRAVE_SEARCH_API_KEY — stejný klíč jako Brave Search pro srovnatelné nabídky (brave.com/search/api). Bez klíče se nikdy žádný produkt/cena/URL nevymýšlí.";
  },

  async search(query: ProductSearchQuery): Promise<ProductCandidate[]> {
    return runSearch(query);
  },

  async refresh(productId: string): Promise<ProductCandidate | null> {
    // productId is the product's own real URL (see toCandidate above) — a
    // meaningful "refresh" would need to re-fetch that specific page, which
    // this provider deliberately never does (no page HTML is ever fetched,
    // only Brave's own search API is used). Re-running search() with the
    // original requirement is the real way to get a fresh candidate list;
    // a single stale URL can't be re-verified without becoming a scraper.
    return null;
  }
};
