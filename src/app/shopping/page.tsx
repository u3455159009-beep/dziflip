import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { computeShoppingListSummary } from "@/lib/shoppingList";
import { formatCZK } from "@/lib/format";
import {
  PRODUCT_REQUIREMENT_STATUSES,
  PRODUCT_REQUIREMENT_STATUS_LABELS,
  type ProductRequirementStatus,
  type ShoppingCategory
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ShoppingOverviewPage() {
  const settings = await getSettings();
  const projects = await prisma.project.findMany({
    where: settings.showDemoData ? undefined : { isDemo: false },
    orderBy: { updatedAt: "desc" },
    include: {
      productRequirements: {
        include: { products: { select: { isSelected: true, unitPrice: true, price: true, packSize: true } } }
      }
    }
  });

  const withShopping = projects.filter((p) => p.productRequirements.length > 0);

  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl text-ink">Nákupy</h1>
      <p className="mb-8 text-sm text-muted">
        Přehled nákupního stavu všech projektů — kolik položek je vybráno, objednáno, koupeno, a kolik ještě chybí.
      </p>

      {withShopping.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádný projekt nemá nákupní seznam.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {withShopping.map((p) => {
            const summary = computeShoppingListSummary(
              p.productRequirements.map((r) => ({
                status: r.status as ProductRequirementStatus,
                shoppingCategory: r.shoppingCategory as ShoppingCategory,
                budgetMax: r.budgetMax,
                quantity: r.quantity,
                quantityNeeded: r.quantityNeeded,
                reservePct: r.reservePct,
                selectedProduct: r.products.find((pr) => pr.isSelected) ?? null
              }))
            );

            return (
              <Link
                key={p.id}
                href={`/project/${p.id}`}
                className="block rounded-xl2 border border-line bg-card p-5 shadow-card transition-shadow hover:shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">{p.title || "Nepojmenovaná nemovitost"}</div>
                    <div className="text-xs text-muted">{[p.municipality, p.district].filter(Boolean).join(" · ") || "Lokalita neznámá"}</div>
                  </div>
                  {p.isDemo && (
                    <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium uppercase text-paper">DEMO</span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-beige-100 px-2.5 py-1">{summary.totalRequirements} položek</span>
                  {PRODUCT_REQUIREMENT_STATUSES.map((s) => {
                    const count = summary.statusCounts[s as ProductRequirementStatus] ?? 0;
                    if (count === 0) return null;
                    return (
                      <span key={s} className="rounded-full bg-beige-100 px-2.5 py-1">
                        {count} {PRODUCT_REQUIREMENT_STATUS_LABELS[s as ProductRequirementStatus].toLowerCase()}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-xs">
                  <div>
                    <div className="text-muted">Rozpočet</div>
                    <div className="font-medium number-tabular">
                      {summary.plannedBudgetKnownCount > 0 ? formatCZK(summary.plannedBudget) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Aktuálně vybrané</div>
                    <div className="font-medium number-tabular">{formatCZK(summary.celkem)}</div>
                  </div>
                  <div>
                    <div className="text-muted">Rezerva</div>
                    <div className="font-medium number-tabular">{formatCZK(summary.rezerva)}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
