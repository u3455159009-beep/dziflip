"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCZK, formatNumber, formatPct } from "@/lib/format";
import { computeEconomics, type AssumptionsInput } from "@/lib/calc";

interface ProjectListItem {
  id: string;
  title: string | null;
  municipality: string | null;
  district: string | null;
  askingPrice: number | null;
  areaM2: number | null;
  pricePerM2: number | null;
  targetPrice: number | null;
  assumptions: AssumptionsInput | null;
}

export default function ComparePage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  const chosen = useMemo(() => projects.filter((p) => selected.includes(p.id)), [projects, selected]);

  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl text-ink">Porovnání nemovitostí</h1>
      <p className="mb-8 text-sm text-muted">
        Vyberte 2–5 nemovitostí. Zobrazí se pouze čísla — výběr nejlepší varianty je na vás.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Načítám…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted">
          Zatím žádné projekty. <Link href="/" className="text-beige-500 underline">Analyzujte nemovitost</Link>.
        </p>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  selected.includes(p.id) ? "border-beige-400 bg-beige-50" : "border-line bg-card"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={!selected.includes(p.id) && selected.length >= 5}
                />
                <span className="truncate">{p.title || "Nepojmenovaná nemovitost"}</span>
              </label>
            ))}
          </div>

          {chosen.length >= 2 && (
            <div className="overflow-x-auto rounded-xl2 border border-line bg-card shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="p-4">Metrika</th>
                    {chosen.map((p) => (
                      <th key={p.id} className="p-4">
                        <Link href={`/project/${p.id}`} className="text-ink hover:text-beige-500">
                          {p.title || "—"}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="number-tabular">
                  <CompareRow label="Nabídková cena" values={chosen.map((p) => formatCZK(p.askingPrice))} />
                  <CompareRow label="Plocha (m²)" values={chosen.map((p) => formatNumber(p.areaM2))} />
                  <CompareRow label="Kč/m²" values={chosen.map((p) => formatCZK(p.pricePerM2))} />
                  <CompareRow
                    label="Rekonstrukce"
                    values={chosen.map((p) => formatCZK(p.assumptions?.renovationCost ?? null))}
                  />
                  <CompareRow
                    label="Celková investice"
                    values={chosen.map((p) => {
                      const a = p.assumptions;
                      if (!a) return "—";
                      const purchase = a.purchasePriceUsed ?? p.targetPrice ?? p.askingPrice ?? 0;
                      const e = computeEconomics(purchase, a, p.areaM2);
                      return formatCZK(e.totalInvestment);
                    })}
                  />
                  <CompareRow
                    label="Odhad. prodejní cena (základní)"
                    values={chosen.map((p) => formatCZK(p.assumptions?.saleBase ?? null))}
                  />
                  <CompareRow
                    label="Očekávaný zisk (základní scénář)"
                    values={chosen.map((p) => {
                      const a = p.assumptions;
                      if (!a) return "—";
                      const purchase = a.purchasePriceUsed ?? p.targetPrice ?? p.askingPrice ?? 0;
                      const e = computeEconomics(purchase, a, p.areaM2);
                      return formatCZK(e.scenarios.base.grossProfit);
                    })}
                  />
                  <CompareRow
                    label="ROI (základní scénář)"
                    values={chosen.map((p) => {
                      const a = p.assumptions;
                      if (!a) return "—";
                      const purchase = a.purchasePriceUsed ?? p.targetPrice ?? p.askingPrice ?? 0;
                      const e = computeEconomics(purchase, a, p.areaM2);
                      return formatPct(e.scenarios.base.roiPct);
                    })}
                  />
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-b border-line/60">
      <td className="p-4 text-muted">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="p-4 font-medium text-ink">
          {v}
        </td>
      ))}
    </tr>
  );
}
