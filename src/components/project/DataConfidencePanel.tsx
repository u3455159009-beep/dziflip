"use client";

import { Card, SectionTitle } from "@/components/ui";
import { computeDataConfidence } from "@/lib/confidence";
import { DATA_CONFIDENCE_LABELS } from "@/lib/types";
import type { FieldMeta } from "@/lib/types";

const LEVEL_STYLES: Record<string, string> = {
  HIGH: "bg-band-goodBg text-band-good border-band-good/40",
  MEDIUM: "bg-band-normalBg text-band-normal border-band-normal/40",
  LOW: "bg-band-badBg text-band-bad border-band-bad/40"
};

export function DataConfidencePanel({
  fieldMeta,
  comparablesCount,
  hasRealBudgetItems,
  renovationCostSet,
  salePriceSet,
  isStale
}: {
  fieldMeta: FieldMeta;
  comparablesCount: number;
  hasRealBudgetItems: boolean;
  renovationCostSet: boolean;
  salePriceSet: boolean;
  isStale?: boolean;
}) {
  const result = computeDataConfidence({
    fieldMeta,
    comparablesCount,
    hasRealBudgetItems,
    renovationCostSet,
    salePriceSet,
    isStale
  });

  return (
    <Card>
      <SectionTitle subtitle="Confidence vychází výhradně z dostupnosti podkladů (ověřené údaje, počet comparables, reálně zadaný rozpočet) — nejde o subjektivní AI odhad.">
        Data Confidence
      </SectionTitle>
      <div className="mb-4">
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${LEVEL_STYLES[result.level]}`}>
          {DATA_CONFIDENCE_LABELS[result.level]}
        </span>
      </div>
      <div className="space-y-1.5 text-sm">
        {result.breakdown.map((b) => (
          <div key={b.label} className="flex items-center justify-between border-b border-line/60 py-1.5">
            <span className="text-muted">{b.label}</span>
            <span className={b.ok ? "text-band-good" : "text-ink"}>{b.value}</span>
          </div>
        ))}
      </div>
      {result.level === "LOW" && (
        <p className="mt-3 text-xs text-band-bad">
          Kritická data chybí — automatické kontaktování (režim AUTO) pro tuto nemovitost neproběhne.
        </p>
      )}
    </Card>
  );
}
