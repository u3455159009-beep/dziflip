// Shared "what does this listing's current numbers actually mean" calc —
// used by every Deal Radar alert path (new match, price drop, listing
// removed/relisted). Pure, synchronous, no I/O: callers pass in whatever
// Assumptions/Comparable rows they already have on hand. Returns null only
// when there's genuinely no sale-price basis to reason about (never a
// guessed verdict); every numeric field inside is independently null-safe
// so the caller can render N/A for whichever ones a thin data set couldn't
// support, without losing the ones it could.
import { computeBands, computeEconomics, classifyPrice, type AssumptionsInput, type FlipBand } from "./calc";
import { computeARV, computeMarketValue, type MarketValueComparable } from "./marketValue";
import { computeDataConfidence } from "./confidence";
import { isDataStale } from "./staleData";
import { computeDziFlipScore } from "./dziflipScore";
import type { FieldMeta, CompQualityTier, DataConfidenceLevel } from "./types";

export interface DealMetricsComparable {
  pricePerM2: number | null;
  qualityTier: string | null;
  priceType: string;
  condition: string | null;
}

export interface DealMetricsInput {
  askingPrice: number;
  areaM2: number | null;
  assumptions: AssumptionsInput & { renovationCost: number | null };
  comparables: DealMetricsComparable[];
  fieldMeta: FieldMeta;
  lastVerifiedAt: Date | null | undefined;
  settings: { minCompCount: number; minCompQuality: string; staleDataThresholdDays: number };
}

export interface DealMetrics {
  band: FlipBand;
  bandThreshold: number | null;
  profit: number | null;
  roi: number | null;
  marginPct: number | null;
  marketValueEstimate: number | null;
  arvEstimate: number | null;
  dziflipScore: number | null;
  confidenceLevel: DataConfidenceLevel;
}

export function computeDealMetrics(input: DealMetricsInput): DealMetrics | null {
  if (input.assumptions.saleConservative == null) return null;

  const bands = computeBands(input.assumptions);
  const band = classifyPrice(input.askingPrice, bands);
  const economics = computeEconomics(input.askingPrice, input.assumptions, input.areaM2);
  const profit = economics.scenarios.conservative.grossProfit;
  const roi = economics.scenarios.conservative.roiPct;
  const marginPct = economics.scenarios.conservative.marginPct;

  const marketComps: MarketValueComparable[] = input.comparables.map((c) => ({
    pricePerM2: c.pricePerM2,
    qualityTier: (c.qualityTier as CompQualityTier | null) ?? null,
    priceType: c.priceType,
    condition: c.condition
  }));
  const valueOpts = { minCompCount: input.settings.minCompCount, minCompQuality: input.settings.minCompQuality as CompQualityTier };
  const marketValue = computeMarketValue(marketComps, input.areaM2, valueOpts);
  const arv = computeARV(marketComps, input.areaM2, valueOpts);

  const confidence = computeDataConfidence({
    fieldMeta: input.fieldMeta,
    comparablesCount: input.comparables.length,
    hasRealBudgetItems: false,
    renovationCostSet: (input.assumptions.renovationCost ?? 0) > 0,
    salePriceSet: true,
    isStale: isDataStale(input.lastVerifiedAt, input.settings.staleDataThresholdDays)
  });

  const dziflipScore = computeDziFlipScore({
    band,
    roiPct: roi,
    marginPct,
    dataConfidenceLevel: confidence.level,
    comparablesCount: input.comparables.length
  });

  return {
    band,
    bandThreshold: bands.goodThreshold,
    profit,
    roi,
    marginPct,
    marketValueEstimate: marketValue.insufficientData ? null : marketValue.base.value,
    arvEstimate: arv.insufficientData ? null : arv.base.value,
    dziflipScore,
    confidenceLevel: confidence.level
  };
}
