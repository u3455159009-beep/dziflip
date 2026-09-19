import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  searchProductsForRequirement,
  addManualProduct,
  selectProduct,
  deselectProduct,
  refreshProductPricing,
  ManualProductRefreshError
} from "@/lib/productSearch";
import { PRODUCT_PROVIDERS } from "@/lib/products/registry";
import { ProductNotAvailableError, type ProductProvider } from "@/lib/products/types";
import { computeMaxBuyPrice, computeEconomics, type AssumptionsInput } from "@/lib/calc";

const testProvider: ProductProvider = {
  key: "TEST_PROVIDER",
  label: "Test Provider",
  status: "ACTIVE",
  async search(query) {
    return [
      {
        productId: "sku-1",
        name: "Testovací vinylová podlaha",
        brand: "TestBrand",
        category: query.category,
        productUrl: "https://example.test/product/sku-1",
        retailer: "TestShop",
        price: 449,
        unitPrice: 449,
        unit: "m2",
        packSize: 2.2,
        packUnit: "balení",
        availability: "SKLADEM",
        lastCheckedAt: new Date().toISOString(),
        source: "TEST_PROVIDER",
        confidence: "VERIFIED"
      }
    ];
  },
  async refresh(productId: string) {
    if (productId === "sku-gone") return null;
    return {
      productId,
      name: "Testovací vinylová podlaha (aktualizováno)",
      category: "PODLAHY" as const,
      productUrl: "https://example.test/product/sku-1",
      retailer: "TestShop",
      price: 399,
      unitPrice: 399,
      unit: "m2",
      packSize: 2.2,
      availability: "SKLADEM" as const,
      lastCheckedAt: new Date().toISOString(),
      source: "TEST_PROVIDER",
      confidence: "VERIFIED" as const
    };
  }
};

const failingProvider: ProductProvider = {
  key: "FAILING_PROVIDER",
  label: "Failing Provider",
  status: "ACTIVE",
  async search() {
    throw new ProductNotAvailableError("Simulovaný výpadek providera.");
  },
  async refresh() {
    throw new ProductNotAvailableError("Simulovaný výpadek providera.");
  }
};

async function wipeDb() {
  await prisma.product.deleteMany();
  await prisma.productRequirement.deleteMany();
  await prisma.project.deleteMany();
}

async function createProjectWithAssumptions(overrides: Partial<AssumptionsInput> = {}) {
  const project = await prisma.project.create({ data: { title: "Shop test", askingPrice: 5000000, areaM2: 70 } });
  await prisma.assumptions.create({
    data: {
      projectId: project.id,
      purchasePriceUsed: 5000000,
      saleConservative: 6500000,
      saleBase: 6800000,
      saleOptimistic: 7000000,
      renovationCost: 0,
      furnishingCost: 0,
      otherCosts: 0,
      financingCost: 0,
      legalCosts: 0,
      reserve: 0,
      minProfit: 0,
      minMarginPct: 0,
      minRoiPct: 0,
      incomeTaxPct: 0,
      bandWidthPct: 0.08,
      ...overrides
    }
  });
  return project;
}

describe("Real Product Shopping Engine", () => {
  beforeAll(async () => {
    await wipeDb();
    PRODUCT_PROVIDERS.push(testProvider, failingProvider);
  });
  afterAll(async () => {
    await wipeDb();
    const idx1 = PRODUCT_PROVIDERS.indexOf(testProvider);
    if (idx1 >= 0) PRODUCT_PROVIDERS.splice(idx1, 1);
    const idx2 = PRODUCT_PROVIDERS.indexOf(failingProvider);
    if (idx2 >= 0) PRODUCT_PROVIDERS.splice(idx2, 1);
  });

  it("persists real candidate fields from an ACTIVE provider, and isolates a failing provider from a working one", async () => {
    const project = await createProjectWithAssumptions();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Vinylová podlaha", quantityNeeded: 64, quantityUnit: "m2", reservePct: 0.1 }
    });

    const outcome = await searchProductsForRequirement(requirement.id);

    expect(outcome.candidates.length).toBe(1);
    expect(outcome.candidates[0].name).toBe("Testovací vinylová podlaha");
    expect(outcome.candidates[0].productUrl).toBe("https://example.test/product/sku-1"); // must point at the specific product
    expect(outcome.candidates[0].confidence).toBe("VERIFIED");

    const failed = outcome.providerNotes.find((n) => n.provider === "FAILING_PROVIDER");
    const ok = outcome.providerNotes.find((n) => n.provider === "TEST_PROVIDER");
    expect(failed?.status).toBe("ERROR");
    expect(ok?.status).toBe("ACTIVE");
  });

  it("selecting a product writes a linked BudgetItem with the real computed price and recomputes renovation/max-buy-price/profit/ROI", async () => {
    const project = await createProjectWithAssumptions();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Vinylová podlaha", quantityNeeded: 64, quantityUnit: "m2", reservePct: 0.1 }
    });
    const product = await addManualProduct(requirement.id, { name: "Ruční podlaha", retailer: "Obchod X", price: 449, productUrl: "https://example.test/x" });

    const beforeAssumptions = await prisma.assumptions.findUniqueOrThrow({ where: { projectId: project.id } });
    const beforeMaxBuy = computeMaxBuyPrice(beforeAssumptions as unknown as AssumptionsInput);

    await selectProduct(product.id);

    const updatedRequirement = await prisma.productRequirement.findUniqueOrThrow({ where: { id: requirement.id } });
    expect(updatedRequirement.status).toBe("SELECTED");

    const budgetItem = await prisma.budgetItem.findUnique({ where: { productRequirementId: requirement.id } });
    expect(budgetItem).not.toBeNull();
    expect(budgetItem!.category).toBe("STAVEBNI_MATERIAL");
    // 64 m² + 10% reserve = 70.4 m², no packSize on manual product -> 70.4 * 449
    expect(budgetItem!.total).toBe(Math.round(70.4 * 449));

    const afterAssumptions = await prisma.assumptions.findUniqueOrThrow({ where: { projectId: project.id } });
    expect(afterAssumptions.renovationCost).toBe(budgetItem!.total);

    const afterMaxBuy = computeMaxBuyPrice(afterAssumptions as unknown as AssumptionsInput);
    expect(afterMaxBuy).not.toBeNull();
    expect(beforeMaxBuy).not.toBeNull();
    expect(afterMaxBuy!).toBeLessThan(beforeMaxBuy!); // higher real renovation cost -> lower max buy price

    const beforeEconomics = computeEconomics(project.askingPrice!, beforeAssumptions as unknown as AssumptionsInput, 70);
    const afterEconomics = computeEconomics(project.askingPrice!, afterAssumptions as unknown as AssumptionsInput, 70);
    expect(afterEconomics.scenarios.conservative.grossProfit).not.toBeNull();
    expect(beforeEconomics.scenarios.conservative.grossProfit).not.toBeNull();
    expect(afterEconomics.scenarios.conservative.grossProfit!).toBeLessThan(beforeEconomics.scenarios.conservative.grossProfit!);
    expect(afterEconomics.scenarios.conservative.roiPct!).toBeLessThan(beforeEconomics.scenarios.conservative.roiPct!);
  });

  it("deselecting a product removes the linked budget line and reverts the recomputed renovation cost", async () => {
    const project = await createProjectWithAssumptions();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Podlaha", quantity: 1 }
    });
    const product = await addManualProduct(requirement.id, { name: "Podlaha", price: 10000 });
    await selectProduct(product.id);

    let budgetItem = await prisma.budgetItem.findUnique({ where: { productRequirementId: requirement.id } });
    expect(budgetItem).not.toBeNull();

    await deselectProduct(product.id);

    budgetItem = await prisma.budgetItem.findUnique({ where: { productRequirementId: requirement.id } });
    expect(budgetItem).toBeNull();

    const requirementAfter = await prisma.productRequirement.findUniqueOrThrow({ where: { id: requirement.id } });
    expect(requirementAfter.status).toBe("NEEDED");

    const assumptions = await prisma.assumptions.findUniqueOrThrow({ where: { projectId: project.id } });
    expect(assumptions.renovationCost).toBe(0);
  });

  it("refreshing a still-existing product records a price change in ProductPriceHistory and never presents the old price as current", async () => {
    const project = await createProjectWithAssumptions();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Podlaha", quantity: 1 }
    });
    const created = await prisma.product.create({
      data: {
        productRequirementId: requirement.id,
        provider: "TEST_PROVIDER",
        externalId: "sku-refresh",
        source: "PROVIDER",
        name: "Podlaha",
        category: "PODLAHY",
        price: 449,
        unitPrice: 449,
        availability: "SKLADEM",
        confidence: "VERIFIED",
        lastCheckedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
      }
    });

    const updated = await refreshProductPricing(created.id);
    expect(updated.price).toBe(399);

    const history = await prisma.productPriceHistory.findMany({ where: { productId: created.id }, orderBy: { recordedAt: "asc" } });
    expect(history.length).toBeGreaterThan(0);
    expect(history[history.length - 1].price).toBe(399);
  });

  it("marks a product UNAVAILABLE when the provider reports it no longer exists — never keeps showing the old price as current", async () => {
    const project = await createProjectWithAssumptions();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Podlaha", quantity: 1 }
    });
    const created = await prisma.product.create({
      data: {
        productRequirementId: requirement.id,
        provider: "TEST_PROVIDER",
        externalId: "sku-gone",
        source: "PROVIDER",
        name: "Zmizelá podlaha",
        category: "PODLAHY",
        price: 449,
        availability: "SKLADEM",
        confidence: "VERIFIED",
        lastCheckedAt: new Date()
      }
    });

    const updated = await refreshProductPricing(created.id);
    expect(updated.status).toBe("UNAVAILABLE");
  });

  it("refuses to auto-refresh a MANUAL product — there is no provider to ask", async () => {
    const project = await createProjectWithAssumptions();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Podlaha", quantity: 1 }
    });
    const manual = await addManualProduct(requirement.id, { name: "Ruční podlaha", price: 100 });

    await expect(refreshProductPricing(manual.id)).rejects.toBeInstanceOf(ManualProductRefreshError);
  });

  it("a manually-added product is honestly marked MANUAL with VERIFIED confidence from the human who typed it, never a fabricated provider result", async () => {
    const project = await createProjectWithAssumptions();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "DVERE", shoppingCategory: "STAVEBNI_MATERIAL", description: "Dveře", quantity: 1 }
    });
    const manual = await addManualProduct(requirement.id, { name: "Interiérové dveře", retailer: "Stavebniny Novák", price: 3500, productUrl: "https://example.test/dvere" });
    expect(manual.source).toBe("MANUAL");
    expect(manual.confidence).toBe("VERIFIED");
    expect(manual.provider).toBe("MANUAL");
  });
});
