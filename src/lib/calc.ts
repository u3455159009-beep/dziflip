// Pure calculation engine for the flip economics. No side effects, no I/O —
// every number here is derived mathematically from user-supplied assumptions,
// never guessed or "felt out" by AI.

export interface AssumptionsInput {
  purchasePriceUsed: number | null;
  saleConservative: number | null;
  saleBase: number | null;
  saleOptimistic: number | null;
  renovationCost: number | null;
  furnishingCost: number | null;
  legalCosts: number | null;
  financingCost: number | null;
  otherCosts: number | null;
  reserve: number | null;
  minProfit: number | null;
  minMarginPct: number | null; // 0-1, fraction of sale price
  minRoiPct: number | null; // 0-1, fraction of total investment
  incomeTaxPct: number | null; // 0-1
  bandWidthPct: number | null; // 0-1, width of NORMAL/BUY-NOW bands around good threshold
}

export const DEFAULT_ASSUMPTIONS: AssumptionsInput = {
  purchasePriceUsed: null,
  saleConservative: null,
  saleBase: null,
  saleOptimistic: null,
  renovationCost: 0,
  furnishingCost: 0,
  legalCosts: 0,
  financingCost: 0,
  otherCosts: 0,
  reserve: 0,
  minProfit: 0,
  minMarginPct: 0,
  minRoiPct: 0,
  incomeTaxPct: 0,
  bandWidthPct: 0.08
};

function n(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function fixedCostsExclPurchase(a: AssumptionsInput): number {
  return (
    n(a.renovationCost) +
    n(a.furnishingCost) +
    n(a.legalCosts) +
    n(a.financingCost) +
    n(a.otherCosts) +
    n(a.reserve)
  );
}

export interface ScenarioResult {
  salePrice: number;
  totalInvestment: number;
  grossProfit: number;
  netProfit: number;
  marginPct: number; // grossProfit / salePrice
  roiPct: number; // grossProfit / totalInvestment
}

export function computeScenario(
  purchasePrice: number,
  salePrice: number,
  a: AssumptionsInput
): ScenarioResult {
  const totalInvestment = purchasePrice + fixedCostsExclPurchase(a);
  const grossProfit = salePrice - totalInvestment;
  const netProfit = grossProfit > 0 ? grossProfit * (1 - n(a.incomeTaxPct)) : grossProfit;
  const marginPct = salePrice > 0 ? grossProfit / salePrice : 0;
  const roiPct = totalInvestment > 0 ? grossProfit / totalInvestment : 0;
  return { salePrice, totalInvestment, grossProfit, netProfit, marginPct, roiPct };
}

export interface Economics {
  purchasePrice: number;
  pricePerM2: number | null;
  costs: {
    renovation: number;
    furnishing: number;
    legal: number;
    financing: number;
    other: number;
    reserve: number;
  };
  totalInvestment: number;
  scenarios: {
    conservative: ScenarioResult;
    base: ScenarioResult;
    optimistic: ScenarioResult;
  };
}

export function computeEconomics(
  purchasePrice: number,
  a: AssumptionsInput,
  areaM2: number | null
): Economics {
  const totalInvestment = purchasePrice + fixedCostsExclPurchase(a);
  return {
    purchasePrice,
    pricePerM2: areaM2 && areaM2 > 0 ? purchasePrice / areaM2 : null,
    costs: {
      renovation: n(a.renovationCost),
      furnishing: n(a.furnishingCost),
      legal: n(a.legalCosts),
      financing: n(a.financingCost),
      other: n(a.otherCosts),
      reserve: n(a.reserve)
    },
    totalInvestment,
    scenarios: {
      conservative: computeScenario(purchasePrice, n(a.saleConservative), a),
      base: computeScenario(purchasePrice, n(a.saleBase), a),
      optimistic: computeScenario(purchasePrice, n(a.saleOptimistic), a)
    }
  };
}

/**
 * Maximum purchase price at which, using the CONSERVATIVE sale price, all
 * three minimum targets (absolute profit, margin, ROI) are simultaneously
 * satisfied. This is the mathematical "good deal" threshold — the boundary
 * between DOBRÁ and NORMÁLNÍ bands, and the basis for MAX BUY PRICE.
 */
export function computeMaxBuyPrice(a: AssumptionsInput): number {
  const sale = n(a.saleConservative);
  const fixed = fixedCostsExclPurchase(a);
  const minProfit = n(a.minProfit);
  const minMargin = n(a.minMarginPct);
  const minRoi = n(a.minRoiPct);

  // profit target: sale - (P + fixed) >= minProfit  =>  P <= sale - fixed - minProfit
  const pProfit = sale - fixed - minProfit;

  // margin target: sale - (P + fixed) >= minMargin * sale  =>  P <= sale*(1-minMargin) - fixed
  const pMargin = sale * (1 - minMargin) - fixed;

  // roi target: sale - (P + fixed) >= minRoi * (P + fixed)
  //   sale - fixed >= (P + fixed)*(1+minRoi) - fixed ... solve for P:
  //   sale - fixed*(1+minRoi) >= P*(1+minRoi)
  //   P <= (sale - fixed*(1+minRoi)) / (1+minRoi)
  const pRoi = (sale - fixed * (1 + minRoi)) / (1 + minRoi);

  return Math.min(pProfit, pMargin, pRoi);
}

export type FlipBand = "BAD" | "NORMAL" | "GOOD" | "BUY_NOW";

export const FLIP_BAND_LABELS: Record<FlipBand, string> = {
  BAD: "ŠPATNÁ CENA",
  NORMAL: "NORMÁLNÍ CENA",
  GOOD: "DOBRÁ CENA",
  BUY_NOW: "KUPUJ HNED"
};

export const FLIP_BAND_ICONS: Record<FlipBand, string> = {
  BAD: "🔴",
  NORMAL: "🟠",
  GOOD: "🟢",
  BUY_NOW: "⚡"
};

export interface FlipBands {
  goodThreshold: number; // upper bound of GOOD / lower bound of NORMAL
  buyNowThreshold: number; // upper bound of BUY_NOW / lower bound of GOOD
  normalThreshold: number; // upper bound of NORMAL / lower bound of BAD
}

export function computeBands(a: AssumptionsInput): FlipBands {
  const goodThreshold = computeMaxBuyPrice(a);
  const width = n(a.bandWidthPct) || 0.08;
  return {
    goodThreshold,
    buyNowThreshold: goodThreshold * (1 - width),
    normalThreshold: goodThreshold * (1 + width)
  };
}

export function classifyPrice(price: number, bands: FlipBands): FlipBand {
  if (price <= bands.buyNowThreshold) return "BUY_NOW";
  if (price <= bands.goodThreshold) return "GOOD";
  if (price <= bands.normalThreshold) return "NORMAL";
  return "BAD";
}

// --- Sensitivity matrix ---

export const SALE_PRICE_DELTAS = [-0.1, -0.05, 0, 0.05, 0.1];
export const RENOVATION_DELTAS = [-0.1, 0, 0.1, 0.2, 0.3];

export interface SensitivityCell {
  saleDeltaPct: number;
  renovationDeltaPct: number;
  salePrice: number;
  grossProfit: number;
  marginPct: number;
  roiPct: number;
}

export function computeSensitivityMatrix(
  purchasePrice: number,
  a: AssumptionsInput
): SensitivityCell[][] {
  const baseSale = n(a.saleBase);
  const baseRenovation = n(a.renovationCost);
  const otherFixed =
    n(a.furnishingCost) + n(a.legalCosts) + n(a.financingCost) + n(a.otherCosts) + n(a.reserve);

  return RENOVATION_DELTAS.map((rDelta) => {
    const renovation = baseRenovation * (1 + rDelta);
    return SALE_PRICE_DELTAS.map((sDelta) => {
      const salePrice = baseSale * (1 + sDelta);
      const totalInvestment = purchasePrice + renovation + otherFixed;
      const grossProfit = salePrice - totalInvestment;
      return {
        saleDeltaPct: sDelta,
        renovationDeltaPct: rDelta,
        salePrice,
        grossProfit,
        marginPct: salePrice > 0 ? grossProfit / salePrice : 0,
        roiPct: totalInvestment > 0 ? grossProfit / totalInvestment : 0
      };
    });
  });
}

// --- Comparables statistics ---

export interface ComparableStat {
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export function computeComparableStats(pricesPerM2: number[]): ComparableStat {
  const valid = pricesPerM2.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return { average: null, median: null, min: null, max: null, count: 0 };
  const sorted = [...valid].sort((x, y) => x - y);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    average: sum / sorted.length,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: sorted.length
  };
}
