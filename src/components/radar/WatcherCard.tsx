"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { formatCZK, formatDate, formatPct } from "@/lib/format";
import { WatcherForm, formValuesToPayload, watcherToFormValues } from "./WatcherForm";
import type { WatcherDTO, WatcherRunSummaryDTO } from "@/lib/watcher-types";

const PROVIDER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "OK",
  PENDING_ACCESS: "Čeká na povolený přístup",
  ERROR: "Chyba",
  UNKNOWN: "Neznámý zdroj"
};

export function WatcherCard({
  watcher: initial,
  onDeleted
}: {
  watcher: WatcherDTO;
  onDeleted: (id: string) => void;
}) {
  const [watcher, setWatcher] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<WatcherRunSummaryDTO | null>(null);
  const [matches, setMatches] = useState<any[] | null>(null);
  const [loadingMatches, setLoadingMatches] = useState(false);

  async function toggleActive() {
    const next = !watcher.active;
    setWatcher((w) => ({ ...w, active: next }));
    await fetch(`/api/watchers/${watcher.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next })
    });
  }

  async function saveEdit(values: Parameters<typeof formValuesToPayload>[0]) {
    const res = await fetch(`/api/watchers/${watcher.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formValuesToPayload(values))
    });
    if (res.ok) {
      const updated = await res.json();
      setWatcher((w) => ({ ...w, ...updated }));
      setEditing(false);
    }
  }

  async function remove() {
    if (!confirm(`Smazat hlídač "${watcher.name}"?`)) return;
    await fetch(`/api/watchers/${watcher.id}`, { method: "DELETE" });
    onDeleted(watcher.id);
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch(`/api/watchers/${watcher.id}/run`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRunResult(data);
        setWatcher((w) => ({ ...w, lastRunAt: new Date().toISOString() }));
        await loadMatches();
      } else {
        alert(data.error || "Spuštění selhalo.");
      }
    } finally {
      setRunning(false);
    }
  }

  async function loadMatches() {
    setLoadingMatches(true);
    try {
      const res = await fetch(`/api/watchers/${watcher.id}`);
      const data = await res.json();
      setMatches(data.projects ?? []);
    } finally {
      setLoadingMatches(false);
    }
  }

  if (editing) {
    return (
      <WatcherForm
        initial={watcherToFormValues(watcher)}
        onSubmit={saveEdit}
        onCancel={() => setEditing(false)}
        submitLabel="Uložit změny"
      />
    );
  }

  return (
    <div className="rounded-xl2 border border-line bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-lg text-ink">{watcher.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                watcher.active ? "bg-band-goodBg text-band-good" : "bg-beige-100 text-muted"
              }`}
            >
              {watcher.active ? "Aktivní" : "Pozastaveno"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {[watcher.municipality, watcher.district, watcher.dispositions].filter(Boolean).join(" · ") ||
              "Bez omezení lokality/dispozice"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {watcher.maxAskingPrice ? `do ${formatCZK(watcher.maxAskingPrice)}` : "bez cenového limitu"}
            {watcher.maxPricePerM2 ? ` · max ${formatCZK(watcher.maxPricePerM2)}/m²` : ""}
            {watcher.minRoiPct ? ` · min. ROI ${formatPct(watcher.minRoiPct)}` : ""}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Zdroje: {watcher.sources.split(",").join(", ")} · Nalezeno projektů: {watcher._count?.projects ?? 0} ·
            Alertů: {watcher._count?.alerts ?? 0}
          </p>
          {watcher.lastRunAt && (
            <p className="mt-1 text-[11px] text-muted">
              Poslední spuštění: {formatDate(watcher.lastRunAt)}
              {watcher.lastRunNote ? ` — ${watcher.lastRunNote}` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Upravit
            </Button>
            <Button onClick={runNow} disabled={running}>
              {running ? "Spouštím…" : "Spustit nyní"}
            </Button>
          </div>
          <div className="flex gap-3 text-xs text-muted">
            <button onClick={toggleActive} className="hover:text-ink">
              {watcher.active ? "pozastavit" : "aktivovat"}
            </button>
            <button onClick={remove} className="hover:text-band-bad">
              smazat
            </button>
          </div>
        </div>
      </div>

      {runResult && (
        <div className="mt-4 rounded-lg bg-beige-50 p-4 text-sm">
          <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 font-medium text-ink">
            <span>Nové: {runResult.newProjects}</span>
            <span>Aktualizace: {runResult.updatedProjects}</span>
            <span>Pokles ceny: {runResult.priceDrops}</span>
            <span>Alerty: {runResult.alerts}</span>
            {runResult.itemErrors > 0 && (
              <span className="text-band-bad">Chyby při zpracování: {runResult.itemErrors}</span>
            )}
          </div>
          <div className="space-y-1 text-xs text-muted">
            {runResult.providers.map((p) => (
              <div key={p.key}>
                <span className="font-medium">{p.label}:</span>{" "}
                {p.note ? p.note : `${PROVIDER_STATUS_LABEL[p.status] ?? p.status} — ${p.itemCount} nabídek`}
              </div>
            ))}
          </div>
        </div>
      )}

      {!matches && (
        <button onClick={loadMatches} className="mt-3 text-xs text-beige-500 underline underline-offset-2">
          {loadingMatches ? "Načítám…" : "Zobrazit nalezené nemovitosti"}
        </button>
      )}

      {matches && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.length === 0 && <p className="text-sm text-muted">Zatím žádné nalezené nemovitosti.</p>}
          {matches.map((p) => (
            <Link
              key={p.id}
              href={`/project/${p.id}`}
              className="rounded-lg border border-line p-3 text-sm hover:border-beige-400"
            >
              <div className="truncate font-medium text-ink">{p.title || "Nepojmenovaná nemovitost"}</div>
              <div className="mt-0.5 text-xs text-muted">{formatCZK(p.askingPrice)}</div>
              {p.isDemo && (
                <div className="mt-1 inline-block rounded-full bg-beige-100 px-2 py-0.5 text-[10px] text-muted">
                  DEMO
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
