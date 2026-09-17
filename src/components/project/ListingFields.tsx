"use client";

import { useState } from "react";
import {
  BOOLEAN_FIELDS,
  LISTING_FIELDS,
  LISTING_FIELD_LABELS,
  type Confidence,
  type FieldMeta,
  type ListingField
} from "@/lib/types";
import { ConfidenceBadge, Card, SectionTitle } from "@/components/ui";
import type { ProjectDTO } from "@/lib/project-types";

type FieldValue = string | number | boolean | null;

function fieldToText(v: FieldValue): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function ListingFields({ project }: { project: ProjectDTO }) {
  const initialMeta: FieldMeta = project.fieldMeta ? JSON.parse(project.fieldMeta) : {};
  const [values, setValues] = useState<Record<ListingField, FieldValue>>(() => {
    const v: Record<string, FieldValue> = {};
    for (const f of LISTING_FIELDS) v[f] = (project as any)[f] ?? null;
    return v as Record<ListingField, FieldValue>;
  });
  const [meta, setMeta] = useState<FieldMeta>(initialMeta);
  const [saving, setSaving] = useState<ListingField | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function save(field: ListingField, value: FieldValue) {
    setSaving(field);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { [field]: value } })
      });
      if (res.ok) {
        setValues((prev) => ({ ...prev, [field]: value }));
        setMeta((prev) => ({ ...prev, [field]: value === null || value === "" ? "UNKNOWN" : "VERIFIED" }));
      }
    } finally {
      setSaving(null);
    }
  }

  function boolLabel(v: FieldValue): string {
    if (v === true) return "true";
    if (v === false) return "false";
    return "";
  }

  return (
    <Card>
      <SectionTitle subtitle="Ručně opravte cokoliv, co aplikace nezískala správně nebo vůbec. Ruční úprava se okamžitě označí jako OVĚŘENO.">
        Údaje o nemovitosti
      </SectionTitle>
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {LISTING_FIELDS.map((field) => {
          const isBool = BOOLEAN_FIELDS.includes(field);
          const currentMeta: Confidence = meta[field] ?? "UNKNOWN";
          return (
            <div key={field}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  {LISTING_FIELD_LABELS[field]}
                </span>
                <ConfidenceBadge level={currentMeta} />
              </div>
              {isBool ? (
                <select
                  value={boolLabel(values[field])}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const parsed = raw === "" ? null : raw === "true";
                    save(field, parsed);
                  }}
                  disabled={saving === field}
                  className="w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink focus:border-beige-400 focus:outline-none focus:ring-2 focus:ring-beige-200"
                >
                  <option value="">Neznámé</option>
                  <option value="true">Ano</option>
                  <option value="false">Ne</option>
                </select>
              ) : (
                <input
                  value={drafts[field] ?? fieldToText(values[field])}
                  onChange={(e) => setDrafts((d) => ({ ...d, [field]: e.target.value }))}
                  onBlur={(e) => {
                    setDrafts((d) => {
                      const { [field]: _omit, ...rest } = d;
                      return rest;
                    });
                    const raw = e.target.value.trim();
                    if (field === "askingPrice" || field === "areaM2" || field === "pricePerM2") {
                      const num = raw === "" ? null : Number(raw.replace(",", "."));
                      save(field, Number.isFinite(num as number) || num === null ? num : values[field]);
                    } else {
                      save(field, raw === "" ? null : raw);
                    }
                  }}
                  placeholder="Neznámé — doplňte"
                  disabled={saving === field}
                  className="w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-beige-400 focus:outline-none focus:ring-2 focus:ring-beige-200"
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
