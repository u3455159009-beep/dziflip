"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, SectionTitle, Select } from "@/components/ui";
import { formatCZK, formatDate, formatNumber } from "@/lib/format";
import { computeComparableStats } from "@/lib/calc";
import { PRICE_TYPE_LABELS, PRICE_TYPES } from "@/lib/types";
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
  priceType: "ASKING" as string
};

export function ComparablesTable({
  projectId,
  comparables: initial
}: {
  projectId: string;
  comparables: ComparableDTO[];
}) {
  const [comparables, setComparables] = useState(initial);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
          distanceKm: form.distanceKm || null
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
      <div className="flex items-start justify-between">
        <SectionTitle subtitle="Srovnatelné nemovitosti v lokalitě. Nabídkové ceny nejsou automaticky realizované prodejní ceny — typ ceny je vždy vyznačen.">
          Cenový engine — srovnatelné nemovitosti
        </SectionTitle>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Zavřít" : "+ Přidat srovnání"}
        </Button>
      </div>

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
          <div className="col-span-full flex justify-end">
            <Button onClick={addComparable} disabled={saving}>
              {saving ? "Ukládám…" : "Uložit srovnání"}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
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
              <th className="py-2 pr-3">Zdroj</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {comparables.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-sm text-muted">
                  Zatím žádná srovnání. Přidejte srovnatelné nabídky ručně.
                </td>
              </tr>
            )}
            {comparables.map((c) => (
              <tr key={c.id} className="border-b border-line/60 number-tabular">
                <td className="py-2.5 pr-3 max-w-[220px] truncate">{c.title || "—"}</td>
                <td className="py-2.5 pr-3">{c.locality || "—"}</td>
                <td className="py-2.5 pr-3">{c.disposition || "—"}</td>
                <td className="py-2.5 pr-3 text-right">{formatNumber(c.areaM2)}</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(c.price)}</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(c.pricePerM2)}</td>
                <td className="py-2.5 pr-3">{c.condition || "—"}</td>
                <td className="py-2.5 pr-3 text-right">{c.distanceKm ? `${formatNumber(c.distanceKm, 1)} km` : "—"}</td>
                <td className="py-2.5 pr-3 text-xs">{PRICE_TYPE_LABELS[c.priceType as keyof typeof PRICE_TYPE_LABELS] ?? c.priceType}</td>
                <td className="py-2.5 pr-3">
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-beige-500 underline underline-offset-2">
                      {c.portal || "odkaz"}
                    </a>
                  ) : (
                    c.portal || "—"
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <button onClick={() => remove(c.id)} className="text-xs text-muted hover:text-band-bad">
                    smazat
                  </button>
                </td>
              </tr>
            ))}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-medium text-ink number-tabular">{value}</div>
    </div>
  );
}
