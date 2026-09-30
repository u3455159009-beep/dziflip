// Brave Product Search provider (Request D, item 7) — real Czech e-shop
// products via the same Brave Search API. Never invents a product, price,
// or URL — a result is kept only when the real returned text yields a
// real allow-listed retailer AND a real, explicitly currency-marked price.
import { describe, it, expect, afterEach, vi } from "vitest";
import { braveProductProvider } from "@/lib/products/braveProductProvider";

const originalKey = process.env.BRAVE_SEARCH_API_KEY;
const originalFetch = global.fetch;

function mockBraveResponse(results: Array<{ title?: string; url?: string; description?: string }>) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ web: { results } })
  })) as any;
}

describe("braveProductProvider", () => {
  afterEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("1. without BRAVE_SEARCH_API_KEY, status is PENDING_ACCESS and search() throws without ever calling fetch", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    expect(braveProductProvider.status).toBe("PENDING_ACCESS");
    global.fetch = vi.fn() as any;

    await expect(braveProductProvider.search({ category: "PODLAHY", description: "vinylová podlaha" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("2. a real result from an allow-listed retailer with a real price becomes a ProductCandidate, marked ESTIMATED (never VERIFIED from a snippet)", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([
      {
        title: "Vinylová podlaha Dub Sierra 1299 Kč/m2",
        url: "https://www.dek.cz/produkty/detail/12345-vinylova-podlaha-dub-sierra",
        description: "Vodě odolná vinylová podlaha, cena 1 299 Kč za m²."
      }
    ]);

    const results = await braveProductProvider.search({ category: "PODLAHY", description: "vinylová podlaha" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toMatch(/Vinylová podlaha/);
    expect(results[0].retailer).toBe("DEK");
    expect(results[0].productUrl).toBe("https://www.dek.cz/produkty/detail/12345-vinylova-podlaha-dub-sierra");
    expect(results[0].price).toBe(1299);
    expect(results[0].confidence).toBe("ESTIMATED");
    expect(results[0].source).toBe("BRAVE_PRODUCT_SEARCH");
  });

  it("3. a result with no parseable price is dropped, never given an invented price", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([
      {
        title: "Vinylová podlaha Dub Sierra",
        url: "https://www.dek.cz/produkty/detail/99999",
        description: "Skladem, více informací na prodejně."
      }
    ]);

    const results = await braveProductProvider.search({ category: "PODLAHY", description: "vinylová podlaha" });
    expect(results).toHaveLength(0);
  });

  it("4. a result from a domain that isn't an allow-listed Czech retailer is dropped, never presented as a real retailer", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([
      {
        title: "Vinylová podlaha 1299 Kč",
        url: "https://some-random-blog.example/post/flooring-review",
        description: "Recenze podlahy, cena kolem 1299 Kč."
      }
    ]);

    const results = await braveProductProvider.search({ category: "PODLAHY", description: "vinylová podlaha" });
    expect(results).toHaveLength(0);
  });

  it("5. correctly parses an unspaced price like '15999 Kč' (not truncated to '999')", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([
      {
        title: "Kuchyňská linka rovná 240 cm, 15999 Kč",
        url: "https://www.mall.cz/kuchynske-linky/rovna-linka-240",
        description: "Kompletní kuchyňská linka."
      }
    ]);

    const results = await braveProductProvider.search({ category: "KUCHYNE", description: "kuchyňská linka" });
    expect(results).toHaveLength(1);
    expect(results[0].price).toBe(15999);
  });

  it("6. correctly parses a decimal price like '899,90 Kč'", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([
      { title: "Vodovodní baterie, 899,90 Kč", url: "https://www.hornbach.cz/p/baterie-123", description: "Chromová baterie." }
    ]);

    const results = await braveProductProvider.search({ category: "VODOVODNI_BATERIE", description: "vodovodní baterie" });
    expect(results).toHaveLength(1);
    expect(results[0].price).toBe(899.9);
  });

  it("7. never mistakes a dimension/EAN-style number for a price", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([
      { title: "Obklad 1200x600 mm, EAN 8594001234567", url: "https://www.dek.cz/p/obklad-456", description: "Rozměr 1200x600 mm." }
    ]);

    const results = await braveProductProvider.search({ category: "OBKLADY", description: "obklad" });
    expect(results).toHaveLength(0);
  });

  it("8. availability is honestly UNKNOWN — a search snippet never reliably states live stock", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([{ title: "Svítidlo LED, 599 Kč", url: "https://www.alza.cz/p/svitidlo-789", description: "Stropní LED svítidlo." }]);

    const results = await braveProductProvider.search({ category: "SVETLA", description: "svítidlo" });
    expect(results[0].availability).toBe("UNKNOWN");
  });

  it("9. refresh() never fetches a page or fabricates a result — it's not a scraper", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    global.fetch = vi.fn() as any;
    const result = await braveProductProvider.refresh("https://www.dek.cz/produkty/detail/12345");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("10. HTTP 429 is reported as a rate-limit/quota ProductNotAvailableError", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    global.fetch = vi.fn(async () => ({ ok: false, status: 429 })) as any;

    await expect(braveProductProvider.search({ category: "PODLAHY", description: "podlaha" })).rejects.toThrow(/rate limit|kvót/i);
  });
});
