// Pure aggregation over ProductRequirement + selected Product data — used
// by both the project-detail Shopping List section and the /shopping
// overview page. Every total here is derived strictly from real selected
// product prices (or a stated planned budgetMax); nothing is estimated.
import { computeShoppingLine } from "./productQuantity";
import type { ProductRequirementStatus, ShoppingCategory } from "./types";

export interface ShoppingRequirementInput {
  status: ProductRequirementStatus;
  shoppingCategory: ShoppingCategory;
  budgetMax: number | null;
  quantity: number;
  quantityNeeded: number | null;
  reservePct: number;
  selectedProduct: { unitPrice: number | null; price: number | null; packSize: number | null } | null;
}

export interface ShoppingListSummary {
  totalRequirements: number;
  statusCounts: Record<ProductRequirementStatus, number>;
  categoryTotals: Record<ShoppingCategory, number>;
  material: number;
  nabytek: number;
  spotrebice: number;
  ostatni: number;
  rezerva: number;
  celkem: number;
  plannedBudget: number;
  plannedBudgetKnownCount: number;
}

const MATERIAL_CATEGORIES: ShoppingCategory[] = ["STAVEBNI_MATERIAL", "KOUPELNA", "KUCHYN", "OSVETLENI"];

export function computeShoppingListSummary(requirements: ShoppingRequirementInput[]): ShoppingListSummary {
  const statusCounts: Record<string, number> = {};
  const categoryTotals: Record<string, number> = {};
  let material = 0;
  let nabytek = 0;
  let spotrebice = 0;
  let ostatni = 0;
  let rezerva = 0;
  let plannedBudget = 0;
  let plannedBudgetKnownCount = 0;

  for (const req of requirements) {
    statusCounts[req.status] = (statusCounts[req.status] ?? 0) + 1;

    if (req.budgetMax != null) {
      const effectiveQty = req.quantityNeeded ?? req.quantity;
      plannedBudget += req.budgetMax * effectiveQty;
      plannedBudgetKnownCount++;
    }

    if (!req.selectedProduct) continue;

    const line = computeShoppingLine({
      quantityNeeded: req.quantityNeeded,
      fallbackQuantity: req.quantity,
      reservePct: req.reservePct,
      packSize: req.selectedProduct.packSize,
      unitPrice: req.selectedProduct.unitPrice ?? req.selectedProduct.price
    });
    const total = line.totalPrice ?? 0;
    const unitPrice = req.selectedProduct.unitPrice ?? req.selectedProduct.price ?? 0;
    const baseCost = line.baseNeeded * unitPrice;
    const reserveCost = Math.max(0, total - baseCost);

    categoryTotals[req.shoppingCategory] = (categoryTotals[req.shoppingCategory] ?? 0) + total;
    rezerva += reserveCost;

    if (MATERIAL_CATEGORIES.includes(req.shoppingCategory)) material += total;
    else if (req.shoppingCategory === "NABYTEK") nabytek += total;
    else if (req.shoppingCategory === "SPOTREBICE") spotrebice += total;
    else ostatni += total; // DEKORACE, OSTATNI
  }

  const celkem = material + nabytek + spotrebice + ostatni;

  return {
    totalRequirements: requirements.length,
    statusCounts: statusCounts as Record<ProductRequirementStatus, number>,
    categoryTotals: categoryTotals as Record<ShoppingCategory, number>,
    material,
    nabytek,
    spotrebice,
    ostatni,
    rezerva,
    celkem,
    plannedBudget,
    plannedBudgetKnownCount
  };
}
