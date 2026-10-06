// Watchdog V2 (Request F, item 2) — cross-portal duplicate suppression,
// listing removed/relisted detection, and the extended alert payload
// (market value / ARV / renovation estimate / DziFlip Score).
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { processListingItem, detectRemovedListings, type WatcherRunSummary } from "@/lib/dealRadar";
import { getSettings } from "@/lib/settings";
import type { ListingSourceItem } from "@/lib/sources/types";

function emptySummary(): WatcherRunSummary {
  return {
    providers: [],
    newProjects: 0,
    updatedProjects: 0,
    priceDrops: 0,
    crossPortalDuplicates: 0,
    listingsRemoved: 0,
    listingsRelisted: 0,
    alerts: 0,
    itemErrors: 0
  };
}

async function wipeDb() {
  await prisma.notificationLog.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.listingEvent.deleteMany();
  await prisma.possibleDuplicate.deleteMany();
  await prisma.project.deleteMany();
  await prisma.watcher.deleteMany();
  await prisma.providerErrorLog.deleteMany();
}

function baseItem(overrides: Partial<ListingSourceItem>): ListingSourceItem {
  return {
    externalId: "ext-1",
    url: "https://example.test/1",
    portal: "Sreality.cz",
    title: "Byt 2+1",
    askingPrice: 5000000,
    disposition: "2+1",
    areaM2: 60,
    municipality: "Brno",
    district: "Žabovřesky",
    street: "Štefánikova 12",
    ownership: null,
    condition: "dobrý stav",
    photos: [],
    publishedAt: new Date().toISOString(),
    fullText: "Byt 2+1, Štefánikova 12, Brno - Žabovřesky.",
    isDemo: false,
    ...overrides
  } as ListingSourceItem;
}

describe("Watchdog V2 — cross-portal duplicate suppression (item 2)", () => {
  beforeEach(wipeDb);
  afterAll(wipeDb);

  it("the same physical property found on a second portal never becomes a second Project or a second NEW_MATCH alert", async () => {
    const watcher = await prisma.watcher.create({ data: { name: "Dedup watcher", sources: "MOCK_DEMO" } });
    const settings = await getSettings();

    const item1 = baseItem({ portal: "Sreality.cz", externalId: "sr-1", url: "https://sreality.cz/1" });
    await processListingItem({ item: item1, providerKey: "SREALITY", watcher, settings, summary: emptySummary() });

    const afterFirst = await prisma.project.findMany({});
    expect(afterFirst.length).toBe(1);

    const summary2 = emptySummary();
    const item2 = baseItem({ portal: "Bezrealitky.cz", externalId: "br-1", url: "https://bezrealitky.cz/1" });
    await processListingItem({ item: item2, providerKey: "BEZREALITKY", watcher, settings, summary: summary2 });

    const afterSecond = await prisma.project.findMany({ include: { listingEvents: true } });
    expect(afterSecond.length).toBe(1); // never a second Project for the same property
    expect(summary2.crossPortalDuplicates).toBe(1);
    expect(summary2.newProjects).toBe(0);
    expect(summary2.alerts).toBe(0); // never a second "new opportunity" alert

    const project = afterSecond[0];
    expect(project.crossPortalListings).toBeTruthy();
    const crossPortal = JSON.parse(project.crossPortalListings!);
    expect(crossPortal.some((c: any) => c.portal === "Bezrealitky.cz" && c.externalId === "br-1")).toBe(true);
    expect(project.listingEvents.some((e) => e.eventType === "CROSS_PORTAL_DUPLICATE")).toBe(true);

    // Neither call ever had a sale-price basis (no comparables provider
    // configured in this test env), so no alert fires for either — this
    // just confirms the cross-portal suppression path itself never alerts.
    const alerts = await prisma.alert.findMany({});
    expect(alerts.length).toBe(0);
  });

  it("the same item re-seen on the same portal twice (identical portal+externalId) is the ordinary same-portal dedup path, not cross-portal suppression", async () => {
    const watcher = await prisma.watcher.create({ data: { name: "Same portal watcher", sources: "MOCK_DEMO" } });
    const settings = await getSettings();
    const item = baseItem({ portal: "Sreality.cz", externalId: "sr-dup-1" });

    await processListingItem({ item, providerKey: "SREALITY", watcher, settings, summary: emptySummary() });
    const summary2 = emptySummary();
    await processListingItem({ item, providerKey: "SREALITY", watcher, settings, summary: summary2 });

    const projects = await prisma.project.findMany({});
    expect(projects.length).toBe(1);
    expect(summary2.crossPortalDuplicates).toBe(0); // handled by the exact-match branch, not findSamePropertyProject
  });
});

describe("Watchdog V2 — listing removed / relisted detection (item 2)", () => {
  beforeEach(wipeDb);
  afterAll(wipeDb);

  it("a tracked listing missing for 2 consecutive runs is marked REMOVED, logs a ListingEvent, and raises a LISTING_REMOVED alert", async () => {
    const watcher = await prisma.watcher.create({ data: { name: "Removal watcher", sources: "MOCK_DEMO" } });
    const settings = await getSettings();

    const project = await prisma.project.create({
      data: {
        status: "ACTIVE",
        sourceWatcherId: watcher.id,
        portal: "Sreality.cz",
        externalId: "removal-1",
        title: "Byt na zmizení",
        askingPrice: 4000000,
        areaM2: 55,
        municipality: "Praha",
        disposition: "2+kk"
      }
    });

    // Run 1: provider returns nothing for this listing — just one miss,
    // must NOT be declared removed yet (avoids a false positive from one
    // transient provider hiccup).
    const summary1 = emptySummary();
    await detectRemovedListings({ watcherId: watcher.id, seenItems: [], settings, summary: summary1 });
    let refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(refreshed.listingMissedRuns).toBe(1);
    expect(refreshed.listingAvailability).toBe("LISTED");
    expect(summary1.listingsRemoved).toBe(0);

    // Run 2: still missing — now crosses the 2-miss threshold.
    const summary2 = emptySummary();
    await detectRemovedListings({ watcherId: watcher.id, seenItems: [], settings, summary: summary2 });
    refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { listingEvents: true } as any });

    expect(refreshed.listingAvailability).toBe("REMOVED");
    expect(refreshed.listingRemovedAt).not.toBeNull();
    expect(summary2.listingsRemoved).toBe(1);

    const events = await prisma.listingEvent.findMany({ where: { projectId: project.id } });
    expect(events.some((e) => e.eventType === "REMOVED")).toBe(true);

    const alert = await prisma.alert.findFirst({ where: { projectId: project.id, reason: "LISTING_REMOVED" } });
    expect(alert).not.toBeNull();
  });

  it("a listing seen again every run never accumulates missed-run count", async () => {
    const watcher = await prisma.watcher.create({ data: { name: "Stable watcher", sources: "MOCK_DEMO" } });
    const settings = await getSettings();
    const project = await prisma.project.create({
      data: { status: "ACTIVE", sourceWatcherId: watcher.id, portal: "Sreality.cz", externalId: "stable-1", askingPrice: 1, municipality: "Brno" }
    });
    const seenItem = baseItem({ portal: "Sreality.cz", externalId: "stable-1" });

    await detectRemovedListings({ watcherId: watcher.id, seenItems: [seenItem], settings, summary: emptySummary() });
    const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(refreshed.listingMissedRuns).toBe(0);
    expect(refreshed.listingAvailability).toBe("LISTED");
  });

  it("a REMOVED listing reappearing (same portal+externalId seen again) is marked RELISTED and raises a LISTING_RELISTED alert", async () => {
    const watcher = await prisma.watcher.create({ data: { name: "Relist watcher", sources: "MOCK_DEMO" } });
    const settings = await getSettings();

    await prisma.project.create({
      data: {
        status: "ACTIVE",
        sourceWatcherId: watcher.id,
        portal: "Sreality.cz",
        externalId: "relist-1",
        title: "Byt co se vrátil",
        askingPrice: 3000000,
        areaM2: 50,
        municipality: "Ostrava",
        disposition: "1+1",
        listingAvailability: "REMOVED",
        listingRemovedAt: new Date(),
        listingMissedRuns: 2
      }
    });

    const summary = emptySummary();
    const item = baseItem({ portal: "Sreality.cz", externalId: "relist-1", askingPrice: 3000000 });
    await processListingItem({ item, providerKey: "SREALITY", watcher, settings, summary });

    const refreshed = await prisma.project.findFirstOrThrow({ where: { externalId: "relist-1" } });
    expect(refreshed.listingAvailability).toBe("RELISTED");
    expect(refreshed.listingMissedRuns).toBe(0);
    expect(summary.listingsRelisted).toBe(1);

    const events = await prisma.listingEvent.findMany({ where: { projectId: refreshed.id } });
    expect(events.some((e) => e.eventType === "RELISTED")).toBe(true);

    const alert = await prisma.alert.findFirst({ where: { projectId: refreshed.id, reason: "LISTING_RELISTED" } });
    expect(alert).not.toBeNull();
  });
});

describe("Watchdog V2 — non-price field change detection (item 2)", () => {
  beforeEach(wipeDb);
  afterAll(wipeDb);

  it("a changed condition/disposition/description on a re-seen listing logs real ListingEvents, not just price", async () => {
    const watcher = await prisma.watcher.create({ data: { name: "Change watcher", sources: "MOCK_DEMO" } });
    const settings = await getSettings();
    const item1 = baseItem({ portal: "Sreality.cz", externalId: "change-1", condition: "původní stav", disposition: "2+1" });
    await processListingItem({ item: item1, providerKey: "SREALITY", watcher, settings, summary: emptySummary() });

    const item2 = baseItem({
      portal: "Sreality.cz",
      externalId: "change-1",
      condition: "po rekonstrukci",
      disposition: "2+1",
      fullText: "Zcela jiný popis inzerátu po rekonstrukci."
    });
    await processListingItem({ item: item2, providerKey: "SREALITY", watcher, settings, summary: emptySummary() });

    const project = await prisma.project.findFirstOrThrow({ where: { externalId: "change-1" } });
    const events = await prisma.listingEvent.findMany({ where: { projectId: project.id } });
    expect(events.some((e) => e.eventType === "CONDITION_CHANGE")).toBe(true);
    expect(events.some((e) => e.eventType === "DESCRIPTION_CHANGE")).toBe(true);
    expect(project.condition).toBe("po rekonstrukci");
  });
});
