// Zero-Click Pipeline test suite (Request C, item 13). Covers: automatic
// photo-pipeline triggering with no click, Gemini Vision schema validation,
// automatic image generation, cache/idempotency across pipeline re-runs,
// automatic shopping-list generation, budget-constraint enforcement,
// automatic Value Engineering, the terminal OVER_BUDGET case, the
// provider-unavailable/WAITING_FOR_PROVIDER case, and no-fabricated-data
// guarantees in the new pipeline/RenovationPlan-generator code paths.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateSettings } from "@/lib/settings";
import { computePipelineState, advancePipeline } from "@/lib/pipeline";
import { GeminiVisionResponseSchema, buildVisionAnalysisPrompt } from "@/lib/vision/gemini/schema";
import {
  derivePriceLevel,
  buildRenovationPlanPrompt,
  generateRenovationPlan,
  RenovationPlanNotAvailableError
} from "@/lib/renovationPlanGenerator";
import { searchProductsForRequirement, autoSelectBestCandidate, selectProduct } from "@/lib/productSearch";
import type { AssumptionsInput } from "@/lib/calc";

const originalImageKey = process.env.IMAGE_GEN_API_KEY;
const originalProductKey = process.env.PRODUCT_SEARCH_API_KEY;
const originalFetch = global.fetch;

async function wipeDb() {
  // Every domain table hangs off Project with onDelete: Cascade, so
  // deleting projects clears comparables/photos/plans/requirements/budget
  // items/etc. automatically. ProviderErrorLog has no Project relation, so
  // it needs its own explicit delete.
  await prisma.providerErrorLog.deleteMany();
  await prisma.project.deleteMany();
}

async function resetEnv() {
  if (originalImageKey === undefined) delete process.env.IMAGE_GEN_API_KEY;
  else process.env.IMAGE_GEN_API_KEY = originalImageKey;
  if (originalProductKey === undefined) delete process.env.PRODUCT_SEARCH_API_KEY;
  else process.env.PRODUCT_SEARCH_API_KEY = originalProductKey;
  global.fetch = originalFetch;
  await updateSettings({ aiPhotoAnalysisEnabled: false });
}

const BASE_ASSUMPTIONS = {
  purchasePriceUsed: 3_000_000,
  saleConservative: 4_000_000,
  saleBase: 4_000_000,
  saleOptimistic: 4_200_000,
  renovationCost: 0,
  furnishingCost: 0,
  legalCosts: 0,
  financingCost: 0,
  otherCosts: 0,
  reserve: 0,
  minProfit: 300_000,
  minMarginPct: 0.1,
  minRoiPct: 0.15,
  incomeTaxPct: 0,
  bandWidthPct: 0.08
};
// With the numbers above, computeMaxRenovationBudget resolves to the ROI
// constraint: 4,000,000 / 1.15 - 3,000,000 ≈ 478,261 Kč. Kept as a plain
// comment (not re-derived) so test expectations stay readable.
const EXPECTED_MAX_RENOVATION_BUDGET = 4_000_000 / 1.15 - 3_000_000;

async function createProject(overrides: Record<string, unknown> = {}) {
  return prisma.project.create({
    data: {
      title: "Byt Žabovřesky",
      askingPrice: 3_200_000,
      areaM2: 100,
      municipality: "Brno",
      district: "Brno-Žabovřesky",
      ...overrides
    }
  });
}

async function createAssumptions(projectId: string, overrides: Record<string, unknown> = {}) {
  return prisma.assumptions.create({ data: { projectId, ...BASE_ASSUMPTIONS, ...overrides } });
}

async function createPhoto(projectId: string, overrides: Record<string, unknown> = {}) {
  return prisma.photo.create({
    data: { projectId, url: "https://example.test/listing/kitchen.jpg", sortOrder: 0, ...overrides }
  });
}

function fakePhotoBytes(): ArrayBuffer {
  return new TextEncoder().encode("fake-original-photo-bytes").buffer;
}

function mockPhotoResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null) },
    arrayBuffer: async () => fakePhotoBytes(),
    json: async () => ({})
  };
}

function mockVisionJsonResponse(overrides: Record<string, unknown> = {}) {
  const payload = {
    roomType: "KUCHYN",
    currentCondition: "Původní kuchyň z 90. let, opotřebovaná linka.",
    visibleIssues: ["opotřebovaná pracovní deska"],
    keepNotes: null,
    removeNotes: "stará kuchyňská linka",
    replaceNotes: "kuchyňská linka, podlaha",
    renovationSuggestions: "vyměnit linku a podlahu",
    confidence: "HIGH",
    elementDetails: null,
    ...overrides
  };
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }] })
  };
}

function mockRenovationPlanJsonResponse(overrides: Record<string, unknown> = {}) {
  const payload = {
    style: "moderní minimalismus",
    flooring: "vinylová podlaha, světlý dub",
    wallColor: null,
    doors: null,
    handles: null,
    outletsSwitches: null,
    lighting: "LED stropní svítidla",
    kitchen: null,
    bathroomFixtures: null,
    tiles: null,
    sanitary: null,
    builtIns: null,
    ...overrides
  };
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }] })
  };
}

function mockGeminiImageEditResponse(imageBase64 = "ZmFrZS1nZW5lcmF0ZWQtaW1hZ2U=") {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: imageBase64 } }] }, finishReason: "STOP" }]
    })
  };
}

function mockProductSearchResponse(category: string, price: number) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      results: [
        {
          productId: `prod-${category}`,
          name: `Testovací produkt ${category}`,
          category,
          productUrl: "https://shop.test/produkt",
          retailer: "TestShop",
          price,
          availability: "SKLADEM"
        }
      ]
    })
  };
}

// Routes every network call the pipeline can make: the Gemini
// generateContent endpoint (image-edit model vs. text/JSON model,
// distinguished by URL and by whether the prompt asks for a "roomType"
// JSON shape — only the Vision prompt does), the generic Product Data
// Provider's search endpoint, and any real photo-byte fetch.
function makeFullPipelineFetch(opts: { productPriceForCategory: (category: string) => number }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com")) {
      if (url.includes("flash-image")) return mockGeminiImageEditResponse();
      const body = JSON.parse((init?.body as string) ?? "{}");
      const promptText = body.contents?.[0]?.parts?.find((p: any) => p.text)?.text ?? "";
      if (promptText.includes('"roomType"')) return mockVisionJsonResponse();
      return mockRenovationPlanJsonResponse();
    }
    if (url.includes("api.example-product-data-provider.invalid")) {
      const parsed = new URL(url);
      const category = parsed.searchParams.get("category") ?? "OSTATNI";
      return mockProductSearchResponse(category, opts.productPriceForCategory(category));
    }
    return mockPhotoResponse();
  }) as any;
}

describe("computePipelineState — derives status live from real data, never a stored flag", () => {
  beforeEach(wipeDb);
  afterEach(resetEnv);
  afterAll(wipeDb);

  it("1. a freshly created project (comparables never run) reports COMPARABLES/MARKET_VALUE PENDING and overall RUNNING", async () => {
    const project = await createProject();
    const state = await computePipelineState(project.id);

    const comparables = state.steps.find((s) => s.step === "COMPARABLES")!;
    const marketValue = state.steps.find((s) => s.step === "MARKET_VALUE")!;
    expect(comparables.status).toBe("PENDING");
    expect(marketValue.status).toBe("PENDING");
    expect(state.overallStatus).toBe("RUNNING");
  });

  it("2. once comparable discovery has run (even with zero active source providers) and Assumptions exist, those steps report DONE", async () => {
    const project = await createProject();
    await createAssumptions(project.id);
    await prisma.project.update({
      where: { id: project.id },
      data: { lastComparableDiscoveryAt: new Date(), comparableDiscoveryNote: "Žádný aktivní zdroj." }
    });

    const state = await computePipelineState(project.id);
    expect(state.steps.find((s) => s.step === "COMPARABLES")!.status).toBe("DONE");
    expect(state.steps.find((s) => s.step === "MARKET_VALUE")!.status).toBe("DONE");
    expect(state.steps.find((s) => s.step === "MAX_BUDGET")!.status).toBe("DONE");
  });

  it("3. a photo needing analysis with no Vision provider connected reports PHOTO_ANALYSIS WAITING_FOR_PROVIDER and overall WAITING_FOR_PROVIDER", async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    const project = await createProject();
    await createAssumptions(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { lastComparableDiscoveryAt: new Date() } });
    await createPhoto(project.id);

    const state = await computePipelineState(project.id);
    const photoStep = state.steps.find((s) => s.step === "PHOTO_ANALYSIS")!;
    expect(photoStep.status).toBe("WAITING_FOR_PROVIDER");
    expect(state.overallStatus).toBe("WAITING_FOR_PROVIDER");
  });

  it("3b. Vision IS configured but the Settings consent toggle is off — PHOTO_ANALYSIS still reports WAITING_FOR_PROVIDER, never a permanently-stuck RUNNING", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    await updateSettings({ aiPhotoAnalysisEnabled: false });
    const project = await createProject();
    await createAssumptions(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { lastComparableDiscoveryAt: new Date() } });
    await createPhoto(project.id);

    const state = await computePipelineState(project.id);
    const photoStep = state.steps.find((s) => s.step === "PHOTO_ANALYSIS")!;
    expect(photoStep.status).toBe("WAITING_FOR_PROVIDER");
    expect(photoStep.detail).toMatch(/Nastavení/);
  });

  it("4. an unsearched ProductRequirement with no active product provider reports PRODUCTS WAITING_FOR_PROVIDER", async () => {
    delete process.env.PRODUCT_SEARCH_API_KEY;
    const project = await createProject();
    await createAssumptions(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { lastComparableDiscoveryAt: new Date() } });
    await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Podlaha" }
    });

    const state = await computePipelineState(project.id);
    expect(state.steps.find((s) => s.step === "PRODUCTS")!.status).toBe("WAITING_FOR_PROVIDER");
  });

  it("5. OVER_BUDGET with no further Value-Engineering candidates still reports BUDGET_CHECK DONE and overall DONE — the dashboard, not the pipeline, shows OVER BUDGET", async () => {
    const project = await createProject();
    await createAssumptions(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { lastComparableDiscoveryAt: new Date() } });
    await prisma.renovationPlan.create({ data: { projectId: project.id } }); // isolate BUDGET_CHECK from the unrelated RENOVATION_PLAN step
    const requirement = await prisma.productRequirement.create({
      data: {
        projectId: project.id,
        category: "PODLAHY",
        shoppingCategory: "STAVEBNI_MATERIAL",
        description: "Podlaha",
        searchedAt: new Date()
      }
    });
    const product = await prisma.product.create({
      data: {
        productRequirementId: requirement.id,
        provider: "MANUAL",
        name: "Drahá podlaha",
        category: "PODLAHY",
        price: 900_000,
        isSelected: true,
        confidence: "VERIFIED"
      }
    });
    await prisma.budgetItem.create({
      data: {
        projectId: project.id,
        productRequirementId: requirement.id,
        category: "STAVEBNI_MATERIAL",
        name: product.name,
        total: 900_000
      }
    });

    const state = await computePipelineState(project.id);
    expect(state.budgetStatus).toBe("OVER_BUDGET");
    expect(state.steps.find((s) => s.step === "BUDGET_CHECK")!.status).toBe("DONE");
    expect(state.overallStatus).toBe("DONE");
  });

  it("6. a photo already analyzed with a matching GENERATED visualization for the current plan reports VISUALIZATION DONE — never re-queued", async () => {
    const project = await createProject();
    const plan = await prisma.renovationPlan.create({ data: { projectId: project.id, flooring: "vinyl" } });
    await prisma.photo.create({
      data: {
        projectId: project.id,
        url: "https://example.test/a.jpg",
        sortOrder: 0,
        roomType: "KUCHYN",
        generations: { create: [{ style: "MODERNI", status: "GENERATED", renovationPlanId: plan.id }] }
      }
    });

    const state = await computePipelineState(project.id);
    expect(state.steps.find((s) => s.step === "VISUALIZATION")!.status).toBe("DONE");
  });
});

describe("advancePipeline — one bounded step at a time, entirely automatic (Zero-Click, no button click)", () => {
  beforeEach(wipeDb);
  afterEach(resetEnv);
  afterAll(wipeDb);

  it("7. runs comparable discovery first when it has never run — no click, and it's what unblocks every later step", async () => {
    const project = await createProject();
    await createAssumptions(project.id);
    global.fetch = vi.fn(async () => mockPhotoResponse()) as any; // must not be needed for this step

    const state = await advancePipeline(project.id);
    const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(refreshed.lastComparableDiscoveryAt).not.toBeNull();
    expect(state.steps.find((s) => s.step === "COMPARABLES")!.status).toBe("DONE");
  });

  it("8. once comparables are done and Vision is active with consent, advancePipeline analyzes one photo via a real Gemini Vision call — no click", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    await updateSettings({ aiPhotoAnalysisEnabled: true });
    const project = await createProject({ lastComparableDiscoveryAt: new Date() });
    await createAssumptions(project.id);
    const photo = await createPhoto(project.id);
    const fetchMock = makeFullPipelineFetch({ productPriceForCategory: () => 1000 });
    global.fetch = fetchMock;

    const state = await advancePipeline(project.id);

    const analyzed = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(analyzed.roomType).toBe("KUCHYN");
    expect(analyzed.analysisSource).toBe("AI_VISION");
    expect(state.steps.find((s) => s.step === "PHOTO_ANALYSIS")!.status).toBe("DONE");

    const visionCall = fetchMock.mock.calls.find((c: any) => {
      const u = String(c[0]);
      return u.includes("generativelanguage.googleapis.com") && !u.includes("flash-image");
    });
    expect(visionCall).toBeTruthy();
  });

  it("9. once a photo is analyzed, advancePipeline generates one shared RenovationPlan via Gemini — no click", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    const project = await createProject({ lastComparableDiscoveryAt: new Date() });
    await createAssumptions(project.id);
    await createPhoto(project.id, { roomType: "KUCHYN", currentCondition: "opotřebovaná" });
    global.fetch = makeFullPipelineFetch({ productPriceForCategory: () => 1000 });

    const state = await advancePipeline(project.id);

    const plan = await prisma.renovationPlan.findUnique({ where: { projectId: project.id } });
    expect(plan).not.toBeNull();
    expect(plan!.flooring).toBe("vinylová podlaha, světlý dub");
    // Deterministic, never left to the model — see derivePriceLevel.
    expect(plan!.priceLevel).toBe("STANDARD");
    expect(state.steps.find((s) => s.step === "RENOVATION_PLAN")!.status).toBe("DONE");
  });

  it("10. once a RenovationPlan exists, advancePipeline generates a Before/After visualization for an eligible photo and derives real ProductRequirements from Change Detection — no click", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    const project = await createProject({ lastComparableDiscoveryAt: new Date() });
    await createAssumptions(project.id);
    const plan = await prisma.renovationPlan.create({
      data: { projectId: project.id, flooring: "vinylová podlaha, světlý dub", lighting: "LED stropní svítidla" }
    });
    const photo = await createPhoto(project.id, { roomType: "KUCHYN" });
    global.fetch = makeFullPipelineFetch({ productPriceForCategory: () => 1000 });

    await advancePipeline(project.id);

    const generation = await prisma.photoGeneration.findFirst({ where: { photoId: photo.id } });
    expect(generation?.status).toBe("GENERATED");
    expect(generation?.renovationPlanId).toBe(plan.id);
    const changeDetection = JSON.parse(generation!.changeDetection!);
    expect(changeDetection).toEqual(expect.arrayContaining(["PODLAHA", "SVETLA"]));

    const requirements = await prisma.productRequirement.findMany({ where: { projectId: project.id } });
    expect(requirements.map((r) => r.category).sort()).toEqual(["PODLAHY", "SVETLA"]);
    expect(requirements.every((r) => r.status === "NEEDED")).toBe(true);
  });

  it("11. advancePipeline searches + auto-selects a real product for an unsearched requirement — no click, never a fabricated product", async () => {
    process.env.PRODUCT_SEARCH_API_KEY = "test-key";
    const project = await createProject({ lastComparableDiscoveryAt: new Date() });
    await createAssumptions(project.id);
    // Every earlier step already satisfied so PRODUCTS is the one step left.
    await prisma.renovationPlan.create({ data: { projectId: project.id } });
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Podlaha" }
    });
    global.fetch = makeFullPipelineFetch({ productPriceForCategory: () => 15_000 });

    await advancePipeline(project.id);

    const refreshed = await prisma.productRequirement.findUniqueOrThrow({
      where: { id: requirement.id },
      include: { products: true }
    });
    expect(refreshed.searchedAt).not.toBeNull();
    expect(refreshed.products).toHaveLength(1);
    expect(refreshed.products[0].name).toBe("Testovací produkt PODLAHY");
    expect(refreshed.products[0].productUrl).toBe("https://shop.test/produkt");
    expect(refreshed.products[0].isSelected).toBe(true); // auto-selected, the only real candidate found
  });

  it("12. the full chain — comparables, photo analysis, plan, visualization, products, budget check — reaches DONE entirely automatically, ending WITHIN_BUDGET", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    process.env.PRODUCT_SEARCH_API_KEY = "test-key";
    await updateSettings({ aiPhotoAnalysisEnabled: true });
    const project = await createProject();
    await createAssumptions(project.id);
    await createPhoto(project.id);
    // Cheap real prices — well under the ≈478,261 Kč max renovation budget.
    const fetchMock = makeFullPipelineFetch({ productPriceForCategory: () => 12_000 });
    global.fetch = fetchMock;

    let state = await computePipelineState(project.id);
    let iterations = 0;
    while (state.overallStatus !== "DONE" && iterations < 25) {
      state = await advancePipeline(project.id);
      iterations++;
    }

    expect(state.overallStatus).toBe("DONE");
    expect(state.budgetStatus).toBe("WITHIN_BUDGET");

    const photo = await prisma.photo.findFirstOrThrow({ where: { projectId: project.id } });
    expect(photo.roomType).toBe("KUCHYN");
    const plan = await prisma.renovationPlan.findUniqueOrThrow({ where: { projectId: project.id } });
    expect(plan.flooring).toBeTruthy();
    const generation = await prisma.photoGeneration.findFirstOrThrow({ where: { photoId: photo.id } });
    expect(generation.status).toBe("GENERATED");
    const requirements = await prisma.productRequirement.findMany({ where: { projectId: project.id } });
    expect(requirements.length).toBeGreaterThan(0);
    expect(requirements.every((r) => r.searchedAt !== null)).toBe(true);
  });

  it("13. once DONE, advancePipeline is idempotent — no further provider calls, no duplicate photos/products/budget lines", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    process.env.PRODUCT_SEARCH_API_KEY = "test-key";
    await updateSettings({ aiPhotoAnalysisEnabled: true });
    const project = await createProject();
    await createAssumptions(project.id);
    await createPhoto(project.id);
    const fetchMock = makeFullPipelineFetch({ productPriceForCategory: () => 12_000 });
    global.fetch = fetchMock;

    let state = await computePipelineState(project.id);
    let iterations = 0;
    while (state.overallStatus !== "DONE" && iterations < 25) {
      state = await advancePipeline(project.id);
      iterations++;
    }
    expect(state.overallStatus).toBe("DONE");

    const callCountAtDone = fetchMock.mock.calls.length;
    const photoCountAtDone = await prisma.photo.count({ where: { projectId: project.id } });
    const productCountAtDone = await prisma.product.count();
    const budgetItemCountAtDone = await prisma.budgetItem.count({ where: { projectId: project.id } });

    // A further round of calls (well beyond what could possibly be needed)
    // must be a total no-op: real data never re-runs against itself.
    for (let i = 0; i < 5; i++) {
      state = await advancePipeline(project.id);
    }

    expect(state.overallStatus).toBe("DONE");
    expect(fetchMock.mock.calls.length).toBe(callCountAtDone);
    expect(await prisma.photo.count({ where: { projectId: project.id } })).toBe(photoCountAtDone);
    expect(await prisma.product.count()).toBe(productCountAtDone);
    expect(await prisma.budgetItem.count({ where: { projectId: project.id } })).toBe(budgetItemCountAtDone);
  });

  it("14. a photo uploaded after the pipeline was already DONE makes the pipeline RUNNING again, and the next advancePipeline call processes only the new photo", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    await updateSettings({ aiPhotoAnalysisEnabled: true });
    const project = await createProject({ lastComparableDiscoveryAt: new Date() });
    await createAssumptions(project.id);
    const plan = await prisma.renovationPlan.create({ data: { projectId: project.id, flooring: "vinyl" } });
    const firstPhoto = await createPhoto(project.id, {
      roomType: "KUCHYN",
      generations: { create: [{ style: "MODERNI", status: "GENERATED", renovationPlanId: plan.id }] }
    } as any);
    let state = await computePipelineState(project.id);
    expect(state.overallStatus).toBe("DONE");

    const newPhoto = await createPhoto(project.id, { url: "https://example.test/listing/new-bathroom.jpg" });
    state = await computePipelineState(project.id);
    expect(state.overallStatus).not.toBe("DONE");
    expect(state.steps.find((s) => s.step === "PHOTO_ANALYSIS")!.status).toBe("RUNNING");

    global.fetch = makeFullPipelineFetch({ productPriceForCategory: () => 1000 });
    await advancePipeline(project.id);

    const untouchedFirst = await prisma.photo.findUniqueOrThrow({ where: { id: firstPhoto.id } });
    const analyzedNew = await prisma.photo.findUniqueOrThrow({ where: { id: newPhoto.id } });
    expect(untouchedFirst.roomType).toBe("KUCHYN"); // unchanged, never re-analyzed
    expect(analyzedNew.roomType).toBe("KUCHYN"); // the new one is now processed
  });
});

describe("advancePipeline — automatic Value Engineering when OVER_BUDGET (item 9)", () => {
  beforeEach(wipeDb);
  afterEach(resetEnv);
  afterAll(wipeDb);

  async function overBudgetProjectWithAlternative() {
    const project = await createProject();
    await createAssumptions(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { lastComparableDiscoveryAt: new Date() } });
    await prisma.renovationPlan.create({ data: { projectId: project.id } });
    const requirement = await prisma.productRequirement.create({
      data: {
        projectId: project.id,
        category: "PODLAHY",
        shoppingCategory: "STAVEBNI_MATERIAL",
        description: "Podlaha",
        searchedAt: new Date()
      }
    });
    const expensive = await prisma.product.create({
      data: {
        productRequirementId: requirement.id,
        provider: "MANUAL",
        name: "Prémiová dřevěná podlaha",
        category: "PODLAHY",
        price: 700_000,
        isSelected: true,
        status: "CANDIDATE",
        confidence: "VERIFIED"
      }
    });
    const cheaper = await prisma.product.create({
      data: {
        productRequirementId: requirement.id,
        provider: "MANUAL",
        name: "Vinylová podlaha (levnější alternativa)",
        category: "PODLAHY",
        price: 120_000,
        isSelected: false,
        status: "CANDIDATE",
        confidence: "VERIFIED"
      }
    });
    await prisma.budgetItem.create({
      data: {
        projectId: project.id,
        productRequirementId: requirement.id,
        category: "STAVEBNI_MATERIAL",
        name: expensive.name,
        total: expensive.price!
      }
    });
    return { project, requirement, expensive, cheaper };
  }

  it("15. automatically swaps to a real, already-found cheaper alternative when OVER_BUDGET — no click", async () => {
    const { project, cheaper } = await overBudgetProjectWithAlternative();

    const before = await computePipelineState(project.id);
    expect(before.budgetStatus).toBe("OVER_BUDGET");

    await advancePipeline(project.id);

    const cheaperRefreshed = await prisma.product.findUniqueOrThrow({ where: { id: cheaper.id } });
    expect(cheaperRefreshed.isSelected).toBe(true);
    const budgetItem = await prisma.budgetItem.findFirstOrThrow({ where: { projectId: project.id } });
    expect(budgetItem.total).toBe(120_000);
  });

  it("16. never swaps to a MORE expensive product, and never invents a discount when no real cheaper alternative exists", async () => {
    const project = await createProject();
    await createAssumptions(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { lastComparableDiscoveryAt: new Date() } });
    await prisma.renovationPlan.create({ data: { projectId: project.id } });
    const requirement = await prisma.productRequirement.create({
      data: {
        projectId: project.id,
        category: "PODLAHY",
        shoppingCategory: "STAVEBNI_MATERIAL",
        description: "Podlaha",
        searchedAt: new Date()
      }
    });
    const onlyOption = await prisma.product.create({
      data: {
        productRequirementId: requirement.id,
        provider: "MANUAL",
        name: "Jediná nalezená podlaha",
        category: "PODLAHY",
        price: 900_000,
        isSelected: true,
        status: "CANDIDATE",
        confidence: "VERIFIED"
      }
    });
    await prisma.budgetItem.create({
      data: { projectId: project.id, productRequirementId: requirement.id, category: "STAVEBNI_MATERIAL", name: onlyOption.name, total: 900_000 }
    });

    const state = await advancePipeline(project.id);

    expect(state.budgetStatus).toBe("OVER_BUDGET");
    expect(state.overallStatus).toBe("DONE"); // no reasonable path remains — reported honestly, never faked
    const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: onlyOption.id } });
    expect(unchanged.isSelected).toBe(true);
    expect(unchanged.price).toBe(900_000);
  });
});

describe("GeminiVisionResponseSchema — structured JSON, validated, never crashes on a bad model response (item 3)", () => {
  it("17. accepts a fully valid Vision response as-is", () => {
    const valid = {
      roomType: "KOUPELNA",
      currentCondition: "Stará koupelna, obklady z 80. let.",
      visibleIssues: ["prasklé obklady", "zastaralá sanita"],
      keepNotes: null,
      removeNotes: "staré obklady",
      replaceNotes: "obklady, sanita, baterie",
      renovationSuggestions: "kompletní rekonstrukce koupelny",
      confidence: "HIGH",
      elementDetails: { floor: "dlažba", walls: "obklady", ceiling: null, doors: null, windows: null, lighting: null, radiators: null, kitchen: null, bathroomFixtures: "stará vana", furniture: null, builtIns: null }
    };
    const result = GeminiVisionResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.roomType).toBe("KOUPELNA");
      expect(result.data.elementDetails?.bathroomFixtures).toBe("stará vana");
    }
  });

  it("18. coerces a malformed/unexpected response to safe defaults instead of throwing — roomType→NEZNAME, confidence→LOW, arrays→[]", () => {
    const malformed = {
      roomType: "NOT_A_REAL_ROOM_TYPE",
      currentCondition: 12345, // wrong type
      visibleIssues: "not an array",
      confidence: "SUPER_HIGH", // not one of the enum values
      elementDetails: "not an object"
    };
    const result = GeminiVisionResponseSchema.safeParse(malformed);
    expect(result.success).toBe(true); // .catch() on every field — never throws
    if (result.success) {
      expect(result.data.roomType).toBe("NEZNAME");
      expect(result.data.visibleIssues).toEqual([]);
      expect(result.data.confidence).toBe("LOW");
      expect(result.data.currentCondition).toBeNull();
      expect(result.data.elementDetails).toBeNull();
    }
  });

  it("19. buildVisionAnalysisPrompt tells the model to say null/empty rather than guess or invent", () => {
    const prompt = buildVisionAnalysisPrompt();
    expect(prompt).toMatch(/roomType/);
    expect(prompt.toLowerCase()).toMatch(/never guess or invent/);
  });
});

describe("RenovationPlanGenerator — budget-first, never lets AI break the flip's economics (item 4/5)", () => {
  beforeEach(wipeDb);
  afterEach(resetEnv);
  afterAll(wipeDb);

  it("20. derivePriceLevel returns BUDGET/STANDARD/PREMIUM from real computed economics, and null when economics are unknown", () => {
    expect(derivePriceLevel(200_000, 100)).toBe("BUDGET"); // 2,000 Kč/m²
    expect(derivePriceLevel(478_000, 100)).toBe("STANDARD"); // 4,780 Kč/m²
    expect(derivePriceLevel(900_000, 100)).toBe("PREMIUM"); // 9,000 Kč/m²
    expect(derivePriceLevel(null, 100)).toBeNull();
    expect(derivePriceLevel(500_000, null)).toBeNull();
    expect(derivePriceLevel(500_000, 0)).toBeNull();
  });

  it("21. buildRenovationPlanPrompt states the real MAX RENOVATION BUDGET and a HARD CONSTRAINT tier — never a silent, unconstrained request", () => {
    const prompt = buildRenovationPlanPrompt({
      rooms: [{ roomType: "KUCHYN", currentCondition: "opotřebovaná", elementDetails: null }],
      priceLevel: "BUDGET",
      maxRenovationBudget: 250_000,
      municipality: "Brno",
      district: "Brno-Žabovřesky"
    });
    expect(prompt).toMatch(/HARD CONSTRAINT/);
    expect(prompt).toMatch(/"BUDGET"/);
    expect(prompt).toMatch(/250000|250 000|250,000/); // the real number, not a placeholder
    // The word "luxury" appears only inside the negative instruction not to
    // propose one — the prompt must never recommend it.
    expect(prompt.toLowerCase()).toMatch(/do not propose a luxury/);
  });

  it("22. generateRenovationPlan never fabricates a plan when Gemini isn't configured — throws RenovationPlanNotAvailableError instead", async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    const project = await createProject();
    await createAssumptions(project.id);

    await expect(generateRenovationPlan(project.id)).rejects.toBeInstanceOf(RenovationPlanNotAvailableError);
    const plan = await prisma.renovationPlan.findUnique({ where: { projectId: project.id } });
    expect(plan).toBeNull();
  });

  it("23. generateRenovationPlan is idempotent — an existing plan is returned unchanged, never overwritten or regenerated", async () => {
    process.env.IMAGE_GEN_API_KEY = "test-key";
    const project = await createProject();
    await createAssumptions(project.id);
    const existing = await prisma.renovationPlan.create({ data: { projectId: project.id, flooring: "already decided" } });
    global.fetch = vi.fn() as any; // must never be called — no regeneration

    const result = await generateRenovationPlan(project.id);
    expect(result.id).toBe(existing.id);
    expect(result.flooring).toBe("already decided");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("Shopping list / product search — never fabricates a product, price, or URL (item 8)", () => {
  beforeEach(wipeDb);
  afterEach(resetEnv);
  afterAll(wipeDb);

  it("24. with no product provider connected, search returns no candidates and a clear PENDING note — never fake data", async () => {
    delete process.env.PRODUCT_SEARCH_API_KEY;
    const project = await createProject();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Podlaha" }
    });

    const outcome = await searchProductsForRequirement(requirement.id);
    expect(outcome.candidates).toHaveLength(0);
    expect(outcome.providerNotes.every((n) => n.status !== "ACTIVE")).toBe(true);

    const refreshed = await prisma.productRequirement.findUniqueOrThrow({ where: { id: requirement.id } });
    expect(refreshed.searchedAt).not.toBeNull(); // "attempted" is still recorded, so the pipeline doesn't loop forever
  });

  it("25. autoSelectBestCandidate never overrides an already-selected (e.g. human-chosen) product", async () => {
    const project = await createProject();
    const requirement = await prisma.productRequirement.create({
      data: { projectId: project.id, category: "PODLAHY", shoppingCategory: "STAVEBNI_MATERIAL", description: "Podlaha" }
    });
    const humanChoice = await prisma.product.create({
      data: { productRequirementId: requirement.id, provider: "MANUAL", name: "Ručně vybraná podlaha", category: "PODLAHY", price: 50_000, isSelected: true, confidence: "VERIFIED" }
    });
    await prisma.product.create({
      data: { productRequirementId: requirement.id, provider: "MANUAL", name: "Levnější alternativa", category: "PODLAHY", price: 10_000, isSelected: false, status: "CANDIDATE", confidence: "VERIFIED" }
    });

    const result = await autoSelectBestCandidate(requirement.id);
    expect(result).toBeNull();
    const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: humanChoice.id } });
    expect(unchanged.isSelected).toBe(true);
  });
});
