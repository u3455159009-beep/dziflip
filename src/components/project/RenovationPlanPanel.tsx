"use client";

// Shared Renovation Design System editor (item 4) — one set of choices
// (flooring, wall color, doors, handles, lighting, kitchen, bathroom,
// tiles, sanitary, built-ins, style, price level) reused across every
// room's visualization so the flat doesn't end up looking like ten
// different apartments stitched together.
import { useState } from "react";
import { Button, Card, Input, SectionTitle, Select } from "@/components/ui";
import { PRODUCT_TIERS, PRODUCT_TIER_LABELS, type ProductTier } from "@/lib/types";
import type { RenovationPlanDTO } from "@/lib/project-types";

const FIELDS: Array<{ key: keyof RenovationPlanDTO; label: string; placeholder: string }> = [
  { key: "flooring", label: "Podlaha", placeholder: "např. vinylová podlaha, světlý dub" },
  { key: "wallColor", label: "Barva stěn", placeholder: "např. bílá / světle šedá" },
  { key: "doors", label: "Dveře", placeholder: "např. bílé hladké, CPL fólie" },
  { key: "handles", label: "Kliky", placeholder: "např. nerez matná" },
  { key: "outletsSwitches", label: "Zásuvky / vypínače", placeholder: "např. bílé, rámečkový systém" },
  { key: "lighting", label: "Osvětlení", placeholder: "např. LED stropní svítidla, teplá bílá" },
  { key: "kitchen", label: "Kuchyň", placeholder: "např. bílá lesklá linka, laminátová deska" },
  { key: "bathroomFixtures", label: "Koupelnové vybavení", placeholder: "např. bílá sanita, chrom baterie" },
  { key: "tiles", label: "Obklady/dlažby", placeholder: "např. velkoformátová dlažba, imitace betonu" },
  { key: "sanitary", label: "Sanita", placeholder: "např. závěsné WC, keramické umyvadlo" },
  { key: "builtIns", label: "Vestavěné skříně", placeholder: "např. bílé vestavěné skříně" }
];

export function RenovationPlanPanel({ projectId, plan: initial }: { projectId: string; plan: RenovationPlanDTO | null }) {
  const [plan, setPlan] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const f of FIELDS) base[f.key as string] = (initial?.[f.key] as string | null) ?? "";
    base.style = initial?.style ?? "";
    base.priceLevel = initial?.priceLevel ?? "";
    base.notes = initial?.notes ?? "";
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/renovation-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan)
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  function set(key: string, value: string) {
    setPlan((p) => ({ ...p, [key]: value }));
  }

  return (
    <Card>
      <SectionTitle subtitle="Jedno sjednocené zadání stylu pro celý byt — používá se pro všechny vizualizace místností, aby výsledek nepůsobil jako deset různých bytů.">
        Renovační design systém
      </SectionTitle>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-muted">Styl</div>
          <Input value={plan.style} onChange={(e) => set("style", e.target.value)} placeholder="např. moderní minimalismus" />
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-muted">Cenová hladina</div>
          <Select value={plan.priceLevel} onChange={(e) => set("priceLevel", e.target.value)}>
            <option value="">nezadáno</option>
            {PRODUCT_TIERS.map((t) => (
              <option key={t} value={t}>
                {PRODUCT_TIER_LABELS[t as ProductTier]}
              </option>
            ))}
          </Select>
        </div>
        {FIELDS.map((f) => (
          <div key={f.key as string}>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted">{f.label}</div>
            <Input value={plan[f.key as string]} onChange={(e) => set(f.key as string, e.target.value)} placeholder={f.placeholder} />
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="mb-1 text-xs uppercase tracking-wide text-muted">Poznámky</div>
        <textarea
          value={plan.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Ukládám…" : "Uložit design systém"}
        </Button>
        {savedAt && <span className="text-xs text-muted">Uloženo.</span>}
      </div>
    </Card>
  );
}
