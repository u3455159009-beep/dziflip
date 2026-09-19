"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Card, Select } from "@/components/ui";
import { formatCZK, formatDate } from "@/lib/format";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, ANALYSIS_STAGE_LABELS, type AnalysisStage } from "@/lib/types";
import type { ProjectDTO } from "@/lib/project-types";
import { ListingFields } from "./ListingFields";
import { ComparablesTable } from "./ComparablesTable";
import { EconomicsSection } from "./EconomicsSection";
import { PhotosGallery } from "./PhotosGallery";
import { RoomConditionPanel } from "./RoomConditionPanel";
import { BudgetSection } from "./BudgetSection";
import { ShoppingListSection } from "./ShoppingListSection";
import { PriceDropWatch } from "./PriceDropWatch";
import { ListingTimeline } from "./ListingTimeline";
import { ContactOutreach } from "./ContactOutreach";
import { DataConfidencePanel } from "./DataConfidencePanel";
import { SourceEvidencePanel } from "./SourceEvidencePanel";
import { SmsConversation } from "./SmsConversation";
import { DuplicatesPanel } from "./DuplicatesPanel";
import { MarketValuePanel } from "./MarketValuePanel";
import { InvestmentDashboard } from "./InvestmentDashboard";
import { AnalysisGapsBanner } from "./AnalysisGapsBanner";
import { LocalityContextPanel } from "./LocalityContextPanel";
import { DiscoveredListingHistoryPanel } from "./DiscoveredListingHistoryPanel";
import { computeDataOrigin, DATA_ORIGIN_LABELS } from "@/lib/dataOrigin";
import { isDataStale } from "@/lib/staleData";
import { computeDataConfidence } from "@/lib/confidence";
import { computeRenovationDataStatus } from "@/lib/renovationBudget";
import type { FieldMeta } from "@/lib/types";
import type { MarketValueEstimate } from "@/lib/marketValue";

const ORIGIN_BADGE_STYLES: Record<string, string> = {
  DEMO: "bg-ink/80 text-paper",
  REAL: "bg-band-good text-white",
  MANUAL: "bg-beige-400 text-white"
};

export function ProjectView({
  project,
  marketValue,
  arv,
  staleDataThresholdDays,
  minCompCount
}: {
  project: ProjectDTO;
  marketValue?: MarketValueEstimate;
  arv?: MarketValueEstimate;
  staleDataThresholdDays?: number;
  minCompCount?: number;
}) {
  const dataOrigin = computeDataOrigin(project);
  const stale = isDataStale(project.lastVerifiedAt, staleDataThresholdDays ?? 14);

  const fieldMeta = (project.fieldMeta ? JSON.parse(project.fieldMeta) : {}) as FieldMeta;
  const dataConfidence = computeDataConfidence({
    fieldMeta,
    comparablesCount: project.comparables.length,
    hasRealBudgetItems: project.budgetItems.length > 0,
    renovationCostSet: Boolean(project.assumptions?.renovationCost && project.assumptions.renovationCost > 0),
    salePriceSet: Boolean(project.assumptions?.saleBase),
    isStale: stale
  });
  const renovationStatus = computeRenovationDataStatus({
    knownBudgetItemCount: project.budgetItems.filter((b) => b.total != null).length,
    renovationCostAssumption: project.assumptions?.renovationCost ?? null
  });

  const searchParams = useSearchParams();
  const showWarning = searchParams.get("warning") === "1";
  const [status, setStatus] = useState(project.status);
  const [targetPrice, setTargetPrice] = useState<string>(project.targetPrice?.toString() ?? "");

  async function updateStatus(next: string) {
    setStatus(next);
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });
  }

  async function saveTargetPrice() {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPrice: targetPrice === "" ? null : Number(targetPrice) })
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/projects" className="text-xs text-muted hover:text-ink">
          ← Zpět na projekty
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-3xl text-ink">{project.title || "Nepojmenovaná nemovitost"}</h1>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${ORIGIN_BADGE_STYLES[dataOrigin]}`}
              >
                {DATA_ORIGIN_LABELS[dataOrigin]}
              </span>
              {stale && (
                <span className="rounded-full border border-band-warn/40 bg-band-warn/10 px-2.5 py-1 text-[10px] font-medium uppercase text-band-warn">
                  Zastaralá data — ověřte znovu
                </span>
              )}
              <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-medium uppercase text-muted">
                {ANALYSIS_STAGE_LABELS[project.analysisStage as AnalysisStage] ?? project.analysisStage}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {project.portal && <span>{project.portal}</span>}
              {project.municipality && <span>· {project.municipality}</span>}
              {project.district && <span>· {project.district}</span>}
              {project.sourceUrl && (
                <a href={project.sourceUrl} target="_blank" rel="noreferrer" className="text-beige-500 underline underline-offset-2">
                  zdrojový inzerát
                </a>
              )}
              <span>· založeno {formatDate(project.createdAt)}</span>
              {project.sourceWatcher && <span>· nalezeno hlídačem "{project.sourceWatcher.name}"</span>}
            </div>
          </div>
          <Select value={status} onChange={(e) => updateStatus(e.target.value)} className="w-48">
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {showWarning && (
        <div className="rounded-lg border border-band-normal/40 bg-band-normalBg p-4 text-sm text-band-normal">
          Ze zadaného odkazu se nepodařilo automaticky získat dostatek údajů (portál pravděpodobně vyžaduje
          JavaScript). Doplňte prosím chybějící údaje ručně níže, nebo vložte zkopírovaný text inzerátu.
        </div>
      )}

      {marketValue && arv && (
        <AnalysisGapsBanner
          askingPrice={project.askingPrice}
          areaM2={project.areaM2}
          condition={project.condition}
          comparableCount={project.comparables.length}
          minCompCount={minCompCount ?? 3}
          marketValueInsufficient={marketValue.insufficientData}
          arvInsufficient={arv.insufficientData}
          saleConservativeSet={Boolean(project.assumptions?.saleConservative)}
          renovationStatus={renovationStatus}
        />
      )}

      {marketValue && arv && (
        <InvestmentDashboard project={project} marketValue={marketValue} arv={arv} dataConfidenceLevel={dataConfidence.level} />
      )}

      <LocalityContextPanel projectId={project.id} />

      <Card className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Nabídková cena</div>
          <div className="font-serif text-2xl text-ink number-tabular">{formatCZK(project.askingPrice)}</div>
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-muted">Moje cílová cena (Kč)</div>
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            onBlur={saveTargetPrice}
            placeholder="nezadáno"
            className="rounded-lg border border-line bg-card px-3.5 py-2 text-sm number-tabular focus:border-beige-400 focus:outline-none focus:ring-2 focus:ring-beige-200"
          />
        </div>
      </Card>

      <DuplicatesPanel
        duplicates={[
          ...project.duplicatesAsA.map((d) => ({ ...d, otherProject: d.projectB })),
          ...project.duplicatesAsB.map((d) => ({ ...d, otherProject: d.projectA }))
        ]}
      />

      <ListingFields project={project} />

      <DataConfidencePanel
        fieldMeta={(project.fieldMeta ? JSON.parse(project.fieldMeta) : {}) as FieldMeta}
        comparablesCount={project.comparables.length}
        hasRealBudgetItems={project.budgetItems.length > 0}
        renovationCostSet={Boolean(project.assumptions?.renovationCost && project.assumptions.renovationCost > 0)}
        salePriceSet={Boolean(project.assumptions?.saleBase)}
        isStale={stale}
      />

      <SourceEvidencePanel project={project} />

      <DiscoveredListingHistoryPanel projectId={project.id} />

      <ComparablesTable
        projectId={project.id}
        comparables={project.comparables}
        discoveryNote={project.comparableDiscoveryNote}
        lastDiscoveryAt={project.lastComparableDiscoveryAt}
      />

      {marketValue && arv && <MarketValuePanel marketValue={marketValue} arv={arv} />}

      <PriceDropWatch projectId={project.id} history={project.priceHistory} />

      <ListingTimeline priceHistory={project.priceHistory} events={project.listingEvents} />

      <EconomicsSection
        projectId={project.id}
        areaM2={project.areaM2}
        askingPrice={project.askingPrice}
        targetPrice={project.targetPrice}
        assumptions={project.assumptions}
      />

      <PhotosGallery projectId={project.id} photos={project.photos} />

      <RoomConditionPanel projectId={project.id} conditions={project.roomConditions} />

      <BudgetSection projectId={project.id} items={project.budgetItems} />

      <ShoppingListSection
        projectId={project.id}
        requirements={project.productRequirements}
        staleDataThresholdDays={staleDataThresholdDays ?? 14}
      />

      <ContactOutreach projectId={project.id} contact={project.contact} messages={project.outreachMessages} />

      <SmsConversation projectId={project.id} contact={project.contact} messages={project.smsMessages} />

      {project.fullText && (
        <Card>
          <h3 className="mb-3 font-serif text-lg text-ink">Kompletní text inzerátu</h3>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap text-xs text-muted">{project.fullText}</pre>
        </Card>
      )}
    </div>
  );
}
