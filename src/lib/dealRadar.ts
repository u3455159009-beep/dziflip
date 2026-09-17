// Deal Radar core pipeline: run a watcher against its configured source
// providers, dedupe against existing projects, run the same math-only
// pricing engine used everywhere else in the app, and raise alerts when —
// and only when — the numbers actually clear the watcher's own thresholds.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { extractContactInfo } from "@/lib/extract";
import { getSourceProvider, parseSourceKeys } from "@/lib/sources/registry";
import { SourceNotAvailableError, type ListingSourceItem, type ListingSourceQuery } from "@/lib/sources/types";
import { computeBands, computeComparableStats, computeEconomics, classifyPrice, type AssumptionsInput } from "@/lib/calc";
import { dispatchAlert } from "@/lib/notifications/dispatcher";
import { computeDataConfidence } from "@/lib/confidence";
import { maybeSendAutoOutreach } from "@/lib/outreach";
import { maybeSendAutoSms } from "@/lib/smsHub";
import type { FieldMeta } from "@/lib/types";

const OWNERSHIP_LABEL: Record<string, string> = {
  OSOBNI: "Osobní",
  DRUZSTEVNI: "Družstevní"
};

const ACTIVE_TRACKING_STATUSES = ["ACTIVE", "WATCHED"];

export interface WatcherRunSummary {
  providers: Array<{ key: string; label: string; status: string; itemCount: number; note?: string }>;
  newProjects: number;
  updatedProjects: number;
  priceDrops: number;
  alerts: number;
}

export async function runWatcher(watcherId: string): Promise<WatcherRunSummary> {
  const watcher = await prisma.watcher.findUnique({ where: { id: watcherId } });
  if (!watcher) throw new Error("Hlídač nenalezen.");

  const settings = await getSettings();
  const sourceKeys = parseSourceKeys(watcher.sources);

  const query: ListingSourceQuery = {
    municipality: watcher.municipality,
    district: watcher.district,
    dispositions: watcher.dispositions ? watcher.dispositions.split(",").map((d) => d.trim()) : undefined,
    minAreaM2: watcher.minAreaM2,
    maxAreaM2: watcher.maxAreaM2,
    maxPrice: watcher.maxAskingPrice,
    maxPricePerM2: watcher.maxPricePerM2,
    condition: watcher.condition,
    ownership: watcher.ownership,
    onlyNewListings: watcher.onlyNewListings
  };

  const summary: WatcherRunSummary = {
    providers: [],
    newProjects: 0,
    updatedProjects: 0,
    priceDrops: 0,
    alerts: 0
  };

  const allItems: Array<{ item: ListingSourceItem; providerKey: string }> = [];

  for (const key of sourceKeys) {
    const provider = getSourceProvider(key);
    if (!provider) {
      summary.providers.push({ key, label: key, status: "UNKNOWN", itemCount: 0, note: "Neznámý zdroj." });
      continue;
    }
    if (provider.status === "PENDING_ACCESS") {
      summary.providers.push({
        key: provider.key,
        label: provider.label,
        status: "PENDING_ACCESS",
        itemCount: 0,
        note: provider.statusNote
      });
      continue;
    }
    try {
      const items = await provider.search(query);
      summary.providers.push({ key: provider.key, label: provider.label, status: "ACTIVE", itemCount: items.length });
      for (const item of items) allItems.push({ item, providerKey: provider.key });
    } catch (err) {
      const note = err instanceof SourceNotAvailableError ? err.message : "Vyhledávání selhalo.";
      summary.providers.push({ key: provider.key, label: provider.label, status: "ERROR", itemCount: 0, note });
    }
  }

  for (const { item, providerKey } of allItems) {
    const existing = await prisma.project.findUnique({
      where: { portal_externalId: { portal: item.portal, externalId: item.externalId } },
      include: { assumptions: true, comparables: true, priceHistory: true }
    });

    if (existing) {
      const priceChanged = existing.askingPrice !== null && existing.askingPrice !== item.askingPrice;
      if (priceChanged && watcher.trackPriceChanges && ACTIVE_TRACKING_STATUSES.includes(existing.status)) {
        const isDrop = item.askingPrice < (existing.askingPrice ?? Infinity);

        await prisma.priceHistory.create({
          data: { projectId: existing.id, price: item.askingPrice, source: "WATCHER" }
        });

        const newPricePerM2 = existing.areaM2 ? item.askingPrice / existing.areaM2 : null;
        await prisma.project.update({
          where: { id: existing.id },
          data: { askingPrice: item.askingPrice, pricePerM2: newPricePerM2 }
        });

        if (existing.assumptions) {
          const purchaseWasTrackingAsking = existing.assumptions.purchasePriceUsed === existing.askingPrice;
          const updatedAssumptions = purchaseWasTrackingAsking
            ? await prisma.assumptions.update({
                where: { projectId: existing.id },
                data: { purchasePriceUsed: item.askingPrice }
              })
            : existing.assumptions;

          summary.updatedProjects++;
          if (isDrop) {
            summary.priceDrops++;
            await maybeAlertAndOutreach({
              project: { ...existing, askingPrice: item.askingPrice, pricePerM2: newPricePerM2 },
              assumptions: updatedAssumptions,
              watcher,
              reason: "PRICE_DROP",
              comparablesCount: existing.comparables.length,
              settings,
              summary
            });
          }
        } else {
          summary.updatedProjects++;
        }
      }
      continue;
    }

    // New listing — build a fresh Project from structured provider data.
    const fieldMeta: FieldMeta = {
      title: "ESTIMATED",
      askingPrice: "VERIFIED",
      disposition: "VERIFIED",
      areaM2: "VERIFIED",
      pricePerM2: "VERIFIED",
      municipality: "VERIFIED",
      district: item.district ? "VERIFIED" : undefined,
      condition: item.condition ? "VERIFIED" : undefined,
      ownership: item.ownership ? "VERIFIED" : undefined
    };

    const contact = extractContactInfo(item.fullText ?? "");
    const pricePerM2 = item.areaM2 ? item.askingPrice / item.areaM2 : null;

    const project = await prisma.project.create({
      data: {
        status: "ACTIVE",
        sourceUrl: item.url,
        portal: item.portal,
        externalId: item.externalId,
        isDemo: item.isDemo,
        sourceWatcherId: watcher.id,
        fullText: item.fullText ?? null,
        fieldMeta: JSON.stringify(fieldMeta),
        title: item.title,
        askingPrice: item.askingPrice,
        disposition: item.disposition,
        areaM2: item.areaM2,
        pricePerM2,
        municipality: item.municipality,
        district: item.district,
        condition: item.condition,
        ownership: item.ownership ? OWNERSHIP_LABEL[item.ownership] ?? item.ownership : null,
        photos: { create: item.photos.map((url, i) => ({ url, sortOrder: i })) },
        priceHistory: { create: [{ price: item.askingPrice, source: "WATCHER" }] },
        contact: { create: { name: null, phone: contact.phone ?? null, email: contact.email ?? null, status: "NEKONTAKTOVANO" } }
      }
    });
    summary.newProjects++;

    // Comparables from the same source, if it can supply them (real,
    // sourced data only — never fabricated).
    const provider = getSourceProvider(providerKey);
    let comparablesCount = 0;
    if (provider?.findComparables) {
      const comps = await provider.findComparables(item);
      if (comps.length > 0) {
        await prisma.comparable.createMany({
          data: comps.map((c) => ({
            projectId: project.id,
            title: c.title,
            url: c.url,
            portal: c.portal,
            locality: [c.municipality, c.district].filter(Boolean).join(" - "),
            disposition: c.disposition,
            areaM2: c.areaM2,
            price: c.askingPrice,
            pricePerM2: c.areaM2 ? c.askingPrice / c.areaM2 : null,
            condition: c.condition,
            priceType: "ASKING"
          }))
        });
        comparablesCount = comps.length;
      }
    }

    const renovationCost =
      settings.defaultRenovationCostPerM2 && item.areaM2
        ? Math.round(settings.defaultRenovationCostPerM2 * item.areaM2)
        : null;

    let saleConservative: number | null = null;
    let saleBase: number | null = null;
    let saleOptimistic: number | null = null;
    if (comparablesCount > 0) {
      const comps = await prisma.comparable.findMany({ where: { projectId: project.id } });
      const stats = computeComparableStats(comps.map((c) => c.pricePerM2 ?? NaN));
      if (stats.median && item.areaM2) {
        saleBase = Math.round(stats.median * item.areaM2);
        saleConservative = Math.round(saleBase * 0.95);
        saleOptimistic = Math.round(saleBase * 1.08);
      }
    }

    const assumptions = await prisma.assumptions.create({
      data: {
        projectId: project.id,
        purchasePriceUsed: item.askingPrice,
        saleConservative,
        saleBase,
        saleOptimistic,
        renovationCost,
        furnishingCost: 0,
        legalCosts: 0,
        financingCost: 0,
        otherCosts: 0,
        reserve: watcher.requiredReserve ?? settings.defaultReserve ?? 0,
        minProfit: watcher.minProfit ?? settings.defaultMinProfit ?? 0,
        minMarginPct: 0,
        minRoiPct: watcher.minRoiPct ?? settings.defaultMinRoiPct ?? 0,
        incomeTaxPct: 0,
        bandWidthPct: 0.08
      }
    });

    await maybeAlertAndOutreach({
      project,
      assumptions,
      watcher,
      reason: "NEW_MATCH",
      comparablesCount,
      settings,
      summary
    });
  }

  await prisma.watcher.update({
    where: { id: watcherId },
    data: {
      lastRunAt: new Date(),
      lastRunNote: summarizeRun(summary)
    }
  });

  return summary;
}

function summarizeRun(s: WatcherRunSummary): string {
  const providerNotes = s.providers
    .map((p) => (p.note ? `${p.label}: ${p.note}` : `${p.label}: ${p.itemCount} nabídek`))
    .join(" · ");
  return `Nové: ${s.newProjects}, aktualizace: ${s.updatedProjects} (z toho pokles ceny: ${s.priceDrops}), alerty: ${s.alerts}. ${providerNotes}`;
}

async function maybeAlertAndOutreach(args: {
  project: { id: string; title: string | null; municipality: string | null; district: string | null; askingPrice: number | null; pricePerM2: number | null; areaM2?: number | null; sourceUrl?: string | null; disposition?: string | null; fieldMeta?: string | null };
  assumptions: AssumptionsInput & { renovationCost: number | null };
  watcher: { id: string; maxRenovationEstimate: number | null; minProfit: number | null; minRoiPct: number | null };
  reason: "NEW_MATCH" | "PRICE_DROP";
  comparablesCount: number;
  settings: Awaited<ReturnType<typeof getSettings>>;
  summary: WatcherRunSummary;
}) {
  const { project, assumptions, watcher, reason, comparablesCount, settings, summary } = args;

  if (assumptions.saleConservative === null || assumptions.saleConservative === undefined) return; // no basis, no alert
  if (project.askingPrice === null) return;

  const bands = computeBands(assumptions);
  const band = classifyPrice(project.askingPrice, bands);
  if (band !== "GOOD" && band !== "BUY_NOW") return;

  const economics = computeEconomics(project.askingPrice, assumptions, project.areaM2 ?? null);
  const profit = economics.scenarios.conservative.grossProfit;
  const roi = economics.scenarios.conservative.roiPct;

  if (watcher.minProfit != null && profit < watcher.minProfit) return;
  if (watcher.minRoiPct != null && roi < watcher.minRoiPct) return;
  if (watcher.maxRenovationEstimate != null && (assumptions.renovationCost ?? 0) > watcher.maxRenovationEstimate) return;

  const alert = await prisma.alert.create({
    data: {
      projectId: project.id,
      watcherId: watcher.id,
      reason,
      band,
      askingPrice: project.askingPrice,
      pricePerM2: project.pricePerM2,
      expectedProfit: profit,
      roiPct: roi
    }
  });
  summary.alerts++;

  await dispatchAlert({
    alertId: alert.id,
    projectTitle: project.title ?? "Nepojmenovaná nemovitost",
    municipality: project.municipality,
    district: project.district,
    disposition: project.disposition ?? null,
    askingPrice: project.askingPrice,
    pricePerM2: project.pricePerM2,
    maxBuyPrice: bands.goodThreshold,
    expectedProfit: profit,
    roiPct: roi,
    band,
    sourceUrl: project.sourceUrl ?? null,
    reason
  });

  const fieldMeta: FieldMeta = project.fieldMeta ? JSON.parse(project.fieldMeta) : {};
  const confidence = computeDataConfidence({
    fieldMeta,
    comparablesCount,
    hasRealBudgetItems: false,
    renovationCostSet: (assumptions.renovationCost ?? 0) > 0,
    salePriceSet: true
  });

  await maybeSendAutoOutreach(project.id, confidence.level);
  await maybeSendAutoSms(project.id);
}
