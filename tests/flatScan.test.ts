import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { flatScanProvider } from "@/lib/sources/flatScan/provider";
import { getFlatScanApiKey, isFlatScanConfigured, getFlatScanMonthlyRequestCount } from "@/lib/sources/flatScan/client";
import { mapFlatScanListingToItem } from "@/lib/sources/flatScan/mapping";
import { buildQuerySignature } from "@/lib/sources/flatScan/cache";
import { computePriceHistorySummary } from "@/lib/sources/flatScan/priceHistory";
import { computeLocalityDeviation, getFlatScanLocalityContext } from "@/lib/sources/flatScan/localityContext";
import { discoverComparablesForProject } from "@/lib/comparableDiscovery";
import { discoverOriginalListing } from "@/lib/listingDiscovery";
import type { FlatScanListing } from "@/lib/sources/flatScan/types";

const originalApiKey = process.env.FLATSCAN_API_KEY;
const originalFetch = global.fetch;

async function wipeDb() {
  await prisma.flatScanPriceHistoryCache.deleteMany();
  await prisma.flatScanListingCache.deleteMany();
  await prisma.flatScanSearchCache.deleteMany();
  await prisma.flatScanLocalityStats.deleteMany();
  await prisma.flatScanRequestLog.deleteMany();
  await prisma.comparablePriceHistory.deleteMany();
  await prisma.comparable.deleteMany();
  await prisma.assumptions.deleteMany();
  await prisma.project.deleteMany();
}

function mkListing(overrides: Partial<FlatScanListing> = {}): FlatScanListing {
  return {
    id: 1001,
    name: "Byt 2+1 Královo Pole",
    disposition: "2+1",
    area: 64.3,
    city: "Brno",
    district: "Královo Pole",
    server: "Sreality.cz",
    link: "https://sreality.cz/detail/1001",
    price: { original: 7600000, current: 7490000, per_meter: 118195, current_per_meter: 116485, on_request: false },
    seller: "RE/MAX",
    days_on_market: 42,
    discount_percent: 1.4,
    lat: 49.2311,
    lng: 16.5876,
    active: true,
    dates: { created: "2026-01-01T00:00:00Z", deleted: null },
    ...overrides
  };
}

function mockFetchListings(listings: FlatScanListing[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: listings })
  }) as any;
}

describe("FlatScan provider status (item 1 — env-gated, never fabricates)", () => {
  afterEach(() => {
    process.env.FLATSCAN_API_KEY = originalApiKey;
  });

  it("is PENDING_ACCESS with no FLATSCAN_API_KEY", () => {
    delete process.env.FLATSCAN_API_KEY;
    expect(isFlatScanConfigured()).toBe(false);
    expect(flatScanProvider.status).toBe("PENDING_ACCESS");
    expect(flatScanProvider.statusNote).toMatch(/FLATSCAN_API_KEY/);
  });

  it("is ACTIVE once FLATSCAN_API_KEY is set — reactively, no restart needed", () => {
    process.env.FLATSCAN_API_KEY = "secret-test-key-123";
    expect(getFlatScanApiKey()).toBe("secret-test-key-123");
    expect(flatScanProvider.status).toBe("ACTIVE");
  });

  it("never includes the API key in the PENDING_ACCESS status note", () => {
    process.env.FLATSCAN_API_KEY = "super-secret-value-xyz";
    delete process.env.FLATSCAN_API_KEY;
    const note = flatScanProvider.statusNote ?? "";
    expect(note).not.toContain("super-secret-value-xyz");
  });
});

describe("mapFlatScanListingToItem — defensive parsing, never fabricates", () => {
  it("maps every documented field from a full example listing", () => {
    const item = mapFlatScanListingToItem(mkListing());
    expect(item).not.toBeNull();
    expect(item!.externalId).toBe("1001");
    expect(item!.askingPrice).toBe(7490000);
    expect(item!.disposition).toBe("2+1");
    expect(item!.areaM2).toBe(64.3);
    expect(item!.municipality).toBe("Brno");
    expect(item!.latitude).toBe(49.2311);
    expect(item!.longitude).toBe(16.5876);
    expect(item!.daysOnMarket).toBe(42);
    expect(item!.discountPercent).toBe(1.4);
    expect(item!.portal).toBe("Sreality.cz");
  });

  it("drops a listing missing the required minimum fields rather than half-filling it", () => {
    const item = mapFlatScanListingToItem(mkListing({ area: undefined as any }));
    expect(item).toBeNull();
  });

  it("leaves comparison-relevant optional fields (condition, floor, elevator...) null when the API doesn't provide them — never guessed", () => {
    const item = mapFlatScanListingToItem(mkListing());
    expect(item!.condition).toBeNull();
    expect(item!.floor).toBeNull();
    expect(item!.elevator).toBeNull();
  });

  it("reads optional comparison fields when the API does provide them", () => {
    const item = mapFlatScanListingToItem(
      mkListing({ condition: "Dobrý stav", floor: 3, elevator: true, balcony: true, construction: "Cihla" })
    );
    expect(item!.condition).toBe("Dobrý stav");
    expect(item!.floor).toBe("3");
    expect(item!.elevator).toBe(true);
    expect(item!.balcony).toBe(true);
    expect(item!.construction).toBe("Cihla");
  });

  it("falls back to price.original when price.current is absent", () => {
    const item = mapFlatScanListingToItem(mkListing({ price: { original: 5000000, on_request: false } }));
    expect(item!.askingPrice).toBe(5000000);
  });
});

describe("buildQuerySignature — deterministic regardless of key order", () => {
  it("produces the same signature for the same filters in a different order", () => {
    const a = buildQuerySignature({ city: "Brno", district: "Královo Pole", disposition: "2+1" });
    const b = buildQuerySignature({ disposition: "2+1", city: "Brno", district: "Královo Pole" });
    expect(a).toBe(b);
  });

  it("produces a different signature for different filters", () => {
    const a = buildQuerySignature({ city: "Brno" });
    const b = buildQuerySignature({ city: "Praha" });
    expect(a).not.toBe(b);
  });

  it("ignores undefined/empty values so they don't create spurious distinct signatures", () => {
    const a = buildQuerySignature({ city: "Brno", district: undefined });
    const b = buildQuerySignature({ city: "Brno" });
    expect(a).toBe(b);
  });
});

describe("computePriceHistorySummary — pure function, never concludes 'buy it'", () => {
  it("returns nulls for an empty history", () => {
    const summary = computePriceHistorySummary([]);
    expect(summary.originalPrice).toBeNull();
    expect(summary.dropAmount).toBeNull();
    expect(summary.changeCount).toBe(0);
  });

  it("computes drop amount/percent and change count across a real price-drop series", () => {
    const history = [
      { price: 7990000, recordedAt: new Date("2026-01-01") },
      { price: 7700000, recordedAt: new Date("2026-01-15") },
      { price: 7490000, recordedAt: new Date("2026-02-01") }
    ];
    const summary = computePriceHistorySummary(history, 42);
    expect(summary.originalPrice).toBe(7990000);
    expect(summary.currentPrice).toBe(7490000);
    expect(summary.dropAmount).toBe(500000);
    expect(summary.dropPct).toBeCloseTo(500000 / 7990000);
    expect(summary.changeCount).toBe(2);
    expect(summary.daysOnMarket).toBe(42);
  });

  it("reports zero change count and zero drop for a single, unchanged price point", () => {
    const summary = computePriceHistorySummary([{ price: 5000000, recordedAt: new Date() }]);
    expect(summary.changeCount).toBe(0);
    expect(summary.dropAmount).toBe(0);
  });
});

describe("computeLocalityDeviation — pure comparison, only ever called with real numbers", () => {
  it("computes the documented example correctly (117 000 vs 125 000 Kč/m² ≈ -6.4 %)", () => {
    const deviation = computeLocalityDeviation(117000, 125000);
    expect(deviation.diffAbs).toBe(-8000);
    expect(deviation.diffPct).toBeCloseTo(-0.064, 3);
  });
});

describe("getFlatScanLocalityContext — never fabricates when not configured", () => {
  afterEach(() => {
    process.env.FLATSCAN_API_KEY = originalApiKey;
  });

  it("returns null when FLATSCAN_API_KEY is unset", async () => {
    delete process.env.FLATSCAN_API_KEY;
    const context = await getFlatScanLocalityContext("Brno", "Královo Pole").catch(() => null);
    expect(context).toBeNull();
  });
});

describe("FlatScan Comparable Discovery + Listing Discovery integration (mocked API)", () => {
  beforeEach(wipeDb);
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.FLATSCAN_API_KEY = originalApiKey;
  });
  afterAll(async () => {
    process.env.FLATSCAN_API_KEY = originalApiKey;
    global.fetch = originalFetch;
    await wipeDb();
  });

  it("discovers real comparables via FlatScan, persisting daysOnMarket/discountPercent/coordinates", async () => {
    process.env.FLATSCAN_API_KEY = "test-key";
    mockFetchListings([
      mkListing({ id: 2001, link: "https://sreality.cz/detail/2001" }),
      mkListing({ id: 2002, link: "https://sreality.cz/detail/2002", price: { original: 6900000, current: 6900000, on_request: false } })
    ]);

    const project = await prisma.project.create({
      data: {
        status: "ACTIVE",
        title: "Testovací byt",
        askingPrice: 7490000,
        disposition: "2+1",
        areaM2: 64.3,
        municipality: "Brno",
        district: "Královo Pole",
        analysisStage: "BASIC_ANALYSIS"
      }
    });

    const result = await discoverComparablesForProject(project.id, { force: true });
    expect(result.activeProviders).toContain("FLATSCAN");
    expect(result.createdCount).toBe(2);

    const comps = await prisma.comparable.findMany({ where: { projectId: project.id } });
    expect(comps.length).toBe(2);
    expect(comps.every((c) => c.sourceProvider === "FLATSCAN")).toBe(true);
    expect(comps.every((c) => c.daysOnMarket === 42)).toBe(true);
    expect(comps.every((c) => c.latitude === 49.2311)).toBe(true);
    expect(comps.some((c) => c.externalId === "2001")).toBe(true);
  });

  it("reuses the cached search within TTL — a second discovery run makes no further real API calls", async () => {
    process.env.FLATSCAN_API_KEY = "test-key";
    mockFetchListings([mkListing({ id: 3001, link: "https://sreality.cz/detail/3001" })]);

    const projectA = await prisma.project.create({
      data: { status: "ACTIVE", title: "A", askingPrice: 7490000, disposition: "2+1", areaM2: 64, municipality: "Brno", district: "Královo Pole", analysisStage: "BASIC_ANALYSIS" }
    });
    await discoverComparablesForProject(projectA.id, { force: true });
    const callsAfterFirst = (global.fetch as any).mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // A second, different project with the exact same search-relevant
    // fields (city/district/disposition/area/price) must reuse the search
    // cache — findComparables' query is derived entirely from these.
    const projectB = await prisma.project.create({
      data: { status: "ACTIVE", title: "B", askingPrice: 7490000, disposition: "2+1", areaM2: 64, municipality: "Brno", district: "Královo Pole", analysisStage: "BASIC_ANALYSIS" }
    });
    await discoverComparablesForProject(projectB.id, { force: true });
    const callsAfterSecond = (global.fetch as any).mock.calls.length;
    expect(callsAfterSecond).toBe(callsAfterFirst); // no new fetch — served from FlatScanSearchCache
  });

  it("logs exactly one FlatScanRequestLog row per real API call, never per cache hit", async () => {
    process.env.FLATSCAN_API_KEY = "test-key";
    mockFetchListings([mkListing({ id: 4001, link: "https://sreality.cz/detail/4001" })]);

    const project = await prisma.project.create({
      data: { status: "ACTIVE", title: "C", askingPrice: 7490000, disposition: "2+1", areaM2: 64, municipality: "Brno", district: "Královo Pole", analysisStage: "BASIC_ANALYSIS" }
    });
    await discoverComparablesForProject(project.id, { force: true });
    const countAfterFirst = await getFlatScanMonthlyRequestCount();
    expect(countAfterFirst).toBeGreaterThan(0);

    // A repeat run against the same cached query must not add another log row.
    const project2 = await prisma.project.create({
      data: { status: "ACTIVE", title: "D", askingPrice: 7490000, disposition: "2+1", areaM2: 64, municipality: "Brno", district: "Královo Pole", analysisStage: "BASIC_ANALYSIS" }
    });
    await discoverComparablesForProject(project2.id, { force: true });
    const countAfterSecond = await getFlatScanMonthlyRequestCount();
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("Listing Discovery Engine matches a text-only listing to a FlatScan result and records matchProviderKey", async () => {
    process.env.FLATSCAN_API_KEY = "test-key";
    mockFetchListings([mkListing({ id: 5001, link: "https://sreality.cz/detail/5001" })]);

    const result = await discoverOriginalListing({
      propertyType: "APARTMENT",
      disposition: "2+1",
      municipality: "Brno",
      district: "Královo Pole",
      street: null,
      areaM2: 64.3,
      askingPrice: 7490000
    });

    expect(result.confidence).not.toBe("NOT_FOUND");
    expect(result.matchProviderKey).toBe("FLATSCAN");
    expect(result.matchExternalId).toBe("5001");
  });

  it("records an ERROR-worthy FlatScanRequestLog entry when the API itself fails, without aborting discovery", async () => {
    process.env.FLATSCAN_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;

    const project = await prisma.project.create({
      data: { status: "ACTIVE", title: "E", askingPrice: 7490000, disposition: "2+1", areaM2: 64, municipality: "Brno", district: "Královo Pole", analysisStage: "BASIC_ANALYSIS" }
    });
    const result = await discoverComparablesForProject(project.id, { force: true });
    expect(result.foundCount).toBe(0);

    const errorLog = await prisma.flatScanRequestLog.findFirst({ where: { ok: false }, orderBy: { requestedAt: "desc" } });
    expect(errorLog).not.toBeNull();
    expect(errorLog!.statusCode).toBe(500);
  });
});
