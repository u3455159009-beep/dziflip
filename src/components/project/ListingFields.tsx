"use client";

import { useState } from "react";
import {
  BOOLEAN_FIELDS,
  LISTING_FIELDS,
  LISTING_FIELD_LABELS,
  PROPERTY_TYPE_FIELDS,
  PROPERTY_TYPE_LABELS,
  type Confidence,
  type FieldMeta,
  type ListingField,
  type PropertyType
} from "@/lib/types";
import { ConfidenceBadge, Card, SectionTitle } from "@/components/ui";
import type { ProjectDTO } from "@/lib/project-types";

// Always shown regardless of property type — identifying/pricing fields
// every listing has, plus propertyType itself so it can be corrected.
const CORE_FIELDS: ListingField[] = [
  "propertyType",
  "title",
  "askingPrice",
  "municipality",
  "district",
  "street",
  "legalNotes",
  "description"
];

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

  const currentType = (values.propertyType as PropertyType | null) || null;
  const visibleFields: ListingField[] =
    currentType && PROPERTY_TYPE_FIELDS[currentType]
      ? Array.from(new Set([...CORE_FIELDS, ...PROPERTY_TYPE_FIELDS[currentType]]))
      : [...LISTING_FIELDS];

  return (
    <Card>
      <SectionTitle subtitle="Ručně opravte cokoliv, co aplikace nezískala správně nebo vůbec. Ruční úprava se okamžitě označí jako OVĚŘENO. Zobrazená pole se přizpůsobují typu nemovitosti.">
        Údaje o nemovitosti
      </SectionTitle>
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleFields.map((field) => {
          const isBool = BOOLEAN_FIELDS.includes(field);
          const isPropertyType = field === "propertyType";
          const currentMeta: Confidence = meta[field] ?? "UNKNOWN";
          return (
            <div key={field}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  {LISTING_FIELD_LABELS[field]}
                </span>
                <ConfidenceBadge level={currentMeta} />
              </div>
              {isPropertyType ? (
                <select
                  value={(values.propertyType as string) ?? ""}
                  onChange={(e) => save(field, e.target.value === "" ? null : e.target.value)}
                  disabled={saving === field}
                  className="w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink focus:border-beige-400 focus:outline-none focus:ring-2 focus:ring-beige-200"
                >
                  <option value="">Neznámé</option>
                  {Object.entries(PROPERTY_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : isBool ? (
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
                    const numericFields: ListingField[] = [
                      "askingPrice", "areaM2", "pricePerM2", "landAreaM2",
                      "windowsReplacedYear", "insulationYear", "roofYear", "risersYear"
                    ];
                    if (numericFields.includes(field)) {
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
