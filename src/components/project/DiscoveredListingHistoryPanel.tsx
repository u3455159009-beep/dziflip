"use client";

// Price history for the FlatScan-discovered original listing (item 8).
// Renders nothing unless the Listing Discovery Engine actually matched
// this project to a FlatScan listing. A price drop / long days-on-market
// is shown as a fact only — never as a "buy it" conclusion; that verdict
// stays entirely with the app's own math (Investment Dashboard / Flip Score).
import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { formatCZK, formatPct, formatDate } from "@/lib/format";

interface HistoryResponse {
  available: boolean;
  reason?: string;
  portal?: string | null;
  url?: string | null;
  summary?: {
    originalPrice: number | null;
    currentPrice: number | null;
    dropAmount: number | null;
    dropPct: number | null;
    changeCount: number;
    daysOnMarket: number | null;
  };
  history?: Array<{ price: number | null; recordedAt: string }>;
}

export function DiscoveredListingHistoryPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<HistoryResponse | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/discovered-listing-history`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ available: false }));
  }, [projectId]);

  if (!data || !data.available || !data.summary) return null;
  const s = data.summary;

  return (
    <Card>
      <SectionTitle subtitle={`Historie ceny nalezeného původního inzerátu (${data.portal ?? "FlatScan"}) — fakt k vyjednávání, nikoliv doporučení koupit.`}>
        Historie ceny — nalezený originál
      </SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Původní cena</div>
          <div className="mt-1 text-lg font-medium text-ink number-tabular">{formatCZK(s.originalPrice)}</div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Aktuální cena</div>
          <div className="mt-1 text-lg font-medium text-ink number-tabular">{formatCZK(s.currentPrice)}</div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Pokles</div>
          <div className={`mt-1 text-lg font-medium number-tabular ${s.dropAmount != null && s.dropAmount > 0 ? "text-band-good" : "text-ink"}`}>
            {s.dropAmount != null ? `${formatCZK(s.dropAmount)} (${formatPct(s.dropPct)})` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Dní na trhu</div>
          <div className="mt-1 text-lg font-medium text-ink number-tabular">{s.daysOnMarket ?? "—"}</div>
        </div>
      </div>
      {data.history && data.history.length > 1 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[400px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3 text-right">Cena</th>
              </tr>
            </thead>
            <tbody className="number-tabular">
              {data.history.map((h, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-muted">{formatDate(h.recordedAt)}</td>
                  <td className="py-2 pr-3 text-right">{formatCZK(h.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
