import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { computeMaxRenovationBudget, computeMaxBuyPrice, computeEconomics, type AssumptionsInput } from "@/lib/calc";
import { computeRenovationCostBreakdown, computeRenovationBudgetStatus } from "@/lib/renovationBudget";
import { buildValueEngineeringPlan, rankValueEngineeringCandidates } from "@/lib/valueEngineering";
import { analyzePhotoWithAi, PhotoAnalysisNotAvailableError } from "@/lib/photoAnalysis";
import { requestPhotoGeneration } from "@/lib/photoGeneration";
import { createRequirementsFromChangeDetection, selectProduct } from "@/lib/productSearch";
import { VISION_PROVIDERS } from "@/lib/vision/registry";
import { IMAGE_GEN_PROVIDERS } from "@/lib/imageGen/registry";
import type { VisionProvider } from "@/lib/vision/types";
import type { ImageGenProvider } from "@/lib/imageGen/types";
import { genericProductSearchProvider } from "@/lib/products/genericSearchProvider";
import { ProductNotAvailableError } from "@/lib/products/types";
import { discoverOriginalListing } from "@/lib/listingDiscovery";
import { updateSettings } from "@/lib/settings";

async function wipeDb() {
  await prisma.productPriceHistory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productRequirement.deleteMany();
  await prisma.budgetItem.deleteMany();
  await prisma.photoGeneration.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.renovationPlan.deleteMany();
  await prisma.assumptions.deleteMany();
  await prisma.project.deleteMany();
}

// --- Item 5: MAX RENOVATION BUDGET (Budget First) ---

describe("computeMaxRenovationBudget (item 5 — Budget First)", () => {
  const base: AssumptionsInput = {
    purchasePriceUsed: 5000000,
    saleConservative: 6500000,
    saleBase: 6800000,
    saleOptimistic: 7000000,
    renovationCost: 0,
    furnishingCost: 0,
    legalCosts: 100000,
    financingCost: 0,
    otherCosts: 0,
    reserve: 50000,
    minProfit: 300000,
    minMarginPct: 0,
    minRoiPct: 0,
    incomeTaxPct: 0,
    bandWidthPct: 0.08
  };

  it("returns null (N/A) when the conservative sale price is unknown — never fabricates a ceiling", () => {
    const result = computeMaxRenovationBudget({ ...base, saleConservative: null });
    expect(result).toBeNull();
  });

  it("returns null (N/A) when the purchase price isn't known yet", () => {
    const result = computeMaxRenovationBudget({ ...base, purchasePriceUsed: null });
    expect(result).toBeNull();
  });

  it("computes a positive ceiling that satisfies the minimum profit target", () => {
    const result = computeMaxRenovationBudget(base);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
    // sale - purchase - legal - reserve - minProfit = 6500000-5000000-100000-50000-300000 = 1050000
    expect(result!).toBeCloseTo(1050000, 0);
  });

  it("a manual override always wins over the computed value", () => {
    const result = computeMaxRenovationBudget(base, 850000);
    expect(result).toBe(850000);
  });

  it("never returns a negative ceiling — floors at 0 instead", () => {
    const result = computeMaxRenovationBudget({ ...base, minProfit: 5000000 });
    expect(result).toBe(0);
  });
});

// --- Item 11/13/16: cost breakdown + budget status ---

describe("computeRenovationCostBreakdown (item 11/13)", () => {
  it("buckets are exhaustive — MATERIAL/PRODUCT/LABOUR/DELIVERY/WASTE/RESERVE always sum exactly to totalPlanned", () => {
    const items = [
      { total: 50000, category: "PODLAHY", productRequirementId: null, deliveryEstimate: 2000, wasteEstimate: 3000 },
      { total: 20000, category: "PRACE", productRequirementId: null, deliveryEstimate: null, wasteEstimate: null },
      { total: 15000, category: "DOPRAVA", productRequirementId: null, deliveryEstimate: null, wasteEstimate: null },
      { total: 10000, category: "REZERVA", productRequirementId: null, deliveryEstimate: null, wasteEstimate: null },
      { total: 30000, category: "KUCHYN", productRequirementId: "req-1", deliveryEstimate: null, wasteEstimate: null }
    ];
    const result = computeRenovationCostBreakdown(items);
    expect(result.totalPlanned).toBe(125000);
    const sum = result.MATERIAL + result.PRODUCT + result.LABOUR + result.DELIVERY + result.WASTE + result.RESERVE;
    expect(sum).toBe(result.totalPlanned);
    expect(result.LABOUR).toBe(20000);
    expect(result.PRODUCT).toBe(30000);
    expect(result.RESERVE).toBe(10000);
    expect(result.WASTE).toBeGreaterThan(0);
  });

  it("waste percentage is carved out of the material bucket, never invented from nothing", () => {
    const items = [{ total: 60000, category: "PODLAHY", productRequirementId: null, deliveryEstimate: null, wasteEstimate: 6000 }];
    const result = computeRenovationCostBreakdown(items);
    expect(result.WASTE).toBe(6000);
    expect(result.MATERIAL).toBe(54000);
  });

  it("a labour estimate line lands fully in the LABOUR bucket", () => {
    const items = [{ total: 25000, category: "PRACE", productRequirementId: null, deliveryEstimate: null, wasteEstimate: null }];
    const result = computeRenovationCostBreakdown(items);
    expect(result.LABOUR).toBe(25000);
    expect(result.MATERIAL).toBe(0);
  });
});

describe("computeRenovationBudgetStatus (item 16)", () => {
  it("is INSUFFICIENT_DATA when MAX RENOVATION BUDGET isn't known — never compares against a fabricated ceiling", () => {
    expect(computeRenovationBudgetStatus(null, 500000)).toBe("INSUFFICIENT_DATA");
  });

  it("is WITHIN_BUDGET when the plan is comfortably under the ceiling", () => {
    expect(computeRenovationBudgetStatus(850000, 600000)).toBe("WITHIN_BUDGET");
  });

  it("is NEAR_LIMIT once the plan crosses the 90% threshold", () => {
    expect(computeRenovationBudgetStatus(850000, 800000)).toBe("NEAR_LIMIT");
  });

  it("matches the spec's own worked example: max 850 000, plán 783 400 -> reserve 66 600 (>= 90 % of budget used -> NEAR_LIMIT)", () => {
    const status = computeRenovationBudgetStatus(850000, 783400);
    expect(status).toBe("NEAR_LIMIT");
    expect(850000 - 783400).toBe(66600);
  });

  it("is OVER_BUDGET once the plan exceeds the ceiling", () => {
    expect(computeRenovationBudgetStatus(850000, 900000)).toBe("OVER_BUDGET");
  });
});

// --- Item 14: Value Engineering ---

describe("Value Engineering (item 14)", () => {
  it("ranks a low-visibility swap (switches) ahead of a high-visibility one (kitchen) even with smaller savings", () => {
    const ranked = rankValueEngineeringCandidates([
      {
        requirementId: "r-kitchen",
        requirementDescription: "Kuchyňská linka",
        category: "KUCHYNE",
        currentProductId: "a",
        currentProductName: "Kuchyň A",
        currentPrice: 150000,
        alternativeProductId: "b",
        alternativeProductName: "Kuchyň B",
        alternativePrice: 120000
      },
      {
        requirementId: "r-switch",
        requirementDescription: "Vypínače",
        category: "VYPINACE",
        currentProductId: "c",
        currentProductName: "Vypínač A",
        currentPrice: 5000,
        alternativeProductId: "d",
        alternativeProductName: "Vypínač B",
        alternativePrice: 3000
      }
    ]);
    expect(ranked[0].requirementId).toBe("r-switch");
  });

  it("greedily closes an OVER_BUDGET gap using only real candidate savings, and reports what's still short", () => {
    const plan = buildValueEngineeringPlan(
      [
        {
          requirementId: "r1",
          requirementDescription: "Světla",
          category: "SVETLA",
          currentProductId: "a",
          currentProductName: "Světlo A",
          currentPrice: 20000,
          alternativeProductId: "b",
          alternativeProductName: "Světlo B",
          alternativePrice: 12000
        }
      ],
      5000
    );
    expect(plan.totalSavings).toBe(8000);
    expect(plan.stillOverBy).toBe(0);
    expect(plan.suggestions.length).toBe(1);
  });

  it("never suggests a swap that costs more than the original — savings must be positive", () => {
    const ranked = rankValueEngineeringCandidates([
      {
        requirementId: "r1",
        requirementDescription: "Podlaha",
        category: "PODLAHY",
        currentProductId: "a",
        currentProductName: "Levná podlaha",
        currentPrice: 10000,
        alternativeProductId: "b",
        alternativeProductName: "Dražší podlaha",
        alternativePrice: 15000
      }
    ]);
    expect(ranked.length).toBe(0);
  });
});

// --- Item 1/2: Listing Photo Discovery ---

describe("Listing Discovery Engine — photos (items 1/2)", () => {
  it("DiscoveryResult carries an empty photos array (not fabricated) with no active provider", async () => {
    const result = await discoverOriginalListing({
      propertyType: "APARTMENT",
      disposition: "2+1",
      municipality: "Brno",
      district: null,
      street: null,
      areaM2: 60,
      askingPrice: 5000000
    });
    expect(result.confidence).toBe("NOT_FOUND");
    expect(result.photos).toEqual([]);
  });
});

// --- Item 3: Photo Understanding Engine (mock Vision provider) ---

describe("Photo Understanding Engine — room detection + structured elements (item 3)", () => {
  const mockVision: VisionProvider = {
    key: "TEST_VISION",
    label: "Test Vision",
    status: "ACTIVE",
    async analyzePhoto(photoUrl: string) {
      if (photoUrl.includes("kitchen")) {
        return {
          roomType: "KUCHYN",
          currentCondition: "Původní kuchyňská linka z 90. let",
          visibleIssues: ["opotřebené dvířka"],
          keepNotes: null,
          removeNotes: "kuchyňská linka",
          replaceNotes: "linka, obklady",
          renovationSuggestions: "Vyměnit linku a obklady",
          confidence: "HIGH",
          elementDetails: {
            floor: "PVC, opotřebené",
            walls: "obklady nad linkou",
            ceiling: "hladký, bílý",
            doors: null,
            windows: "plastová, 1x",
            lighting: "zářivka",
            radiators: null,
            kitchen: "rohová linka, 90. léta",
            bathroomFixtures: null,
            furniture: null,
            builtIns: null
          }
        };
      }
      return {
        roomType: "KOUPELNA",
        currentCondition: "Původní obklady",
        visibleIssues: [],
        keepNotes: null,
        removeNotes: null,
        replaceNotes: "obklady, sanita",
        renovationSuggestions: null,
        confidence: "MEDIUM",
        elementDetails: {
          floor: "dlažba, praskliny",
          walls: "obklady 80. léta",
          ceiling: null,
          doors: null,
          windows: null,
          lighting: null,
          radiators: "trubkový",
          kitchen: null,
          bathroomFixtures: "vana, umyvadlo",
          furniture: null,
          builtIns: null
        }
      };
    }
  };

  beforeAll(async () => {
    await wipeDb();
    VISION_PROVIDERS.push(mockVision);
    await updateSettings({ aiPhotoAnalysisEnabled: true });
  });
  afterAll(async () => {
    await wipeDb();
    const idx = VISION_PROVIDERS.indexOf(mockVision);
    if (idx >= 0) VISION_PROVIDERS.splice(idx, 1);
    await updateSettings({ aiPhotoAnalysisEnabled: false });
  });

  it("detects a kitchen and persists structured element details, never inventing an unknown field", async () => {
    const project = await prisma.project.create({ data: { title: "Kitchen test" } });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/kitchen1.jpg", sortOrder: 0 } });

    const updated = await analyzePhotoWithAi(photo.id);
    expect(updated.roomType).toBe("KUCHYN");
    expect(updated.analysisSource).toBe("AI_VISION");
    const details = JSON.parse(updated.elementDetails!);
    expect(details.kitchen).toMatch(/linka/);
    expect(details.doors).toBeNull();
  });

  it("detects a bathroom from a different photo", async () => {
    const project = await prisma.project.create({ data: { title: "Bathroom test" } });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/bathroom1.jpg", sortOrder: 0 } });

    const updated = await analyzePhotoWithAi(photo.id);
    expect(updated.roomType).toBe("KOUPELNA");
    const details = JSON.parse(updated.elementDetails!);
    expect(details.bathroomFixtures).toMatch(/vana/);
  });
});

describe("AI Photo Analysis — provider unavailable (item 21 scenario)", () => {
  beforeAll(wipeDb);
  afterAll(wipeDb);

  it("throws PhotoAnalysisNotAvailableError, never a fabricated analysis, when no Vision provider is ACTIVE", async () => {
    await updateSettings({ aiPhotoAnalysisEnabled: true });
    const project = await prisma.project.create({ data: { title: "No vision" } });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/x.jpg", sortOrder: 0 } });
    await expect(analyzePhotoWithAi(photo.id)).rejects.toBeInstanceOf(PhotoAnalysisNotAvailableError);
    await updateSettings({ aiPhotoAnalysisEnabled: false });
  });
});

// --- Items 4/6/8/15/18: Renovation Visualization + Change Detection + shopping linkage ---

describe("Renovation Visualization pipeline (items 4/6/8/15/18)", () => {
  const mockImageGen: ImageGenProvider = {
    key: "TEST_IMAGE_GEN",
    label: "Test Image Gen",
    status: "ACTIVE",
    async generate(request) {
      return {
        generatedUrl: "https://example.test/generated/kitchen-after.jpg",
        model: "test-model-v1",
        changeDetection: ["PODLAHA", "KUCHYNSKA_LINKA", "SVETLA"],
        structuralChange: request.prompt?.includes("bourat") ?? false,
        structuralChangeNote: request.prompt?.includes("bourat") ? "Vizualizace předpokládá odstranění této příčky." : null,
        confidence: "MEDIUM"
      };
    }
  };

  beforeAll(() => {
    IMAGE_GEN_PROVIDERS.push(mockImageGen);
  });
  afterAll(async () => {
    await wipeDb();
    const idx = IMAGE_GEN_PROVIDERS.indexOf(mockImageGen);
    if (idx >= 0) IMAGE_GEN_PROVIDERS.splice(idx, 1);
  });

  it("passes the project's shared RenovationPlan as design-system context so rooms stay visually consistent", async () => {
    const project = await prisma.project.create({ data: { title: "Design consistency test" } });
    await prisma.renovationPlan.create({
      data: { projectId: project.id, style: "moderní minimalismus", flooring: "vinyl, světlý dub", wallColor: "bílá" }
    });
    const photo = await prisma.photo.create({
      data: { projectId: project.id, url: "https://example.test/kitchen.jpg", sortOrder: 0, roomType: "KUCHYN" }
    });

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("GENERATED");
    expect(generation.renovationPlanId).not.toBeNull();
  });

  it("marks a structural change explicitly and flags it for technical review, never presenting it as a routine cosmetic swap", async () => {
    const project = await prisma.project.create({ data: { title: "Structural test" } });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/livingroom.jpg", sortOrder: 0 } });

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", "otevřít dispozici, bourat příčku");
    expect(generation.structuralChange).toBe(true);
    expect(generation.structuralChangeNote).toMatch(/příčky/);
    expect(generation.requiresTechnicalReview).toBe(true);
  });

  it("Change Detection creates linked ProductRequirements in the shopping list — the visualization can't show a change with nothing to buy for it", async () => {
    const project = await prisma.project.create({ data: { title: "Linkage test" } });
    const photo = await prisma.photo.create({
      data: { projectId: project.id, url: "https://example.test/kitchen2.jpg", sortOrder: 0, roomType: "KUCHYN" }
    });

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("GENERATED");

    const requirements = await prisma.productRequirement.findMany({ where: { sourcePhotoGenerationId: generation.id } });
    // changeDetection was PODLAHA, KUCHYNSKA_LINKA, SVETLA -> 3 distinct categories
    expect(requirements.length).toBe(3);
    for (const r of requirements) {
      expect(r.usedInVisualization).toBe(false);
      expect(r.status).toBe("NEEDED");
    }
  });

  it("re-running createRequirementsFromChangeDetection for the same generation never duplicates requirements", async () => {
    const project = await prisma.project.create({ data: { title: "No duplicate test" } });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/kitchen3.jpg", sortOrder: 0 } });
    const generation = await prisma.photoGeneration.create({
      data: { photoId: photo.id, style: "MODERNI", status: "GENERATED", changeDetection: JSON.stringify(["PODLAHA"]) }
    });

    const first = await createRequirementsFromChangeDetection(generation.id, ["PODLAHA"], "KUCHYN", project.id);
    const second = await createRequirementsFromChangeDetection(generation.id, ["PODLAHA"], "KUCHYN", project.id);
    expect(first.length).toBe(1);
    expect(second.length).toBe(0);

    const all = await prisma.productRequirement.findMany({ where: { sourcePhotoGenerationId: generation.id } });
    expect(all.length).toBe(1);
  });
});

describe("Renovation Visualization — provider unavailable (item 19, honest architecture)", () => {
  afterAll(wipeDb);

  it("records NOT_CONFIGURED and never fabricates a generated image URL when no image-gen provider is ACTIVE", async () => {
    const project = await prisma.project.create({ data: { title: "No image gen" } });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/y.jpg", sortOrder: 0 } });

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    expect(generation.status).toBe("NOT_CONFIGURED");
    expect(generation.generatedUrl).toBeNull();
  });
});

// --- Item 17: renovation change recalculates profit/margin/ROI/MAX BUY PRICE ---

describe("Change Detection -> shopping selection -> economics recompute (item 17)", () => {
  const mockImageGen: ImageGenProvider = {
    key: "TEST_IMAGE_GEN_2",
    label: "Test Image Gen 2",
    status: "ACTIVE",
    async generate() {
      return {
        generatedUrl: "https://example.test/generated/after.jpg",
        model: "test-model-v1",
        changeDetection: ["PODLAHA"],
        structuralChange: false,
        structuralChangeNote: null,
        confidence: "HIGH"
      };
    }
  };

  beforeAll(() => {
    IMAGE_GEN_PROVIDERS.push(mockImageGen);
  });
  afterAll(async () => {
    await wipeDb();
    const idx = IMAGE_GEN_PROVIDERS.indexOf(mockImageGen);
    if (idx >= 0) IMAGE_GEN_PROVIDERS.splice(idx, 1);
  });

  it("selecting a product for a visualization-derived requirement recomputes renovation cost, MAX BUY PRICE, profit and ROI", async () => {
    const project = await prisma.project.create({ data: { title: "E2E test", askingPrice: 5000000, areaM2: 70 } });
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
        bandWidthPct: 0.08
      }
    });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/floor.jpg", sortOrder: 0 } });

    const beforeAssumptions = await prisma.assumptions.findUniqueOrThrow({ where: { projectId: project.id } });
    const beforeMaxBuy = computeMaxBuyPrice(beforeAssumptions as unknown as AssumptionsInput);

    const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
    const requirement = await prisma.productRequirement.findFirstOrThrow({ where: { sourcePhotoGenerationId: generation.id } });
    const product = await prisma.product.create({
      data: {
        productRequirementId: requirement.id,
        provider: "MANUAL",
        source: "MANUAL",
        name: "Vinylová podlaha",
        category: "PODLAHY",
        price: 60000,
        unitPrice: 60000,
        availability: "UNKNOWN",
        confidence: "VERIFIED",
        lastCheckedAt: new Date()
      }
    });

    await selectProduct(product.id);

    const afterAssumptions = await prisma.assumptions.findUniqueOrThrow({ where: { projectId: project.id } });
    expect(afterAssumptions.renovationCost).toBeGreaterThan(0);

    const afterMaxBuy = computeMaxBuyPrice(afterAssumptions as unknown as AssumptionsInput);
    expect(afterMaxBuy!).toBeLessThan(beforeMaxBuy!);

    const beforeEconomics = computeEconomics(project.askingPrice!, beforeAssumptions as unknown as AssumptionsInput, 70);
    const afterEconomics = computeEconomics(project.askingPrice!, afterAssumptions as unknown as AssumptionsInput, 70);
    expect(afterEconomics.scenarios.conservative.grossProfit!).toBeLessThan(beforeEconomics.scenarios.conservative.grossProfit!);
    expect(afterEconomics.scenarios.conservative.roiPct!).toBeLessThan(beforeEconomics.scenarios.conservative.roiPct!);
  });
});

// --- Item 20: real Czech product data provider architecture ---

describe("Generic Product Data Provider (item 20 — env-gated, never fabricates)", () => {
  const originalKey = process.env.PRODUCT_SEARCH_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.PRODUCT_SEARCH_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("is PENDING_ACCESS without PRODUCT_SEARCH_API_KEY", () => {
    delete process.env.PRODUCT_SEARCH_API_KEY;
    expect(genericProductSearchProvider.status).toBe("PENDING_ACCESS");
  });

  it("throws ProductNotAvailableError rather than returning a fabricated product when the key is missing", async () => {
    delete process.env.PRODUCT_SEARCH_API_KEY;
    await expect(
      genericProductSearchProvider.search({ category: "PODLAHY", description: "vinylová podlaha" })
    ).rejects.toBeInstanceOf(ProductNotAvailableError);
  });

  it("becomes ACTIVE once a key is set, and maps only real fields from the response — missing price stays UNKNOWN confidence", async () => {
    process.env.PRODUCT_SEARCH_API_KEY = "test-key";
    expect(genericProductSearchProvider.status).toBe("ACTIVE");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            productId: "sku-9",
            name: "Vinylová podlaha XY",
            productUrl: "https://example.cz/produkt/sku-9",
            retailer: "Příklad s.r.o.",
            price: null,
            availability: "NENI_SKLADEM"
          }
        ]
      })
    }) as any;

    const candidates = await genericProductSearchProvider.search({ category: "PODLAHY", description: "vinylová podlaha" });
    expect(candidates.length).toBe(1);
    expect(candidates[0].price).toBeNull();
    expect(candidates[0].confidence).toBe("UNKNOWN");
    expect(candidates[0].productUrl).toBe("https://example.cz/produkt/sku-9");
  });

  it("drops a result missing the minimum real fields (no fabricated placeholder product)", async () => {
    process.env.PRODUCT_SEARCH_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ name: "Podlaha bez URL a obchodu" }] })
    }) as any;

    const candidates = await genericProductSearchProvider.search({ category: "PODLAHY", description: "podlaha" });
    expect(candidates.length).toBe(0);
  });
});
