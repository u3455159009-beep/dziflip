"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, SectionTitle, Select } from "@/components/ui";
import { formatCZK, formatDate } from "@/lib/format";
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  PRICE_SOURCES,
  PRICE_SOURCE_LABELS,
  type BudgetCategory
} from "@/lib/types";
import type { BudgetItemDTO } from "@/lib/project-types";

const emptyForm = {
  room: "",
  category: BUDGET_CATEGORIES[0] as string,
  name: "",
  quantity: "1",
  unit: "",
  unitPrice: "",
  laborEstimate: "",
  materialEstimate: "",
  priceSource: "ESTIMATE" as string,
  productUrl: "",
  shop: ""
};

export function BudgetSection({ projectId, items: initial }: { projectId: string; items: BudgetItemDTO[] }) {
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cheapPct, setCheapPct] = useState(-20);
  const [premiumPct, setPremiumPct] = useState(50);

  const totalsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.category, (map.get(item.category) ?? 0) + (item.total ?? 0));
    }
    return map;
  }, [items]);

  const grandTotal = useMemo(() => items.reduce((s, i) => s + (i.total ?? 0), 0), [items]);

  const byRoom = useMemo(() => {
    const map = new Map<string, BudgetItemDTO[]>();
    for (const item of items) {
      const key = item.room || "Bez místnosti";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  async function addItem() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          room: form.room || null,
          quantity: form.quantity || null,
          unitPrice: form.unitPrice || null,
          laborEstimate: form.laborEstimate || null,
          materialEstimate: form.materialEstimate || null
        })
      });
      if (res.ok) {
        const created = await res.json();
        setItems((p) => [...p, created]);
        setForm(emptyForm);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setItems((p) => p.filter((i) => i.id !== id));
    await fetch(`/api/projects/${projectId}/budget/${id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <div className="flex items-start justify-between">
        <SectionTitle subtitle="Rozlišujeme přesnou cenu z produktu, odhad a ručně zadanou cenu. Levná a premium varianta jsou transparentní procentní odchylky od doporučené (skutečně zadané) varianty.">
          Rekonstrukční plán a rozpočet
        </SectionTitle>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Zavřít" : "+ Přidat položku"}
        </Button>
      </div>

      {open && (
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-line bg-beige-50 p-4 sm:grid-cols-4">
          <Input label="Místnost" value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} />
          <Select label="Kategorie" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {BUDGET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {BUDGET_CATEGORY_LABELS[c as BudgetCategory]}
              </option>
            ))}
          </Select>
          <Input label="Položka" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Množství" type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          <Input label="Jednotka" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          <Input label="Jednotková cena (Kč)" type="number" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} />
          <Input label="Odhad práce (Kč)" type="number" value={form.laborEstimate} onChange={(e) => setForm((f) => ({ ...f, laborEstimate: e.target.value }))} />
          <Input label="Odhad materiálu (Kč)" type="number" value={form.materialEstimate} onChange={(e) => setForm((f) => ({ ...f, materialEstimate: e.target.value }))} />
          <Select label="Typ ceny" value={form.priceSource} onChange={(e) => setForm((f) => ({ ...f, priceSource: e.target.value }))}>
            {PRICE_SOURCES.map((s) => (
              <option key={s} value={s}>
                {PRICE_SOURCE_LABELS[s as keyof typeof PRICE_SOURCE_LABELS]}
              </option>
            ))}
          </Select>
          <Input label="Obchod" value={form.shop} onChange={(e) => setForm((f) => ({ ...f, shop: e.target.value }))} />
          <Input label="URL produktu" value={form.productUrl} onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))} />
          <div className="col-span-full flex justify-end">
            <Button onClick={addItem} disabled={saving}>
              {saving ? "Ukládám…" : "Uložit položku"}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádné položky rozpočtu.</p>
      ) : (
        <div className="space-y-6">
          {Array.from(byRoom.entries()).map(([room, roomItems]) => (
            <div key={room}>
              <h3 className="mb-2 font-serif text-lg text-ink">{room}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3">Položka</th>
                      <th className="py-2 pr-3">Kategorie</th>
                      <th className="py-2 pr-3 text-right">Množství</th>
                      <th className="py-2 pr-3 text-right">Jedn. cena</th>
                      <th className="py-2 pr-3 text-right">Práce</th>
                      <th className="py-2 pr-3 text-right">Materiál</th>
                      <th className="py-2 pr-3 text-right">Celkem</th>
                      <th className="py-2 pr-3">Zdroj ceny</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="number-tabular">
                    {roomItems.map((item) => (
                      <tr key={item.id} className="border-b border-line/60">
                        <td className="py-2 pr-3">
                          {item.productUrl ? (
                            <a href={item.productUrl} target="_blank" rel="noreferrer" className="text-beige-500 underline underline-offset-2">
                              {item.name}
                            </a>
                          ) : (
                            item.name
                          )}
                          {item.shop && <div className="text-[11px] text-muted">{item.shop}</div>}
                        </td>
                        <td className="py-2 pr-3 text-xs">{BUDGET_CATEGORY_LABELS[item.category as BudgetCategory] ?? item.category}</td>
                        <td className="py-2 pr-3 text-right">
                          {item.quantity ?? "—"} {item.unit ?? ""}
                        </td>
                        <td className="py-2 pr-3 text-right">{formatCZK(item.unitPrice)}</td>
                        <td className="py-2 pr-3 text-right">{formatCZK(item.laborEstimate)}</td>
                        <td className="py-2 pr-3 text-right">{formatCZK(item.materialEstimate)}</td>
                        <td className="py-2 pr-3 text-right font-medium text-ink">{formatCZK(item.total)}</td>
                        <td className="py-2 pr-3 text-[11px]">
                          {PRICE_SOURCE_LABELS[item.priceSource as keyof typeof PRICE_SOURCE_LABELS] ?? item.priceSource}
                          {item.verifiedAt && <div className="text-muted">ověřeno {formatDate(item.verifiedAt)}</div>}
                        </td>
                        <td className="py-2 text-right">
                          <button onClick={() => remove(item.id)} className="text-xs text-muted hover:text-band-bad">
                            smazat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 border-t border-line pt-6">
        <h3 className="mb-3 font-serif text-lg text-ink">Celkový rozpočet dle kategorií</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm number-tabular">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Kategorie</th>
                <th className="py-2 pr-3 text-right">Doporučená</th>
              </tr>
            </thead>
            <tbody>
              {BUDGET_CATEGORIES.filter((c) => totalsByCategory.has(c)).map((c) => (
                <tr key={c} className="border-b border-line/60">
                  <td className="py-2 pr-3">{BUDGET_CATEGORY_LABELS[c as BudgetCategory]}</td>
                  <td className="py-2 pr-3 text-right">{formatCZK(totalsByCategory.get(c) ?? 0)}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold text-ink">
                <td className="py-2.5 pr-3">CELKEM</td>
                <td className="py-2.5 pr-3 text-right">{formatCZK(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-line p-4">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-muted">
              <span>Levná varianta</span>
              <input
                type="number"
                value={cheapPct}
                onChange={(e) => setCheapPct(Number(e.target.value))}
                className="w-16 rounded border border-line px-1.5 py-0.5 text-right text-xs"
              />
            </div>
            <div className="font-serif text-2xl text-ink number-tabular">
              {formatCZK(grandTotal * (1 + cheapPct / 100))}
            </div>
          </div>
          <div className="rounded-lg border border-beige-400 bg-beige-50 p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">Doporučená varianta</div>
            <div className="font-serif text-2xl text-ink number-tabular">{formatCZK(grandTotal)}</div>
          </div>
          <div className="rounded-lg border border-line p-4">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-muted">
              <span>Premium varianta</span>
              <input
                type="number"
                value={premiumPct}
                onChange={(e) => setPremiumPct(Number(e.target.value))}
                className="w-16 rounded border border-line px-1.5 py-0.5 text-right text-xs"
              />
            </div>
            <div className="font-serif text-2xl text-ink number-tabular">
              {formatCZK(grandTotal * (1 + premiumPct / 100))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Levná a premium varianta jsou procentní odchylky od skutečně zadaných položek (doporučená), nikoliv reálná
          dohledaná data — procenta si upravte podle vlastní zkušenosti.
        </p>
      </div>
    </Card>
  );
}
