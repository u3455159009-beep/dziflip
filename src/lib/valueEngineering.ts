// Value Engineering (item 14) — when the renovation plan is OVER_BUDGET,
// suggest real, already-found cheaper alternatives (never invented
// products) for the requirements where swapping has the smallest expected
// impact on how sellable the finished flat is. Only ever operates on
// candidates that are real Product rows already returned by a provider or
// added manually — this module never fabricates a product or a price.
import type { ProductCategory } from "./types";

// Lower = safer to swap without hurting sellability (e.g. switches/outlets,
// a garage or cellar item). Higher = a buyer notices immediately (kitchen,
// flooring, bathroom fixtures). Categories not listed default to 2 (medium).
const CATEGORY_IMPACT: Partial<Record<ProductCategory, number>> = {
  KUCHYNE: 5,
  PRACOVNI_DESKY: 4,
  DREZY: 3,
  PODLAHY: 4,
  OBKLADY: 3,
  DLAZBY: 3,
  VANY: 4,
  SPRCHY: 4,
  UMYVADLA: 3,
  SANITA: 3,
  WC: 2,
  VODOVODNI_BATERIE: 2,
  DVERE: 3,
  SVETLA: 2,
  ZRCADLA: 1,
  ZASUVKY: 1,
  VYPINACE: 1,
  KLIKY: 1,
  BARVY: 1,
  LISTY: 1,
  ZAVESY: 1,
  DEKORACE: 1,
  SPOTREBICE: 3,
  DIGESTOR: 2,
  POSTELE: 2,
  MATRACE: 1,
  SKRINE: 2,
  STOLY: 1,
  ZIDLE: 1,
  POHOVKY: 2,
  KRESLA: 1,
  KONFERENCNI_STOLKY: 1
};

function impactOf(category: string): number {
  return CATEGORY_IMPACT[category as ProductCategory] ?? 2;
}

export interface ValueEngineeringCandidate {
  requirementId: string;
  requirementDescription: string;
  category: string;
  currentProductId: string;
  currentProductName: string;
  currentPrice: number;
  alternativeProductId: string;
  alternativeProductName: string;
  alternativePrice: number;
}

export interface ValueEngineeringSuggestion extends ValueEngineeringCandidate {
  savings: number;
  impactScore: number; // lower = smaller impact on sellability
}

/**
 * Ranks real cheaper-alternative candidates by smallest sellability impact
 * first, then largest savings. Only positive-savings candidates are kept —
 * this never suggests a "downgrade" that costs more.
 */
export function rankValueEngineeringCandidates(candidates: ValueEngineeringCandidate[]): ValueEngineeringSuggestion[] {
  return candidates
    .map((c) => ({ ...c, savings: c.currentPrice - c.alternativePrice, impactScore: impactOf(c.category) }))
    .filter((c) => c.savings > 0)
    .sort((a, b) => a.impactScore - b.impactScore || b.savings - a.savings);
}

export interface ValueEngineeringPlan {
  suggestions: ValueEngineeringSuggestion[];
  totalSavings: number;
  overBudgetAmount: number;
  stillOverBy: number; // 0 when the chosen suggestions fully close the gap
}

/**
 * Greedily selects the lowest-impact, highest-savings swaps needed to close
 * an OVER_BUDGET gap (item 14). Never selects more than needed to reach
 * zero, so the plan stays as close to the original design intent as
 * possible while still fitting MAX RENOVATION BUDGET.
 */
export function buildValueEngineeringPlan(
  candidates: ValueEngineeringCandidate[],
  overBudgetAmount: number
): ValueEngineeringPlan {
  const ranked = rankValueEngineeringCandidates(candidates);
  const chosen: ValueEngineeringSuggestion[] = [];
  let totalSavings = 0;
  for (const c of ranked) {
    if (totalSavings >= overBudgetAmount) break;
    chosen.push(c);
    totalSavings += c.savings;
  }
  return {
    suggestions: chosen,
    totalSavings,
    overBudgetAmount,
    stillOverBy: Math.max(0, overBudgetAmount - totalSavings)
  };
}
