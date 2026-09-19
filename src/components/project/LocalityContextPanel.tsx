"use client";

// District/locality context (item 9) — only renders when FlatScan's own
// /districts or /localities endpoint actually returned a number for this
// area. Silent (renders nothing) otherwise — never a placeholder guess.
import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { formatCZK, formatPct } from "@/lib/format";

interface LocalityContextResponse {
  available: boolean;
  reason?: string;
  municipality?: string | null;
  district?: string | null;
  medianPricePerM2?: number | null;
  avgPricePerM2?: number | null;
  activeListingCount?: number | null;
  trendPct?: number | null;
  listingPricePerM2?: number | null;
  deviation?: { diffAbs: number; diffPct: number } | null;
}

export function LocalityContextPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<LocalityContextResponse | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/locality-context`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ available: false }));
  }, [projectId]);

  if (!data || !data.available) return null;

  const referencePrice = data.medianPricePerM2 ?? data.avgPricePerM2 ?? null;

  return (
    <Card>
      <SectionTitle subtitle="Kontext lokality z FlatScan Data API — jen skutečně vrácené hodnoty, nikdy dopočítané.">
        Lokalita: {data.district ? `${data.municipality} — ${data.district}` : data.municipality}
      </SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Medián Kč/m²</div>
          <div className="mt-1 text-lg font-medium text-ink number-tabular">
            {data.medianPricePerM2 != null ? `${formatCZK(data.medianPricePerM2)}/m²` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Průměr Kč/m²</div>
          <div className="mt-1 text-lg font-medium text-ink number-tabular">
            {data.avgPricePerM2 != null ? `${formatCZK(data.avgPricePerM2)}/m²` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Aktivní nabídky</div>
          <div className="mt-1 text-lg font-medium text-ink number-tabular">{data.activeListingCount ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Trend</div>
          <div className="mt-1 text-lg font-medium text-ink number-tabular">{data.trendPct != null ? formatPct(data.trendPct) : "—"}</div>
        </div>
      </div>
      {data.deviation && referencePrice != null && data.listingPricePerM2 != null && (
        <div className="mt-4 rounded-lg bg-beige-50 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted">Nabídka:</span>
            <span className="number-tabular">{formatCZK(data.listingPricePerM2)}/m²</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted">Lokalita:</span>
            <span className="number-tabular">{formatCZK(referencePrice)}/m²</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
            <span className="font-medium text-ink">Rozdíl:</span>
            <span className={`font-medium number-tabular ${data.deviation.diffPct <= 0 ? "text-band-good" : "text-band-bad"}`}>
              {formatPct(data.deviation.diffPct)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
