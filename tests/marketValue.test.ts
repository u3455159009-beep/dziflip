import { describe, it, expect } from "vitest";
import { computeMarketValue, computeARV, computePricePerM2Stats, type MarketValueComparable } from "@/lib/marketValue";

const opts = { minCompCount: 3, minCompQuality: "MEDIUM" as const };

function mkComp(pricePerM2: number, overrides: Partial<MarketValueComparable> = {}): MarketValueComparable {
  return { pricePerM2, qualityTier: "HIGH", priceType: "ASKING", condition: "dobrý stav", ...overrides };
}

describe("computeMarketValue", () => {
  it("reports insufficient data rather than a number when there aren't enough usable comparables", () => {
    const result = computeMarketValue([mkComp(100000), mkComp(105000)], 70, opts);
    expect(result.insufficientData).toBe(true);
    expect(result.base.value).toBeNull();
    expect(result.explanation).toMatch(/NEDOSTATEK DAT/);
  });

  it("never fabricates a value when areaM2 is unknown", () => {
    const result = computeMarketValue([mkComp(100000), mkComp(105000), mkComp(98000)], null, opts);
    expect(result.insufficientData).toBe(true);
  });

  it("computes CONSERVATIVE/BASE/HIGH bands from a sufficient comparable sample", () => {
    const comps = [mkComp(95000), mkComp(100000), mkComp(105000), mkComp(102000)];
    const result = computeMarketValue(comps, 70, opts);
    expect(result.insufficientData).toBe(false);
    expect(result.conservative.value).not.toBeNull();
    expect(result.base.value).not.toBeNull();
    expect(result.high.value).not.toBeNull();
    // conservative <= base <= high
    expect(result.conservative.value!).toBeLessThanOrEqual(result.base.value!);
    expect(result.base.value!).toBeLessThanOrEqual(result.high.value!);
  });

  it("labels asking-price comparables distinctly from realized sale prices", () => {
    const comps = [
      mkComp(100000, { priceType: "ASKING" }),
      mkComp(102000, { priceType: "ASKING" }),
      mkComp(98000, { priceType: "ASKING" })
    ];
    const result = computeMarketValue(comps, 70, opts);
    expect(result.askingCount).toBe(3);
    expect(result.realizedCount).toBe(0);
    expect(result.base.explanation).toMatch(/NABÍDKOVÉ/);
  });

  it("prefers HIGH quality tier comparables over MEDIUM when there are enough of them", () => {
    const comps = [
      mkComp(200000, { qualityTier: "HIGH" }),
      mkComp(205000, { qualityTier: "HIGH" }),
      mkComp(210000, { qualityTier: "HIGH" }),
      mkComp(50000, { qualityTier: "MEDIUM" }) // outlier that should be excluded from the HIGH-only basis
    ];
    const result = computeMarketValue(comps, 70, opts);
    expect(result.usedComparableCount).toBe(3);
    expect(result.highQualityCount).toBe(3);
  });

  it("filters out comparables below the minimum quality tier", () => {
    const comps = [mkComp(100000, { qualityTier: "LOW" }), mkComp(105000, { qualityTier: "LOW" }), mkComp(98000, { qualityTier: "LOW" })];
    const result = computeMarketValue(comps, 70, opts);
    expect(result.insufficientData).toBe(true);
  });
});

describe("computeARV", () => {
  it("only uses renovated-condition comparables, separate from current-condition market value", () => {
    const comps = [
      mkComp(100000, { condition: "původní stav" }),
      mkComp(102000, { condition: "původní stav" }),
      mkComp(150000, { condition: "po rekonstrukci" }),
      mkComp(155000, { condition: "po kompletní rekonstrukci" }),
      mkComp(148000, { condition: "novostavba" })
    ];
    const arv = computeARV(comps, 70, opts);
    expect(arv.insufficientData).toBe(false);
    expect(arv.usedComparableCount).toBe(3);
    // ARV basis should be meaningfully higher than the un-renovated comps' price level
    expect(arv.base.value!).toBeGreaterThan(140000 * 0.9);
  });

  it("reports insufficient data when there are no renovated comparables at all", () => {
    const comps = [mkComp(100000, { condition: "k rekonstrukci" }), mkComp(102000, { condition: "původní stav" }), mkComp(98000, { condition: "původní stav" })];
    const arv = computeARV(comps, 70, opts);
    expect(arv.insufficientData).toBe(true);
  });

  it("never reports HIGH confidence even with a large renovated sample — ARV is inherently less certain than current value", () => {
    const comps = Array.from({ length: 8 }, () => mkComp(150000, { condition: "po rekonstrukci" }));
    const arv = computeARV(comps, 70, opts);
    expect(arv.confidence).not.toBe("HIGH");
  });
});

describe("computePricePerM2Stats", () => {
  it("returns null stats for an empty input", () => {
    const stats = computePricePerM2Stats([]);
    expect(stats.count).toBe(0);
    expect(stats.average).toBeNull();
  });

  it("computes median and weighted median correctly", () => {
    const stats = computePricePerM2Stats([mkComp(100), mkComp(200), mkComp(300)]);
    expect(stats.median).toBe(200);
    expect(stats.count).toBe(3);
  });
});
