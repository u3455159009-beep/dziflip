"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCZK, formatDate, formatPct } from "@/lib/format";
import { FLIP_BAND_ICONS, FLIP_BAND_LABELS } from "@/lib/calc";
import { DATA_CONFIDENCE_LABELS } from "@/lib/types";
import type { DealFeedItem } from "@/lib/dealFeed";

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

export function DealCard({ item }: { item: DealFeedItem }) {
  const [showWhy, setShowWhy] = useState(false);

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
        {item.isDemo && (
          <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium uppercase text-paper">
            DEMO
          </span>
        )}
        {item.band && (
          <span
            className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${BAND_STYLES[item.band]}`}
          >
            {FLIP_BAND_ICONS[item.band]} {FLIP_BAND_LABELS[item.band]}
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
