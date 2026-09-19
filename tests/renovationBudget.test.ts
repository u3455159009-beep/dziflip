import { describe, it, expect } from "vitest";
import { computeBudgetRange, computeRenovationDataStatus } from "@/lib/renovationBudget";

describe("computeBudgetRange", () => {
  it("returns null bands when no item has a computed total", () => {
    const result = computeBudgetRange([{ name: "Kuchyň", total: null, priceSource: "ESTIMATE" }]);
    expect(result.low).toBeNull();
    expect(result.expected).toBeNull();
    expect(result.knownItemCount).toBe(0);
  });

  it("never folds an unknown-quantity item's cost into the numeric range — it's listed as an uncertainty instead", () => {
    const items = [
      { name: "Podlahy", total: 50000, priceSource: "EXACT" },
      { name: "Kuchyňská linka (rozměry neznámé)", total: null, priceSource: "ESTIMATE" }
    ];
    const result = computeBudgetRange(items);
    expect(result.expected).toBe(50000);
    expect(result.unknownScopeItems).toContain("Kuchyňská linka (rozměry neznámé)");
    expect(result.explanation).toMatch(/Kuchyňská linka/);
  });

  it("computes LOW/EXPECTED/HIGH as a fixed band around the known total, low <= expected <= high", () => {
    const items = [
      { name: "A", total: 100000, priceSource: "EXACT" },
      { name: "B", total: 50000, priceSource: "EXACT" }
    ];
    const result = computeBudgetRange(items);
    expect(result.expected).toBe(150000);
    expect(result.low!).toBeLessThan(result.expected!);
    expect(result.high!).toBeGreaterThan(result.expected!);
  });

  it("flags positions that are only ESTIMATE-priced as a named uncertainty", () => {
    const items = [{ name: "Elektroinstalace", total: 80000, priceSource: "ESTIMATE" }];
    const result = computeBudgetRange(items);
    expect(result.explanation).toMatch(/ODHAD/);
  });
});

describe("computeRenovationDataStatus (item 10) — 0 Kč must never be presented as a real renovation cost", () => {
  it("is UNKNOWN when there are no budget items and no per-m² assumption", () => {
    const status = computeRenovationDataStatus({ knownBudgetItemCount: 0, renovationCostAssumption: null });
    expect(status).toBe("UNKNOWN");
  });

  it("is UNKNOWN when the renovation cost assumption is exactly 0 Kč — that's absence of data, not a real 0 Kč renovation", () => {
    const status = computeRenovationDataStatus({ knownBudgetItemCount: 0, renovationCostAssumption: 0 });
    expect(status).toBe("UNKNOWN");
  });

  it("is ESTIMATED when a positive per-m² cost was typed in but no itemized budget exists yet", () => {
    const status = computeRenovationDataStatus({ knownBudgetItemCount: 0, renovationCostAssumption: 350000 });
    expect(status).toBe("ESTIMATED");
  });

  it("is KNOWN once at least one real itemized budget line exists, regardless of the rough assumption", () => {
    const status = computeRenovationDataStatus({ knownBudgetItemCount: 3, renovationCostAssumption: 350000 });
    expect(status).toBe("KNOWN");
  });
});
