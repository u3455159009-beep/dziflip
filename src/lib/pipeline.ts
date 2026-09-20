// Zero-Click Pipeline orchestrator. After a project is created (or a photo
// is uploaded), nothing else requires a user click — this module derives
// what work is still outstanding purely from real database state (never a
// separate "have I done this" flag that could drift out of sync) and
// performs exactly ONE bounded unit of that work per call, so each
// serverless request stays fast and safe regardless of how many photos or
// products a project has.
//
// The client (PipelineStatus.tsx) polls POST .../pipeline/advance
// repeatedly until the whole thing reports DONE. Because every check
// re-reads the database rather than trusting a stored "step done" flag,
// this is naturally idempotent and crash-safe: if a serverless invocation
// dies mid-step, the next poll just re-evaluates real state and continues
// — it can never duplicate a photo, a product, or a cost line.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { discoverComparablesForProject } from "@/lib/comparableDiscovery";
import { analyzePhotoWithAi, PhotoAnalysisNotAvailableError } from "@/lib/photoAnalysis";
import { getActiveVisionProvider } from "@/lib/vision/registry";
import { requestPhotoGeneration } from "@/lib/photoGeneration";
import { getActiveImageGenProvider } from "@/lib/imageGen/registry";
import { generateRenovationPlan, RenovationPlanNotAvailableError } from "@/lib/renovationPlanGenerator";
import { searchProductsForRequirement, autoSelectBestCandidate, selectProduct } from "@/lib/productSearch";
import { getActiveProductProviders } from "@/lib/products/registry";
import { ProductNotAvailableError } from "@/lib/products/types";
import { computeMaxRenovationBudget, type AssumptionsInput } from "@/lib/calc";
import { computeRenovationBudgetStatus, computeRenovationCostBreakdown } from "@/lib/renovationBudget";
import { buildValueEngineeringPlan, type ValueEngineeringCandidate } from "@/lib/valueEngineering";
import type { RenovationBudgetStatus } from "@/lib/types";

export const PIPELINE_STEPS = [
  "EXTRACT",
  "LISTING_VERIFICATION",
  "COMPARABLES",
  "MARKET_VALUE",
  "MAX_BUDGET",
  "PHOTO_ANALYSIS",
  "RENOVATION_PLAN",
  "VISUALIZATION",
  "PRODUCTS",
  "BUDGET_CHECK",
  "DONE"
] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  EXTRACT: "Čtu inzerát",
  LISTING_VERIFICATION: "Ověřuji nemovitost",
  COMPARABLES: "Hledám srovnatelné nabídky",
  MARKET_VALUE: "Počítám tržní cenu",
  MAX_BUDGET: "Počítám maximální rozpočet rekonstrukce",
  PHOTO_ANALYSIS: "Analyzuji fotografie",
  RENOVATION_PLAN: "Navrhuji rekonstrukci",
  VISUALIZATION: "Generuji BEFORE/AFTER",
  PRODUCTS: "Hledám produkty",
  BUDGET_CHECK: "Kontroluji rozpočet",
  DONE: "Hotovo"
};

export type PipelineStepStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "WAITING_FOR_PROVIDER";

export interface PipelineStepState {
  step: PipelineStep;
  status: PipelineStepStatus;
  detail: string | null;
}

export interface PipelineState {
  overallStatus: "RUNNING" | "DONE" | "WAITING_FOR_PROVIDER";
  steps: PipelineStepState[];
  budgetStatus: RenovationBudgetStatus | null;
}

const RELEVANT_ROOM_TYPES_EXCLUDED = new Set(["NEZNAME"]);

async function getProjectFull(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      photos: { include: { generations: true } },
      assumptions: true,
      renovationPlan: true,
      productRequirements: { include: { products: true, budgetItem: true } },
      budgetItems: true,
      comparables: true
    }
  });
}

function eligiblePhotosForAnalysis<T extends { roomType: string | null }>(photos: T[]): T[] {
  return photos.filter((p) => p.roomType === null);
}

function eligiblePhotosForVisualization<
  T extends { roomType: string | null; generations: Array<{ status: string; renovationPlanId: string | null }> }
>(photos: T[], planId: string): T[] {
  return photos.filter((p) => {
    if (!p.roomType || RELEVANT_ROOM_TYPES_EXCLUDED.has(p.roomType)) return false;
    return !p.generations.some((g) => g.status === "GENERATED" && g.renovationPlanId === planId);
  });
}

/**
 * Read-only — derives the full pipeline state from real data, never
 * performs any work itself. Used both by the status endpoint and by
 * advancePipeline to decide what to do next.
 */
export async function computePipelineState(projectId: string): Promise<PipelineState> {
  const [project, settings] = await Promise.all([getProjectFull(projectId), getSettings()]);
  const steps: PipelineStepState[] = [];

  steps.push({ step: "EXTRACT", status: "DONE", detail: null });

  const listingDone = project.discoveredListingConfidence != null || !project.sourceText || project.sourceUrl != null;
  steps.push({
    step: "LISTING_VERIFICATION",
    status: listingDone ? "DONE" : "PENDING",
    detail: project.discoveredListingConfidence ?? null
  });

  steps.push({
    step: "COMPARABLES",
    status: project.lastComparableDiscoveryAt ? "DONE" : "PENDING",
    detail: project.comparableDiscoveryNote
  });

  // Market value/ARV are computed live from comparables wherever they're
  // displayed (never stored) — this step is just "did comparable discovery
  // run", i.e. done together with COMPARABLES.
  steps.push({ step: "MARKET_VALUE", status: project.lastComparableDiscoveryAt ? "DONE" : "PENDING", detail: null });

  // MAX RENOVATION BUDGET is likewise a live calc — done as soon as
  // Assumptions exists, which it always does from the moment of creation.
  steps.push({ step: "MAX_BUDGET", status: project.assumptions ? "DONE" : "PENDING", detail: null });

  const photosNeedingAnalysis = eligiblePhotosForAnalysis(project.photos);
  const visionActive = Boolean(getActiveVisionProvider());
  // Vision being ACTIVE (a real key configured) isn't enough on its own —
  // sending real property photos to an external AI vendor also needs the
  // explicit Settings consent toggle. Without it, analysis can never
  // actually run; reporting that truthfully as WAITING_FOR_PROVIDER (rather
  // than a "RUNNING" that never finishes) is what keeps this step's status
  // honest and stops the client from polling a step that can't progress.
  const photoAnalysisReady = visionActive && settings.aiPhotoAnalysisEnabled;
  steps.push({
    step: "PHOTO_ANALYSIS",
    status:
      photosNeedingAnalysis.length === 0
        ? "DONE"
        : photoAnalysisReady
          ? "RUNNING"
          : "WAITING_FOR_PROVIDER",
    detail:
      photosNeedingAnalysis.length === 0
        ? null
        : visionActive && !settings.aiPhotoAnalysisEnabled
          ? "AI analýza fotografií je v Nastavení vypnutá — zapněte ji, aby mohla proběhnout automaticky."
          : `${photosNeedingAnalysis.length} fotografií čeká na analýzu`
  });

  const geminiTextConfigured = Boolean(process.env.IMAGE_GEN_API_KEY);
  steps.push({
    step: "RENOVATION_PLAN",
    status: project.renovationPlan ? "DONE" : geminiTextConfigured ? "RUNNING" : "WAITING_FOR_PROVIDER",
    detail: project.renovationPlan ? project.renovationPlan.style : null
  });

  const imageGenActive = Boolean(getActiveImageGenProvider());
  const photosNeedingVisualization = project.renovationPlan
    ? eligiblePhotosForVisualization(project.photos, project.renovationPlan.id)
    : [];
  steps.push({
    step: "VISUALIZATION",
    status: !project.renovationPlan
      ? "PENDING"
      : photosNeedingVisualization.length === 0
        ? "DONE"
        : imageGenActive
          ? "RUNNING"
          : "WAITING_FOR_PROVIDER",
    detail: photosNeedingVisualization.length > 0 ? `${photosNeedingVisualization.length} místností čeká na vizualizaci` : null
  });

  const unsearchedRequirements = project.productRequirements.filter((r) => !(r as any).searchedAt);
  const productProviderActive = getActiveProductProviders().length > 0;
  steps.push({
    step: "PRODUCTS",
    status:
      unsearchedRequirements.length === 0
        ? "DONE"
        : productProviderActive
          ? "RUNNING"
          : "WAITING_FOR_PROVIDER",
    detail: unsearchedRequirements.length > 0 ? `${unsearchedRequirements.length} položek čeká na vyhledání produktů` : null
  });

  const assumptionsInput: AssumptionsInput | null = project.assumptions ? (project.assumptions as unknown as AssumptionsInput) : null;
  const maxBudget = assumptionsInput
    ? computeMaxRenovationBudget(assumptionsInput, project.assumptions?.maxRenovationBudgetOverride ?? null)
    : null;
  const breakdown = computeRenovationCostBreakdown(
    project.budgetItems.map((b) => ({
      total: b.total,
      category: b.category,
      productRequirementId: b.productRequirementId,
      deliveryEstimate: b.deliveryEstimate,
      wasteEstimate: b.wasteEstimate
    }))
  );
  const budgetStatus = computeRenovationBudgetStatus(maxBudget, breakdown.totalPlanned);

  const veCandidates = buildValueEngineeringCandidates(project.productRequirements);
  const stillHasSwaps = budgetStatus === "OVER_BUDGET" && veCandidates.length > 0;
  steps.push({
    step: "BUDGET_CHECK",
    status: unsearchedRequirements.length > 0 ? "PENDING" : stillHasSwaps ? "RUNNING" : "DONE",
    detail: budgetStatus
  });

  // Overall status mirrors advancePipeline's own priority order: it always
  // works the first not-yet-DONE step in `steps`, so that step's status is
  // exactly what determines whether real progress can happen right now.
  // Without this, a later step sitting at PENDING (blocked only because an
  // earlier step hasn't run yet) could mask an earlier step that's
  // genuinely stuck on WAITING_FOR_PROVIDER — making the whole pipeline
  // look like it's actively progressing when nothing actually can.
  const blockingSteps = steps.filter((s) => s.step !== "DONE");
  const firstUnfinished = blockingSteps.find((s) => s.status !== "DONE");

  const overallStatus: PipelineState["overallStatus"] = !firstUnfinished
    ? "DONE"
    : firstUnfinished.status === "WAITING_FOR_PROVIDER"
      ? "WAITING_FOR_PROVIDER"
      : "RUNNING";
  steps.push({ step: "DONE", status: overallStatus === "DONE" ? "DONE" : "PENDING", detail: null });

  return { overallStatus, steps, budgetStatus };
}

function buildValueEngineeringCandidates(
  requirements: Array<{
    id: string;
    description: string;
    category: string;
    products: Array<{ id: string; name: string; price: number | null; isSelected: boolean; status: string }>;
  }>
): ValueEngineeringCandidate[] {
  const candidates: ValueEngineeringCandidate[] = [];
  for (const req of requirements) {
    const selected = req.products.find((p) => p.isSelected);
    if (!selected || selected.price == null) continue;
    const cheaperAlternatives = req.products.filter(
      (p) => !p.isSelected && p.status === "CANDIDATE" && p.price != null && p.price < selected.price!
    );
    if (cheaperAlternatives.length === 0) continue;
    const cheapest = cheaperAlternatives.reduce((a, b) => (b.price! < a.price! ? b : a));
    candidates.push({
      requirementId: req.id,
      requirementDescription: req.description,
      category: req.category,
      currentProductId: selected.id,
      currentProductName: selected.name,
      currentPrice: selected.price!,
      alternativeProductId: cheapest.id,
      alternativeProductName: cheapest.name,
      alternativePrice: cheapest.price!
    });
  }
  return candidates;
}

async function logPipelineFailure(projectId: string, step: PipelineStep, message: string) {
  await prisma.providerErrorLog.create({ data: { provider: `PIPELINE_${step}`, errorMessage: message } }).catch(() => {});
}

/**
 * Performs exactly one bounded unit of pipeline work — whichever the
 * highest-priority outstanding step needs — then returns the freshly
 * recomputed state. A no-op (nothing left to do, or everything remaining
 * is blocked on an unconnected provider) is a normal, valid outcome.
 */
export async function advancePipeline(projectId: string): Promise<PipelineState> {
  const project = await getProjectFull(projectId);

  // 1. Listing discovery / comparables — cheap, safe to (re-)run.
  if (!project.lastComparableDiscoveryAt) {
    await discoverComparablesForProject(projectId, { force: false }).catch((err) => {
      logPipelineFailure(projectId, "COMPARABLES", err instanceof Error ? err.message : "Comparable discovery selhalo.");
    });
    return computePipelineState(projectId);
  }

  // 2. Photo Understanding — one photo per call. Requires both a real
  // Vision provider AND the explicit Settings consent toggle (sending real
  // property photos to an external AI vendor) — skipping the call entirely
  // when either is missing keeps this in sync with computePipelineState's
  // WAITING_FOR_PROVIDER reporting for the same condition.
  const photosNeedingAnalysis = eligiblePhotosForAnalysis(project.photos);
  const settings = await getSettings();
  if (photosNeedingAnalysis.length > 0 && getActiveVisionProvider() && settings.aiPhotoAnalysisEnabled) {
    try {
      await analyzePhotoWithAi(photosNeedingAnalysis[0].id);
    } catch (err) {
      if (!(err instanceof PhotoAnalysisNotAvailableError)) {
        await logPipelineFailure(projectId, "PHOTO_ANALYSIS", err instanceof Error ? err.message : "Analýza fotografie selhala.");
      }
    }
    return computePipelineState(projectId);
  }

  // 3. Renovation Plan — one shared design for the whole property.
  if (!project.renovationPlan && process.env.IMAGE_GEN_API_KEY) {
    try {
      await generateRenovationPlan(projectId);
    } catch (err) {
      if (!(err instanceof RenovationPlanNotAvailableError)) {
        await logPipelineFailure(projectId, "RENOVATION_PLAN", err instanceof Error ? err.message : "Návrh rekonstrukce selhal.");
      }
    }
    return computePipelineState(projectId);
  }

  // 4. Before/After visualization — one room per call.
  if (project.renovationPlan) {
    const photosNeedingVisualization = eligiblePhotosForVisualization(project.photos, project.renovationPlan.id);
    if (photosNeedingVisualization.length > 0 && getActiveImageGenProvider()) {
      await requestPhotoGeneration(photosNeedingVisualization[0].id, "MODERNI", null).catch((err) => {
        logPipelineFailure(projectId, "VISUALIZATION", err instanceof Error ? err.message : "Vizualizace selhala.");
      });
      return computePipelineState(projectId);
    }
  }

  // 5. Shopping list — search + auto-select one requirement per call.
  const unsearchedRequirements = project.productRequirements.filter((r) => !(r as any).searchedAt);
  if (unsearchedRequirements.length > 0 && getActiveProductProviders().length > 0) {
    const req = unsearchedRequirements[0];
    try {
      await searchProductsForRequirement(req.id);
      await autoSelectBestCandidate(req.id);
    } catch (err) {
      if (!(err instanceof ProductNotAvailableError)) {
        await logPipelineFailure(projectId, "PRODUCTS", err instanceof Error ? err.message : "Vyhledání produktů selhalo.");
      }
    }
    return computePipelineState(projectId);
  }

  // 6. Budget check + Value Engineering — one real swap per call, only
  // ever using already-found real candidates; never touches ARV/sale price.
  if (unsearchedRequirements.length === 0) {
    const assumptionsInput: AssumptionsInput | null = project.assumptions ? (project.assumptions as unknown as AssumptionsInput) : null;
    const maxBudget = assumptionsInput
      ? computeMaxRenovationBudget(assumptionsInput, project.assumptions?.maxRenovationBudgetOverride ?? null)
      : null;
    const breakdown = computeRenovationCostBreakdown(
      project.budgetItems.map((b) => ({
        total: b.total,
        category: b.category,
        productRequirementId: b.productRequirementId,
        deliveryEstimate: b.deliveryEstimate,
        wasteEstimate: b.wasteEstimate
      }))
    );
    const status = computeRenovationBudgetStatus(maxBudget, breakdown.totalPlanned);
    if (status === "OVER_BUDGET" && maxBudget != null) {
      const candidates = buildValueEngineeringCandidates(project.productRequirements);
      const plan = buildValueEngineeringPlan(candidates, breakdown.totalPlanned - maxBudget);
      const first = plan.suggestions[0];
      if (first) {
        await selectProduct(first.alternativeProductId);
        return computePipelineState(projectId);
      }
    }
  }

  return computePipelineState(projectId);
}
