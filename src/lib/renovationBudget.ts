// AI Renovation Budget — range calculation. Never invents an exact number
// for a position whose quantity/price is unknown: those positions are
// listed as an explicit uncertainty instead of being folded into LOW/
// EXPECTED/HIGH. The range itself is a transparent, fixed execution-risk
// band (−12 % / +20 %) applied only to fully-specified positions.
import type { RenovationDataStatus } from "./types";

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
