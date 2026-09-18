"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCZK, formatDate, formatPct } from "@/lib/format";
import { FLIP_BAND_ICONS, FLIP_BAND_LABELS } from "@/lib/calc";
import { DATA_CONFIDENCE_LABELS, SMS_FEED_STATUS_LABELS } from "@/lib/types";
import { DATA_ORIGIN_LABELS } from "@/lib/dataOrigin";
import type { DealFeedItem } from "@/lib/dealFeed";

const ORIGIN_BADGE_STYLES: Record<string, string> = {
  DEMO: "bg-ink/80 text-paper",
  REAL: "bg-band-good text-white",
  MANUAL: "bg-beige-400 text-white"
};

const BAND_STYLES: Record<string, string> = {
  BUY_NOW: "bg-band-hotBg border-band-hot/40 text-band-hot",
  GOOD: "bg-band-goodBg border-band-good/40 text-band-good",
  NORMAL: "bg-band-normalBg border-band-normal/40 text-band-normal",
  BAD: "bg-band-badBg border-band-bad/40 text-band-bad"
};

const CONFIDENCE_STYLES: Record<string, string> = {
  HIGH: "text-band-good",
  MEDIUM: "text-band-normal",
  LOW: "text-band-bad"
};

const SMS_STATUS_STYLES: Record<string, string> = {
  SMS_NEODESLANA: "bg-beige-100 text-muted",
  SMS_DRAFT: "bg-band-normalBg text-band-normal",
  SMS_ODESLANA: "bg-band-normalBg text-band-normal",
  MAKLER_ODPOVEDEL: "bg-band-goodBg text-band-good",
  PROHLIDKA_NAVRZENA: "bg-band-hotBg text-band-hot"
};

export function DealCard({ item }: { item: DealFeedItem }) {
  const [showWhy, setShowWhy] = useState(false);
  const overstatesConfidence =
    item.dealScoreConfidence === "LOW_DATA" && (item.band === "GOOD" || item.band === "BUY_NOW");

  return (
    <div className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
      <div className="relative">
        <Link href={`/project/${item.id}`}>
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photoUrl} alt="" className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-44 w-full items-center justify-center bg-beige-100 text-xs text-muted">
              Bez fotografie
            </div>
          )}
        </Link>
        <span
          className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${ORIGIN_BADGE_STYLES[item.dataOrigin]}`}
        >
          {DATA_ORIGIN_LABELS[item.dataOrigin]}
        </span>
        {item.band && !overstatesConfidence && (
          <span
            className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${BAND_STYLES[item.band]}`}
          >
            {FLIP_BAND_ICONS[item.band]} {FLIP_BAND_LABELS[item.band]}
          </span>
        )}
        {overstatesConfidence && (
          <span className="absolute right-3 top-3 max-w-[70%] rounded-full border border-band-normal/40 bg-band-normalBg px-2.5 py-1 text-right text-[11px] font-semibold leading-tight text-band-normal">
            ⚠️ POTENCIÁLNĚ ZAJÍMAVÉ — POTŘEBA OVĚŘIT DATA
          </span>
        )}
      </div>

      <div className="p-4">
        <Link href={`/project/${item.id}`} className="block truncate font-medium text-ink hover:text-beige-500">
          {item.title || "Nepojmenovaná nemovitost"}
        </Link>
        <div className="mt-0.5 truncate text-xs text-muted">
          {[item.municipality, item.district, item.disposition].filter(Boolean).join(" · ") || "Lokalita neznámá"}
          {" · nalezeno "}
          {formatDate(item.createdAt)}
        </div>

        <span
          className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${SMS_STATUS_STYLES[item.smsStatus]}`}
        >
          {SMS_FEED_STATUS_LABELS[item.smsStatus]}
        </span>

        <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
          <Metric label="Nabídková cena" value={formatCZK(item.askingPrice)} />
          <Metric label="Kč/m²" value={formatCZK(item.pricePerM2)} />
          <Metric label="Odhad rekonstrukce" value={formatCZK(item.renovationEstimate)} />
          <Metric label="Max Buy Price" value={formatCZK(item.maxBuyPrice)} />
          <Metric label="Odhad prodeje po rekonstrukci" value={formatCZK(item.saleEstimate)} />
          <Metric
            label="Očekávaný zisk"
            value={formatCZK(item.expectedProfit)}
            tone={item.expectedProfit != null ? (item.expectedProfit >= 0 ? "good" : "bad") : undefined}
          />
          <Metric label="ROI" value={formatPct(item.roiPct)} />
          <Metric
            label="Confidence"
            value={DATA_CONFIDENCE_LABELS[item.dataConfidenceLevel]}
            className={CONFIDENCE_STYLES[item.dataConfidenceLevel]}
          />
        </div>

        <button
          onClick={() => setShowWhy((s) => !s)}
          className="mt-3 text-xs font-medium text-beige-500 underline underline-offset-2"
        >
          {showWhy ? "Skrýt výpočet" : "PROČ?"}
        </button>

        {showWhy && (
          <div className="mt-3 space-y-2 rounded-lg bg-beige-50 p-3 text-[11px] text-muted">
            <Row label="Kupní cena v analýze" value={formatCZK(item.why.purchasePrice)} />
            <Row label="Rekonstrukce" value={formatCZK(item.why.costs.renovation)} />
            <Row label="Vybavení" value={formatCZK(item.why.costs.furnishing)} />
            <Row label="Právní + financování + ostatní + rezerva" value={formatCZK(item.why.costs.legal + item.why.costs.financing + item.why.costs.other + item.why.costs.reserve)} />
            <Row label="Celková investice" value={formatCZK(item.why.totalInvestment)} strong />
            <Row label="Konzervativní prodejní cena" value={formatCZK(item.why.saleConservative)} />
            <Row label="= Hrubý zisk" value={formatCZK(item.why.grossProfit)} strong />
            <Row label="Marže" value={formatPct(item.why.marginPct)} />
            {item.why.bands && (
              <Row
                label="Pásma (kupuj hned / dobrá / normální)"
                value={`${formatCZK(item.why.bands.buyNowThreshold)} / ${formatCZK(item.why.bands.goodThreshold)} / ${formatCZK(item.why.bands.normalThreshold)}`}
              />
            )}
            <div className="pt-1 font-medium text-ink">Zdroje dat</div>
            <Row
              label="Comparables"
              value={
                item.why.comparablesCount > 0
                  ? `${item.why.comparablesCount} zdrojů, průměr ${formatCZK(item.why.comparablesAvgPricePerM2)}/m²`
                  : "žádné — prodejní cena je bez podkladu"
              }
            />
            {item.why.sourceUrl && (
              <Row
                label="Inzerát"
                value={
                  <a href={item.why.sourceUrl} target="_blank" rel="noreferrer" className="text-beige-500 underline">
                    {item.why.portal || "zdroj"}
                  </a>
                }
              />
            )}
            <div className="pt-1 font-medium text-ink">Data confidence</div>
            {item.why.confidenceBreakdown.map((b) => (
              <Row key={b.label} label={b.label} value={b.value} tone={b.ok ? "good" : undefined} />
            ))}
            <Row
              label="ARV (hodnota po rekonstrukci)"
              value={
                item.why.arv.insufficientData
                  ? "NEDOSTATEK DAT"
                  : `${formatCZK(item.why.arv.base)} (${item.why.arv.confidence === "HIGH" ? "vysoká jistota" : item.why.arv.confidence === "MEDIUM" ? "střední jistota" : "nízká jistota"})`
              }
              tone={!item.why.arv.insufficientData && item.why.arv.confidence !== "LOW" ? "good" : undefined}
            />
            {overstatesConfidence && (
              <div className="rounded-md bg-band-normalBg p-2 text-band-normal">
                Cenové pásmo napovídá dobrou cenu, ale data (comps / ARV / kritická pole) nejsou dostatečně ověřená —
                než se rozhodneš, ověř zdroje ručně.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  className
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  className?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`font-medium number-tabular ${
          tone === "good" ? "text-band-good" : tone === "bad" ? "text-band-bad" : "text-ink"
        } ${className ?? ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "good";
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "font-semibold text-ink" : ""}`}>
      <span>{label}</span>
      <span className={tone === "good" ? "text-band-good" : ""}>{value}</span>
    </div>
  );
}
