// Comparable Discovery Engine (item 4) — the piece that means a user should
// never have to manually type in comparables. Orchestrates every ACTIVE
// source provider's findComparables() against the subject project, persists
// results with a stable cache key (projectId+url) so re-running never
// duplicates a listing, and records a price-history row whenever a
// previously-seen comparable's price changed (item 15). Adding a new
// provider to src/lib/sources/registry.ts is all that's needed for it to
// participate here — nothing in this file is portal-specific.
//
// With no ACTIVE provider configured (the default — see Settings → Provider
// Health), this simply finds nothing and says so; it never falls back to
// fabricated or mock data in a real project's comparable set.
import { prisma } from "@/lib/prisma";
import { SOURCE_PROVIDERS } from "./sources/registry";
import { SourceNotAvailableError, type ListingSourceItem } from "./sources/types";
import { rescoreAllComparables } from "./comparableScoring";

export interface ComparableDiscoveryResult {
  activeProviders: string[];
  foundCount: number;
  createdCount: number;
  updatedCount: number;
  priceDropCount: number;
  skipped: boolean;
  note: string;
}

const DISCOVERY_CACHE_HOURS = 24;

function buildSubjectItem(project: {
  id: string;
  externalId: string | null;
  sourceUrl: string | null;
  portal: string | null;
  title: string | null;
  askingPrice: number | null;
  disposition: string | null;
  areaM2: number | null;
  municipality: string | null;
  district: string | null;
  condition: string | null;
  ownership: string | null;
  publishedAt: Date | null;
  firstSeenAt: Date;
}): ListingSourceItem {
  return {
    externalId: project.externalId ?? project.id,
    url: project.sourceUrl ?? "",
    portal: project.portal ?? "",
    title: project.title ?? "",
    askingPrice: project.askingPrice ?? 0,
    disposition: project.disposition ?? "",
    areaM2: project.areaM2 ?? 0,
    municipality: project.municipality ?? "",
    district: project.district,
    condition: project.condition,
    ownership: project.ownership,
    photos: [],
    publishedAt: (project.publishedAt ?? project.firstSeenAt).toISOString(),
    isDemo: false
  };
}

/**
 * Runs comparable discovery for one project and upserts the results. Safe
 * to call on every project-detail page load — `force: false` (the default)
 * skips the actual provider calls when the project's comparables were
 * refreshed within DISCOVERY_CACHE_HOURS, so re-opening a project never
 * re-triggers a full re-scan.
 */
export async function discoverComparablesForProject(
  projectId: string,
  opts: { force?: boolean } = {}
): Promise<ComparableDiscoveryResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Projekt nenalezen.");

  if (!opts.force && project.lastComparableDiscoveryAt) {
    const ageHours = (Date.now() - project.lastComparableDiscoveryAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < DISCOVERY_CACHE_HOURS) {
      return {
        activeProviders: [],
        foundCount: 0,
        createdCount: 0,
        updatedCount: 0,
        priceDropCount: 0,
        skipped: true,
        note: project.comparableDiscoveryNote ?? `Přeskočeno — srovnání aktualizována před ${Math.round(ageHours)} h.`
      };
    }
  }

  const subjectItem = buildSubjectItem(project);
  const activeProviders = SOURCE_PROVIDERS.filter(
    (p) => p.status === "ACTIVE" && p.key !== "MOCK_DEMO" && typeof p.findComparables === "function"
  );

  const found: Array<{ item: ListingSourceItem; providerKey: string }> = [];
  const errors: string[] = [];

  for (const provider of activeProviders) {
    try {
      const results = await provider.findComparables!(subjectItem);
      for (const item of results) found.push({ item, providerKey: provider.key });
    } catch (err) {
      // One provider failing must never abort discovery via the others.
      errors.push(err instanceof SourceNotAvailableError ? `${provider.label}: ${err.message}` : `${provider.label}: vyhledávání selhalo.`);
    }
  }

  let createdCount = 0;
  let updatedCount = 0;
  let priceDropCount = 0;

  for (const { item, providerKey } of found) {
    if (!item.url) continue; // dedup key requires a real URL — never persist an unlinked "comparable"
    const pricePerM2 = item.areaM2 ? item.askingPrice / item.areaM2 : null;
    const existing = await prisma.comparable.findUnique({ where: { projectId_url: { projectId, url: item.url } } });

    if (existing) {
      const priceChanged = existing.price !== null && existing.price !== item.askingPrice;
      await prisma.comparable.update({
        where: { id: existing.id },
        data: {
          price: item.askingPrice,
          pricePerM2,
          condition: item.condition ?? existing.condition,
          lastSeenAt: new Date()
        }
      });
      if (priceChanged) {
        await prisma.comparablePriceHistory.create({ data: { comparableId: existing.id, price: item.askingPrice } });
        if (item.askingPrice < (existing.price ?? Infinity)) priceDropCount++;
      }
      updatedCount++;
    } else {
      const created = await prisma.comparable.create({
        data: {
          projectId,
          title: item.title,
          url: item.url,
          portal: item.portal,
          locality: [item.municipality, item.district].filter(Boolean).join(" - "),
          disposition: item.disposition,
          areaM2: item.areaM2,
          price: item.askingPrice,
          pricePerM2,
          condition: item.condition,
          ownership: item.ownership,
          floor: item.floor,
          totalFloors: item.totalFloors,
          elevator: item.elevator,
          balcony: item.balcony,
          terrace: item.terrace,
          loggia: item.loggia,
          parking: item.parking,
          buildingType: item.buildingType,
          construction: item.construction,
          priceType: "ASKING",
          sourceProvider: providerKey,
          lastSeenAt: new Date()
        }
      });
      await prisma.comparablePriceHistory.create({ data: { comparableId: created.id, price: item.askingPrice } });
      createdCount++;
    }
  }

  await rescoreAllComparables(projectId).catch(() => {});

  const note =
    activeProviders.length === 0
      ? "Žádný aktivní zdroj srovnatelných nabídek není připojen (viz Nastavení → Provider Health)."
      : `Prohledáno ${activeProviders.length} aktivních zdrojů, nalezeno ${found.length} nabídek (${createdCount} nových, ${updatedCount} aktualizovaných).${
          errors.length > 0 ? ` Chyby: ${errors.join("; ")}.` : ""
        }`;

  await prisma.project.update({
    where: { id: projectId },
    data: { lastComparableDiscoveryAt: new Date(), comparableDiscoveryNote: note }
  });

  return {
    activeProviders: activeProviders.map((p) => p.key),
    foundCount: found.length,
    createdCount,
    updatedCount,
    priceDropCount,
    skipped: false,
    note
  };
}
