// "Co chybí k dokončení analýzy" (item 14) — a deterministic checklist so
// the user immediately understands why the Investment Dashboard shows N/A
// in a given tile, instead of silently wondering. Pure function so it's
// trivially testable and shares no rendering concerns with the banner.
export interface AnalysisGapsInput {
  askingPrice: number | null;
  areaM2: number | null;
  condition: string | null;
  comparableCount: number;
  minCompCount: number;
  marketValueInsufficient: boolean;
  arvInsufficient: boolean;
  saleConservativeSet: boolean;
  renovationStatus: "KNOWN" | "ESTIMATED" | "UNKNOWN";
}

export function computeAnalysisGaps(input: AnalysisGapsInput): string[] {
  const gaps: string[] = [];

  if (!input.askingPrice) gaps.push("chybí nabídková cena");
  if (!input.areaM2) gaps.push("chybí podlahová plocha");
  if (!input.condition) gaps.push("nebylo možné určit stav nemovitosti");

  if (input.comparableCount < input.minCompCount) {
    gaps.push(`potřebujeme alespoň ${input.minCompCount} kvalitní srovnatelné nabídky (nalezeno ${input.comparableCount})`);
  } else if (input.marketValueInsufficient) {
    gaps.push("nalezené srovnatelné nabídky nemají dostatečnou kvalitu pro spolehlivý odhad tržní hodnoty");
  }

  if (input.arvInsufficient) {
    gaps.push("chybí dostatek srovnání v renovovaném stavu pro odhad ARV");
  }

  if (input.renovationStatus === "UNKNOWN") {
    gaps.push("chybí odhad nákladů rekonstrukce");
  }

  if (!input.saleConservativeSet) {
    gaps.push("chybí konzervativní prodejní cena (doplňte ručně, nebo počkejte na automatický odhad z Tržní hodnoty/ARV)");
  }

  return gaps;
}
