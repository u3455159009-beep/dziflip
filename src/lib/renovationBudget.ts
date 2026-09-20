// AI Renovation Budget — range calculation. Never invents an exact number
// for a position whose quantity/price is unknown: those positions are
// listed as an explicit uncertainty instead of being folded into LOW/
// EXPECTED/HIGH. The range itself is a transparent, fixed execution-risk
// band (−12 % / +20 %) applied only to fully-specified positions.
import type { RenovationBudgetStatus, RenovationCostType, RenovationDataStatus } from "./types";

/**
 * Renovation data status (item 10) — distinguishes a real, itemized budget
 * (KNOWN) from a rough per-m² assumption typed into "Náklady rekonstrukce"
 * with no line items behind it (ESTIMATED) from having neither (UNKNOWN).
 * A dashboard must never present an ESTIMATED or UNKNOWN number as if it
 * were a verified renovation cost.
 */
export function computeRenovationDataStatus(input: {
  knownBudgetItemCount: number;
  renovationCostAssumption: number | null;
}): RenovationDataStatus {
  if (input.knownBudgetItemCount > 0) return "KNOWN";
  if (input.renovationCostAssumption != null && input.renovationCostAssumption > 0) return "ESTIMATED";
  return "UNKNOWN";
}

export interface BudgetRangeInput {
  name: string;
  total: number | null;
  priceSource: string;
}

export interface BudgetRangeResult {
  low: number | null;
  expected: number | null;
  high: number | null;
  knownItemCount: number;
  unknownScopeItems: string[];
  explanation: string;
}

const LOW_FACTOR = 0.88;
const HIGH_FACTOR = 1.2;

export function computeBudgetRange(items: BudgetRangeInput[]): BudgetRangeResult {
  const known = items.filter((i) => i.total != null);
  const unknown = items.filter((i) => i.total == null);

  if (known.length === 0) {
    return {
      low: null,
      expected: null,
      high: null,
      knownItemCount: 0,
      unknownScopeItems: unknown.map((i) => i.name),
      explanation:
        unknown.length > 0
          ? `Rozpočet zatím nelze odhadnout — ${unknown.length} položek nemá zadané množství ani cenu.`
          : "Zatím nejsou zadány žádné položky rozpočtu."
    };
  }

  const expected = known.reduce((s, i) => s + (i.total ?? 0), 0);
  const low = Math.round(expected * LOW_FACTOR);
  const high = Math.round(expected * HIGH_FACTOR);
  const estimateCount = known.filter((i) => i.priceSource === "ESTIMATE").length;

  const uncertainties: string[] = [];
  if (unknown.length > 0) {
    const sample = unknown
      .slice(0, 3)
      .map((i) => i.name)
      .join(", ");
    uncertainties.push(
      `${unknown.length} položek (${sample}${unknown.length > 3 ? "…" : ""}) nemá zadané množství/cenu a není zahrnuto v čísle níže`
    );
  }
  if (estimateCount > 0) {
    uncertainties.push(`${estimateCount} z ${known.length} položek je pouze ODHAD ceny, ne ověřená cena z produktu`);
  }

  const explanation =
    uncertainties.length > 0
      ? `Rozpětí zohledňuje běžnou odchylku realizace (−12 % / +20 %) nad ${known.length} specifikovanými položkami. Největší nejistoty: ${uncertainties.join("; ")}.`
      : `Rozpětí zohledňuje běžnou odchylku realizace (−12 % / +20 %) nad ${known.length} plně specifikovanými položkami.`;

  return { low, expected, high, knownItemCount: known.length, unknownScopeItems: unknown.map((i) => i.name), explanation };
}

// --- Cost breakdown (item 11/13) — MATERIAL / PRODUCT / LABOUR / DELIVERY / WASTE / RESERVE ---

export interface CostBreakdownItemInput {
  total: number | null;
  category: string;
  productRequirementId: string | null;
  deliveryEstimate: number | null;
  wasteEstimate: number | null;
}

export type CostBreakdown = Record<RenovationCostType, number> & { totalPlanned: number };

function bucketFor(item: CostBreakdownItemInput): RenovationCostType {
  if (item.productRequirementId) return "PRODUCT";
  if (item.category === "PRACE") return "LABOUR";
  if (item.category === "DOPRAVA") return "DELIVERY";
  if (item.category === "REZERVA") return "RESERVE";
  return "MATERIAL";
}

/**
 * Splits known BudgetItem totals into the six cost-type buckets required by
 * item 11 ("tile alone isn't the complete bathroom cost"). Each item's own
 * `total` is the source of truth — the buckets always sum exactly to
 * `totalPlanned`, so this is a re-labeling of existing money, never an
 * invented additional cost. deliveryEstimate/wasteEstimate, when set on a
 * line, are carved out of that line's own bucket into DELIVERY/WASTE so
 * they're visible separately, matching the worked example's structure.
 */
export function computeRenovationCostBreakdown(items: CostBreakdownItemInput[]): CostBreakdown {
  const totals: Record<RenovationCostType, number> = {
    MATERIAL: 0,
    PRODUCT: 0,
    LABOUR: 0,
    DELIVERY: 0,
    WASTE: 0,
    RESERVE: 0
  };
  let totalPlanned = 0;

  for (const item of items) {
    const amount = item.total ?? 0;
    totalPlanned += amount;
    const bucket = bucketFor(item);
    const waste = item.wasteEstimate ?? 0;
    const delivery = bucket === "DELIVERY" ? 0 : item.deliveryEstimate ?? 0;
    const carved = Math.min(amount, waste + delivery);
    totals[bucket] += amount - carved;
    totals.WASTE += waste > carved ? carved : waste;
    totals.DELIVERY += delivery > carved - waste ? Math.max(0, carved - waste) : delivery;
  }

  return { ...totals, totalPlanned };
}

/**
 * Renovation Dashboard status (item 16). INSUFFICIENT_DATA when the MAX
 * RENOVATION BUDGET itself isn't known yet (see computeMaxRenovationBudget)
 * — this function never invents a ceiling to compare against.
 */
export function computeRenovationBudgetStatus(
  maxBudget: number | null,
  totalPlanned: number,
  nearLimitThresholdPct = 0.9
): RenovationBudgetStatus {
  if (maxBudget === null) return "INSUFFICIENT_DATA";
  if (totalPlanned > maxBudget) return "OVER_BUDGET";
  if (totalPlanned >= maxBudget * nearLimitThresholdPct) return "NEAR_LIMIT";
  return "WITHIN_BUDGET";
}
