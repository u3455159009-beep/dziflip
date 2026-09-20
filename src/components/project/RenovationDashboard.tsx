"use client";

// Renovation Dashboard (item 16) — "Budget First" (item 5): shows MAX
// RENOVATION BUDGET computed live from the deal's own economics (purchase
// price, conservative sale price, other fixed costs, minimum profit/margin/
// ROI), the current planned renovation cost broken down into MATERIAL /
// PRODUCT / LABOUR / DELIVERY / WASTE / RESERVE (item 11/13), and a
// WITHIN_BUDGET / NEAR_LIMIT / OVER_BUDGET / INSUFFICIENT_DATA status. Never
// shows a fabricated ceiling — INSUFFICIENT_DATA whenever purchase price or
// conservative sale price isn't known yet.
import { Card, SectionTitle } from "@/components/ui";
import { formatCZK } from "@/lib/format";
import { DEFAULT_ASSUMPTIONS, computeMaxRenovationBudget, type AssumptionsInput } from "@/lib/calc";
import { computeRenovationCostBreakdown, computeRenovationBudgetStatus } from "@/lib/renovationBudget";
import { RENOVATION_BUDGET_STATUS_LABELS, RENOVATION_COST_TYPE_LABELS, type RenovationCostType } from "@/lib/types";
import type { ProjectDTO } from "@/lib/project-types";

const STATUS_STYLES: Record<string, string> = {
  WITHIN_BUDGET: "bg-band-goodBg border-band-good/40 text-band-good",
  NEAR_LIMIT: "bg-band-warn/10 border-band-warn/40 text-band-warn",
  OVER_BUDGET: "bg-band-badBg border-band-bad/40 text-band-bad",
  INSUFFICIENT_DATA: "bg-beige-50 border-line text-muted"
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

const COST_TYPE_ORDER: RenovationCostType[] = ["MATERIAL", "PRODUCT", "LABOUR", "DELIVERY", "WASTE", "RESERVE"];

export function RenovationDashboard({ project }: { project: ProjectDTO }) {
  const a = toAssumptionsInput(project.assumptions);
  const maxBudget = computeMaxRenovationBudget(a, project.assumptions?.maxRenovationBudgetOverride ?? null);

  const breakdown = computeRenovationCostBreakdown(
    project.budgetItems.map((b) => ({
      total: b.total,
      category: b.category,
      productRequirementId: b.productRequirementId,
      deliveryEstimate: b.deliveryEstimate,
      wasteEstimate: b.wasteEstimate
    }))
  );

  const status = computeRenovationBudgetStatus(maxBudget, breakdown.totalPlanned);
  const headroom = maxBudget != null ? maxBudget - breakdown.totalPlanned : null;

  const roomCount = new Set(project.photos.map((p) => p.roomType).filter(Boolean)).size;
  const visualizationCount = project.photos.reduce((s, p) => s + p.generations.filter((g) => g.status === "GENERATED").length, 0);
  const productCount = project.productRequirements.reduce((s, r) => s + r.products.length, 0);

  return (
    <Card>
      <SectionTitle subtitle="Rozpočet rekonstrukce vs. maximum, které si tento flip může dovolit — počítáno vždy naživo z aktuální ekonomiky, nikdy neuloženo jako zastaralé číslo.">
        Renovation Dashboard
      </SectionTitle>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-line p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Max rozpočet rekonstrukce</div>
          <div className="mt-1 text-xl font-medium number-tabular text-ink">{maxBudget != null ? formatCZK(maxBudget) : "N/A"}</div>
          {maxBudget == null && <div className="mt-1 text-xs text-muted">Chybí nákupní cena nebo konzervativní prodejní cena.</div>}
          {project.assumptions?.maxRenovationBudgetOverride != null && (
            <div className="mt-1 text-xs text-muted">Ručně nastaveno v Předpokladech.</div>
          )}
        </div>
        <div className="rounded-lg border border-line p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Plánovaný rozpočet</div>
          <div className="mt-1 text-xl font-medium number-tabular text-ink">{formatCZK(breakdown.totalPlanned)}</div>
        </div>
        <div className="rounded-lg border border-line p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Rezerva do max. rozpočtu</div>
          <div className={`mt-1 text-xl font-medium number-tabular ${headroom != null && headroom < 0 ? "text-band-bad" : "text-ink"}`}>
            {headroom != null ? formatCZK(headroom) : "N/A"}
          </div>
        </div>
        <div className="rounded-lg border border-line p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Stav</div>
          <span className={`mt-1 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${STATUS_STYLES[status]}`}>
            {RENOVATION_BUDGET_STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COST_TYPE_ORDER.map((ct) => (
          <div key={ct} className="rounded-lg bg-beige-50 p-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted">{RENOVATION_COST_TYPE_LABELS[ct]}</div>
            <div className="mt-1 text-sm font-medium number-tabular text-ink">{formatCZK(breakdown[ct])}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm text-muted">
        <div>
          <div className="text-lg font-medium text-ink number-tabular">{roomCount}</div>
          místností analyzováno
        </div>
        <div>
          <div className="text-lg font-medium text-ink number-tabular">{visualizationCount}</div>
          vizualizací
        </div>
        <div>
          <div className="text-lg font-medium text-ink number-tabular">{productCount}</div>
          produktů v nákupním seznamu
        </div>
      </div>
    </Card>
  );
}
