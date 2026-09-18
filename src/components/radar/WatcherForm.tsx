"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import type { WatcherDTO } from "@/lib/watcher-types";

interface SourceProviderInfo {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote: string | null;
}

const DISPOSITION_OPTIONS = ["1+kk", "1+1", "2+kk", "2+1", "3+kk", "3+1", "4+kk", "4+1"];

export interface WatcherFormValues {
  name: string;
  municipality: string;
  district: string;
  dispositions: string[];
  minAreaM2: string;
  maxAreaM2: string;
  maxAskingPrice: string;
  maxPricePerM2: string;
  condition: string;
  ownership: string;
  minProfit: string;
  minRoiPct: string;
  maxRenovationEstimate: string;
  requiredReserve: string;
  onlyNewListings: boolean;
  trackPriceChanges: boolean;
  sources: string[];
}

const EMPTY: WatcherFormValues = {
  name: "",
  municipality: "",
  district: "",
  dispositions: [],
  minAreaM2: "",
  maxAreaM2: "",
  maxAskingPrice: "",
  maxPricePerM2: "",
  condition: "",
  ownership: "",
  minProfit: "",
  minRoiPct: "",
  maxRenovationEstimate: "",
  requiredReserve: "",
  onlyNewListings: false,
  trackPriceChanges: true,
  sources: ["MOCK_DEMO"]
};

export function watcherToFormValues(w: WatcherDTO): WatcherFormValues {
  return {
    name: w.name,
    municipality: w.municipality ?? "",
    district: w.district ?? "",
    dispositions: w.dispositions ? w.dispositions.split(",").map((d) => d.trim()) : [],
    minAreaM2: w.minAreaM2?.toString() ?? "",
    maxAreaM2: w.maxAreaM2?.toString() ?? "",
    maxAskingPrice: w.maxAskingPrice?.toString() ?? "",
    maxPricePerM2: w.maxPricePerM2?.toString() ?? "",
    condition: w.condition ?? "",
    ownership: w.ownership ?? "",
    minProfit: w.minProfit?.toString() ?? "",
    minRoiPct: w.minRoiPct != null ? String(Math.round(w.minRoiPct * 1000) / 10) : "",
    maxRenovationEstimate: w.maxRenovationEstimate?.toString() ?? "",
    requiredReserve: w.requiredReserve?.toString() ?? "",
    onlyNewListings: w.onlyNewListings,
    trackPriceChanges: w.trackPriceChanges,
    sources: w.sources.split(",").map((s) => s.trim())
  };
}

export function formValuesToPayload(v: WatcherFormValues) {
  return {
    name: v.name,
    municipality: v.municipality || null,
    district: v.district || null,
    dispositions: v.dispositions.length ? v.dispositions.join(",") : null,
    minAreaM2: v.minAreaM2 || null,
    maxAreaM2: v.maxAreaM2 || null,
    maxAskingPrice: v.maxAskingPrice || null,
    maxPricePerM2: v.maxPricePerM2 || null,
    condition: v.condition || null,
    ownership: v.ownership || null,
    minProfit: v.minProfit || null,
    minRoiPct: v.minRoiPct ? Number(v.minRoiPct) / 100 : null,
    maxRenovationEstimate: v.maxRenovationEstimate || null,
    requiredReserve: v.requiredReserve || null,
    onlyNewListings: v.onlyNewListings,
    trackPriceChanges: v.trackPriceChanges,
    sources: v.sources.join(",")
  };
}

export function WatcherForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel
}: {
  initial?: WatcherFormValues;
  onSubmit: (values: WatcherFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState<WatcherFormValues>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<SourceProviderInfo[]>([]);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => {});
  }, []);

  function set<K extends keyof WatcherFormValues>(key: K, v: WatcherFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function toggleDisposition(d: string) {
    set(
      "dispositions",
      values.dispositions.includes(d)
        ? values.dispositions.filter((x) => x !== d)
        : [...values.dispositions, d]
    );
  }

  function toggleSource(key: string) {
    set(
      "sources",
      values.sources.includes(key) ? values.sources.filter((x) => x !== key) : [...values.sources, key]
    );
  }

  async function handleSubmit() {
    if (!values.name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 rounded-lg border border-line bg-beige-50 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Název hlídače" value={values.name} onChange={(e) => set("name", e.target.value)} />
        <Input label="Obec / lokalita" value={values.municipality} onChange={(e) => set("municipality", e.target.value)} />
        <Input label="Městská část" value={values.district} onChange={(e) => set("district", e.target.value)} />
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">Dispozice</span>
        <div className="flex flex-wrap gap-2">
          {DISPOSITION_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDisposition(d)}
              className={`rounded-full border px-3 py-1 text-xs ${
                values.dispositions.includes(d)
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-card text-muted hover:text-ink"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="Min. plocha (m²)" type="number" value={values.minAreaM2} onChange={(e) => set("minAreaM2", e.target.value)} />
        <Input label="Max. plocha (m²)" type="number" value={values.maxAreaM2} onChange={(e) => set("maxAreaM2", e.target.value)} />
        <Input label="Max. nabídková cena (Kč)" type="number" value={values.maxAskingPrice} onChange={(e) => set("maxAskingPrice", e.target.value)} />
        <Input label="Max. Kč/m²" type="number" value={values.maxPricePerM2} onChange={(e) => set("maxPricePerM2", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="Stav nemovitosti (klíčové slovo)" value={values.condition} onChange={(e) => set("condition", e.target.value)} />
        <Select label="Vlastnictví" value={values.ownership} onChange={(e) => set("ownership", e.target.value)}>
          <option value="">Kterékoliv</option>
          <option value="OSOBNI">Osobní</option>
          <option value="DRUZSTEVNI">Družstevní</option>
        </Select>
        <Input label="Min. požadovaný zisk (Kč)" type="number" value={values.minProfit} onChange={(e) => set("minProfit", e.target.value)} />
        <Input label="Min. ROI (%)" type="number" value={values.minRoiPct} onChange={(e) => set("minRoiPct", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="Max. odhad rekonstrukce (Kč)" type="number" value={values.maxRenovationEstimate} onChange={(e) => set("maxRenovationEstimate", e.target.value)} />
        <Input label="Požadovaná rezerva (Kč)" type="number" value={values.requiredReserve} onChange={(e) => set("requiredReserve", e.target.value)} />
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <input type="checkbox" checked={values.onlyNewListings} onChange={(e) => set("onlyNewListings", e.target.checked)} />
          Pouze nové nabídky
        </label>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <input type="checkbox" checked={values.trackPriceChanges} onChange={(e) => set("trackPriceChanges", e.target.checked)} />
          Sledovat změny ceny
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">Zdroje dat</span>
        <div className="flex flex-wrap gap-3">
          {providers.map((p) => (
            <label
              key={p.key}
              className={`flex items-center gap-2 text-sm ${p.status === "PENDING_ACCESS" ? "text-muted" : ""}`}
              title={p.statusNote ?? undefined}
            >
              <input type="checkbox" checked={values.sources.includes(p.key)} onChange={() => toggleSource(p.key)} />
              {p.label}{" "}
              {p.status === "ACTIVE" ? (
                <span className="text-band-good">(aktivní)</span>
              ) : (
                <span className="text-band-normal">(čeká na povolený přístup)</span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Zrušit
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Ukládám…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
