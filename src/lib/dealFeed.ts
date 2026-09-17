// Shared builder for the "30-second" deal card data used by the Deal Feed
// and Deal Radar match lists. All numbers come straight from the same
// math-only engine used on the project detail page — nothing here is a
// separate, looser "feed estimate."
import {
  classifyPrice,
  computeBands,
  computeComparableStats,
  computeEconomics,
  type AssumptionsInput,
  type FlipBand
} from "./calc";
import { computeDataConfidence, type ConfidenceBreakdownItem } from "./confidence";
import type { FieldMeta, DataConfidenceLevel, SmsFeedStatus } from "./types";

export interface DealFeedItem {
  id: string;
  title: string | null;
  municipality: string | null;
  district: string | null;
  disposition: string | null;
  areaM2: number | null;
  askingPrice: number | null;
  pricePerM2: number | null;
  photoUrl: string | null;
  createdAt: string;
  isDemo: boolean;
  status: string;
  renovationEstimate: number | null;
  maxBuyPrice: number | null;
  saleEstimate: number | null;
  expectedProfit: number | null;
  roiPct: number | null;
  band: FlipBand | null;
  dataConfidenceLevel: DataConfidenceLevel;
  smsStatus: SmsFeedStatus;
  why: {
    purchasePrice: number | null;
    totalInvestment: number | null;
    costs: { renovation: number; furnishing: number; legal: number; financing: number; other: number; reserve: number };
    saleConservative: number | null;
    saleBase: number | null;
    saleOptimistic: number | null;
    grossProfit: number | null;
    roiPct: number | null;
    marginPct: number | null;
    bands: { buyNowThreshold: number; goodThreshold: number; normalThreshold: number } | null;
    comparablesCount: number;
    comparablesAvgPricePerM2: number | null;
    confidenceBreakdown: ConfidenceBreakdownItem[];
    sourceUrl: string | null;
    portal: string | null;
  };
}

export interface ProjectForFeed {
  id: string;
  title: string | null;
  municipality: string | null;
  district: string | null;
  disposition: string | null;
  areaM2: number | null;
  askingPrice: number | null;
  pricePerM2: number | null;
  createdAt: Date;
  isDemo: boolean;
  status: string;
  sourceUrl: string | null;
  portal: string | null;
  fieldMeta: string | null;
  photos: { url: string }[];
  comparables: { pricePerM2: number | null }[];
  budgetItems: { id: string }[];
  assumptions: AssumptionsInput | null;
  smsMessages: { status: string; direction: string; classification: string | null }[];
}

function computeSmsStatus(messages: ProjectForFeed["smsMessages"]): SmsFeedStatus {
  const inbound = messages.filter((m) => m.direction === "INBOUND");
  if (inbound.some((m) => m.classification === "NABIZI_PROHLIDKU")) return "PROHLIDKA_NAVRZENA";
  if (inbound.length > 0) return "MAKLER_ODPOVEDEL";
  if (messages.some((m) => m.direction === "OUTBOUND" && ["QUEUED", "SENT", "DELIVERED"].includes(m.status))) {
    return "SMS_ODESLANA";
  }
  if (messages.some((m) => m.direction === "OUTBOUND" && m.status === "DRAFT")) return "SMS_DRAFT";
  return "SMS_NEODESLANA";
}

export function buildDealFeedItem(project: ProjectForFeed): DealFeedItem {
  const fieldMeta: FieldMeta = project.fieldMeta ? JSON.parse(project.fieldMeta) : {};
  const comparablesCount = project.comparables.length;
  const comparableStats = computeComparableStats(project.comparables.map((c) => c.pricePerM2 ?? NaN));

  const a = project.assumptions;
  const purchasePrice = a?.purchasePriceUsed ?? project.askingPrice ?? null;

  let maxBuyPrice: number | null = null;
  let band: FlipBand | null = null;
  let expectedProfit: number | null = null;
  let roiPct: number | null = null;
  let marginPct: number | null = null;
  let bandThresholds: DealFeedItem["why"]["bands"] = null;
  let totalInvestment: number | null = null;
  let costs = { renovation: 0, furnishing: 0, legal: 0, financing: 0, other: 0, reserve: 0 };

  if (a && purchasePrice !== null) {
    const economics = computeEconomics(purchasePrice, a, project.areaM2);
    totalInvestment = economics.totalInvestment;
    costs = economics.costs;
    if (a.saleConservative) {
      const bands = computeBands(a);
      bandThresholds = bands;
      band = classifyPrice(purchasePrice, bands);
      maxBuyPrice = bands.goodThreshold;
      expectedProfit = economics.scenarios.conservative.grossProfit;
      roiPct = economics.scenarios.conservative.roiPct;
      marginPct = economics.scenarios.conservative.marginPct;
    }
  }

  const confidence = computeDataConfidence({
    fieldMeta,
    comparablesCount,
    hasRealBudgetItems: project.budgetItems.length > 0,
    renovationCostSet: Boolean(a?.renovationCost && a.renovationCost > 0),
    salePriceSet: Boolean(a?.saleBase)
  });

  return {
    id: project.id,
    title: project.title,
    municipality: project.municipality,
    district: project.district,
    disposition: project.disposition,
    areaM2: project.areaM2,
    askingPrice: project.askingPrice,
    pricePerM2: project.pricePerM2,
    photoUrl: project.photos[0]?.url ?? null,
    createdAt: project.createdAt.toISOString(),
    isDemo: project.isDemo,
    status: project.status,
    renovationEstimate: a?.renovationCost ?? null,
    maxBuyPrice,
    saleEstimate: a?.saleBase ?? null,
    expectedProfit,
    roiPct,
    band,
    dataConfidenceLevel: confidence.level,
    smsStatus: computeSmsStatus(project.smsMessages),
    why: {
      purchasePrice,
      totalInvestment,
      costs,
      saleConservative: a?.saleConservative ?? null,
      saleBase: a?.saleBase ?? null,
      saleOptimistic: a?.saleOptimistic ?? null,
      grossProfit: expectedProfit,
      roiPct,
      marginPct,
      bands: bandThresholds,
      comparablesCount,
      comparablesAvgPricePerM2: comparableStats.average,
      confidenceBreakdown: confidence.breakdown,
      sourceUrl: project.sourceUrl,
      portal: project.portal
    }
  };
}
