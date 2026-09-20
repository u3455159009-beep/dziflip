// Generic Product Data Provider — mirrors the Web Search Provider pattern
// (src/lib/sources/searchProvider.ts): calls a configurable, licensed
// product-data HTTP API (a retailer's own feed/API, or an aggregator) that
// the operator points it at, instead of scraping any specific Czech
// e-shop. Until PRODUCT_SEARCH_API_KEY is set it stays PENDING_ACCESS —
// search/refresh never return a fabricated product, price, or URL.
//
// Expected response shape from PRODUCT_SEARCH_API_URL (JSON):
// { results: [ { productId, name, brand, category, description, imageUrl,
//   productUrl, retailer, price, originalPrice, unitPrice, unit, packSize,
//   packUnit, availability, lastCheckedAt } ] }. Only fields the response
// actually provides are used — anything absent stays unset, never guessed.
import type { ProductAvailability, ProductCategory } from "@/lib/types";
import { PRODUCT_AVAILABILITIES } from "@/lib/types";
import { ProductNotAvailableError, type ProductCandidate, type ProductProvider, type ProductSearchQuery } from "./types";

const DEFAULT_PRODUCT_SEARCH_API_URL = "https://api.example-product-data-provider.invalid/v1/products/search";

interface RawProductResult {
  productId?: string;
  name?: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  productUrl?: string;
  retailer?: string;
  price?: number | null;
  originalPrice?: number | null;
  unitPrice?: number | null;
  unit?: string;
  packSize?: number;
  packUnit?: string;
  availability?: string;
  lastCheckedAt?: string;
}

function toCandidate(r: RawProductResult, category: ProductCategory): ProductCandidate | null {
  // The minimum a real candidate needs to be usable downstream (linked to a
  // real budget line): a stable id, a name, a specific product URL, and a
  // retailer name. Anything short of this is dropped, never half-filled.
  if (!r.productId || !r.name || !r.productUrl || !r.retailer) return null;
  const availability: ProductAvailability = PRODUCT_AVAILABILITIES.includes(r.availability as ProductAvailability)
    ? (r.availability as ProductAvailability)
    : "UNKNOWN";
  return {
    productId: r.productId,
    name: r.name,
    brand: r.brand,
    category,
    description: r.description,
    imageUrl: r.imageUrl,
    productUrl: r.productUrl,
    retailer: r.retailer,
    price: r.price ?? null,
    originalPrice: r.originalPrice ?? null,
    unitPrice: r.unitPrice ?? null,
    unit: r.unit,
    packSize: r.packSize,
    packUnit: r.packUnit,
    availability,
    lastCheckedAt: r.lastCheckedAt ?? new Date().toISOString(),
    source: "PRODUCT_SEARCH",
    confidence: r.price != null ? "VERIFIED" : "UNKNOWN"
  };
}

async function runSearch(params: URLSearchParams): Promise<RawProductResult[]> {
  const apiKey = process.env.PRODUCT_SEARCH_API_KEY;
  if (!apiKey) {
    throw new ProductNotAvailableError(
      "PRODUCT_SEARCH_API_KEY není nastavený. Generický Product Data Provider čeká na připojení licencovaného produktového API/feedu."
    );
  }
  const apiUrl = process.env.PRODUCT_SEARCH_API_URL || DEFAULT_PRODUCT_SEARCH_API_URL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
    });
    if (!res.ok) {
      throw new ProductNotAvailableError(`Product Data Provider: server vrátil chybu ${res.status}.`);
    }
    const data = await res.json().catch(() => null);
    return Array.isArray(data?.results) ? data.results : [];
  } catch (err) {
    if (err instanceof ProductNotAvailableError) throw err;
    if ((err as any)?.name === "AbortError") {
      throw new ProductNotAvailableError("Product Data Provider: vyhledávání vypršelo (timeout).");
    }
    throw new ProductNotAvailableError("Product Data Provider: vyhledávání selhalo.");
  } finally {
    clearTimeout(timeout);
  }
}

export const genericProductSearchProvider: ProductProvider = {
  key: "PRODUCT_SEARCH",
  label: "Product Data (obecné produktové API)",
  get status() {
    return process.env.PRODUCT_SEARCH_API_KEY ? "ACTIVE" : "PENDING_ACCESS";
  },
  get statusNote() {
    return process.env.PRODUCT_SEARCH_API_KEY
      ? undefined
      : "Čeká na PRODUCT_SEARCH_API_KEY (a volitelně PRODUCT_SEARCH_API_URL) — licencované produktové API/feed (např. agregátor českých e-shopů). Bez klíče se nikdy nic nescrapuje ani nevymýšlí.";
  },

  async search(query: ProductSearchQuery): Promise<ProductCandidate[]> {
    const params = new URLSearchParams();
    params.set("category", query.category);
    params.set("q", query.description);
    if (query.style) params.set("style", query.style);
    if (query.budgetMax != null) params.set("budgetMax", String(query.budgetMax));
    if (query.referenceLocality) params.set("locality", query.referenceLocality);
    params.set("country", "CZ");

    const results = await runSearch(params);
    return results.map((r) => toCandidate(r, query.category)).filter((c): c is ProductCandidate => c !== null);
  },

  async refresh(productId: string): Promise<ProductCandidate | null> {
    const params = new URLSearchParams();
    params.set("productId", productId);
    const results = await runSearch(params);
    if (results.length === 0) return null;
    const first = results[0];
    return toCandidate(first, (first.category as ProductCategory) ?? "OSTATNI");
  }
};
