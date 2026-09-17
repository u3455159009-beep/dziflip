"use client";

import { useState } from "react";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import { formatCZK, formatDate, formatPct } from "@/lib/format";
import type { PriceHistoryDTO } from "@/lib/project-types";

export function PriceDropWatch({
  projectId,
  history: initial
}: {
  projectId: string;
  history: PriceHistoryDTO[];
}) {
  const [history, setHistory] = useState(initial);
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function recordPrice() {
    const price = Number(newPrice);
    if (!Number.isFinite(price) || price <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/price-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price })
      });
      if (res.ok) {
        setHistory((h) => [...h, { id: `tmp-${Date.now()}`, projectId, price, recordedAt: new Date().toISOString(), source: "MANUAL" }]);
        setNewPrice("");
      }
    } finally {
      setSaving(false);
    }
  }

  const first = history[0];
  const last = history[history.length - 1];
  const diff = first && last ? last.price - first.price : null;
  const diffPct = first && diff !== null && first.price ? diff / first.price : null;

  return (
    <Card>
      <SectionTitle subtitle="Historie nabídkové ceny. Po změně ceny se ekonomika flipu (max. nákupní cena, zisk, ROI) přepočítá automaticky, protože vychází vždy z aktuální kupní ceny v analýze.">
        Price Drop Watch
      </SectionTitle>

      {history.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádná historie ceny.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between border-b border-line/60 py-1.5">
              <span className="text-muted">
                {formatDate(h.recordedAt)}
                <span className="ml-2 text-[10px] uppercase text-muted/70">
                  {h.source === "WATCHER" ? "Deal Radar" : h.source === "SEED" ? "počáteční" : "ručně"}
                </span>
              </span>
              <span className="font-medium number-tabular">{formatCZK(h.price)}</span>
            </li>
          ))}
        </ul>
      )}

      {diff !== null && diff !== 0 && (
        <div className={`mt-4 rounded-lg p-4 text-sm ${diff < 0 ? "bg-band-goodBg text-band-good" : "bg-band-badBg text-band-bad"}`}>
          Rozdíl od první zaznamenané ceny: <b className="number-tabular">{formatCZK(diff)}</b> ({diffPct !== null ? formatPct(diffPct) : "—"})
        </div>
      )}

      <div className="mt-5 flex items-end gap-3">
        <Input label="Nová zjištěná cena (Kč)" type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
        <Button variant="secondary" onClick={recordPrice} disabled={saving}>
          {saving ? "Ukládám…" : "Zaznamenat cenu"}
        </Button>
      </div>
    </Card>
  );
}
