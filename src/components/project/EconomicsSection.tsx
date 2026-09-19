"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Input, SectionTitle } from "@/components/ui";
import { formatCZK, formatPct } from "@/lib/format";
import {
  DEFAULT_ASSUMPTIONS,
  FLIP_BAND_ICONS,
  FLIP_BAND_LABELS,
  RENOVATION_DELTAS,
  SALE_PRICE_DELTAS,
  classifyPrice,
  computeBands,
  computeEconomics,
  computeMaxBuyPrice,
  computeSensitivityMatrix,
  type AssumptionsInput,
  type FlipBand
} from "@/lib/calc";
import type { AssumptionsDTO } from "@/lib/project-types";

function toInput(a: AssumptionsDTO | null): AssumptionsInput {
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

function useDebouncedSave(projectId: string, value: AssumptionsInput) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/assumptions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value)
      }).catch(() => {});
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [projectId, value]);
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  hint
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div>
      <Input
        label={label + (suffix ? ` (${suffix})` : "")}
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

const BAND_ORDER: FlipBand[] = ["BUY_NOW", "GOOD", "NORMAL", "BAD"];
const BAND_STYLES: Record<FlipBand, string> = {
  BUY_NOW: "bg-band-hotBg border-band-hot/40 text-band-hot",
  GOOD: "bg-band-goodBg border-band-good/40 text-band-good",
  NORMAL: "bg-band-normalBg border-band-normal/40 text-band-normal",
  BAD: "bg-band-badBg border-band-bad/40 text-band-bad",
  UNKNOWN: "bg-beige-50 border-line text-muted"
};

export function EconomicsSection({
  projectId,
  areaM2,
  askingPrice,
  targetPrice,
  assumptions
}: {
  projectId: string;
  areaM2: number | null;
  askingPrice: number | null;
  targetPrice: number | null;
  assumptions: AssumptionsDTO | null;
}) {
  const [a, setA] = useState<AssumptionsInput>(() => {
    const base = toInput(assumptions);
    if (base.purchasePriceUsed === null) base.purchasePriceUsed = targetPrice ?? askingPrice ?? null;
    return base;
  });

  useDebouncedSave(projectId, a);

  function set<K extends keyof AssumptionsInput>(key: K, v: AssumptionsInput[K]) {
    setA((prev) => ({ ...prev, [key]: v }));
  }

  // A missing purchase price is unknown, never 0 Kč (item 13) — an
  // "acquired for free" phantom would otherwise inflate every profit figure.
  const purchasePrice: number | null = a.purchasePriceUsed && a.purchasePriceUsed > 0 ? a.purchasePriceUsed : null;
  const maxBuy = useMemo(() => computeMaxBuyPrice(a), [a]);
  const bands = useMemo(() => computeBands(a), [a]);
  const currentBand = useMemo(() => (purchasePrice !== null ? classifyPrice(purchasePrice, bands) : "UNKNOWN"), [purchasePrice, bands]);
  const economics = useMemo(() => (purchasePrice !== null ? computeEconomics(purchasePrice, a, areaM2) : null), [purchasePrice, a, areaM2]);
  const matrix = useMemo(() => (purchasePrice !== null ? computeSensitivityMatrix(purchasePrice, a) : []), [purchasePrice, a]);

  const hasSaleData = a.saleBase !== null && a.saleBase !== undefined && a.saleBase > 0;
  const bandsKnown = bands.goodThreshold !== null;

  return (
    <div className="space-y-8">
      <Card>
        <SectionTitle subtitle="Všechny hranice se počítají matematicky z čísel níže — nikoliv odhadem AI. Změna kteréhokoliv čísla okamžitě přepočítá celou analýzu.">
          Parametry flipu
        </SectionTitle>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumField label="Kupní cena použitá v analýze" suffix="Kč" value={a.purchasePriceUsed} onChange={(v) => set("purchasePriceUsed", v)} />
          <NumField label="Konzervativní prodejní cena" suffix="Kč" value={a.saleConservative} onChange={(v) => set("saleConservative", v)} />
          <NumField label="Základní prodejní cena" suffix="Kč" value={a.saleBase} onChange={(v) => set("saleBase", v)} />
          <NumField label="Optimistická prodejní cena" suffix="Kč" value={a.saleOptimistic} onChange={(v) => set("saleOptimistic", v)} />
          <NumField label="Náklady rekonstrukce" suffix="Kč" value={a.renovationCost} onChange={(v) => set("renovationCost", v)} />
          <NumField label="Vybavení a nábytek" suffix="Kč" value={a.furnishingCost} onChange={(v) => set("furnishingCost", v)} />
          <NumField label="Právní náklady" suffix="Kč" value={a.legalCosts} onChange={(v) => set("legalCosts", v)} />
          <NumField label="Náklady financování" suffix="Kč" value={a.financingCost} onChange={(v) => set("financingCost", v)} />
          <NumField label="Další náklady" suffix="Kč" value={a.otherCosts} onChange={(v) => set("otherCosts", v)} />
          <NumField label="Rezerva" suffix="Kč" value={a.reserve} onChange={(v) => set("reserve", v)} />
          <NumField label="Min. požadovaný zisk" suffix="Kč" value={a.minProfit} onChange={(v) => set("minProfit", v)} />
          <NumField
            label="Min. marže"
            suffix="%"
            value={a.minMarginPct !== null ? Math.round((a.minMarginPct ?? 0) * 1000) / 10 : null}
            onChange={(v) => set("minMarginPct", v === null ? null : v / 100)}
          />
          <NumField
            label="Min. ROI"
            suffix="%"
            value={a.minRoiPct !== null ? Math.round((a.minRoiPct ?? 0) * 1000) / 10 : null}
            onChange={(v) => set("minRoiPct", v === null ? null : v / 100)}
          />
          <NumField
            label="Daň z příjmu (na zisk)"
            suffix="%"
            value={a.incomeTaxPct !== null ? Math.round((a.incomeTaxPct ?? 0) * 1000) / 10 : null}
            onChange={(v) => set("incomeTaxPct", v === null ? null : v / 100)}
            hint="Volitelné — ovlivňuje jen odhad čistého zisku."
          />
          <NumField
            label="Šířka pásem NORMÁLNÍ / KUPUJ HNED"
            suffix="%"
            value={a.bandWidthPct !== null ? Math.round((a.bandWidthPct ?? 0) * 1000) / 10 : null}
            onChange={(v) => set("bandWidthPct", v === null ? null : v / 100)}
            hint="Procentní odchylka od hranice DOBRÁ cena definující šířku sousedních pásem."
          />
        </div>
      </Card>

      <Card>
        <SectionTitle subtitle="Pásma jsou vypočítána z konzervativní prodejní ceny a vašich minimálních požadavků na zisk, marži a ROI.">
          Flip Score
        </SectionTitle>
        {!bandsKnown ? (
          <p className="text-sm text-muted">
            Doplňte konzervativní prodejní cenu (ručně, nebo automaticky z Tržní hodnoty / ARV výše), aby bylo možné
            vypočítat cenová pásma.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {BAND_ORDER.map((band) => (
                <div
                  key={band}
                  className={`rounded-lg border p-4 text-center ${BAND_STYLES[band]} ${
                    currentBand === band ? "ring-2 ring-offset-2 ring-offset-paper ring-ink/20" : ""
                  }`}
                >
                  <div className="text-2xl">{FLIP_BAND_ICONS[band]}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wide">{FLIP_BAND_LABELS[band]}</div>
                  <div className="mt-1 text-xs number-tabular">{bandRangeLabel(band, bands)}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-beige-50 p-4 text-sm">
              <span className="text-muted">
                Aktuální kupní cena v analýze ({formatCZK(purchasePrice)}) spadá do pásma:
              </span>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium ${BAND_STYLES[currentBand]}`}>
                {FLIP_BAND_ICONS[currentBand]} {FLIP_BAND_LABELS[currentBand]}
              </span>
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle subtitle="MAX BUY PRICE = konzervativní prodejní cena − rekonstrukce − vybavení − transakční náklady − financování − rezerva − požadovaný zisk (nejpřísnější z podmínek zisk/marže/ROI).">
          Maximální nákupní cena
        </SectionTitle>
        <div className="font-serif text-4xl text-ink number-tabular">
          {maxBuy !== null ? formatCZK(maxBuy) : "—"}
        </div>
        {maxBuy === null && (
          <p className="mt-2 text-sm text-muted">
            Nelze vypočítat — chybí konzervativní prodejní cena (doplňte ji ručně, nebo počkejte na automatický
            odhad z Tržní hodnoty / ARV, jakmile bude dost srovnatelných nabídek).
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle subtitle="Nabídkové ceny scénářů nejsou jistotou. Optimistický scénář neprezentujeme jako pravděpodobný výsledek.">
          Ekonomika flipu
        </SectionTitle>
        {!economics ? (
          <p className="text-sm text-muted">
            Nelze vypočítat — chybí kupní cena (doplňte ji ručně výše, nebo cílovou/nabídkovou cenu na začátku stránky).
          </p>
        ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              <Row label="Kupní cena" value={formatCZK(economics.purchasePrice)} />
              <Row label="Cena za m²" value={formatCZK(economics.pricePerM2)} />
              <Row label="Rekonstrukce" value={formatCZK(economics.costs.renovation)} />
              <Row label="Nábytek a vybavení" value={formatCZK(economics.costs.furnishing)} />
              <Row label="Právní náklady" value={formatCZK(economics.costs.legal)} />
              <Row label="Financování" value={formatCZK(economics.costs.financing)} />
              <Row label="Další náklady" value={formatCZK(economics.costs.other)} />
              <Row label="Rezerva" value={formatCZK(economics.costs.reserve)} />
              <Row label="CELKOVÁ INVESTICE" value={formatCZK(economics.totalInvestment)} strong />
            </tbody>
          </table>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3"></th>
                <th className="py-2 pr-3 text-right">Konzervativní</th>
                <th className="py-2 pr-3 text-right">Základní</th>
                <th className="py-2 pr-3 text-right">Optimistický</th>
              </tr>
            </thead>
            <tbody className="number-tabular">
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-3 text-muted">Očekávaná prodejní cena</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.conservative.salePrice)}</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.base.salePrice)}</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.optimistic.salePrice)}</td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-3 text-muted">Hrubý zisk</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.conservative.grossProfit)}</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.base.grossProfit)}</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.optimistic.grossProfit)}</td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-3 text-muted">Odhad čistého zisku</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.conservative.netProfit)}</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.base.netProfit)}</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(economics.scenarios.optimistic.netProfit)}</td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-3 text-muted">Marže</td>
                <td className="py-2.5 pr-3 text-right">{formatPct(economics.scenarios.conservative.marginPct)}</td>
                <td className="py-2.5 pr-3 text-right">{formatPct(economics.scenarios.base.marginPct)}</td>
                <td className="py-2.5 pr-3 text-right">{formatPct(economics.scenarios.optimistic.marginPct)}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-muted">ROI</td>
                <td className="py-2.5 pr-3 text-right">{formatPct(economics.scenarios.conservative.roiPct)}</td>
                <td className="py-2.5 pr-3 text-right">{formatPct(economics.scenarios.base.roiPct)}</td>
                <td className="py-2.5 pr-3 text-right">{formatPct(economics.scenarios.optimistic.roiPct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        </>
        )}
      </Card>

      <Card>
        <SectionTitle subtitle="Osa X: změna prodejní ceny. Osa Y: změna nákladů rekonstrukce. V každém políčku je výsledný hrubý zisk (základní prodejní cena, aktuální kupní cena).">
          Citlivostní analýza
        </SectionTitle>
        {matrix.length === 0 ? (
          <p className="text-sm text-muted">Nelze vypočítat — chybí základní prodejní cena.</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm number-tabular">
            <thead>
              <tr>
                <th className="py-2 pr-3 text-left text-xs uppercase tracking-wide text-muted">
                  Rekonstrukce ↓ / Cena →
                </th>
                {SALE_PRICE_DELTAS.map((d) => (
                  <th key={d} className="py-2 px-3 text-right text-xs uppercase tracking-wide text-muted">
                    {d > 0 ? "+" : ""}
                    {Math.round(d * 100)} %
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="py-2 pr-3 text-xs text-muted">
                    {RENOVATION_DELTAS[i] > 0 ? "+" : ""}
                    {Math.round(RENOVATION_DELTAS[i] * 100)} %
                  </td>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`py-2 px-3 text-right ${
                        cell.grossProfit >= 0 ? "text-band-good" : "text-band-bad"
                      }`}
                    >
                      {formatCZK(cell.grossProfit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}

function bandRangeLabel(band: FlipBand, bands: ReturnType<typeof computeBands>): string {
  switch (band) {
    case "BUY_NOW":
      return `do ${formatCZK(bands.buyNowThreshold)}`;
    case "GOOD":
      return `${formatCZK(bands.buyNowThreshold)} – ${formatCZK(bands.goodThreshold)}`;
    case "NORMAL":
      return `${formatCZK(bands.goodThreshold)} – ${formatCZK(bands.normalThreshold)}`;
    case "BAD":
      return `nad ${formatCZK(bands.normalThreshold)}`;
    case "UNKNOWN":
      return "—";
  }
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t border-line" : "border-b border-line/60"}>
      <td className={`py-2.5 pr-3 ${strong ? "font-semibold text-ink" : "text-muted"}`}>{label}</td>
      <td className={`py-2.5 text-right number-tabular ${strong ? "font-semibold text-ink" : ""}`}>{value}</td>
    </tr>
  );
}
