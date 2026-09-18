"use client";

import { Card, SectionTitle, ConfidenceBadge } from "@/components/ui";
import { LISTING_FIELDS, LISTING_FIELD_LABELS, type FieldMeta, type ListingField } from "@/lib/types";
import type { ProjectDTO } from "@/lib/project-types";

export function SourceEvidencePanel({ project }: { project: ProjectDTO }) {
  const meta: FieldMeta = project.fieldMeta ? JSON.parse(project.fieldMeta) : {};
  const source: Partial<Record<ListingField, string>> = project.fieldSource ? JSON.parse(project.fieldSource) : {};

  const rows = LISTING_FIELDS.filter((field) => {
    const value = (project as unknown as Record<string, unknown>)[field];
    return value !== null && value !== undefined && value !== "";
  });

  return (
    <Card>
      <SectionTitle subtitle="Pro každé kritické pole je vidět, odkud hodnota pochází a jak je jistá — nic se nezobrazuje jako ověřené bez skutečného zdroje.">
        Source Evidence Panel
      </SectionTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Zatím nejsou vyplněná žádná kritická pole.</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          {rows.map((field) => {
            const confidence = meta[field] ?? "UNKNOWN";
            const src = source[field];
            return (
              <div key={field} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5">
                <span className="text-muted">{LISTING_FIELD_LABELS[field]}</span>
                <div className="flex items-center gap-2">
                  {src && project.sourceUrl ? (
                    <a
                      href={project.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-beige-500 underline underline-offset-2"
                    >
                      {src}
                    </a>
                  ) : (
                    <span className="text-xs text-muted">{src ?? "—"}</span>
                  )}
                  <ConfidenceBadge level={confidence} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
