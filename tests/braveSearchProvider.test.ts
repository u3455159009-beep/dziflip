// Brave Search comparable-listing provider (Request D, item 2) — the
// concrete, currently-obtainable replacement for a FlatScan-style feed.
import { describe, it, expect, afterEach, vi } from "vitest";
import { braveSearchProvider } from "@/lib/sources/braveSearchProvider";

const originalKey = process.env.BRAVE_SEARCH_API_KEY;
const originalFetch = global.fetch;

function mockBraveResponse(results: Array<{ title?: string; url?: string; description?: string }>) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ web: { results } })
  })) as any;
}

describe("braveSearchProvider", () => {
  afterEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("1. without BRAVE_SEARCH_API_KEY, status is PENDING_ACCESS and search() throws without ever calling fetch", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    expect(braveSearchProvider.status).toBe("PENDING_ACCESS");
    global.fetch = vi.fn() as any;

    await expect(braveSearchProvider.search({})).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("2. with a key, status is ACTIVE and a real, fully-parseable Brave result becomes a ListingSourceItem", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    expect(braveSearchProvider.status).toBe("ACTIVE");
    mockBraveResponse([
      {
        title: "Prodej bytu 3+kk, 78 m², Praha - Smíchov, 6 990 000 Kč",
        url: "https://www.sreality.cz/detail/prodej/byt/3+kk/praha-smichov/456",
        description: "Byt 3+kk, 78 m², dobrý stav, osobní vlastnictví, Praha - Smíchov."
      }
    ]);

    const results = await braveSearchProvider.search({ municipality: "Praha", dispositions: ["3+kk"] });
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://www.sreality.cz/detail/prodej/byt/3+kk/praha-smichov/456");
    expect(results[0].askingPrice).toBe(6990000);
    expect(results[0].areaM2).toBe(78);
    expect(results[0].disposition).toBe("3+kk");
    expect(results[0].municipality).toBe("Praha");
    expect(results[0].isDemo).toBe(false);
  });

  it("3. the request key/header is sent correctly and the query is restricted to real-estate portal domains via site:", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    const fetchMock = vi.fn(async (_url: string, _init?: any) => ({ ok: true, json: async () => ({ web: { results: [] } }) }));
    global.fetch = fetchMock as any;

    await braveSearchProvider.search({ municipality: "Brno", district: "Žabovřesky", dispositions: ["2+1"] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("api.search.brave.com/res/v1/web/search");
    expect((init as any).headers["X-Subscription-Token"]).toBe("test-brave-key");
    const decodedQuery = decodeURIComponent(String(url));
    expect(decodedQuery).toMatch(/site:sreality\.cz/);
    expect(decodedQuery).toMatch(/Brno/);
    expect(decodedQuery).toMatch(/Žabovřesky/);
  });

  it("4. a result missing price/area/disposition/municipality is dropped, never half-filled with a guess", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([
      { title: "Krásný byt v centru", url: "https://www.sreality.cz/x", description: "Volejte pro více informací." }
    ]);

    const results = await braveSearchProvider.search({});
    expect(results).toHaveLength(0);
  });

  it("5. a result with neither url nor title is dropped before even attempting extraction", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    mockBraveResponse([{ description: "no title or url" }, { title: "has title but no url" }]);

    const results = await braveSearchProvider.search({});
    expect(results).toHaveLength(0);
  });

  it("6. HTTP 401/403 is reported as a clear SourceNotAvailableError, never a crash, never fabricated data", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    global.fetch = vi.fn(async () => ({ ok: false, status: 401 })) as any;

    await expect(braveSearchProvider.search({})).rejects.toThrow(/autentizace|401/i);
  });

  it("7. HTTP 429 is reported distinctly as a rate-limit/quota message", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    global.fetch = vi.fn(async () => ({ ok: false, status: 429 })) as any;

    await expect(braveSearchProvider.search({})).rejects.toThrow(/rate limit|kvót/i);
  });

  it("8. findComparables excludes the subject's own URL from its own results", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
    const subjectUrl = "https://www.sreality.cz/detail/prodej/byt/2+1/self/999";
    mockBraveResponse([
      {
        title: "Prodej bytu 2+1, 62 m², Brno, 5 000 000 Kč",
        url: subjectUrl,
        description: "Byt 2+1, 62 m², Brno."
      },
      {
        title: "Prodej bytu 2+1, 60 m², Brno, 4 800 000 Kč",
        url: "https://www.sreality.cz/detail/prodej/byt/2+1/other/1000",
        description: "Byt 2+1, 60 m², Brno."
      }
    ]);

    const subject = {
      externalId: subjectUrl,
      url: subjectUrl,
      portal: "Sreality",
      title: "Test",
      askingPrice: 5000000,
      disposition: "2+1",
      areaM2: 62,
      municipality: "Brno",
      district: null,
      ownership: null,
      condition: null,
      photos: [],
      publishedAt: new Date().toISOString(),
      isDemo: false
    };

    const results = await braveSearchProvider.findComparables!(subject);
    expect(results.every((r) => r.url !== subjectUrl)).toBe(true);
  });
});
