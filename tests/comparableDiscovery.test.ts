import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { discoverComparablesForProject } from "@/lib/comparableDiscovery";
import { computeMarketValue } from "@/lib/marketValue";
import { rescoreAllComparables } from "@/lib/comparableScoring";
import type { CompQualityTier } from "@/lib/types";

async function wipeDb() {
  await prisma.comparablePriceHistory.deleteMany();
  await prisma.comparable.deleteMany();
  await prisma.assumptions.deleteMany();
  await prisma.project.deleteMany();
  await prisma.providerErrorLog.deleteMany();
}

async function createTestProject() {
  return prisma.project.create({
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
}

const originalFetch = global.fetch;
const originalSearchApiKey = process.env.SEARCH_API_KEY;

function mockSearchResults(results: any[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results })
  }) as any;
}

describe("Comparable Discovery Engine (item 4)", () => {
  beforeEach(wipeDb);
  afterEach(() => {
    global.fetch = originalFetch;
  });
  afterAll(async () => {
    process.env.SEARCH_API_KEY = originalSearchApiKey;
    await wipeDb();
  });

  it("scenario I — 0 comparables: with no ACTIVE provider configured, finds nothing, never crashes, and explains why", async () => {
    delete process.env.SEARCH_API_KEY;
    const project = await createTestProject();

    const result = await discoverComparablesForProject(project.id, { force: true });

    expect(result.foundCount).toBe(0);
    expect(result.createdCount).toBe(0);
    expect(result.activeProviders.length).toBe(0);
    expect(result.note).toMatch(/Žádný aktivní zdroj/);

    const comps = await prisma.comparable.findMany({ where: { projectId: project.id } });
    expect(comps.length).toBe(0);

    const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(updated.comparableDiscoveryNote).toBe(result.note);
  });

  it("scenario O — provider offline/erroring must not abort the whole discovery run", async () => {
    process.env.SEARCH_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
    const project = await createTestProject();

    const result = await discoverComparablesForProject(project.id, { force: true });
    expect(result.foundCount).toBe(0);
    expect(result.note).toMatch(/Chyby:/);

    const comps = await prisma.comparable.findMany({ where: { projectId: project.id } });
    expect(comps.length).toBe(0);
  });

  it("real-provider discovery persists comparables with cache metadata, then dedups + records a price drop on re-discovery (scenario N)", async () => {
    process.env.SEARCH_API_KEY = "test-key";
    const project = await createTestProject();

    mockSearchResults([
      { url: "https://example.test/c1", title: "Byt 2+1 Královo Pole", price: 7200000, areaM2: 63, disposition: "2+1", municipality: "Brno", district: "Královo Pole", condition: "Dobrý stav" },
      { url: "https://example.test/c2", title: "Byt 2+1 Žabovřesky", price: 6800000, areaM2: 61, disposition: "2+1", municipality: "Brno", district: "Žabovřesky", condition: "Původní stav" }
    ]);

    const first = await discoverComparablesForProject(project.id, { force: true });
    expect(first.createdCount).toBe(2);
    expect(first.foundCount).toBe(2);

    const compsAfterFirst = await prisma.comparable.findMany({ where: { projectId: project.id } });
    expect(compsAfterFirst.length).toBe(2);
    expect(compsAfterFirst.every((c) => c.sourceProvider === "WEB_SEARCH")).toBe(true);
    expect(compsAfterFirst.every((c) => c.lastSeenAt != null)).toBe(true);

    // Re-discovery without force must be skipped (cache) — never re-queries or duplicates.
    const cached = await discoverComparablesForProject(project.id, { force: false });
    expect(cached.skipped).toBe(true);
    expect(cached.createdCount).toBe(0);

    // Force re-discovery with a price drop on c1 and one brand-new listing.
    mockSearchResults([
      { url: "https://example.test/c1", title: "Byt 2+1 Královo Pole", price: 6900000, areaM2: 63, disposition: "2+1", municipality: "Brno", district: "Královo Pole", condition: "Dobrý stav" },
      { url: "https://example.test/c2", title: "Byt 2+1 Žabovřesky", price: 6800000, areaM2: 61, disposition: "2+1", municipality: "Brno", district: "Žabovřesky", condition: "Původní stav" },
      { url: "https://example.test/c3", title: "Byt 2+1 Bystrc", price: 6500000, areaM2: 60, disposition: "2+1", municipality: "Brno", district: "Bystrc", condition: "Dobrý stav" }
    ]);

    const second = await discoverComparablesForProject(project.id, { force: true });
    expect(second.createdCount).toBe(1); // only c3 is new
    expect(second.updatedCount).toBe(2); // c1 + c2 re-confirmed
    expect(second.priceDropCount).toBe(1); // c1 dropped in price

    const compsAfterSecond = await prisma.comparable.findMany({ where: { projectId: project.id }, include: { priceHistory: true } });
    expect(compsAfterSecond.length).toBe(3); // deduped by URL — never a duplicate row for c1/c2

    const c1 = compsAfterSecond.find((c) => c.url === "https://example.test/c1")!;
    expect(c1.price).toBe(6900000);
    expect(c1.priceHistory.length).toBeGreaterThanOrEqual(2); // initial capture + the price-drop record
  });

  it("scenarios J/K — market value is insufficient with 1-2 comparables but real with 3+, using genuinely persisted Comparable rows", async () => {
    const project = await createTestProject();
    const compData = [
      { locality: "Brno - Královo Pole", disposition: "2+1", areaM2: 63, price: 7100000, condition: "Dobrý stav" },
      { locality: "Brno - Královo Pole", disposition: "2+1", areaM2: 65, price: 7300000, condition: "Dobrý stav" }
    ];
    for (const c of compData) {
      await prisma.comparable.create({
        data: { projectId: project.id, ...c, pricePerM2: c.price / c.areaM2, priceType: "ASKING" }
      });
    }
    await rescoreAllComparables(project.id);
    let comps = await prisma.comparable.findMany({ where: { projectId: project.id } });
    let marketComps = comps.map((c) => ({ pricePerM2: c.pricePerM2, qualityTier: c.qualityTier as CompQualityTier | null, priceType: c.priceType, condition: c.condition }));
    let result = computeMarketValue(marketComps, 64, { minCompCount: 3, minCompQuality: "MEDIUM" });
    expect(result.insufficientData).toBe(true); // only 2 comparables (scenario J)

    await prisma.comparable.create({
      data: { projectId: project.id, locality: "Brno - Královo Pole", disposition: "2+1", areaM2: 62, price: 7000000, pricePerM2: 7000000 / 62, condition: "Dobrý stav", priceType: "ASKING" }
    });
    await rescoreAllComparables(project.id);
    comps = await prisma.comparable.findMany({ where: { projectId: project.id } });
    marketComps = comps.map((c) => ({ pricePerM2: c.pricePerM2, qualityTier: c.qualityTier as CompQualityTier | null, priceType: c.priceType, condition: c.condition }));
    result = computeMarketValue(marketComps, 64, { minCompCount: 3, minCompQuality: "MEDIUM" });
    expect(result.insufficientData).toBe(false); // 3 comparables (scenario K)
    expect(result.base.value).not.toBeNull();
  });
});
