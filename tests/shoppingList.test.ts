import { describe, it, expect } from "vitest";
import { computeShoppingListSummary, type ShoppingRequirementInput } from "@/lib/shoppingList";

function req(overrides: Partial<ShoppingRequirementInput>): ShoppingRequirementInput {
  return {
    status: "NEEDED",
    shoppingCategory: "OSTATNI",
    budgetMax: null,
    quantity: 1,
    quantityNeeded: null,
    reservePct: 0.1,
    selectedProduct: null,
    ...overrides
  };
}

describe("computeShoppingListSummary", () => {
  it("buckets totals correctly: material/nabytek/spotrebice/ostatni and sums to celkem", () => {
    const summary = computeShoppingListSummary([
      req({ shoppingCategory: "STAVEBNI_MATERIAL", selectedProduct: { unitPrice: 100, price: null, packSize: null }, quantity: 10 }),
      req({ shoppingCategory: "NABYTEK", selectedProduct: { unitPrice: null, price: 5000, packSize: null } }),
      req({ shoppingCategory: "SPOTREBICE", selectedProduct: { unitPrice: null, price: 8000, packSize: null } }),
      req({ shoppingCategory: "DEKORACE", selectedProduct: { unitPrice: null, price: 500, packSize: null } })
    ]);
    expect(summary.material).toBe(1000); // 10 * 100 (no reserve — quantityNeeded is null)
    expect(summary.nabytek).toBe(5000);
    expect(summary.spotrebice).toBe(8000);
    expect(summary.ostatni).toBe(500);
    expect(summary.celkem).toBe(1000 + 5000 + 8000 + 500);
  });

  it("counts requirements without a selected product toward status counts but not toward celkem", () => {
    const summary = computeShoppingListSummary([req({ status: "NEEDED" }), req({ status: "SELECTED", selectedProduct: { unitPrice: 100, price: null, packSize: null }, quantity: 2 })]);
    expect(summary.totalRequirements).toBe(2);
    expect(summary.statusCounts.NEEDED).toBe(1);
    expect(summary.statusCounts.SELECTED).toBe(1);
    expect(summary.celkem).toBe(200);
  });

  it("computes the reserve-cost line as the price difference caused by the reserve/pack buffer", () => {
    const summary = computeShoppingListSummary([
      req({
        shoppingCategory: "STAVEBNI_MATERIAL",
        quantityNeeded: 64,
        reservePct: 0.1,
        selectedProduct: { unitPrice: 449, price: null, packSize: 2.2 }
      })
    ]);
    // base cost (64 * 449) vs actual total (32 packs * 2.2 * 449)
    const baseCost = 64 * 449;
    expect(summary.rezerva).toBeGreaterThan(0);
    expect(summary.celkem - summary.rezerva).toBeCloseTo(baseCost, 0);
  });

  it("only sums plannedBudget from requirements that actually stated a budgetMax — never invents one", () => {
    const summary = computeShoppingListSummary([
      req({ budgetMax: 500, quantity: 10 }),
      req({ budgetMax: null })
    ]);
    expect(summary.plannedBudgetKnownCount).toBe(1);
    expect(summary.plannedBudget).toBe(5000);
  });
});
