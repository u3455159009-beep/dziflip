"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCZK, formatDate, formatPct } from "@/lib/format";
import { FLIP_BAND_ICONS, FLIP_BAND_LABELS, type FlipBand } from "@/lib/calc";
import { ALERT_REASON_LABELS } from "@/lib/types";

export interface AlertItem {
  id: string;
  reason: string;
  band: string | null;
  askingPrice: number | null;
  pricePerM2: number | null;
  expectedProfit: number | null;
  roiPct: number | null;
  createdAt: string;
  readAt: string | null;
  watcher: { id: string; name: string } | null;
  project: {
    id: string;
    title: string | null;
    municipality: string | null;
    district: string | null;
    disposition: string | null;
    areaM2: number | null;
    sourceUrl: string | null;
    isDemo: boolean;
    photos: { url: string }[];
  };
  notifications: Array<{ channel: string; status: string; detail: string | null }>;
}

const BAND_STYLES: Record<string, string> = {
  BUY_NOW: "bg-band-hotBg border-band-hot/40 text-band-hot",
  GOOD: "bg-band-goodBg border-band-good/40 text-band-good",
  NORMAL: "bg-band-normalBg border-band-normal/40 text-band-normal",
  BAD: "bg-band-badBg border-band-bad/40 text-band-bad"
};

export function AlertsInbox({ initialAlerts }: { initialAlerts: AlertItem[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [onlyUnread, setOnlyUnread] = useState(false);

  async function markRead(id: string, read: boolean) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, readAt: read ? new Date().toISOString() : null } : a)));
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read })
    });
  }

  const visible = onlyUnread ? alerts.filter((a) => !a.readAt) : alerts;
  const unreadCount = alerts.filter((a) => !a.readAt).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted">{unreadCount} nepřečtených z {alerts.length} celkem</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
          Jen nepřečtené
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">Žádné alerty.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <div
              key={a.id}
              className={`flex gap-4 rounded-xl2 border p-4 shadow-card ${
                a.readAt ? "border-line bg-card" : "border-beige-400 bg-beige-50"
              }`}
            >
              {a.project.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.project.photos[0].url} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-beige-100 text-[10px] text-muted">
                  Bez foto
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    {ALERT_REASON_LABELS[a.reason as keyof typeof ALERT_REASON_LABELS] ?? a.reason}
                  </span>
                  {a.band && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BAND_STYLES[a.band]}`}>
                      {FLIP_BAND_ICONS[a.band as FlipBand]} {FLIP_BAND_LABELS[a.band as FlipBand]}
                    </span>
                  )}
                  {a.project.isDemo && (
                    <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium uppercase text-paper">
                      DEMO
                    </span>
                  )}
                  <span className="text-[11px] text-muted">{formatDate(a.createdAt)}</span>
                  {a.watcher && <span className="text-[11px] text-muted">· hlídač {a.watcher.name}</span>}
                </div>
                <Link href={`/project/${a.project.id}`} className="mt-1 block truncate font-medium text-ink hover:text-beige-500">
                  {a.project.title || "Nepojmenovaná nemovitost"}
                </Link>
                <div className="text-xs text-muted">
                  {[a.project.municipality, a.project.district, a.project.disposition, a.project.areaM2 ? `${a.project.areaM2} m²` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                  <span>Cena: <b className="number-tabular">{formatCZK(a.askingPrice)}</b></span>
                  <span>Kč/m²: <b className="number-tabular">{formatCZK(a.pricePerM2)}</b></span>
                  <span>Zisk: <b className="number-tabular">{formatCZK(a.expectedProfit)}</b></span>
                  <span>ROI: <b className="number-tabular">{formatPct(a.roiPct)}</b></span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {a.project.sourceUrl && (
                    <a href={a.project.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-beige-500 underline underline-offset-2">
                      Původní inzerát
                    </a>
                  )}
                  <button onClick={() => markRead(a.id, !a.readAt)} className="text-xs text-muted hover:text-ink">
                    {a.readAt ? "označit jako nepřečtené" : "označit jako přečtené"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
