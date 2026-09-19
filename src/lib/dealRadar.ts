// Deal Radar core pipeline: run a watcher against its configured source
// providers, dedupe against existing projects, run the same math-only
// pricing engine used everywhere else in the app, and raise alerts when —
// and only when — the numbers actually clear the watcher's own thresholds.
//
// Pipeline per listing (Deal Radar V2): NEW LISTING → NORMALIZE → DEDUP →
// COMPARABLES → MARKET VALUE → ARV → RENOVATION ESTIMATE → MAX BUY PRICE →
// DEAL SCORE → DATA CONFIDENCE → ALERT → CONTACT/SMS RULES. A failure
// anywhere in one listing's processing is caught, logged to
// ProviderErrorLog, and never aborts the rest of the run (item 22). The
// Project row is saved (BASIC_ANALYSIS) before comparables/valuation work
// runs, so it's visible in the app immediately rather than only once the
// full pipeline finishes (item 21). Phase 3's SMS/outreach automation
// safety rules are invoked unchanged at the end of the pipeline — nothing
// about them is relaxed here.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { extractContactInfo } from "@/lib/extract";
import { getSourceProvider, parseSourceKeys } from "@/lib/sources/registry";
import { SourceNotAvailableError, type ListingSourceItem, type ListingSourceQuery } from "@/lib/sources/types";
import { computeBands, computeEconomics, classifyPrice, type AssumptionsInput } from "@/lib/calc";
import { dispatchAlert } from "@/lib/notifications/dispatcher";
import { computeDataConfidence } from "@/lib/confidence";
import { maybeSendAutoOutreach } from "@/lib/outreach";
import { maybeSendAutoSms } from "@/lib/smsHub";
import { rescoreAllComparables } from "@/lib/comparableScoring";
import { computeARV, computeMarketValue, type MarketValueComparable } from "@/lib/marketValue";
import { isDataStale } from "@/lib/staleData";
import { findPossibleDuplicates } from "@/lib/dedup";
import type { FieldMeta, CompQualityTier } from "@/lib/types";

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
  itemErrors: number;
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
    alerts: 0,
    itemErrors: 0
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
      await prisma.providerErrorLog
        .create({
          data: {
            provider: provider.key,
            watcherId,
            errorMessage: note
          }
        })
        .catch(() => {});
    }
  }

  for (const { item, providerKey } of allItems) {
    try {
      await processListingItem({ item, providerKey, watcher, settings, summary });
    } catch (err) {
      // One bad listing must never take down the rest of the run.
      summary.itemErrors++;
      const message = err instanceof Error ? err.message : "Neznámá chyba při zpracování nabídky.";
      await prisma.providerErrorLog
        .create({
          data: {
            provider: providerKey,
            watcherId,
            externalId: item.externalId,
            errorMessage: message
          }
        })
        .catch(() => {});
    }
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
  const errorNote = s.itemErrors > 0 ? ` Chyby při zpracování: ${s.itemErrors}.` : "";
  return `Nové: ${s.newProjects}, aktualizace: ${s.updatedProjects} (z toho pokles ceny: ${s.priceDrops}), alerty: ${s.alerts}.${errorNote} ${providerNotes}`;
}

export async function processListingItem(args: {
  item: ListingSourceItem;
  providerKey: string;
  watcher: NonNullable<Awaited<ReturnType<typeof prisma.watcher.findUnique>>>;
  settings: Awaited<ReturnType<typeof getSettings>>;
  summary: WatcherRunSummary;
}) {
  const { item, providerKey, watcher, settings, summary } = args;

  // --- DEDUP against an already-tracked listing from the same portal ---
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
      await prisma.listingEvent.create({
        data: {
          projectId: existing.id,
          eventType: "PRICE_CHANGE",
          detail: isDrop ? "Cena snížena (zjištěno hlídačem)." : "Cena zvýšena (zjištěno hlídačem).",
          oldValue: existing.askingPrice != null ? String(existing.askingPrice) : null,
          newValue: String(item.askingPrice)
        }
      });

      const newPricePerM2 = existing.areaM2 ? item.askingPrice / existing.areaM2 : null;
      const refetchedAt = new Date();
      await prisma.project.update({
        where: { id: existing.id },
        data: { askingPrice: item.askingPrice, pricePerM2: newPricePerM2, lastSeenAt: refetchedAt, lastVerifiedAt: refetchedAt }
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
            project: { ...existing, askingPrice: item.askingPrice, pricePerM2: newPricePerM2, lastVerifiedAt: refetchedAt },
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
    } else {
      // Still seen again by the watcher, even without a price change.
      await prisma.project.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
    return;
  }

  // --- NORMALIZE + create the Project (BASIC_ANALYSIS — visible right away) ---
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
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      lastVerifiedAt: new Date(),
      analysisStage: "BASIC_ANALYSIS",
      photos: { create: item.photos.map((url, i) => ({ url, sortOrder: i })) },
      priceHistory: { create: [{ price: item.askingPrice, source: "WATCHER" }] },
      contact: { create: { name: null, phone: contact.phone ?? null, email: contact.email ?? null, status: "NEKONTAKTOVANO" } },
      listingEvents: { create: [{ eventType: "CAPTURED", detail: "Nalezeno hlídačem a uloženo." }] }
    }
  });
  summary.newProjects++;

  // --- DEDUP against other already-tracked projects (possible duplicates) ---
  await findPossibleDuplicates(project.id).catch(() => 0);

  // --- COMPARABLES (real, sourced data only — never fabricated) ---
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

  // --- MARKET VALUE + ARV → sale-price basis for MAX BUY PRICE ---
  let saleConservative: number | null = null;
  let saleBase: number | null = null;
  let saleOptimistic: number | null = null;
  if (comparablesCount > 0) {
    // Score the freshly-created comparables (Comparable Engine V2) so the
    // sale-price basis below reflects real similarity/quality, not just
    // "any comp with a price."
    await rescoreAllComparables(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { analysisStage: "COMPARABLES" } });

    const comps = await prisma.comparable.findMany({ where: { projectId: project.id } });
    const marketComps: MarketValueComparable[] = comps.map((c) => ({
      pricePerM2: c.pricePerM2,
      qualityTier: (c.qualityTier as CompQualityTier | null) ?? null,
      priceType: c.priceType,
      condition: c.condition
    }));
    const valueOpts = { minCompCount: settings.minCompCount, minCompQuality: settings.minCompQuality as CompQualityTier };
    // Prefer After-Renovation Value as the flip's sale-price basis; fall
    // back to the current-condition market value only when there isn't
    // yet a renovated-comp sample to support an ARV estimate.
    const arv = computeARV(marketComps, item.areaM2, valueOpts);
    const basis = arv.insufficientData ? computeMarketValue(marketComps, item.areaM2, valueOpts) : arv;
    if (!basis.insufficientData) {
      saleConservative = basis.conservative.value;
      saleBase = basis.base.value;
      saleOptimistic = basis.high.value;
    }
  }

  // --- RENOVATION ESTIMATE + MAX BUY PRICE (assumptions row) ---
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

  await prisma.project.update({ where: { id: project.id }, data: { analysisStage: "FULL_ANALYSIS" } });

  // --- DEAL SCORE / DATA CONFIDENCE → ALERT → CONTACT/SMS RULES ---
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

async function maybeAlertAndOutreach(args: {
  project: { id: string; title: string | null; municipality: string | null; district: string | null; askingPrice: number | null; pricePerM2: number | null; areaM2?: number | null; sourceUrl?: string | null; disposition?: string | null; fieldMeta?: string | null; lastVerifiedAt?: Date | null };
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
  if (profit === null || roi === null) return; // no real conservative sale price to base an alert on

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
    salePriceSet: true,
    isStale: isDataStale(project.lastVerifiedAt, settings.staleDataThresholdDays)
  });

  // Phase 3 SMS/outreach automation safety rules (DRAFT/AUTO gating, daily
  // limits, blacklist, duplicate prevention, confidence gate) are invoked
  // here unchanged — nothing about them is relaxed by Deal Radar V2.
  await maybeSendAutoOutreach(project.id, confidence.level);
  await maybeSendAutoSms(project.id);
}
