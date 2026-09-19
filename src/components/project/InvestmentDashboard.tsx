"use client";

// Investment Dashboard (item 12) — the single "what's the verdict, in
// numbers" view at the top of a project's detail page. Every tile falls
// back to N/A / "Nelze vypočítat" rather than a fabricated 0 Kč or -100 %
// figure (item 13) whenever its underlying data isn't actually known yet.
// The price band at the bottom reuses the app's existing, purely
// mathematical BAD/NORMAL/GOOD/BUY_NOW classification — no separate
// subjective AI verdict is introduced here.
import { Card, SectionTitle } from "@/components/ui";
import { formatCZK, formatPct } from "@/lib/format";
import {
  DEFAULT_ASSUMPTIONS,
  FLIP_BAND_ICONS,
  FLIP_BAND_LABELS,
  classifyPrice,
  computeBands,
  computeEconomics,
  type AssumptionsInput,
  type FlipBand
} from "@/lib/calc";
import { computeBudgetRange, computeRenovationDataStatus } from "@/lib/renovationBudget";
import { RENOVATION_DATA_STATUS_LABELS, type DataConfidenceLevel } from "@/lib/types";
import type { ProjectDTO } from "@/lib/project-types";
import type { MarketValueEstimate } from "@/lib/marketValue";

const BAND_STYLES: Record<FlipBand, string> = {
  BUY_NOW: "bg-band-hotBg border-band-hot/40 text-band-hot",
  GOOD: "bg-band-goodBg border-band-good/40 text-band-good",
  NORMAL: "bg-band-normalBg border-band-normal/40 text-band-normal",
  BAD: "bg-band-badBg border-band-bad/40 text-band-bad",
  UNKNOWN: "bg-beige-50 border-line text-muted"
};

const CONFIDENCE_STYLES: Record<DataConfidenceLevel, string> = {
  HIGH: "bg-band-good/10 text-band-good",
  MEDIUM: "bg-band-warn/10 text-band-warn",
  LOW: "bg-band-bad/10 text-band-bad"
};

function toAssumptionsInput(a: ProjectDTO["assumptions"]): AssumptionsInput {
  if (!a) return { ...DEFAULT_ASSUMPTIONS };
  return {
    purchasePriceUsed: a.purchasePriceUsed,
    saleConservative: a.saleConservative,
    saleBase: a.saleBase,
    saleOptimistic: a.saleOptimistic,
    renovationCost: a.renovationCost,
    furnishingCost: a.furnishingCost,
    legalCosts: a.legalCosts,
    financingCost: a.financingCost,
    otherCosts: a.otherCosts,
    reserve: a.reserve,
    minProfit: a.minProfit,
    minMarginPct: a.minMarginPct,
    minRoiPct: a.minRoiPct,
    incomeTaxPct: a.incomeTaxPct,
    bandWidthPct: a.bandWidthPct
  };
}

function Tile({ label, value, sub, valueClassName }: { label: string; value: string; sub?: string; valueClassName?: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-medium number-tabular ${valueClassName ?? "text-ink"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function InvestmentDashboard({
  project,
  marketValue,
  arv,
  dataConfidenceLevel
}: {
  project: ProjectDTO;
  marketValue: MarketValueEstimate;
  arv: MarketValueEstimate;
  dataConfidenceLevel: DataConfidenceLevel;
}) {
  const a = toAssumptionsInput(project.assumptions);
  const purchasePrice = a.purchasePriceUsed ?? project.askingPrice ?? null;
  const bands = computeBands(a);
  const band = purchasePrice != null && purchasePrice > 0 ? classifyPrice(purchasePrice, bands) : "UNKNOWN";
  const economics = purchasePrice != null ? computeEconomics(purchasePrice, a, project.areaM2) : null;
  const conservativeScenario = economics?.scenarios.conservative;

  const askingPricePerM2 =
    project.pricePerM2 ?? (project.askingPrice && project.areaM2 ? project.askingPrice / project.areaM2 : null);

  const budgetRange = computeBudgetRange(project.budgetItems.map((b) => ({ name: b.name, total: b.total, priceSource: b.priceSource })));
  const renovationStatus = computeRenovationDataStatus({
    knownBudgetItemCount: budgetRange.knownItemCount,
    renovationCostAssumption: a.renovationCost
  });

  const marketPricePerM2Label =
    marketValue.stats.count > 0
      ? `medián ${formatCZK(marketValue.stats.median)}/m² (${formatCZK(marketValue.stats.p25)} – ${formatCZK(marketValue.stats.p75)}/m²), n=${marketValue.stats.count}`
      : "N/A — nedostatek srovnatelných nabídek";

  return (
    <Card>
      <SectionTitle subtitle="Souhrn celé investiční analýzy na jednom místě. Cokoliv níže chybí, je zobrazeno jako N/A — nikoliv jako 0 Kč nebo vymyšlené číslo.">
        Investiční přehled
      </SectionTitle>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Nabídková cena" value={formatCZK(project.askingPrice)} />
        <Tile label="Nabídková cena / m²" value={askingPricePerM2 != null ? `${formatCZK(askingPricePerM2)}/m²` : "N/A"} />
        <Tile label="Tržní cena / m² (srovnání)" value={marketValue.stats.count > 0 ? `${formatCZK(marketValue.stats.median)}/m²` : "N/A"} sub={marketPricePerM2Label} />
        <Tile
          label="Data confidence"
          value={dataConfidenceLevel}
          valueClassName={CONFIDENCE_STYLES[dataConfidenceLevel].split(" ")[1]}
        />

        <Tile
          label="Odhad tržní hodnoty"
          value={!marketValue.insufficientData ? `${formatCZK(marketValue.conservative.value)} – ${formatCZK(marketValue.high.value)}` : "N/A"}
          sub={!marketValue.insufficientData ? `Base: ${formatCZK(marketValue.base.value)}` : "Nedostatek dat"}
        />
        <Tile
          label="ARV (po rekonstrukci)"
          value={!arv.insufficientData ? `${formatCZK(arv.conservative.value)} – ${formatCZK(arv.high.value)}` : "N/A"}
          sub={!arv.insufficientData ? `Base: ${formatCZK(arv.base.value)}` : "Nedostatek dat"}
        />
        <Tile
          label="Odhad rekonstrukce"
          value={
            renovationStatus === "KNOWN" && budgetRange.low != null
              ? `${formatCZK(budgetRange.low)} – ${formatCZK(budgetRange.high)}`
              : renovationStatus === "ESTIMATED"
                ? formatCZK(a.renovationCost)
                : "N/A"
          }
          sub={`${RENOVATION_DATA_STATUS_LABELS[renovationStatus]}${renovationStatus === "UNKNOWN" ? " — náklady rekonstrukce zatím nelze určit" : ""}`}
        />
        <Tile label="Max Buy Price" value={bands.goodThreshold != null ? formatCZK(bands.goodThreshold) : "N/A"} sub={bands.goodThreshold == null ? "Chybí konzervativní prodejní cena" : undefined} />

        <Tile
          label="Očekávaný zisk (konzervativní)"
          value={conservativeScenario?.grossProfit != null ? formatCZK(conservativeScenario.grossProfit) : "N/A"}
          valueClassName={conservativeScenario?.grossProfit != null ? (conservativeScenario.grossProfit >= 0 ? "text-band-good" : "text-band-bad") : undefined}
        />
        <Tile
          label="ROI (konzervativní)"
          value={conservativeScenario?.roiPct != null ? formatPct(conservativeScenario.roiPct) : "N/A"}
          valueClassName={conservativeScenario?.roiPct != null ? (conservativeScenario.roiPct >= 0 ? "text-band-good" : "text-band-bad") : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-beige-50 p-4 text-sm">
        <span className="text-muted">Cenové pásmo (matematické, ze stejných čísel jako výše):</span>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium ${BAND_STYLES[band]}`}>
          {FLIP_BAND_ICONS[band]} {FLIP_BAND_LABELS[band]}
        </span>
      </div>
    </Card>
  );
}
