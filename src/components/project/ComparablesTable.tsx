"use client";

import { Fragment, useMemo, useState } from "react";
import { Button, Card, Input, SectionTitle, Select } from "@/components/ui";
import { formatCZK, formatDateTime, formatNumber } from "@/lib/format";
import { computeComparableStats } from "@/lib/calc";
import { PRICE_TYPE_LABELS, PRICE_TYPES, COMP_QUALITY_TIER_LABELS, type CompQualityTier } from "@/lib/types";
import type { ComparableDTO } from "@/lib/project-types";

const emptyForm = {
  title: "",
  url: "",
  portal: "",
  locality: "",
  disposition: "",
  areaM2: "",
  price: "",
  condition: "",
  distanceKm: "",
  priceType: "ASKING" as string,
  ownership: "",
  floor: "",
  totalFloors: "",
  elevator: "",
  balcony: "",
  terrace: "",
  loggia: "",
  parking: "",
  buildingType: "",
  construction: ""
};

const DIMENSION_LABELS: Record<string, string> = {
  locality: "lokalita",
  distance: "vzdálenost",
  disposition: "dispozice",
  area: "plocha",
  condition: "stav",
  buildingType: "typ domu",
  ownership: "vlastnictví",
  floor: "patro",
  elevator: "výtah",
  amenities: "balkon/terasa/lodžie",
  parking: "parkování",
  recency: "stáří nabídky"
};

const QUALITY_TIER_STYLES: Record<string, string> = {
  HIGH: "bg-band-good/10 text-band-good",
  MEDIUM: "bg-band-warn/10 text-band-warn",
  LOW: "bg-band-bad/10 text-band-bad"
};

function BoolSelect({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Neznámé</option>
      <option value="true">Ano</option>
      <option value="false">Ne</option>
    </Select>
  );
}

export function ComparablesTable({
  projectId,
  comparables: initial,
  discoveryNote,
  lastDiscoveryAt
}: {
  projectId: string;
  comparables: ComparableDTO[];
  discoveryNote?: string | null;
  lastDiscoveryAt?: string | null;
}) {
  const [comparables, setComparables] = useState(initial);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState(discoveryNote ?? null);
  const [lastAt, setLastAt] = useState(lastDiscoveryAt ?? null);

  async function refreshComparables() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comparables/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true })
      });
      const data = await res.json();
      if (res.ok) {
        setNote(data.note ?? null);
        setLastAt(new Date().toISOString());
        const refreshed = await fetch(`/api/projects/${projectId}`);
        if (refreshed.ok) {
          const project = await refreshed.json();
          setComparables(project.comparables ?? []);
        }
      } else {
        setNote(data.error ?? "Vyhledání srovnatelných nabídek selhalo.");
      }
    } finally {
      setRefreshing(false);
    }
  }

  const stats = useMemo(
    () => computeComparableStats(comparables.map((c) => c.pricePerM2 ?? NaN)),
    [comparables]
  );

  async function addComparable() {
    if (!form.title && !form.url) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comparables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          areaM2: form.areaM2 || null,
          price: form.price || null,
          distanceKm: form.distanceKm || null,
          elevator: form.elevator === "" ? undefined : form.elevator === "true",
          balcony: form.balcony === "" ? undefined : form.balcony === "true",
          terrace: form.terrace === "" ? undefined : form.terrace === "true",
          loggia: form.loggia === "" ? undefined : form.loggia === "true",
          parking: form.parking === "" ? undefined : form.parking === "true"
        })
      });
      if (res.ok) {
        const created = await res.json();
        setComparables((prev) => [created, ...prev]);
        setForm(emptyForm);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setComparables((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/projects/${projectId}/comparables/${id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <SectionTitle subtitle="Srovnatelné nemovitosti v lokalitě. Nabídkové ceny nejsou automaticky realizované prodejní ceny — typ ceny je vždy vyznačen. Comparable Discovery Engine hledá srovnání automaticky přes aktivní zdroje (viz Nastavení → Provider Health) — ručně je doplňte, jen pokud automatické vyhledání nestačí.">
          Cenový engine — srovnatelné nemovitosti
        </SectionTitle>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={refreshComparables} disabled={refreshing}>
            {refreshing ? "Vyhledávám…" : "↻ Aktualizovat srovnání"}
          </Button>
          <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
            {open ? "Zavřít" : "+ Přidat ručně"}
          </Button>
        </div>
      </div>

      {note && (
        <p className="mb-4 text-xs text-muted">
          {note}
          {lastAt && ` (naposledy ${formatDateTime(lastAt)})`}
        </p>
      )}

      {open && (
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-line bg-beige-50 p-4 sm:grid-cols-3">
          <Input label="Název" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Input label="URL" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          <Input label="Portál" value={form.portal} onChange={(e) => setForm((f) => ({ ...f, portal: e.target.value }))} />
          <Input label="Lokalita" value={form.locality} onChange={(e) => setForm((f) => ({ ...f, locality: e.target.value }))} />
          <Input label="Dispozice" value={form.disposition} onChange={(e) => setForm((f) => ({ ...f, disposition: e.target.value }))} />
          <Input label="Plocha (m²)" type="number" value={form.areaM2} onChange={(e) => setForm((f) => ({ ...f, areaM2: e.target.value }))} />
          <Input label="Cena (Kč)" type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          <Input label="Stav" value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))} />
          <Input label="Vzdálenost (km)" type="number" value={form.distanceKm} onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))} />
          <Select label="Typ ceny" value={form.priceType} onChange={(e) => setForm((f) => ({ ...f, priceType: e.target.value }))}>
            {PRICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRICE_TYPE_LABELS[t as keyof typeof PRICE_TYPE_LABELS]}
              </option>
            ))}
          </Select>
          <Input label="Vlastnictví" value={form.ownership} onChange={(e) => setForm((f) => ({ ...f, ownership: e.target.value }))} />
          <Input label="Patro" value={form.floor} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} />
          <Input label="Počet podlaží" value={form.totalFloors} onChange={(e) => setForm((f) => ({ ...f, totalFloors: e.target.value }))} />
          <Input label="Typ domu" value={form.buildingType} onChange={(e) => setForm((f) => ({ ...f, buildingType: e.target.value }))} />
          <Input label="Konstrukce" value={form.construction} onChange={(e) => setForm((f) => ({ ...f, construction: e.target.value }))} />
          <BoolSelect label="Výtah" value={form.elevator} onChange={(v) => setForm((f) => ({ ...f, elevator: v }))} />
          <BoolSelect label="Balkon" value={form.balcony} onChange={(v) => setForm((f) => ({ ...f, balcony: v }))} />
          <BoolSelect label="Terasa" value={form.terrace} onChange={(v) => setForm((f) => ({ ...f, terrace: v }))} />
          <BoolSelect label="Lodžie" value={form.loggia} onChange={(v) => setForm((f) => ({ ...f, loggia: v }))} />
          <BoolSelect label="Parkování" value={form.parking} onChange={(v) => setForm((f) => ({ ...f, parking: v }))} />
          <div className="col-span-full flex justify-end">
            <Button onClick={addComparable} disabled={saving}>
              {saving ? "Ukládám…" : "Uložit srovnání"}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Nemovitost</th>
              <th className="py-2 pr-3">Lokalita</th>
              <th className="py-2 pr-3">Dispozice</th>
              <th className="py-2 pr-3 text-right">m²</th>
              <th className="py-2 pr-3 text-right">Cena</th>
              <th className="py-2 pr-3 text-right">Kč/m²</th>
              <th className="py-2 pr-3">Stav</th>
              <th className="py-2 pr-3 text-right">Vzdálenost</th>
              <th className="py-2 pr-3">Typ ceny</th>
              <th className="py-2 pr-3">Podobnost</th>
              <th className="py-2 pr-3">Zdroj</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {comparables.length === 0 && (
              <tr>
                <td colSpan={12} className="py-6 text-center text-sm text-muted">
                  Zatím žádná srovnání. Přidejte srovnatelné nabídky ručně.
                </td>
              </tr>
            )}
            {comparables.map((c) => {
              const tier = c.qualityTier as CompQualityTier | null;
              const breakdown = c.similarityBreakdown ? safeParse(c.similarityBreakdown) : null;
              const isExpanded = expanded === c.id;
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-line/60 number-tabular">
                    <td className="py-2.5 pr-3 max-w-[220px] truncate">{c.title || "—"}</td>
                    <td className="py-2.5 pr-3">{c.locality || "—"}</td>
                    <td className="py-2.5 pr-3">{c.disposition || "—"}</td>
                    <td className="py-2.5 pr-3 text-right">{formatNumber(c.areaM2)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatCZK(c.price)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatCZK(c.pricePerM2)}</td>
                    <td className="py-2.5 pr-3">{c.condition || "—"}</td>
                    <td className="py-2.5 pr-3 text-right">{c.distanceKm ? `${formatNumber(c.distanceKm, 1)} km` : "—"}</td>
                    <td className="py-2.5 pr-3 text-xs">
                      {PRICE_TYPE_LABELS[c.priceType as keyof typeof PRICE_TYPE_LABELS] ?? c.priceType}
                      {c.isOutlier && (
                        <span className="ml-1.5 rounded-full bg-band-bad/10 px-1.5 py-0.5 text-[10px] font-medium text-band-bad" title={c.outlierReason ?? undefined}>
                          OUTLIER
                        </span>
                      )}
                      {c.priceHistory.length > 1 && (
                        <span className="ml-1.5 rounded-full bg-band-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-band-warn">
                          změna ceny ×{c.priceHistory.length - 1}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {tier ? (
                        <button
                          onClick={() => setExpanded(isExpanded ? null : c.id)}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${QUALITY_TIER_STYLES[tier] ?? ""}`}
                        >
                          {c.similarityScore != null ? `${Math.round(c.similarityScore * 100)} %` : "—"} · {COMP_QUALITY_TIER_LABELS[tier]}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-beige-500 underline underline-offset-2">
                          {c.portal || "odkaz"}
                        </a>
                      ) : (
                        c.portal || "—"
                      )}
                      <div className="text-[10px] text-muted">{c.sourceProvider ? "automaticky nalezeno" : "ručně přidáno"}</div>
                    </td>
                    <td className="py-2.5 text-right">
                      <button onClick={() => remove(c.id)} className="text-xs text-muted hover:text-band-bad">
                        smazat
                      </button>
                    </td>
                  </tr>
                  {isExpanded && breakdown && (
                    <tr className="border-b border-line/60 bg-beige-50">
                      <td colSpan={12} className="px-3 py-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted">
                          Proč je tato nemovitost srovnatelná
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(breakdown).map(([key, value]) => (
                            <span key={key} className="rounded-full bg-white px-2.5 py-1 text-xs text-ink shadow-sm">
                              {DIMENSION_LABELS[key] ?? key}: {Math.round((value as number) * 100)} %
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg bg-beige-50 p-4 text-sm sm:grid-cols-4">
        <Stat label="Průměr Kč/m²" value={formatCZK(stats.average)} />
        <Stat label="Medián Kč/m²" value={formatCZK(stats.median)} />
        <Stat
          label="Rozpětí Kč/m²"
          value={stats.min && stats.max ? `${formatCZK(stats.min)} – ${formatCZK(stats.max)}` : "—"}
        />
        <Stat label="Počet srovnání" value={String(stats.count)} />
      </div>
    </Card>
  );
}

function safeParse(json: string): Record<string, number> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-medium text-ink number-tabular">{value}</div>
    </div>
  );
}
