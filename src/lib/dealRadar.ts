// Deal Radar core pipeline ("Hlídací pes" / Watchdog): run a watcher
// against its configured source providers, dedupe against existing
// projects (including the same property found on a DIFFERENT portal —
// never a second "new opportunity" alert for it), detect listing removal/
// return, track price AND non-price changes, run the same math-only
// pricing engine used everywhere else in the app, and raise alerts when —
// and only when — the numbers actually clear the watcher's own thresholds.
//
// Pipeline per listing (Deal Radar V2): NEW LISTING → NORMALIZE → DEDUP
// (same portal AND cross-portal) → COMPARABLES → MARKET VALUE → ARV →
// RENOVATION ESTIMATE → MAX BUY PRICE → DEAL SCORE → DATA CONFIDENCE →
// ALERT → full Zero-Click analysis pipeline → CONTACT/SMS RULES. A failure
// anywhere in one listing's processing is caught, logged to
// ProviderErrorLog, and never aborts the rest of the run (item 22). The
// Project row is saved (BASIC_ANALYSIS) before comparables/valuation work
// runs, so it's visible in the app immediately rather than only once the
// full pipeline finishes (item 21). The alert itself is dispatched BEFORE
// the slower Vision/RenovationPlan/Visualization/Product pipeline runs —
// "the moment it finds a match" must not wait on AI calls.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { extractContactInfo } from "@/lib/extract";
import { getSourceProvider, parseSourceKeys } from "@/lib/sources/registry";
import { SourceNotAvailableError, type ListingSourceItem, type ListingSourceQuery } from "@/lib/sources/types";
import { dispatchAlert } from "@/lib/notifications/dispatcher";
import { maybeSendAutoOutreach } from "@/lib/outreach";
import { maybeSendAutoSms } from "@/lib/smsHub";
import { rescoreAllComparables } from "@/lib/comparableScoring";
import { computeARV, computeMarketValue, type MarketValueComparable } from "@/lib/marketValue";
import { findPossibleDuplicates, scoreDuplicateMatch, type DedupCandidate } from "@/lib/dedup";
import { computeDealMetrics, type DealMetrics } from "@/lib/dealMetrics";
import { advancePipeline, PIPELINE_STEPS } from "@/lib/pipeline";
import { logProviderSuccess, logProviderError } from "@/lib/providerCallLog";
import type { FieldMeta, CompQualityTier } from "@/lib/types";
import type { AlertNotificationPayload } from "@/lib/notifications/types";

const OWNERSHIP_LABEL: Record<string, string> = {
  OSOBNI: "Osobní",
  DRUZSTEVNI: "Družstevní"
};

const ACTIVE_TRACKING_STATUSES = ["ACTIVE", "WATCHED"];
// Two consecutive runs that don't see a previously-tracked listing before
// it's declared REMOVED — one transient provider hiccup (a flaky search,
// a momentary 500) must never alone claim a real listing vanished.
const MISSED_RUNS_BEFORE_REMOVED = 2;

export interface WatcherRunSummary {
  providers: Array<{ key: string; label: string; status: string; itemCount: number; note?: string }>;
  newProjects: number;
  updatedProjects: number;
  priceDrops: number;
  crossPortalDuplicates: number;
  listingsRemoved: number;
  listingsRelisted: number;
  alerts: number;
  itemErrors: number;
}

type SettingsType = Awaited<ReturnType<typeof getSettings>>;

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
    crossPortalDuplicates: 0,
    listingsRemoved: 0,
    listingsRelisted: 0,
    alerts: 0,
    itemErrors: 0
  };

  const allItems: Array<{ item: ListingSourceItem; providerKey: string }> = [];
  let anyProviderSucceeded = false;

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
    const startedAt = Date.now();
    try {
      const items = await provider.search(query);
      const latencyMs = Date.now() - startedAt;
      summary.providers.push({ key: provider.key, label: provider.label, status: "ACTIVE", itemCount: items.length });
      await logProviderSuccess(provider.key, { resultCount: items.length, latencyMs });
      for (const item of items) allItems.push({ item, providerKey: provider.key });
      anyProviderSucceeded = true;
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const note = err instanceof SourceNotAvailableError ? err.message : "Vyhledávání selhalo.";
      summary.providers.push({ key: provider.key, label: provider.label, status: "ERROR", itemCount: 0, note });
      await logProviderError(provider.key, note, { latencyMs, watcherId });
    }
  }

  for (const { item, providerKey } of allItems) {
    try {
      await processListingItem({ item, providerKey, watcher, settings, summary });
    } catch (err) {
      // One bad listing must never take down the rest of the run.
      summary.itemErrors++;
      const message = err instanceof Error ? err.message : "Neznámá chyba při zpracování nabídky.";
      await logProviderError(providerKey, message, { watcherId, externalId: item.externalId });
    }
  }

  // --- LISTING AVAILABILITY: REMOVED detection (item 2) ---
  // Only when at least one provider genuinely ran this time — a total
  // provider outage must never be mistaken for every tracked listing
  // vanishing at once.
  if (anyProviderSucceeded) {
    await detectRemovedListings({ watcherId, seenItems: allItems.map((a) => a.item), settings, summary });
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
  return `Nové: ${s.newProjects}, aktualizace: ${s.updatedProjects} (pokles ceny: ${s.priceDrops}, duplicity na jiném portálu: ${s.crossPortalDuplicates}), staženo: ${s.listingsRemoved}, vráceno do nabídky: ${s.listingsRelisted}, alerty: ${s.alerts}.${errorNote} ${providerNotes}`;
}

export async function detectRemovedListings(args: {
  watcherId: string;
  seenItems: ListingSourceItem[];
  settings: SettingsType;
  summary: WatcherRunSummary;
}) {
  const { watcherId, seenItems, settings, summary } = args;
  const seenKeys = new Set(seenItems.map((i) => `${i.portal}::${i.externalId}`));

  const trackedProjects = await prisma.project.findMany({
    where: {
      sourceWatcherId: watcherId,
      status: { in: ACTIVE_TRACKING_STATUSES },
      portal: { not: null },
      externalId: { not: null },
      listingAvailability: { not: "REMOVED" }
    },
    include: { comparables: true, assumptions: true }
  });

  for (const tp of trackedProjects) {
    const key = `${tp.portal}::${tp.externalId}`;
    if (seenKeys.has(key)) {
      if (tp.listingMissedRuns > 0) {
        await prisma.project.update({ where: { id: tp.id }, data: { listingMissedRuns: 0 } }).catch(() => {});
      }
      continue;
    }

    const missed = tp.listingMissedRuns + 1;
    if (missed >= MISSED_RUNS_BEFORE_REMOVED) {
      await prisma.project.update({
        where: { id: tp.id },
        data: { listingAvailability: "REMOVED", listingRemovedAt: new Date(), listingMissedRuns: missed }
      });
      await prisma.listingEvent.create({
        data: {
          projectId: tp.id,
          eventType: "REMOVED",
          detail: `Inzerát nebyl nalezen ${missed}x po sobě při průchodu hlídače — pravděpodobně stažen z nabídky.`
        }
      });
      summary.listingsRemoved++;
      await alertListingAvailabilityChange({ project: tp, reason: "LISTING_REMOVED", watcherId, settings, summary });
    } else {
      await prisma.project.update({ where: { id: tp.id }, data: { listingMissedRuns: missed } });
    }
  }
}

export async function processListingItem(args: {
  item: ListingSourceItem;
  providerKey: string;
  watcher: NonNullable<Awaited<ReturnType<typeof prisma.watcher.findUnique>>>;
  settings: SettingsType;
  summary: WatcherRunSummary;
}) {
  const { item, providerKey, watcher, settings, summary } = args;

  // --- DEDUP against an already-tracked listing from the same portal ---
  const existing = await prisma.project.findUnique({
    where: { portal_externalId: { portal: item.portal, externalId: item.externalId } },
    include: { assumptions: true, comparables: true, priceHistory: true }
  });

  if (existing) {
    // Listing availability: a previously-REMOVED project reappearing is a
    // RELISTED event, always worth a (separate, informational) alert —
    // independent of whether its price also changed this run.
    if (existing.listingAvailability === "REMOVED") {
      await prisma.project.update({
        where: { id: existing.id },
        data: { listingAvailability: "RELISTED", listingRelistedAt: new Date(), listingMissedRuns: 0, lastSeenAt: new Date() }
      });
      await prisma.listingEvent.create({
        data: { projectId: existing.id, eventType: "RELISTED", detail: "Inzerát se znovu objevil v nabídce." }
      });
      summary.listingsRelisted++;
      await alertListingAvailabilityChange({
        project: { ...existing, askingPrice: item.askingPrice },
        reason: "LISTING_RELISTED",
        watcherId: watcher.id,
        settings,
        summary
      });
    } else if (existing.listingMissedRuns > 0) {
      await prisma.project.update({ where: { id: existing.id }, data: { listingMissedRuns: 0 } }).catch(() => {});
    }

    // Non-price field changes (item 2 — "změny textu nebo důležitých
    // parametrů"). Checked independently of the price-change branch below
    // so a listing that only edits its description still gets a real,
    // dated ListingEvent.
    await detectNonPriceChanges(existing, item);

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
            comparables: existing.comparables,
            watcher,
            reason: "PRICE_DROP",
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

  // --- DEDUP across portals: same physical property found under a
  // different (portal, externalId) combination must never become a second
  // Project / a second "new opportunity" alert (item 2). ---
  const samePropertyMatch = await findSamePropertyProject(item);
  if (samePropertyMatch) {
    const crossPortalEntry = { portal: item.portal, url: item.url, externalId: item.externalId, firstSeenAt: new Date().toISOString() };
    const existingCrossPortal: Array<{ portal: string; url: string; externalId: string; firstSeenAt: string }> =
      samePropertyMatch.crossPortalListings ? JSON.parse(samePropertyMatch.crossPortalListings) : [];
    const alreadyRecorded = existingCrossPortal.some((c) => c.portal === item.portal && c.externalId === item.externalId);

    if (!alreadyRecorded) {
      existingCrossPortal.push(crossPortalEntry);
      await prisma.project.update({
        where: { id: samePropertyMatch.id },
        data: { crossPortalListings: JSON.stringify(existingCrossPortal), lastSeenAt: new Date() }
      });
      await prisma.listingEvent.create({
        data: {
          projectId: samePropertyMatch.id,
          eventType: "CROSS_PORTAL_DUPLICATE",
          detail: `Stejná nemovitost nalezena i na portálu ${item.portal}.`,
          newValue: item.url
        }
      });
    } else {
      await prisma.project.update({ where: { id: samePropertyMatch.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
    summary.crossPortalDuplicates++;
    summary.updatedProjects++;
    return; // never a second "new opportunity" alert for the same property
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
    street: item.street ? "VERIFIED" : undefined,
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
      street: item.street ?? null,
      propertyType: item.propertyType ?? null,
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

  // --- DEDUP against other already-tracked projects (possible duplicates,
  // flagged for manual review — distinct from the automatic SAME_PROPERTY
  // suppression above, which only ever fires before a Project exists) ---
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
  let comps: Awaited<ReturnType<typeof prisma.comparable.findMany>> = [];
  if (comparablesCount > 0) {
    // Score the freshly-created comparables (Comparable Engine V2) so the
    // sale-price basis below reflects real similarity/quality, not just
    // "any comp with a price."
    await rescoreAllComparables(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { analysisStage: "COMPARABLES" } });

    comps = await prisma.comparable.findMany({ where: { projectId: project.id } });
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

  // --- DEAL SCORE / DATA CONFIDENCE → ALERT (fast — fires before the
  // slower Zero-Click analysis pipeline below) → CONTACT/SMS RULES ---
  await maybeAlertAndOutreach({
    project,
    assumptions,
    comparables: comps,
    watcher,
    reason: "NEW_MATCH",
    settings,
    summary
  });

  // --- Full Zero-Click analysis pipeline (item 4): Vision → RenovationPlan
  // → BEFORE/AFTER → Products → Budget check. Runs the exact same
  // orchestrator a manually-created project goes through
  // (src/lib/pipeline.ts) — each step is already individually isolated and
  // reports WAITING_FOR_PROVIDER rather than failing when a provider isn't
  // connected, so a thin-data listing still gets everything that CAN run.
  // Bounded by the real number of pipeline steps so this can never loop
  // forever on a stuck project.
  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    const state = await advancePipeline(project.id).catch(() => null);
    if (!state || state.overallStatus !== "RUNNING") break;
  }
}

async function detectNonPriceChanges(
  existing: { id: string; disposition: string | null; areaM2: number | null; condition: string | null; fullText: string | null },
  item: ListingSourceItem
) {
  if (item.disposition && existing.disposition && item.disposition !== existing.disposition) {
    await prisma.listingEvent.create({
      data: {
        projectId: existing.id,
        eventType: "DESCRIPTION_CHANGE",
        detail: "Dispozice v inzerátu se změnila.",
        oldValue: existing.disposition,
        newValue: item.disposition
      }
    });
    await prisma.project.update({ where: { id: existing.id }, data: { disposition: item.disposition } }).catch(() => {});
  }

  if (item.condition && existing.condition && item.condition !== existing.condition) {
    await prisma.listingEvent.create({
      data: {
        projectId: existing.id,
        eventType: "CONDITION_CHANGE",
        detail: "Popsaný stav nemovitosti se změnil.",
        oldValue: existing.condition,
        newValue: item.condition
      }
    });
    await prisma.project.update({ where: { id: existing.id }, data: { condition: item.condition } }).catch(() => {});
  }

  if (item.fullText && existing.fullText && item.fullText !== existing.fullText) {
    await prisma.listingEvent.create({
      data: {
        projectId: existing.id,
        eventType: "DESCRIPTION_CHANGE",
        detail: "Text inzerátu se změnil."
      }
    });
    await prisma.project.update({ where: { id: existing.id }, data: { fullText: item.fullText } }).catch(() => {});
  }
}

/**
 * Looks for an already-tracked ACTIVE/WATCHED project that scoreDuplicateMatch
 * classifies SAME_PROPERTY as `item` — i.e. the same physical listing found
 * under a different portal/externalId. Returns null (never guessed) unless
 * the match is that strong.
 */
async function findSamePropertyProject(
  item: ListingSourceItem
): Promise<{ id: string; crossPortalListings: string | null } | null> {
  const candidates = await prisma.project.findMany({
    where: { status: { in: ACTIVE_TRACKING_STATUSES } },
    include: { contact: true }
  });

  const itemCandidate: DedupCandidate = {
    id: "NEW",
    title: item.title,
    municipality: item.municipality,
    district: item.district,
    street: item.street ?? null,
    areaM2: item.areaM2,
    disposition: item.disposition,
    askingPrice: item.askingPrice,
    fullText: item.fullText ?? null,
    contactPhone: item.contactPhone ?? null
  };

  for (const other of candidates) {
    if (other.portal === item.portal && other.externalId === item.externalId) continue; // exact match already handled by caller
    const otherCandidate: DedupCandidate = {
      id: other.id,
      title: other.title,
      municipality: other.municipality,
      district: other.district,
      street: other.street,
      areaM2: other.areaM2,
      disposition: other.disposition,
      askingPrice: other.askingPrice,
      fullText: other.fullText,
      contactPhone: other.contact?.phone ?? null
    };
    const result = scoreDuplicateMatch(itemCandidate, otherCandidate);
    if (result.classification === "SAME_PROPERTY") {
      return { id: other.id, crossPortalListings: other.crossPortalListings };
    }
  }
  return null;
}

function buildAlertPayload(args: {
  alertId: string;
  project: {
    id: string;
    title: string | null;
    propertyType?: string | null;
    municipality: string | null;
    district: string | null;
    disposition?: string | null;
    askingPrice: number | null;
    pricePerM2: number | null;
    sourceUrl?: string | null;
  };
  reason: string;
  metrics: DealMetrics | null;
  renovationEstimate: number | null;
}): AlertNotificationPayload {
  const { alertId, project, reason, metrics, renovationEstimate } = args;
  return {
    alertId,
    projectId: project.id,
    projectTitle: project.title ?? "Nepojmenovaná nemovitost",
    propertyType: project.propertyType ?? null,
    municipality: project.municipality,
    district: project.district,
    disposition: project.disposition ?? null,
    askingPrice: project.askingPrice,
    pricePerM2: project.pricePerM2,
    maxBuyPrice: metrics?.bandThreshold ?? null,
    expectedProfit: metrics?.profit ?? null,
    roiPct: metrics?.roi ?? null,
    band: metrics?.band ?? null,
    sourceUrl: project.sourceUrl ?? null,
    reason,
    marketValueEstimate: metrics?.marketValueEstimate ?? null,
    arvEstimate: metrics?.arvEstimate ?? null,
    renovationEstimate,
    dziflipScore: metrics?.dziflipScore ?? null
  };
}

async function maybeAlertAndOutreach(args: {
  project: {
    id: string;
    title: string | null;
    propertyType?: string | null;
    municipality: string | null;
    district: string | null;
    askingPrice: number | null;
    pricePerM2: number | null;
    areaM2?: number | null;
    sourceUrl?: string | null;
    disposition?: string | null;
    fieldMeta?: string | null;
    lastVerifiedAt?: Date | null;
  };
  assumptions: { saleConservative: number | null; renovationCost: number | null } & Record<string, unknown>;
  comparables: Array<{ pricePerM2: number | null; qualityTier: string | null; priceType: string; condition: string | null }>;
  watcher: { id: string; maxRenovationEstimate: number | null; minProfit: number | null; minRoiPct: number | null };
  reason: "NEW_MATCH" | "PRICE_DROP";
  settings: SettingsType;
  summary: WatcherRunSummary;
}) {
  const { project, assumptions, comparables, watcher, reason, settings, summary } = args;

  if (project.askingPrice === null) return;

  const fieldMeta: FieldMeta = project.fieldMeta ? JSON.parse(project.fieldMeta) : {};
  const metrics = computeDealMetrics({
    askingPrice: project.askingPrice,
    areaM2: project.areaM2 ?? null,
    assumptions: assumptions as any,
    comparables,
    fieldMeta,
    lastVerifiedAt: project.lastVerifiedAt,
    settings
  });
  if (!metrics) return; // no sale-price basis, no alert
  if (metrics.band !== "GOOD" && metrics.band !== "BUY_NOW") return;
  if (metrics.profit === null || metrics.roi === null) return;

  if (watcher.minProfit != null && metrics.profit < watcher.minProfit) return;
  if (watcher.minRoiPct != null && metrics.roi < watcher.minRoiPct) return;
  if (watcher.maxRenovationEstimate != null && (assumptions.renovationCost ?? 0) > watcher.maxRenovationEstimate) return;

  const alert = await prisma.alert.create({
    data: {
      projectId: project.id,
      watcherId: watcher.id,
      reason,
      band: metrics.band,
      askingPrice: project.askingPrice,
      pricePerM2: project.pricePerM2,
      expectedProfit: metrics.profit,
      roiPct: metrics.roi,
      marketValueEstimate: metrics.marketValueEstimate,
      arvEstimate: metrics.arvEstimate,
      renovationEstimate: assumptions.renovationCost ?? null,
      dziflipScore: metrics.dziflipScore
    }
  });
  summary.alerts++;

  await dispatchAlert(
    buildAlertPayload({
      alertId: alert.id,
      project: { ...project, propertyType: project.propertyType ?? null },
      reason,
      metrics,
      renovationEstimate: assumptions.renovationCost ?? null
    })
  );

  // Phase 3 SMS/outreach automation safety rules (DRAFT/AUTO gating, daily
  // limits, blacklist, duplicate prevention, confidence gate) are invoked
  // here unchanged — nothing about them is relaxed by Deal Radar V2.
  await maybeSendAutoOutreach(project.id, metrics.confidenceLevel);
  await maybeSendAutoSms(project.id);
}

/**
 * Informational alert for a listing availability change (item 2 —
 * "sledovat... návrat nabídky, zmizení nabídky"). Never gated on profit/ROI
 * thresholds (there's no new economics to evaluate) — it always fires,
 * carrying whatever real metrics are still on file (N/A for the rest).
 */
async function alertListingAvailabilityChange(args: {
  project: {
    id: string;
    title: string | null;
    propertyType: string | null;
    municipality: string | null;
    district: string | null;
    disposition: string | null;
    askingPrice: number | null;
    pricePerM2: number | null;
    areaM2: number | null;
    sourceUrl: string | null;
    fieldMeta: string | null;
    lastVerifiedAt: Date | null;
    comparables?: Array<{ pricePerM2: number | null; qualityTier: string | null; priceType: string; condition: string | null }>;
    assumptions?: ({ saleConservative: number | null; renovationCost: number | null } & Record<string, unknown>) | null;
  };
  reason: "LISTING_REMOVED" | "LISTING_RELISTED";
  watcherId: string | null;
  settings: SettingsType;
  summary: WatcherRunSummary;
}) {
  const { project, reason, watcherId, settings, summary } = args;

  const assumptions = project.assumptions ?? (await prisma.assumptions.findUnique({ where: { projectId: project.id } }));
  const comparables = project.comparables ?? (await prisma.comparable.findMany({ where: { projectId: project.id } }));

  const fieldMeta: FieldMeta = project.fieldMeta ? JSON.parse(project.fieldMeta) : {};
  const metrics =
    assumptions && project.askingPrice != null
      ? computeDealMetrics({
          askingPrice: project.askingPrice,
          areaM2: project.areaM2,
          assumptions: assumptions as any,
          comparables,
          fieldMeta,
          lastVerifiedAt: project.lastVerifiedAt,
          settings
        })
      : null;

  const alert = await prisma.alert.create({
    data: {
      projectId: project.id,
      watcherId,
      reason,
      band: metrics?.band ?? null,
      askingPrice: project.askingPrice,
      pricePerM2: project.pricePerM2,
      expectedProfit: metrics?.profit ?? null,
      roiPct: metrics?.roi ?? null,
      marketValueEstimate: metrics?.marketValueEstimate ?? null,
      arvEstimate: metrics?.arvEstimate ?? null,
      renovationEstimate: assumptions?.renovationCost ?? null,
      dziflipScore: metrics?.dziflipScore ?? null
    }
  });
  summary.alerts++;

  await dispatchAlert(
    buildAlertPayload({
      alertId: alert.id,
      project,
      reason,
      metrics,
      renovationEstimate: assumptions?.renovationCost ?? null
    })
  );
}
