"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import { formatCZK, formatDateTime } from "@/lib/format";
import {
  SHOPPING_CATEGORIES,
  SHOPPING_CATEGORY_LABELS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_REQUIREMENT_STATUSES,
  PRODUCT_REQUIREMENT_STATUS_LABELS,
  PRODUCT_AVAILABILITY_LABELS,
  PRODUCT_TIERS,
  PRODUCT_TIER_LABELS,
  type ShoppingCategory,
  type ProductCategory,
  type ProductRequirementStatus,
  type ProductTier
} from "@/lib/types";
import { computeShoppingListSummary } from "@/lib/shoppingList";
import { computeShoppingLine } from "@/lib/productQuantity";
import { isDataStale } from "@/lib/staleData";
import type { ProductRequirementDTO, ProductDTO } from "@/lib/project-types";

const AVAILABILITY_STYLES: Record<string, string> = {
  SKLADEM: "bg-band-good/10 text-band-good",
  OMEZENE: "bg-band-warn/10 text-band-warn",
  NENI_SKLADEM: "bg-band-bad/10 text-band-bad",
  UNKNOWN: "bg-beige-100 text-muted"
};

const emptyRequirementForm = {
  room: "",
  category: PRODUCT_CATEGORIES[0] as string,
  shoppingCategory: "OSTATNI" as string,
  description: "",
  budgetMin: "",
  budgetMax: "",
  dimensions: "",
  style: "",
  quantity: "1",
  quantityNeeded: "",
  quantityUnit: "",
  reservePct: "10"
};

const emptyManualForm = {
  name: "",
  retailer: "",
  price: "",
  productUrl: "",
  note: ""
};

export function ShoppingListSection({
  projectId,
  requirements: initial,
  staleDataThresholdDays
}: {
  projectId: string;
  requirements: ProductRequirementDTO[];
  staleDataThresholdDays: number;
}) {
  const [requirements, setRequirements] = useState(initial);
  const [form, setForm] = useState(emptyRequirementForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const summary = useMemo(
    () =>
      computeShoppingListSummary(
        requirements.map((r) => ({
          status: r.status as ProductRequirementStatus,
          shoppingCategory: r.shoppingCategory as ShoppingCategory,
          budgetMax: r.budgetMax,
          quantity: r.quantity,
          quantityNeeded: r.quantityNeeded,
          reservePct: r.reservePct,
          selectedProduct: r.products.find((p) => p.isSelected) ?? null
        }))
      ),
    [requirements]
  );

  const byShoppingCategory = useMemo(() => {
    const map = new Map<string, ProductRequirementDTO[]>();
    for (const r of requirements) {
      const key = r.shoppingCategory;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [requirements]);

  function updateRequirement(id: string, patch: Partial<ProductRequirementDTO>) {
    setRequirements((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function addRequirement() {
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/product-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          reservePct: form.reservePct === "" ? 0.1 : Number(form.reservePct) / 100
        })
      });
      if (res.ok) {
        const created = await res.json();
        setRequirements((prev) => [{ ...created, products: [] }, ...prev]);
        setForm(emptyRequirementForm);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeRequirement(id: string) {
    setRequirements((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/projects/${projectId}/product-requirements/${id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <div className="flex items-start justify-between">
        <SectionTitle subtitle="Skutečný nákupní seznam pro rekonstrukci a vybavení. Ceny a produkty pochází buď z připojeného obchodu, nebo je zadáváš ručně — nic se nevymýšlí.">
          Shopping List
        </SectionTitle>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Zavřít" : "+ Přidat požadavek"}
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg bg-beige-50 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <SummaryStat label="Materiál" value={formatCZK(summary.material)} />
        <SummaryStat label="Nábytek" value={formatCZK(summary.nabytek)} />
        <SummaryStat label="Spotřebiče" value={formatCZK(summary.spotrebice)} />
        <SummaryStat label="Ostatní" value={formatCZK(summary.ostatni)} />
        <SummaryStat label="Rezerva" value={formatCZK(summary.rezerva)} />
        <SummaryStat label="Celkem" value={formatCZK(summary.celkem)} strong />
      </div>

      {open && (
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-line bg-beige-50 p-4 sm:grid-cols-4">
          <Input label="Místnost" value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} />
          <Select label="Kategorie produktu" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PRODUCT_CATEGORY_LABELS[c as ProductCategory]}
              </option>
            ))}
          </Select>
          <Select
            label="Skupina v nákupním seznamu"
            value={form.shoppingCategory}
            onChange={(e) => setForm((f) => ({ ...f, shoppingCategory: e.target.value }))}
          >
            {SHOPPING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SHOPPING_CATEGORY_LABELS[c as ShoppingCategory]}
              </option>
            ))}
          </Select>
          <Input
            label="Popis"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="col-span-2"
          />
          <Input label="Styl" value={form.style} onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))} />
          <Input
            label="Rozměry (text)"
            value={form.dimensions}
            onChange={(e) => setForm((f) => ({ ...f, dimensions: e.target.value }))}
          />
          <Input
            label="Ověřené množství (číslo)"
            type="number"
            value={form.quantityNeeded}
            onChange={(e) => setForm((f) => ({ ...f, quantityNeeded: e.target.value }))}
          />
          <Input
            label="Jednotka (m2, bm…)"
            value={form.quantityUnit}
            onChange={(e) => setForm((f) => ({ ...f, quantityUnit: e.target.value }))}
          />
          <Input
            label="Počet kusů (bez rozměru)"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          />
          <Input
            label="Rezerva (%)"
            type="number"
            value={form.reservePct}
            onChange={(e) => setForm((f) => ({ ...f, reservePct: e.target.value }))}
          />
          <Input
            label="Rozpočet min (Kč/jedn.)"
            type="number"
            value={form.budgetMin}
            onChange={(e) => setForm((f) => ({ ...f, budgetMin: e.target.value }))}
          />
          <Input
            label="Rozpočet max (Kč/jedn.)"
            type="number"
            value={form.budgetMax}
            onChange={(e) => setForm((f) => ({ ...f, budgetMax: e.target.value }))}
          />
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
        <div className="space-y-8">
          {SHOPPING_CATEGORIES.map((cat) => {
            const items = byShoppingCategory.get(cat);
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="mb-3 font-serif text-lg text-ink">{SHOPPING_CATEGORY_LABELS[cat as ShoppingCategory]}</h3>
                <div className="space-y-4">
                  {items.map((r) => (
                    <RequirementRow
                      key={r.id}
                      projectId={projectId}
                      requirement={r}
                      staleDataThresholdDays={staleDataThresholdDays}
                      onUpdate={(patch) => updateRequirement(r.id, patch)}
                      onRemove={() => removeRequirement(r.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SummaryStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 number-tabular ${strong ? "font-serif text-lg text-ink" : "font-medium text-ink"}`}>{value}</div>
    </div>
  );
}

function RequirementRow({
  projectId,
  requirement,
  staleDataThresholdDays,
  onUpdate,
  onRemove
}: {
  projectId: string;
  requirement: ProductRequirementDTO;
  staleDataThresholdDays: number;
  onUpdate: (patch: Partial<ProductRequirementDTO>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(emptyManualForm);
  const [comparing, setComparing] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  // Filters (item 10)
  const [filterRetailer, setFilterRetailer] = useState("");
  const [filterInStockOnly, setFilterInStockOnly] = useState(false);
  const [filterPickupOnly, setFilterPickupOnly] = useState(false);
  const [filterTier, setFilterTier] = useState<string>("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");

  const selected = requirement.products.find((p) => p.isSelected) ?? null;

  const retailers = useMemo(
    () => Array.from(new Set(requirement.products.map((p) => p.retailer).filter(Boolean))) as string[],
    [requirement.products]
  );

  const filteredProducts = useMemo(() => {
    return requirement.products.filter((p) => {
      if (filterRetailer && p.retailer !== filterRetailer) return false;
      if (filterInStockOnly && p.availability !== "SKLADEM") return false;
      if (filterPickupOnly && !p.branches.some((b) => b.personalPickup)) return false;
      if (filterTier && p.tier !== filterTier) return false;
      if (filterMaxPrice && p.price != null && p.price > Number(filterMaxPrice)) return false;
      return true;
    });
  }, [requirement.products, filterRetailer, filterInStockOnly, filterPickupOnly, filterTier, filterMaxPrice]);

  async function updateStatus(status: string) {
    onUpdate({ status });
    await fetch(`/api/projects/${projectId}/product-requirements/${requirement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
  }

  async function findProducts() {
    setSearching(true);
    setSearchNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/product-requirements/${requirement.id}/search`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        const newProducts = [...requirement.products, ...body.candidates];
        onUpdate({ products: newProducts });
        const pending = (body.providerNotes as Array<{ provider: string; status: string; note?: string }>).filter(
          (n) => n.status !== "ACTIVE" || body.candidates.length === 0
        );
        if (body.candidates.length === 0) {
          setSearchNote(
            pending.length > 0
              ? `Žádný produktový provider není aktivně připojen: ${pending.map((p) => p.note ?? p.provider).join(" · ")}`
              : "Žádné produkty nenalezeny."
          );
        }
        setExpanded(true);
      } else {
        setSearchNote(body.error || "Vyhledávání selhalo.");
      }
    } finally {
      setSearching(false);
    }
  }

  async function selectProduct(productId: string) {
    const res = await fetch(`/api/projects/${projectId}/products/${productId}/select`, { method: "POST" });
    if (res.ok) {
      const updated: ProductDTO = await res.json();
      onUpdate({
        status: "SELECTED",
        products: requirement.products.map((p) => (p.id === productId ? updated : { ...p, isSelected: false }))
      });
    }
  }

  async function deselectProduct(productId: string) {
    const res = await fetch(`/api/projects/${projectId}/products/${productId}/deselect`, { method: "POST" });
    if (res.ok) {
      const updated: ProductDTO = await res.json();
      onUpdate({ status: "NEEDED", products: requirement.products.map((p) => (p.id === productId ? updated : p)) });
    }
  }

  async function refreshProduct(productId: string) {
    const res = await fetch(`/api/projects/${projectId}/products/${productId}/refresh`, { method: "POST" });
    const body = await res.json();
    if (res.ok) {
      onUpdate({ products: requirement.products.map((p) => (p.id === productId ? body : p)) });
    } else {
      alert(body.error || "Aktualizace ceny selhala.");
    }
  }

  async function removeProduct(productId: string) {
    onUpdate({ products: requirement.products.filter((p) => p.id !== productId) });
    await fetch(`/api/projects/${projectId}/products/${productId}`, { method: "DELETE" });
  }

  async function addManualProduct() {
    if (!manualForm.name.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/product-requirements/${requirement.id}/manual-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manualForm)
    });
    if (res.ok) {
      const created = await res.json();
      onUpdate({ products: [...requirement.products, created] });
      setManualForm(emptyManualForm);
      setManualOpen(false);
      setExpanded(true);
    }
  }

  function toggleCompare(id: string) {
    setComparing((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  const effectiveQuantity = requirement.quantityNeeded != null ? `${requirement.quantityNeeded} ${requirement.quantityUnit ?? ""}` : `${requirement.quantity} ks`;

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium text-ink">
            {requirement.description}
            {requirement.room && <span className="text-muted"> · {requirement.room}</span>}
          </div>
          <div className="text-xs text-muted">
            {PRODUCT_CATEGORY_LABELS[requirement.category as ProductCategory] ?? requirement.category} · potřeba {effectiveQuantity}
            {requirement.style && ` · styl: ${requirement.style}`}
            {(requirement.budgetMin || requirement.budgetMax) && (
              <> · rozpočet {formatCZK(requirement.budgetMin)} – {formatCZK(requirement.budgetMax)}/jedn.</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={requirement.status} onChange={(e) => updateStatus(e.target.value)} className="w-40 text-xs">
            {PRODUCT_REQUIREMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PRODUCT_REQUIREMENT_STATUS_LABELS[s as ProductRequirementStatus]}
              </option>
            ))}
          </Select>
          <button onClick={onRemove} className="text-xs text-muted hover:text-band-bad">
            smazat
          </button>
        </div>
      </div>

      {selected && (
        <div className="mt-3 rounded-md bg-band-good/10 p-2 text-xs text-band-good">
          Vybráno: <strong>{selected.name}</strong> ({selected.retailer ?? "—"}) — položka je zapsaná v rozpočtu projektu.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={findProducts} disabled={searching} className="text-xs">
          {searching ? "Hledám…" : "Najít produkty"}
        </Button>
        <button onClick={() => setManualOpen((o) => !o)} className="text-xs text-beige-500 underline underline-offset-2">
          {manualOpen ? "Zavřít ruční přidání" : "+ Přidat produkt ručně"}
        </button>
        {requirement.products.length > 0 && (
          <button onClick={() => setExpanded((e) => !e)} className="text-xs text-beige-500 underline underline-offset-2">
            {expanded ? "Skrýt kandidáty" : `Zobrazit kandidáty (${requirement.products.length})`}
          </button>
        )}
        {comparing.length >= 2 && (
          <button onClick={() => setShowComparison(true)} className="text-xs text-beige-500 underline underline-offset-2">
            Porovnat vybrané ({comparing.length})
          </button>
        )}
      </div>

      {searchNote && <p className="mt-2 text-xs text-band-warn">{searchNote}</p>}

      {manualOpen && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-beige-50 p-3 sm:grid-cols-3">
          <Input label="Název" value={manualForm.name} onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Obchod" value={manualForm.retailer} onChange={(e) => setManualForm((f) => ({ ...f, retailer: e.target.value }))} />
          <Input label="Cena (Kč)" type="number" value={manualForm.price} onChange={(e) => setManualForm((f) => ({ ...f, price: e.target.value }))} />
          <Input label="URL produktu" value={manualForm.productUrl} onChange={(e) => setManualForm((f) => ({ ...f, productUrl: e.target.value }))} className="col-span-2" />
          <Textarea label="Poznámka" value={manualForm.note} onChange={(e) => setManualForm((f) => ({ ...f, note: e.target.value }))} rows={1} />
          <div className="col-span-full flex justify-end">
            <Button onClick={addManualProduct} className="text-xs">
              Uložit ruční produkt
            </Button>
          </div>
        </div>
      )}

      {expanded && requirement.products.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-md bg-beige-50 p-2.5 text-xs">
            <Select label="Obchod" value={filterRetailer} onChange={(e) => setFilterRetailer(e.target.value)} className="w-36 text-xs">
              <option value="">Všechny</option>
              {retailers.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <Select label="Varianta" value={filterTier} onChange={(e) => setFilterTier(e.target.value)} className="w-32 text-xs">
              <option value="">Všechny</option>
              {PRODUCT_TIERS.map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_TIER_LABELS[t as ProductTier]}
                </option>
              ))}
            </Select>
            <Input
              label="Max. cena (Kč)"
              type="number"
              value={filterMaxPrice}
              onChange={(e) => setFilterMaxPrice(e.target.value)}
              className="w-28 text-xs"
            />
            <label className="flex items-center gap-1.5 pb-2.5">
              <input type="checkbox" checked={filterInStockOnly} onChange={(e) => setFilterInStockOnly(e.target.checked)} />
              Skladem
            </label>
            <label className="flex items-center gap-1.5 pb-2.5">
              <input type="checkbox" checked={filterPickupOnly} onChange={(e) => setFilterPickupOnly(e.target.checked)} />
              Osobní odběr
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                requirement={requirement}
                staleDataThresholdDays={staleDataThresholdDays}
                comparing={comparing.includes(p.id)}
                onToggleCompare={() => toggleCompare(p.id)}
                onSelect={() => selectProduct(p.id)}
                onDeselect={() => deselectProduct(p.id)}
                onRefresh={() => refreshProduct(p.id)}
                onRemove={() => removeProduct(p.id)}
              />
            ))}
          </div>
        </>
      )}

      {showComparison && (
        <ComparisonModal
          products={requirement.products.filter((p) => comparing.includes(p.id))}
          onClose={() => setShowComparison(false)}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  requirement,
  staleDataThresholdDays,
  comparing,
  onToggleCompare,
  onSelect,
  onDeselect,
  onRefresh,
  onRemove
}: {
  product: ProductDTO;
  requirement: ProductRequirementDTO;
  staleDataThresholdDays: number;
  comparing: boolean;
  onToggleCompare: () => void;
  onSelect: () => void;
  onDeselect: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const line = computeShoppingLine({
    quantityNeeded: requirement.quantityNeeded,
    fallbackQuantity: requirement.quantity,
    reservePct: requirement.reservePct,
    packSize: product.packSize,
    unitPrice: product.unitPrice ?? product.price
  });
  const stale = isDataStale(product.lastCheckedAt, staleDataThresholdDays);
  const unavailable = product.status === "UNAVAILABLE";

  return (
    <div className={`overflow-hidden rounded-lg border ${product.isSelected ? "border-band-good" : "border-line"} ${unavailable ? "opacity-60" : ""}`}>
      <div className="relative aspect-[4/3] w-full bg-beige-100">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">Bez fotografie</div>
        )}
        {product.tier && (
          <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium uppercase text-paper">
            {PRODUCT_TIER_LABELS[product.tier as ProductTier] ?? product.tier}
          </span>
        )}
        {product.source === "MANUAL" && (
          <span className="absolute right-2 top-2 rounded-full bg-beige-400 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
            Manuální
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-3">
        {unavailable && <div className="text-xs font-semibold text-band-bad">PRODUCT UNAVAILABLE</div>}
        <div className="font-medium text-ink">{product.name}</div>
        <div className="text-xs text-muted">
          {product.brand && `${product.brand} · `}
          {product.retailer ?? "neznámý obchod"}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Cena</span>
          <span className="font-medium number-tabular">
            {product.unitPrice != null ? `${formatCZK(product.unitPrice)}${product.unit ? `/${product.unit}` : ""}` : formatCZK(product.price)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Potřeba</span>
          <span className="number-tabular">
            {line.baseNeeded} {requirement.quantityUnit ?? ""}
          </span>
        </div>
        {requirement.quantityNeeded != null && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Rezerva</span>
            <span className="number-tabular">{Math.round(requirement.reservePct * 100)} %</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Objednat</span>
          <span className="number-tabular">
            {line.packs != null ? `${line.packs} balení (${line.orderedQuantity} ${requirement.quantityUnit ?? ""})` : `${line.orderedQuantity} ${requirement.quantityUnit ?? ""}`}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Cena celkem</span>
          <span className="font-semibold text-ink number-tabular">{formatCZK(line.totalPrice)}</span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${AVAILABILITY_STYLES[product.availability] ?? ""}`}>
            {PRODUCT_AVAILABILITY_LABELS[product.availability as keyof typeof PRODUCT_AVAILABILITY_LABELS] ?? product.availability}
          </span>
          {stale && !unavailable && (
            <span className="rounded-full bg-band-warn/10 px-2 py-0.5 text-[10px] font-medium uppercase text-band-warn">
              Stale price
            </span>
          )}
        </div>

        {product.branches.length > 0 && (
          <div className="rounded bg-beige-50 p-1.5 text-[11px] text-muted">
            {product.branches.map((b) => (
              <div key={b.id}>
                {b.name}
                {b.address && ` — ${b.address}`}
                {" · "}
                {PRODUCT_AVAILABILITY_LABELS[b.stockStatus as keyof typeof PRODUCT_AVAILABILITY_LABELS] ?? b.stockStatus}
                {b.stockQty != null && ` (${b.stockQty} ks)`}
                {b.personalPickup && " · osobní odběr"}
              </div>
            ))}
          </div>
        )}

        <div className="text-[10px] text-muted">Poslední ověření: {formatDateTime(product.lastCheckedAt)}</div>

        {product.productUrl && (
          <a
            href={product.productUrl}
            target="_blank"
            rel="noreferrer"
            className="block w-full rounded-full border border-ink/30 py-1.5 text-center text-xs font-medium text-ink hover:bg-beige-100"
          >
            Otevřít produkt
          </a>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
          {product.isSelected ? (
            <button onClick={onDeselect} className="text-band-bad">
              zrušit výběr
            </button>
          ) : (
            <button onClick={onSelect} className="font-medium text-band-good" disabled={unavailable}>
              vybrat produkt
            </button>
          )}
          {product.source !== "MANUAL" && (
            <button onClick={onRefresh} className="text-beige-500">
              aktualizovat cenu
            </button>
          )}
          <label className="flex items-center gap-1 text-muted">
            <input type="checkbox" checked={comparing} onChange={onToggleCompare} />
            porovnat
          </label>
          <button onClick={onRemove} className="ml-auto text-muted hover:text-band-bad">
            odebrat
          </button>
        </div>

        {product.isSelected && product.priceHistory.length > 0 && (
          <div className="mt-1 border-t border-line/60 pt-1 text-[11px] text-muted">
            {product.priceHistory
              .slice()
              .reverse()
              .slice(0, 4)
              .map((h) => (
                <div key={h.id}>
                  {formatDateTime(h.recordedAt)} — {formatCZK(h.price)}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonModal({ products, onClose }: { products: ProductDTO[]; onClose: () => void }) {
  const rows: Array<{ label: string; render: (p: ProductDTO) => React.ReactNode }> = [
    { label: "Obchod", render: (p) => p.retailer ?? "—" },
    { label: "Značka", render: (p) => p.brand ?? "—" },
    { label: "Cena/jedn.", render: (p) => (p.unitPrice != null ? `${formatCZK(p.unitPrice)}${p.unit ? `/${p.unit}` : ""}` : formatCZK(p.price)) },
    { label: "Cena celkem (bez rezervy)", render: (p) => formatCZK(p.price) },
    { label: "Dostupnost", render: (p) => PRODUCT_AVAILABILITY_LABELS[p.availability as keyof typeof PRODUCT_AVAILABILITY_LABELS] ?? p.availability },
    { label: "Balení", render: (p) => (p.packSize ? `${p.packSize} ${p.packUnit ?? ""}` : "—") },
    { label: "Poslední ověření", render: (p) => formatDateTime(p.lastCheckedAt) }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-xl2 bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-xl text-ink">Porovnání produktů</h3>
          <button onClick={onClose} className="text-sm text-muted hover:text-ink">
            zavřít
          </button>
        </div>
        <p className="mb-4 text-xs text-muted">
          Žádná varianta není automaticky označena jako „vítěz" — porovnej si reálné rozdíly a vyber sám.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Parametr</th>
                {products.map((p) => (
                  <th key={p.id} className="py-2 pr-3">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-xs text-muted">{row.label}</td>
                  {products.map((p) => (
                    <td key={p.id} className="py-2 pr-3 number-tabular">
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
