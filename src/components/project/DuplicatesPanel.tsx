"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";
import { formatCZK } from "@/lib/format";
import { DUPLICATE_CLASSIFICATION_LABELS, type DuplicateClassification } from "@/lib/types";

interface DuplicateRow {
  id: string;
  matchScore: number;
  classification: string;
  reasons: string;
  resolvedStatus: string;
  otherProject: {
    id: string;
    title: string | null;
    municipality: string | null;
    district: string | null;
    askingPrice: number | null;
    isDemo: boolean;
  };
}

const CLASS_STYLES: Record<string, string> = {
  SAME_PROPERTY: "bg-band-badBg text-band-bad border-band-bad/40",
  POSSIBLE_DUPLICATE: "bg-band-normalBg text-band-normal border-band-normal/40"
};

export function DuplicatesPanel({ duplicates: initial }: { duplicates: DuplicateRow[] }) {
  const [duplicates, setDuplicates] = useState(initial.filter((d) => d.resolvedStatus === "PENDING"));
  const [busyId, setBusyId] = useState<string | null>(null);

  if (duplicates.length === 0) return null;

  async function resolve(id: string, resolvedStatus: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/duplicates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolvedStatus })
      });
      if (res.ok) setDuplicates((d) => d.filter((x) => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="border-band-normal/40">
      <SectionTitle subtitle="Nikdy automaticky neslučujeme — potvrďte prosím sami, zda jde o stejnou nemovitost, nebo o jinou nabídku.">
        Možné duplicity
      </SectionTitle>
      <div className="space-y-3">
        {duplicates.map((d) => {
          const reasons: string[] = JSON.parse(d.reasons || "[]");
          return (
            <div key={d.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CLASS_STYLES[d.classification] ?? ""}`}
                >
                  {DUPLICATE_CLASSIFICATION_LABELS[d.classification as DuplicateClassification] ?? d.classification}
                </span>
                <span className="text-xs text-muted">shoda {Math.round(d.matchScore * 100)} %</span>
                {d.otherProject.isDemo && (
                  <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium uppercase text-paper">
                    DEMO
                  </span>
                )}
              </div>
              <Link href={`/project/${d.otherProject.id}`} className="mt-2 block font-medium text-ink hover:text-beige-500">
                {d.otherProject.title || "Nepojmenovaná nemovitost"}
              </Link>
              <div className="text-xs text-muted">
                {[d.otherProject.municipality, d.otherProject.district].filter(Boolean).join(" · ")}
                {d.otherProject.askingPrice ? ` · ${formatCZK(d.otherProject.askingPrice)}` : ""}
              </div>
              {reasons.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs text-muted">
                  {reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => resolve(d.id, "CONFIRMED_SAME")}
                  disabled={busyId === d.id}
                  className="rounded-full border border-band-bad/40 px-3 py-1 text-xs text-band-bad hover:bg-band-badBg"
                >
                  Ano, je to stejná nemovitost
                </button>
                <button
                  onClick={() => resolve(d.id, "CONFIRMED_DIFFERENT")}
                  disabled={busyId === d.id}
                  className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink"
                >
                  Ne, je to jiná nemovitost
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
