import { describe, it, expect } from "vitest";
import { computeMaxBuyPrice, computeBands, classifyPrice, DEFAULT_ASSUMPTIONS, type AssumptionsInput } from "@/lib/calc";

function assumptions(overrides: Partial<AssumptionsInput>): AssumptionsInput {
  return {
    ...DEFAULT_ASSUMPTIONS,
    saleConservative: 6000000,
    renovationCost: 500000,
    furnishingCost: 100000,
    legalCosts: 50000,
    financingCost: 50000,
    otherCosts: 0,
    reserve: 100000,
    minProfit: 300000,
    minMarginPct: 0,
    minRoiPct: 0,
    ...overrides
  };
}

describe("computeMaxBuyPrice", () => {
  it("computes the purchase price where conservative profit exactly meets the minimum profit target", () => {
    const a = assumptions({});
    const maxBuy = computeMaxBuyPrice(a);
    // sale - fixed - minProfit = maxBuy  =>  verify by reconstructing gross profit
    const fixed = a.renovationCost! + a.furnishingCost! + a.legalCosts! + a.financingCost! + a.reserve!;
    const grossProfit = a.saleConservative! - (maxBuy + fixed);
    expect(Math.round(grossProfit)).toBe(a.minProfit);
  });

  it("is the minimum of the profit/margin/ROI targets — the tightest constraint wins", () => {
    const loose = computeMaxBuyPrice(assumptions({ minMarginPct: 0, minRoiPct: 0 }));
    const tightMargin = computeMaxBuyPrice(assumptions({ minMarginPct: 0.3, minRoiPct: 0 }));
    expect(tightMargin).toBeLessThan(loose);
  });
});

describe("classifyPrice / computeBands", () => {
  it("classifies a price at or below the BUY_NOW threshold as BUY_NOW", () => {
    const a = assumptions({});
    const bands = computeBands(a);
    expect(classifyPrice(bands.buyNowThreshold - 1, bands)).toBe("BUY_NOW");
  });

  it("classifies a price well above the normal threshold as BAD", () => {
    const a = assumptions({});
    const bands = computeBands(a);
    expect(classifyPrice(bands.normalThreshold * 2, bands)).toBe("BAD");
  });
});
