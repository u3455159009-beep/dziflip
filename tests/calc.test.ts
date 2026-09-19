import { describe, it, expect } from "vitest";
import {
  computeMaxBuyPrice,
  computeBands,
  classifyPrice,
  computeScenario,
  computeEconomics,
  computeSensitivityMatrix,
  DEFAULT_ASSUMPTIONS,
  type AssumptionsInput
} from "@/lib/calc";

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
    expect(maxBuy).not.toBeNull();
    // sale - fixed - minProfit = maxBuy  =>  verify by reconstructing gross profit
    const fixed = a.renovationCost! + a.furnishingCost! + a.legalCosts! + a.financingCost! + a.reserve!;
    const grossProfit = a.saleConservative! - (maxBuy! + fixed);
    expect(Math.round(grossProfit)).toBe(a.minProfit);
  });

  it("is the minimum of the profit/margin/ROI targets — the tightest constraint wins", () => {
    const loose = computeMaxBuyPrice(assumptions({ minMarginPct: 0, minRoiPct: 0 }));
    const tightMargin = computeMaxBuyPrice(assumptions({ minMarginPct: 0.3, minRoiPct: 0 }));
    expect(tightMargin).toBeLessThan(loose!);
  });

  it("returns null — never a nonsense number — when the conservative sale price is unknown (item 13)", () => {
    expect(computeMaxBuyPrice(assumptions({ saleConservative: null }))).toBeNull();
    expect(computeMaxBuyPrice(assumptions({ saleConservative: 0 }))).toBeNull();
  });
});

describe("classifyPrice / computeBands", () => {
  it("classifies a price at or below the BUY_NOW threshold as BUY_NOW", () => {
    const a = assumptions({});
    const bands = computeBands(a);
    expect(classifyPrice(bands.buyNowThreshold! - 1, bands)).toBe("BUY_NOW");
  });

  it("classifies a price well above the normal threshold as BAD", () => {
    const a = assumptions({});
    const bands = computeBands(a);
    expect(classifyPrice(bands.normalThreshold! * 2, bands)).toBe("BAD");
  });

  it("returns null bands and UNKNOWN classification when the sale price is unknown, never a fabricated band", () => {
    const a = assumptions({ saleConservative: null });
    const bands = computeBands(a);
    expect(bands.goodThreshold).toBeNull();
    expect(bands.buyNowThreshold).toBeNull();
    expect(bands.normalThreshold).toBeNull();
    expect(classifyPrice(5000000, bands)).toBe("UNKNOWN");
  });
});

describe("computeScenario — missing sale price must never look like a 0 Kč sale (item 13)", () => {
  it("returns all-null profit figures, not a phantom 0 Kč sale price, when salePrice is null", () => {
    const a = assumptions({});
    const scenario = computeScenario(7490000, null, a);
    expect(scenario.salePrice).toBeNull();
    expect(scenario.grossProfit).toBeNull();
    expect(scenario.netProfit).toBeNull();
    expect(scenario.marginPct).toBeNull();
    expect(scenario.roiPct).toBeNull();
  });

  it("treats a sale price of exactly 0 the same as unknown — 0 Kč is never a real price", () => {
    const a = assumptions({});
    const scenario = computeScenario(7490000, 0, a);
    expect(scenario.salePrice).toBeNull();
    expect(scenario.grossProfit).toBeNull();
  });

  it("computes real figures once a genuine sale price is known", () => {
    const a = assumptions({});
    const scenario = computeScenario(5000000, 6500000, a);
    expect(scenario.salePrice).toBe(6500000);
    expect(scenario.grossProfit).not.toBeNull();
    expect(scenario.roiPct).not.toBeNull();
  });
});

describe("computeEconomics — a project missing all sale-price data must never show -100% ROI or -7 490 000 Kč profit", () => {
  it("never fabricates a negative-100%-ROI phantom result for a freshly analyzed listing with no sale price yet", () => {
    const a: AssumptionsInput = { ...DEFAULT_ASSUMPTIONS, purchasePriceUsed: 7490000 };
    const economics = computeEconomics(7490000, a, 64.3);
    for (const scenario of Object.values(economics.scenarios)) {
      expect(scenario.salePrice).toBeNull();
      expect(scenario.grossProfit).toBeNull();
      expect(scenario.roiPct).toBeNull();
    }
  });
});

describe("computeSensitivityMatrix", () => {
  it("returns an empty matrix rather than a matrix built on a phantom 0 Kč base sale price", () => {
    const a = assumptions({ saleBase: null });
    expect(computeSensitivityMatrix(7490000, a)).toEqual([]);
  });
});
