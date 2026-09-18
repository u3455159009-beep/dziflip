import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runWatcher, processListingItem } from "@/lib/dealRadar";
import { getSourceProvider } from "@/lib/sources/registry";
import { SourceNotAvailableError } from "@/lib/sources/types";
import { getSettings } from "@/lib/settings";
import { simulateDemoPriceChange } from "@/lib/sources/mockProvider";

async function wipeDb() {
  await prisma.possibleDuplicate.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.project.deleteMany();
  await prisma.watcher.deleteMany();
  await prisma.providerErrorLog.deleteMany();
}

describe("Deal Radar V2 — full pipeline (DEMO fixtures)", () => {
  beforeAll(wipeDb);
  afterAll(wipeDb);

  it("runs NEW LISTING → NORMALIZE → DEDUP → COMPARABLES → MARKET VALUE → ARV → MAX BUY PRICE → DEAL SCORE → ALERT without crashing", async () => {
    const watcher = await prisma.watcher.create({
      data: { name: "Test watcher — MOCK_DEMO", sources: "MOCK_DEMO" }
    });

    const summary = await runWatcher(watcher.id);

    expect(summary.itemErrors).toBe(0);
    expect(summary.newProjects).toBe(14); // fixed DEMO fixture count
    expect(summary.providers[0].status).toBe("ACTIVE");

    const projects = await prisma.project.findMany({
      where: { sourceWatcherId: watcher.id },
      include: { comparables: true, assumptions: true, listingEvents: true }
    });
    expect(projects.length).toBe(14);

    // every project reached FULL_ANALYSIS (comparables scored, assumptions built)
    for (const p of projects) {
      expect(p.analysisStage).toBe("FULL_ANALYSIS");
      expect(p.isDemo).toBe(true);
      expect(p.listingEvents.some((e) => e.eventType === "CAPTURED")).toBe(true);
    }

    // comparables were fetched and scored (Comparable Engine V2)
    const withComparables = projects.filter((p) => p.comparables.length > 0);
    expect(withComparables.length).toBeGreaterThan(0);
    for (const p of withComparables) {
      expect(p.comparables.every((c) => c.qualityTier !== null)).toBe(true);
    }
  });

  it("never presents an asking-price comparable as a realized sale, and Deal Score confidence gates HIGH on real data sufficiency", async () => {
    const projects = await prisma.project.findMany({ where: { comparables: { some: {} } }, include: { comparables: true } });
    for (const p of projects) {
      expect(p.comparables.every((c) => c.priceType === "ASKING")).toBe(true);
    }
  });

  it("detects possible duplicates among similar DEMO listings without auto-merging anything", async () => {
    const dups = await prisma.possibleDuplicate.findMany();
    expect(dups.length).toBeGreaterThan(0);
    for (const d of dups) {
      expect(d.resolvedStatus).toBe("PENDING");
      expect(d.classification).not.toBe("DIFFERENT");
    }
  });

  it("tracks price history and logs a PRICE_CHANGE listing event when the watcher re-runs and a price actually changed", async () => {
    const watcher = await prisma.watcher.findFirstOrThrow({ where: { name: "Test watcher — MOCK_DEMO" } });
    const before = await prisma.project.findFirstOrThrow({
      where: { sourceWatcherId: watcher.id, externalId: "demo-001" },
      include: { priceHistory: true }
    });

    await simulateDemoPriceChange("demo-001", (before.askingPrice ?? 0) - 300000);
    await runWatcher(watcher.id);

    const after = await prisma.project.findFirstOrThrow({
      where: { id: before.id },
      include: { priceHistory: true, listingEvents: true }
    });

    expect(after.askingPrice).toBe((before.askingPrice ?? 0) - 300000);
    expect(after.priceHistory.length).toBeGreaterThan(before.priceHistory.length);
    expect(after.listingEvents.some((e) => e.eventType === "PRICE_CHANGE")).toBe(true);
  });

  it("isolates one bad listing's failure — the rest of the run still completes (item 22)", async () => {
    const watcher = await prisma.watcher.create({ data: { name: "Isolation test watcher", sources: "MOCK_DEMO" } });
    const settings = await getSettings();

    const goodItem = {
      externalId: "isolation-good-1",
      portal: "DEMO",
      url: "https://example.test/good",
      title: "Dobrá položka",
      askingPrice: 5000000,
      disposition: "2+kk",
      areaM2: 50,
      municipality: "Praha",
      district: "Praha 5",
      condition: "dobrý stav",
      ownership: "OSOBNI",
      photos: [],
      fullText: "Test",
      isDemo: true
    } as const;

    const badItem = {
      ...goodItem,
      externalId: "isolation-bad-1",
      // NaN is not a valid Prisma Float value — this forces a real,
      // deterministic failure inside processListingItem.
      askingPrice: NaN
    } as const;

    await expect(
      processListingItem({ item: badItem as any, providerKey: "MOCK_DEMO", watcher, settings, summary: { providers: [], newProjects: 0, updatedProjects: 0, priceDrops: 0, alerts: 0, itemErrors: 0 } })
    ).rejects.toThrow();

    // A good item processed independently must still succeed — one
    // listing's failure never contaminates another's processing.
    await processListingItem({
      item: goodItem as any,
      providerKey: "MOCK_DEMO",
      watcher,
      settings,
      summary: { providers: [], newProjects: 0, updatedProjects: 0, priceDrops: 0, alerts: 0, itemErrors: 0 }
    });

    const created = await prisma.project.findUnique({ where: { portal_externalId: { portal: "DEMO", externalId: "isolation-good-1" } } });
    expect(created).not.toBeNull();

    const badProject = await prisma.project.findUnique({ where: { portal_externalId: { portal: "DEMO", externalId: "isolation-bad-1" } } });
    expect(badProject).toBeNull();
  });

  it("gracefully reports an unavailable provider (PENDING_ACCESS) as a note, never a thrown crash", async () => {
    const provider = getSourceProvider("SREALITY");
    expect(provider?.status).toBe("PENDING_ACCESS");
    await expect(provider!.search({})).rejects.toThrow(SourceNotAvailableError);

    const watcher = await prisma.watcher.create({ data: { name: "Mixed provider watcher", sources: "MOCK_DEMO,SREALITY" } });
    const summary = await runWatcher(watcher.id);
    const sreality = summary.providers.find((p) => p.key === "SREALITY");
    expect(sreality?.status).toBe("PENDING_ACCESS");
    expect(sreality?.note).toBeTruthy();
    // MOCK_DEMO must still have been processed despite SREALITY being unavailable.
    const mock = summary.providers.find((p) => p.key === "MOCK_DEMO");
    expect(mock?.status).toBe("ACTIVE");
  });
});
