// Shared helpers for keeping Project.fieldMeta (confidence) and
// Project.fieldSource (human-readable provenance) in sync. Every place that
// writes listing fields — text extraction, URL fetch, a Deal Radar
// provider, or a manual edit — should go through these so the Source
// Evidence Panel always has a real, traceable answer for "where did this
// number come from," never a guess presented as fact.
import type { Confidence, FieldMeta, ListingField } from "@/lib/types";

export type FieldSourceMap = Partial<Record<ListingField, string>>;

export function parseFieldMeta(json: string | null | undefined): FieldMeta {
  if (!json) return {};
  try {
    return JSON.parse(json) as FieldMeta;
  } catch {
    return {};
  }
}

export function parseFieldSource(json: string | null | undefined): FieldSourceMap {
  if (!json) return {};
  try {
    return JSON.parse(json) as FieldSourceMap;
  } catch {
    return {};
  }
}

/**
 * Mark every present key of `fields` with the same confidence + source in
 * both maps, mutating them in place. Absent/null/empty values are skipped
 * — never recorded as if they were known.
 */
export function markFields(
  meta: FieldMeta,
  source: FieldSourceMap,
  fields: Partial<Record<ListingField, unknown>>,
  confidence: Confidence,
  sourceLabel: string
): void {
  for (const key of Object.keys(fields) as ListingField[]) {
    const value = fields[key];
    if (value === undefined || value === null || value === "") continue;
    meta[key] = confidence;
    source[key] = sourceLabel;
  }
}

export function serializeFieldMeta(meta: FieldMeta): string {
  return JSON.stringify(meta);
}

export function serializeFieldSource(source: FieldSourceMap): string {
  return JSON.stringify(source);
}
