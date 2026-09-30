// Shared low-level Brave Search API client — used by both the comparable-
// listing source provider (src/lib/sources/braveSearchProvider.ts) and the
// Czech product-search provider (src/lib/products/braveProductProvider.ts).
// One real, documented REST API (https://api.search.brave.com/res/v1/web/search,
// header X-Subscription-Token — https://brave.com/search/api/), self-serve
// signup, real ToS covering programmatic consumption of search results.
// This is never a scraper: no target-site HTML is ever fetched here, only
// what Brave's own API already returns for a query.
const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const REQUEST_TIMEOUT_MS = 12000;

export class BraveSearchNotAvailableError extends Error {}

export interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
}

export function getBraveApiKey(): string | undefined {
  const raw = process.env.BRAVE_SEARCH_API_KEY;
  if (!raw) return undefined;
  return raw.trim() || undefined;
}

export function isBraveSearchConfigured(): boolean {
  return Boolean(getBraveApiKey());
}

/**
 * Runs one real Brave web search and returns its real `web.results` array
 * verbatim (title/url/description) — no parsing, no filtering, no
 * fabrication. Callers turn these into their own domain type (a
 * ListingSourceItem or a ProductCandidate) and are responsible for
 * dropping anything they can't confidently parse from the real text.
 */
export async function braveWebSearch(query: string, opts: { count?: number } = {}): Promise<BraveWebResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) {
    throw new BraveSearchNotAvailableError(
      "BRAVE_SEARCH_API_KEY není nastavený. Brave Search čeká na připojení (viz Nastavení → Provider Health)."
    );
  }

  const params = new URLSearchParams({ q: query, country: "cz", search_lang: "cs", count: String(opts.count ?? 20) });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BRAVE_WEB_SEARCH_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey }
    });
    if (!res.ok) {
      if (res.status === 429) throw new BraveSearchNotAvailableError("Brave Search: dosažen rate limit / měsíční kvóta (HTTP 429).");
      if (res.status === 401 || res.status === 403) {
        throw new BraveSearchNotAvailableError(`Brave Search: autentizace selhala (HTTP ${res.status}). Zkontroluj BRAVE_SEARCH_API_KEY.`);
      }
      throw new BraveSearchNotAvailableError(`Brave Search: server vrátil chybu ${res.status}.`);
    }
    const data = (await res.json().catch(() => null)) as BraveSearchResponse | null;
    return data?.web?.results ?? [];
  } catch (err) {
    if (err instanceof BraveSearchNotAvailableError) throw err;
    if ((err as any)?.name === "AbortError") {
      throw new BraveSearchNotAvailableError("Brave Search: vyhledávání vypršelo (timeout).");
    }
    throw new BraveSearchNotAvailableError("Brave Search: vyhledávání selhalo (síťová chyba).");
  } finally {
    clearTimeout(timeout);
  }
}
