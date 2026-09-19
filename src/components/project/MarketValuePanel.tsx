import { Card, SectionTitle } from "@/components/ui";
import { formatCZK } from "@/lib/format";
import type { MarketValueEstimate, MarketValueConfidence } from "@/lib/marketValue";

const CONFIDENCE_STYLES: Record<MarketValueConfidence, string> = {
  HIGH: "bg-band-good/10 text-band-good",
  MEDIUM: "bg-band-warn/10 text-band-warn",
  LOW: "bg-band-bad/10 text-band-bad"
};

const CONFIDENCE_LABELS: Record<MarketValueConfidence, string> = {
  HIGH: "Vysoká jistota",
  MEDIUM: "Střední jistota",
  LOW: "Nízká jistota"
};

function Band({ label, band }: { label: string; band: { value: number | null; explanation: string } }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-medium text-ink number-tabular">{band.value != null ? formatCZK(band.value) : "—"}</div>
      <div className="mt-1 text-xs text-muted">{band.explanation}</div>
    </div>
  );
}

function Estimate({ title, subtitle, estimate }: { title: string; subtitle: string; estimate: MarketValueEstimate }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-ink">{title}</div>
          <div className="text-xs text-muted">{subtitle}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${CONFIDENCE_STYLES[estimate.confidence]}`}>
          {CONFIDENCE_LABELS[estimate.confidence]}
        </span>
      </div>

      {estimate.insufficientData ? (
        <div className="mt-3 rounded-lg bg-band-bad/10 p-3 text-sm font-medium text-band-bad">
          {estimate.explanation}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Band label="Conservative" band={estimate.conservative} />
            <Band label="Base" band={estimate.base} />
            <Band label="High" band={estimate.high} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4">
            <div>Použito srovnání: {estimate.usedComparableCount}</div>
            <div>Z toho HIGH kvalita: {estimate.highQualityCount}</div>
            <div>Nabídkové ceny: {estimate.askingCount}</div>
            <div>Realizované ceny: {estimate.realizedCount}</div>
          </div>
        </>
      )}
      <div className="mt-3 border-t border-line/60 pt-3 text-xs text-muted">
        Nalezeno celkem {estimate.totalFound} srovnání, z toho vyřazeno {estimate.rejectedOutlierCount} jako
        statistický outlier (IQR metoda).
        {estimate.rejectedOutliers.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {estimate.rejectedOutliers.map((o, i) => (
              <li key={i}>{o.reason}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function MarketValuePanel({
  marketValue,
  arv
}: {
  marketValue: MarketValueEstimate;
  arv: MarketValueEstimate;
}) {
  return (
    <Card>
      <SectionTitle subtitle="Odhad tržní hodnoty a hodnoty po rekonstrukci (ARV) vypočtený ze srovnatelných nemovitostí. Nabídkové ceny nejsou realizované prodejní ceny.">
        Tržní hodnota engine
      </SectionTitle>
      <div className="mt-4 space-y-4">
        <Estimate
          title="Aktuální tržní hodnota"
          subtitle="Vychází ze srovnání v současném stavu nemovitosti."
          estimate={marketValue}
        />
        <Estimate
          title="After-Renovation Value (ARV)"
          subtitle="Vychází pouze ze srovnání v renovovaném / po rekonstrukci stavu — vždy odděleně od aktuální tržní hodnoty."
          estimate={arv}
        />
      </div>
    </Card>
  );
}
