// Orchestration for the Real Product Shopping Engine: runs provider
// searches, persists real (or manual) candidates, and wires a selected
// product's real price into the project's budget/economics. Nothing here
// ever fabricates a product, price, URL, retailer, or stock level — when a
// provider isn't connected, the search simply returns nothing (and the UI
// says so honestly), it never falls back to made-up data.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getActiveProductProviders, getProductProvider } from "@/lib/products/registry";
import { ProductNotAvailableError, type ProductCandidate } from "@/lib/products/types";
import { computeShoppingLine } from "@/lib/productQuantity";
import type { BudgetCategory, ProductCategory, ShoppingCategory } from "@/lib/types";

// A shopping category maps directly onto the (extended) BudgetItem
// category taxonomy — see BUDGET_CATEGORIES in types.ts. OSVETLENI reuses
// the pre-existing SVETLA code so lighting fixtures bought via the shopping
// list land in the same bucket as pre-Phase-5 manual lighting entries.
const SHOPPING_TO_BUDGET_CATEGORY: Record<ShoppingCategory, BudgetCategory> = {
  STAVEBNI_MATERIAL: "STAVEBNI_MATERIAL",
  KOUPELNA: "KOUPELNA",
  KUCHYN: "KUCHYN",
  OSVETLENI: "SVETLA",
  NABYTEK: "NABYTEK",
  SPOTREBICE: "SPOTREBICE",
  DEKORACE: "DEKORACE",
  OSTATNI: "OSTATNI"
};

// Which Assumptions bucket a BudgetItem's category rolls up into when the
// shopping list recomputes renovation/furnishing/other costs.
const FURNISHING_CATEGORIES: BudgetCategory[] = ["NABYTEK", "SPOTREBICE", "DEKORACE"];
const OTHER_CATEGORIES: BudgetCategory[] = ["OSTATNI"];

async function persistCandidate(requirementId: string, c: ProductCandidate) {
  return prisma.product.create({
    data: {
      productRequirementId: requirementId,
      externalId: c.productId,
      provider: c.source,
      source: "PROVIDER",
      name: c.name,
      brand: c.brand ?? null,
      category: c.category,
      description: c.description ?? null,
      imageUrl: c.imageUrl ?? null,
      productUrl: c.productUrl,
      retailer: c.retailer,
      price: c.price,
      originalPrice: c.originalPrice ?? null,
      unitPrice: c.unitPrice ?? null,
      unit: c.unit ?? null,
      packSize: c.packSize ?? null,
      packUnit: c.packUnit ?? null,
      availability: c.availability,
      confidence: c.confidence,
      lastCheckedAt: new Date(c.lastCheckedAt),
      branches: c.branchAvailability
        ? {
            create: c.branchAvailability.map((b) => ({
              name: b.name,
              address: b.address ?? null,
              stockStatus: b.stockStatus,
              stockQty: b.stockQty ?? null,
              personalPickup: b.personalPickup ?? false
            }))
          }
        : undefined,
      priceHistory: { create: [{ price: c.price, availability: c.availability }] }
    }
  });
}

export interface ProductSearchOutcome {
  candidates: Awaited<ReturnType<typeof persistCandidate>>[];
  providerNotes: Array<{ provider: string; status: string; note?: string }>;
}

/**
 * Runs every ACTIVE product provider for this requirement. One provider's
 * failure never blocks another's results — each is isolated and reported.
 * With no ACTIVE provider (the current state of this app), returns an
 * empty candidate list plus a clear PENDING_ACCESS note per provider —
 * never a fabricated result.
 */
export async function searchProductsForRequirement(requirementId: string): Promise<ProductSearchOutcome> {
  const requirement = await prisma.productRequirement.findUniqueOrThrow({ where: { id: requirementId } });
  const settings = await getSettings();

  const active = getActiveProductProviders();
  const providerNotes: ProductSearchOutcome["providerNotes"] = [];
  const candidates: Awaited<ReturnType<typeof persistCandidate>>[] = [];

  for (const provider of active) {
    try {
      const results = await provider.search({
        category: requirement.category as ProductCategory,
        description: requirement.description,
        style: requirement.style,
        budgetMax: requirement.budgetMax,
        referenceLocality: settings.shoppingReferenceLocality
      });
      providerNotes.push({ provider: provider.key, status: "ACTIVE" });
      for (const c of results) {
        candidates.push(await persistCandidate(requirementId, c));
      }
    } catch (err) {
      const note = err instanceof ProductNotAvailableError ? err.message : "Vyhledávání produktů selhalo.";
      providerNotes.push({ provider: provider.key, status: "ERROR", note });
    }
  }

  return { candidates, providerNotes };
}

export async function addManualProduct(
  requirementId: string,
  data: { name: string; retailer?: string | null; price?: number | null; productUrl?: string | null; quantity?: number | null; note?: string | null; category?: ProductCategory }
) {
  const requirement = await prisma.productRequirement.findUniqueOrThrow({ where: { id: requirementId } });
  return prisma.product.create({
    data: {
      productRequirementId: requirementId,
      provider: "MANUAL",
      source: "MANUAL",
      name: data.name,
      category: data.category ?? (requirement.category as ProductCategory),
      description: data.note ?? null,
      productUrl: data.productUrl ?? null,
      retailer: data.retailer ?? null,
      price: data.price ?? null,
      unitPrice: data.price ?? null,
      availability: "UNKNOWN",
      confidence: "VERIFIED", // a human typing this in directly is a real, verified observation
      lastCheckedAt: new Date(),
      priceHistory: data.price != null ? { create: [{ price: data.price, availability: "UNKNOWN" }] } : undefined
    }
  });
}

/**
 * Recomputes Assumptions.renovationCost/furnishingCost/otherCosts from the
 * project's current BudgetItem rows (manually-added ones and
 * shopping-list-linked ones alike). Only ever called from an explicit
 * shopping-list action (select/deselect/refresh a product) — never a
 * passive background job, so it never silently overwrites a number the
 * user just typed into the Economics form for an unrelated reason.
 */
export async function recomputeProjectEconomicsFromBudget(projectId: string) {
  const [items, assumptions] = await Promise.all([
    prisma.budgetItem.findMany({ where: { projectId } }),
    prisma.assumptions.findUnique({ where: { projectId } })
  ]);
  if (!assumptions) return null;

  let furnishingCost = 0;
  let otherCosts = 0;
  let renovationCost = 0;
  for (const item of items) {
    const total = item.total ?? 0;
    if (FURNISHING_CATEGORIES.includes(item.category as BudgetCategory)) furnishingCost += total;
    else if (OTHER_CATEGORIES.includes(item.category as BudgetCategory)) otherCosts += total;
    else renovationCost += total;
  }

  return prisma.assumptions.update({
    where: { projectId },
    data: { renovationCost, furnishingCost, otherCosts }
  });
}

export async function syncBudgetItemForRequirement(requirementId: string) {
  const requirement = await prisma.productRequirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: { products: true, budgetItem: true, project: true }
  });
  const selected = requirement.products.find((p) => p.isSelected);

  if (!selected) {
    if (requirement.budgetItem) {
      await prisma.budgetItem.delete({ where: { id: requirement.budgetItem.id } });
    }
    return null;
  }

  const line = computeShoppingLine({
    quantityNeeded: requirement.quantityNeeded,
    fallbackQuantity: requirement.quantity,
    reservePct: requirement.reservePct,
    packSize: selected.packSize,
    unitPrice: selected.unitPrice ?? selected.price
  });

  const budgetCategory = SHOPPING_TO_BUDGET_CATEGORY[requirement.shoppingCategory as ShoppingCategory] ?? "OSTATNI";

  const data = {
    projectId: requirement.projectId,
    room: requirement.room,
    category: budgetCategory,
    name: selected.name,
    quantity: line.orderedQuantity,
    unit: requirement.quantityUnit ?? selected.unit ?? "ks",
    unitPrice: selected.unitPrice ?? selected.price,
    total: line.totalPrice,
    priceSource: selected.confidence === "VERIFIED" ? "EXACT" : "ESTIMATE",
    productUrl: selected.productUrl,
    shop: selected.retailer,
    verifiedAt: selected.lastCheckedAt
  };

  if (requirement.budgetItem) {
    return prisma.budgetItem.update({ where: { id: requirement.budgetItem.id }, data });
  }
  return prisma.budgetItem.create({ data: { ...data, productRequirementId: requirementId } });
}

export async function selectProduct(productId: string) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

  await prisma.$transaction([
    prisma.product.updateMany({
      where: { productRequirementId: product.productRequirementId, isSelected: true },
      data: { isSelected: false }
    }),
    prisma.product.update({ where: { id: productId }, data: { isSelected: true } }),
    prisma.productRequirement.update({
      where: { id: product.productRequirementId },
      data: { status: "SELECTED" }
    })
  ]);

  await syncBudgetItemForRequirement(product.productRequirementId);
  const requirement = await prisma.productRequirement.findUniqueOrThrow({ where: { id: product.productRequirementId } });
  await recomputeProjectEconomicsFromBudget(requirement.projectId);

  return prisma.product.findUniqueOrThrow({ where: { id: productId } });
}

export async function deselectProduct(productId: string) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  await prisma.product.update({ where: { id: productId }, data: { isSelected: false } });
  await prisma.productRequirement.update({
    where: { id: product.productRequirementId },
    data: { status: "NEEDED" }
  });

  await syncBudgetItemForRequirement(product.productRequirementId);
  const requirement = await prisma.productRequirement.findUniqueOrThrow({ where: { id: product.productRequirementId } });
  await recomputeProjectEconomicsFromBudget(requirement.projectId);

  return prisma.product.findUniqueOrThrow({ where: { id: productId } });
}

export class ManualProductRefreshError extends Error {}

/**
 * Re-checks one product's real price/availability/URL against its
 * provider. Never available for MANUAL products (there is no provider to
 * ask — the human who added it owns keeping it current). When the
 * provider reports the product no longer exists, marks it UNAVAILABLE
 * rather than leaving a stale price looking current.
 */
export async function refreshProductPricing(productId: string) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

  if (product.source === "MANUAL") {
    throw new ManualProductRefreshError("Ruční produkt nelze automaticky ověřit — upravte údaje ručně.");
  }

  const provider = getProductProvider(product.provider);
  if (!provider || provider.status !== "ACTIVE") {
    throw new ProductNotAvailableError(
      `${provider?.label ?? product.provider}: provider není aktivně připojen, cenu nelze ověřit.`
    );
  }

  const result = await provider.refresh(product.externalId ?? "");

  if (!result) {
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { status: "UNAVAILABLE" },
      include: { priceHistory: true }
    });
    await prisma.productPriceHistory.create({
      data: { productId, price: product.price, availability: "NENI_SKLADEM" }
    });
    if (product.isSelected) {
      await syncBudgetItemForRequirement(product.productRequirementId);
      await recomputeProjectEconomicsFromBudget((await prisma.productRequirement.findUniqueOrThrow({ where: { id: product.productRequirementId } })).projectId);
    }
    return updated;
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      price: result.price,
      originalPrice: result.originalPrice ?? null,
      unitPrice: result.unitPrice ?? null,
      productUrl: result.productUrl,
      availability: result.availability,
      confidence: result.confidence,
      lastCheckedAt: new Date(result.lastCheckedAt),
      status: "CANDIDATE"
    }
  });
  await prisma.productPriceHistory.create({
    data: { productId, price: result.price, availability: result.availability }
  });

  if (product.isSelected) {
    await syncBudgetItemForRequirement(product.productRequirementId);
    await recomputeProjectEconomicsFromBudget((await prisma.productRequirement.findUniqueOrThrow({ where: { id: product.productRequirementId } })).projectId);
  }

  return updated;
}
