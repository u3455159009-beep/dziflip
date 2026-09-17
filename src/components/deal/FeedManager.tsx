"use client";

import { useMemo, useState } from "react";
import { DealCard } from "./DealCard";
import { Input, Select } from "@/components/ui";
import { FLIP_BAND_ICONS, FLIP_BAND_LABELS, type FlipBand } from "@/lib/calc";
import type { DealFeedItem } from "@/lib/dealFeed";

const BAND_FILTERS: Array<FlipBand | "ALL"> = ["ALL", "BUY_NOW", "GOOD", "NORMAL", "BAD"];

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}

export function FeedManager({ items }: { items: DealFeedItem[] }) {
  const [band, setBand] = useState<FlipBand | "ALL">("ALL");
  const [minProfit, setMinProfit] = useState("");
  const [locality, setLocality] = useState("");
  const [disposition, setDisposition] = useState("");
  const [onlyToday, setOnlyToday] = useState(false);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (band !== "ALL" && it.band !== band) return false;
      if (minProfit && (it.expectedProfit ?? -Infinity) < Number(minProfit)) return false;
      if (locality) {
        const loc = `${it.municipality ?? ""} ${it.district ?? ""}`.toLowerCase();
        if (!loc.includes(locality.toLowerCase())) return false;
      }
      if (disposition && it.disposition !== disposition) return false;
      if (onlyToday && !isToday(it.createdAt)) return false;
      return true;
    });
  }, [items, band, minProfit, locality, disposition, onlyToday]);

  const dispositions = useMemo(
    () => Array.from(new Set(items.map((i) => i.disposition).filter(Boolean))) as string[],
    [items]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {BAND_FILTERS.map((b) => (
          <button
            key={b}
            onClick={() => setBand(b)}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${
              band === b ? "border-ink bg-ink text-paper" : "border-line bg-card text-muted hover:text-ink"
            }`}
          >
            {b === "ALL" ? "Vše" : `${FLIP_BAND_ICONS[b]} ${FLIP_BAND_LABELS[b]}`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input
          label="Min. očekávaný zisk (Kč)"
          type="number"
          value={minProfit}
          onChange={(e) => setMinProfit(e.target.value)}
        />
        <Input label="Lokalita obsahuje" value={locality} onChange={(e) => setLocality(e.target.value)} />
        <Select label="Dispozice" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="">Všechny</option>
          {dispositions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <input type="checkbox" checked={onlyToday} onChange={(e) => setOnlyToday(e.target.checked)} />
          Nalezeno dnes
        </label>
      </div>

      <p className="text-xs text-muted">
        Zobrazeno {filtered.length} z {items.length} nemovitostí.
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Žádná nemovitost neodpovídá zvoleným filtrům.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <DealCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
