// Automatic, budget-aware RenovationPlan generation (Zero-Click pipeline,
// item 5 — "JEDEN DESIGN PRO CELÝ BYT"). Runs once real room analyses
// exist, so every room's later visualization draws from the same,
// already-decided design instead of each photo inventing its own look.
//
// The AI is never trusted to enforce the flip's economics by itself — the
// price tier (BUDGET/STANDARD/PREMIUM) is computed deterministically from
// computeMaxRenovationBudget ÷ area, and told to Gemini as a hard
// constraint; the actual enforcement is the real, priced shopping list +
// Value Engineering loop that runs later against real product prices, not
// this text proposal.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateJsonWithGemini } from "@/lib/gemini/textClient";
import { isGeminiConfigured } from "@/lib/imageGen/gemini/client";
import { computeMaxRenovationBudget, type AssumptionsInput } from "@/lib/calc";
import type { ProductTier } from "@/lib/types";

export class RenovationPlanNotAvailableError extends Error {}

const PLAN_FIELDS = [
  "flooring",
  "wallColor",
  "doors",
  "handles",
  "outletsSwitches",
  "lighting",
  "kitchen",
  "bathroomFixtures",
  "tiles",
  "sanitary",
  "builtIns"
] as const;

const RenovationPlanResponseSchema = z.object({
  style: z.string().nullable().catch(null),
  flooring: z.string().nullable().catch(null),
  wallColor: z.string().nullable().catch(null),
  doors: z.string().nullable().catch(null),
  handles: z.string().nullable().catch(null),
  outletsSwitches: z.string().nullable().catch(null),
  lighting: z.string().nullable().catch(null),
  kitchen: z.string().nullable().catch(null),
  bathroomFixtures: z.string().nullable().catch(null),
  tiles: z.string().nullable().catch(null),
  sanitary: z.string().nullable().catch(null),
  builtIns: z.string().nullable().catch(null)
});

/**
 * Deterministic price tier from real economics — never left to the model's
 * own judgment, so a tight flip budget can never be talked into a luxury
 * design. Thresholds are Kč/m² of MAX RENOVATION BUDGET, calibrated to
 * typical Czech flip-renovation costs.
 */
export function derivePriceLevel(maxRenovationBudget: number | null, areaM2: number | null): ProductTier | null {
  if (maxRenovationBudget === null || !areaM2 || areaM2 <= 0) return null;
  const perM2 = maxRenovationBudget / areaM2;
  if (perM2 < 3500) return "BUDGET";
  if (perM2 < 7000) return "STANDARD";
  return "PREMIUM";
}

export interface RoomAnalysisInput {
  roomType: string | null;
  currentCondition: string | null;
  elementDetails: string | null; // raw JSON string from Photo.elementDetails
}

export function buildRenovationPlanPrompt(input: {
  rooms: RoomAnalysisInput[];
  priceLevel: ProductTier | null;
  maxRenovationBudget: number | null;
  municipality: string | null;
  district: string | null;
}): string {
  const lines = [
    "Design ONE consistent renovation plan for an entire Czech apartment/house that is being flipped (bought, renovated, resold).",
    "The plan must apply the SAME flooring, wall color, doors, handles, lighting, and kitchen/bathroom style across every room — it must look like one coherent home, not a collage of different apartments.",
    "Optimize for: resale value, a neutral modern look that appeals to the broadest pool of buyers, and a good cost-to-visual-impact ratio. Do NOT propose a luxury/designer renovation.",
    "Respond with ONLY a single valid JSON object, no markdown, matching exactly this shape:",
    `{ "style": string, ${PLAN_FIELDS.map((f) => `"${f}": string or null`).join(", ")} }`,
    "Every string value must name a concrete, realistically sourceable material/product choice (e.g. \"vinylová podlaha, světlý dub\"), not a vague description.",
    "Write all values in Czech."
  ];

  if (input.priceLevel) {
    lines.push(
      `HARD CONSTRAINT: this flip's maximum renovation budget only supports the "${input.priceLevel}" price tier. Every material/product choice MUST be realistic for that tier — do not propose premium/designer materials for a BUDGET or STANDARD tier.`
    );
  }
  if (input.maxRenovationBudget != null) {
    lines.push(`Maximum total renovation budget for the whole property: ${Math.round(input.maxRenovationBudget)} Kč.`);
  }
  if (input.municipality) {
    lines.push(`Property location: ${[input.municipality, input.district].filter(Boolean).join(", ")}.`);
  }

  const roomLines = input.rooms
    .filter((r) => r.roomType || r.currentCondition)
    .map((r, i) => {
      const details = r.elementDetails ? (() => {
        try {
          return JSON.stringify(JSON.parse(r.elementDetails!));
        } catch {
          return null;
        }
      })() : null;
      return `Room ${i + 1} (${r.roomType ?? "unknown type"}): condition = ${r.currentCondition ?? "unknown"}${details ? `, elements = ${details}` : ""}`;
    });
  if (roomLines.length > 0) {
    lines.push("Known rooms and their current condition (from real photo analysis):");
    lines.push(...roomLines);
  }

  return lines.join("\n");
}

/**
 * Generates and persists a RenovationPlan for a project, only if one
 * doesn't already exist (idempotent — never overwrites a plan the user or
 * a previous pipeline run already set). Throws
 * RenovationPlanNotAvailableError (never fabricates a plan) when Gemini
 * isn't configured or the call fails.
 */
export async function generateRenovationPlan(projectId: string) {
  if (!isGeminiConfigured()) {
    throw new RenovationPlanNotAvailableError("Google Gemini: IMAGE_GEN_API_KEY není nastavený — návrh rekonstrukce nelze automaticky vygenerovat.");
  }

  const existing = await prisma.renovationPlan.findUnique({ where: { projectId } });
  if (existing) return existing;

  const [project, assumptions, photos] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.assumptions.findUnique({ where: { projectId } }),
    prisma.photo.findMany({ where: { projectId }, select: { roomType: true, currentCondition: true, elementDetails: true } })
  ]);

  const maxRenovationBudget = assumptions
    ? computeMaxRenovationBudget(assumptions as unknown as AssumptionsInput, assumptions.maxRenovationBudgetOverride)
    : null;
  const priceLevel = derivePriceLevel(maxRenovationBudget, project.areaM2);

  const prompt = buildRenovationPlanPrompt({
    rooms: photos,
    priceLevel,
    maxRenovationBudget,
    municipality: project.municipality,
    district: project.district
  });

  const outcome = await generateJsonWithGemini({ prompt });
  if (outcome.status !== "OK") {
    throw new RenovationPlanNotAvailableError(`Google Gemini: ${outcome.detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.text);
  } catch {
    throw new RenovationPlanNotAvailableError("Google Gemini: odpověď nebyla platný JSON.");
  }

  const validated = RenovationPlanResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new RenovationPlanNotAvailableError("Google Gemini: odpověď neodpovídala očekávanému schématu rekonstrukčního plánu.");
  }

  return prisma.renovationPlan.create({
    data: {
      projectId,
      priceLevel,
      ...validated.data
    }
  });
}
