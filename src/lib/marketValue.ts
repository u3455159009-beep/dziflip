// Market Value Engine V2 — turns a set of scored comparables into an
// explainable Kč/m² distribution and CONSERVATIVE/BASE/HIGH value bands.
// Every number here is derived from real comparable data; when there isn't
// enough of it, the engine reports INSUFFICIENT rather than guessing.
// Asking-price comparables are never silently treated as realized sales —
// the caller-facing explanation always states how many of each price type
// were used.
import { COMP_QUALITY_RANK, conditionOrdinal, meetsMinQuality } from "./comparableEngine";
import type { CompQualityTier } from "./types";

export interface MarketValueComparable {
  pricePerM2: number | null;
  qualityTier: CompQualityTier | null;
  priceType: string; // ASKING | ESTIMATE | REALIZED
  condition: string | null;
}

export interface PricePerM2Stats {
  average: number | null;
  median: number | null;
  weightedMedian: number | null;
  min: number | null;
  max: number | null;
  p25: number | null;
  p75: number | null;
  count: number;
}

const EMPTY_STATS: PricePerM2Stats = {
  average: null,
  median: null,
  weightedMedian: null,
  min: null,
  max: null,
  p25: null,
  p75: null,
  count: 0
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function weightedMedian(values: Array<{ value: number; weight: number }>): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return null;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= totalWeight / 2) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

export function computePricePerM2Stats(comps: MarketValueComparable[]): PricePerM2Stats {
  const valid = comps.filter((c): c is MarketValueComparable & { pricePerM2: number } => typeof c.pricePerM2 === "number" && c.pricePerM2 > 0);
  if (valid.length === 0) return { ...EMPTY_STATS };

  const values = valid.map((c) => c.pricePerM2);
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const weighted = weightedMedian(
    valid.map((c) => ({ value: c.pricePerM2, weight: c.qualityTier ? COMP_QUALITY_RANK[c.qualityTier] : 1 }))
  );

  return {
    average: sum / sorted.length,
    median,
    weightedMedian: weighted,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    count: sorted.length
  };
}

export interface MarketValueOptions {
  minCompCount: number;
  minCompQuality: CompQualityTier;
}

export interface ValueBand {
  value: number | null;
  explanation: string;
}

export type MarketValueConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface MarketValueEstimate {
  areaM2: number | null;
  stats: PricePerM2Stats;
  usedComparableCount: number;
  highQualityCount: number;
  askingCount: number;
  realizedCount: number;
  conservative: ValueBand;
  base: ValueBand;
  high: ValueBand;
  confidence: MarketValueConfidence;
  insufficientData: boolean;
  explanation: string;
}

function insufficientEstimate(areaM2: number | null, usableCount: number, required: number): MarketValueEstimate {
  const msg = `NEDOSTATEK DAT PRO SPOLEHLIVÝ ODHAD — nalezeno pouze ${usableCount} srovnatelných nabídek dostatečné kvality, potřeba alespoň ${required}.`;
  return {
    areaM2,
    stats: { ...EMPTY_STATS },
    usedComparableCount: usableCount,
    highQualityCount: 0,
    askingCount: 0,
    realizedCount: 0,
    conservative: { value: null, explanation: msg },
    base: { value: null, explanation: msg },
    high: { value: null, explanation: msg },
    confidence: "LOW",
    insufficientData: true,
    explanation: msg
  };
}

/**
 * Computes CONSERVATIVE/BASE/HIGH Kč value bands from a set of already-scored
 * comparables. Prefers HIGH-quality-tier comparables when there are enough of
 * them; otherwise falls back to all comparables meeting `minCompQuality`.
 * Returns an insufficient-data result (all value bands null) when there
 * aren't enough usable comparables — never fabricates a number.
 */
export function computeMarketValue(
  comparables: MarketValueComparable[],
  areaM2: number | null,
  opts: MarketValueOptions
): MarketValueEstimate {
  const usable = comparables.filter((c) => c.qualityTier && meetsMinQuality(c.qualityTier, opts.minCompQuality));

  if (usable.length < opts.minCompCount || !areaM2 || areaM2 <= 0) {
    return insufficientEstimate(areaM2, usable.length, opts.minCompCount);
  }

  const highTier = usable.filter((c) => c.qualityTier === "HIGH");
  const statsSource = highTier.length >= opts.minCompCount ? highTier : usable;
  const stats = computePricePerM2Stats(statsSource);

  if (!stats.weightedMedian) {
    return insufficientEstimate(areaM2, usable.length, opts.minCompCount);
  }

  const askingCount = statsSource.filter((c) => c.priceType === "ASKING").length;
  const realizedCount = statsSource.filter((c) => c.priceType === "REALIZED").length;
  const priceTypeNote =
    realizedCount > 0
      ? `z toho ${realizedCount} realizovaných cen a ${askingCount} nabídkových cen`
      : `všechny hodnoty jsou NABÍDKOVÉ ceny, nikoli realizované prodejní ceny`;

  const base = Math.round(stats.weightedMedian * areaM2);
  const conservativeValue = stats.p25 ? Math.round(stats.p25 * areaM2) : Math.round(base * 0.95);
  const highValue = stats.p75 ? Math.round(stats.p75 * areaM2) : Math.round(base * 1.08);

  const usedHigh = highTier.length >= opts.minCompCount;
  const confidence: MarketValueConfidence = usedHigh && statsSource.length >= opts.minCompCount * 2 ? "HIGH" : usedHigh || statsSource.length >= opts.minCompCount ? "MEDIUM" : "LOW";

  const baseExplanation = `Base Value ${base.toLocaleString("cs-CZ")} Kč vychází z ${statsSource.length} srovnatelných nabídek (${priceTypeNote}) s váženým mediánem ${Math.round(stats.weightedMedian).toLocaleString("cs-CZ")} Kč/m².`;

  return {
    areaM2,
    stats,
    usedComparableCount: statsSource.length,
    highQualityCount: highTier.length,
    askingCount,
    realizedCount,
    conservative: {
      value: conservativeValue,
      explanation: `Conservative Value ${conservativeValue.toLocaleString("cs-CZ")} Kč odpovídá 25. percentilu (${stats.p25 ? Math.round(stats.p25).toLocaleString("cs-CZ") : "—"} Kč/m²) srovnatelných nabídek.`
    },
    base: { value: base, explanation: baseExplanation },
    high: {
      value: highValue,
      explanation: `High Value ${highValue.toLocaleString("cs-CZ")} Kč odpovídá 75. percentilu (${stats.p75 ? Math.round(stats.p75).toLocaleString("cs-CZ") : "—"} Kč/m²) srovnatelných nabídek.`
    },
    confidence,
    insufficientData: false,
    explanation: baseExplanation
  };
}

const RENOVATED_CONDITION_MIN_ORDINAL = 7; // "po rekonstrukci" or better

/**
 * Filters a comparable set down to those in renovated (or better) condition,
 * for use as the basis of an After-Renovation Value estimate. Comparables
 * with unknown condition are excluded rather than assumed renovated.
 */
export function filterRenovatedComparables<T extends { condition: string | null }>(comparables: T[]): T[] {
  return comparables.filter((c) => {
    const ordinal = conditionOrdinal(c.condition);
    return ordinal !== null && ordinal >= RENOVATED_CONDITION_MIN_ORDINAL;
  });
}

/**
 * After-Renovation Value: market value computed only from renovated-condition
 * comparables. Kept as a distinct call (not just a filtered computeMarketValue)
 * so ARV is always visibly separate from the current-condition market value
 * shown alongside it, and always LOW confidence when the renovated-comp
 * sample is thin — even if the wider comparable set is large.
 */
export function computeARV(
  comparables: MarketValueComparable[],
  areaM2: number | null,
  opts: MarketValueOptions
): MarketValueEstimate {
  const renovated = filterRenovatedComparables(comparables);
  const result = computeMarketValue(renovated, areaM2, opts);
  if (result.insufficientData) {
    const msg = `NEDOSTATEK DAT PRO SPOLEHLIVÝ ODHAD ARV — nalezeno pouze ${renovated.length} srovnání v renovovaném stavu, potřeba alespoň ${opts.minCompCount}.`;
    return { ...result, explanation: msg, conservative: { ...result.conservative, explanation: msg }, base: { ...result.base, explanation: msg }, high: { ...result.high, explanation: msg } };
  }
  // ARV never claims HIGH confidence purely from statsSource size the way
  // current-value estimates can — after-renovation comparables are always
  // scarcer and the renovation itself is not yet verified on the subject.
  const confidence: MarketValueConfidence = result.confidence === "HIGH" ? "MEDIUM" : result.confidence;
  return { ...result, confidence };
}
