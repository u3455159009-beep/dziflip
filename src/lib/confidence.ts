// Deterministic, rule-based data-confidence scoring. The level is derived
// purely from what data is actually on hand — never a model's subjective
// read of "how good this deal feels." Same inputs always produce the same
// level, and every input that fed the score is shown in the breakdown so
// it can be checked by hand.
import type { Confidence, DataConfidenceLevel, FieldMeta } from "./types";

export interface ConfidenceBreakdownItem {
  label: string;
  value: string;
  ok: boolean;
}

export interface DataConfidenceResult {
  level: DataConfidenceLevel;
  breakdown: ConfidenceBreakdownItem[];
}

function fieldLabel(c: Confidence | undefined): string {
  if (c === "VERIFIED") return "OVĚŘENO";
  if (c === "ESTIMATED") return "ODHADNUTO";
  return "NEZNÁMÉ";
}

export interface ConfidenceInput {
  fieldMeta: FieldMeta;
  comparablesCount: number;
  hasRealBudgetItems: boolean; // at least one BudgetItem entered manually
  renovationCostSet: boolean; // assumptions.renovationCost is a non-zero number
  salePriceSet: boolean; // assumptions.saleBase is set
}

export function computeDataConfidence(input: ConfidenceInput): DataConfidenceResult {
  const priceMeta = input.fieldMeta.askingPrice;
  const areaMeta = input.fieldMeta.areaM2;

  const priceOk = priceMeta === "VERIFIED";
  const areaOk = areaMeta === "VERIFIED";
  const comparablesOk = input.comparablesCount >= 3;
  const renovationOk = input.hasRealBudgetItems;
  const salePriceOk = comparablesOk && input.salePriceSet;

  const breakdown: ConfidenceBreakdownItem[] = [
    { label: "Cena", value: fieldLabel(priceMeta), ok: priceOk },
    { label: "Plocha", value: fieldLabel(areaMeta), ok: areaOk },
    {
      label: "Comparables",
      value: input.comparablesCount > 0 ? `${input.comparablesCount} zdrojů` : "chybí",
      ok: comparablesOk
    },
    {
      label: "Rekonstrukce",
      value: input.hasRealBudgetItems
        ? "OVĚŘENO (položkový rozpočet)"
        : input.renovationCostSet
          ? "ODHAD"
          : "NEZNÁMÉ",
      ok: renovationOk
    },
    {
      label: "Prodejní cena",
      value: input.salePriceSet ? (comparablesOk ? "ODHAD (z comparables)" : "ODHAD (nepodloženo)") : "NEZNÁMÉ",
      ok: salePriceOk
    }
  ];

  let level: DataConfidenceLevel;
  if (!priceOk || !areaOk || (input.comparablesCount === 0 && !input.salePriceSet)) {
    level = "LOW";
  } else if (priceOk && areaOk && comparablesOk && (renovationOk || input.renovationCostSet)) {
    level = "HIGH";
  } else {
    level = "MEDIUM";
  }

  return { level, breakdown };
}
