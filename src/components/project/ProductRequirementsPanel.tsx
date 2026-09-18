"use client";

import { useState } from "react";
import { Button, Card, Input, SectionTitle, Select } from "@/components/ui";
import { formatCZK } from "@/lib/format";
import { PRODUCT_REQUIREMENT_STATUSES, PRODUCT_REQUIREMENT_STATUS_LABELS, type ProductRequirementStatus } from "@/lib/types";
import type { ProductRequirementDTO } from "@/lib/project-types";

const emptyForm = {
  room: "",
  category: "",
  description: "",
  budgetMin: "",
  budgetMax: "",
  dimensions: "",
  style: "",
  quantity: "1"
};

export function ProductRequirementsPanel({
  projectId,
  requirements: initial
}: {
  projectId: string;
  requirements: ProductRequirementDTO[];
}) {
  const [requirements, setRequirements] = useState(initial);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addRequirement() {
    if (!form.category.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/product-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        const created = await res.json();
        setRequirements((prev) => [created, ...prev]);
        setForm(emptyForm);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setRequirements((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    await fetch(`/api/projects/${projectId}/product-requirements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
  }

  async function remove(id: string) {
    setRequirements((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/projects/${projectId}/product-requirements/${id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <div className="flex items-start justify-between">
        <SectionTitle subtitle="Seznam požadovaných produktů (nábytek, sanita, podlahy…) pro budoucí párování s reálnou nabídkou obchodů. Zatím žádné automatické vyhledávání produktů není připojené.">
          Product Matching — požadavky
        </SectionTitle>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Zavřít" : "+ Přidat požadavek"}
        </Button>
      </div>

      {open && (
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-line bg-beige-50 p-4 sm:grid-cols-4">
          <Input label="Místnost" value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} />
          <Input label="Kategorie" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <Input
            label="Popis"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="col-span-2"
          />
          <Input label="Rozpočet min (Kč)" type="number" value={form.budgetMin} onChange={(e) => setForm((f) => ({ ...f, budgetMin: e.target.value }))} />
          <Input label="Rozpočet max (Kč)" type="number" value={form.budgetMax} onChange={(e) => setForm((f) => ({ ...f, budgetMax: e.target.value }))} />
          <Input label="Rozměry" value={form.dimensions} onChange={(e) => setForm((f) => ({ ...f, dimensions: e.target.value }))} />
          <Input label="Styl" value={form.style} onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))} />
          <Input label="Množství" type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          <div className="col-span-full flex justify-end">
            <Button onClick={addRequirement} disabled={saving}>
              {saving ? "Ukládám…" : "Uložit požadavek"}
            </Button>
          </div>
        </div>
      )}

      {requirements.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádné požadavky na produkty.</p>
      ) : (
        <div className="space-y-2">
          {requirements.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/60 p-3 text-sm">
              <div>
                <div className="font-medium text-ink">
                  {r.description} {r.quantity > 1 && <span className="text-muted">× {r.quantity}</span>}
                </div>
                <div className="text-xs text-muted">
                  {[r.room, r.category, r.dimensions, r.style].filter(Boolean).join(" · ")}
                  {(r.budgetMin || r.budgetMax) && (
                    <> · rozpočet {formatCZK(r.budgetMin)} – {formatCZK(r.budgetMax)}</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={r.status}
                  onChange={(e) => updateStatus(r.id, e.target.value)}
                  className="w-40 text-xs"
                >
                  {PRODUCT_REQUIREMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PRODUCT_REQUIREMENT_STATUS_LABELS[s as ProductRequirementStatus]}
                    </option>
                  ))}
                </Select>
                <button onClick={() => remove(r.id)} className="text-xs text-muted hover:text-band-bad">
                  smazat
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
