// Pure prompt/derivation logic for the Gemini image-to-image provider —
// separated from I/O so it's directly unit-testable. Nothing here talks to
// the network; it only turns a RenovationPlan + room context into (a) the
// text instruction sent to Gemini and (b) the deterministic Change
// Detection list (item 8) that the plan itself specifies.
import type { ChangeDetectionItem, RoomType } from "@/lib/types";
import type { ImageGenRoomAnalysis, RenovationPlanContext } from "../types";

const ROOM_TYPE_EN: Partial<Record<RoomType, string>> = {
  KUCHYN: "kitchen",
  OBYVACI_POKOJ: "living room",
  LOZNICE: "bedroom",
  KOUPELNA: "bathroom",
  WC: "toilet room",
  CHODBA: "hallway",
  BALKON: "balcony",
  TERASA: "terrace",
  EXTERIER: "exterior",
  SKLEP: "cellar",
  GARAZ: "garage",
  NEZNAME: "room"
};

// Each RenovationPlan field, when set, both (a) becomes one line of the
// prompt's "change only these things" instruction and (b) maps to the
// Change Detection item(s) it corresponds to — so the shopping-list
// linkage (item 15) always reflects exactly what the prompt actually asked
// Gemini to change, never a separate, disconnected guess.
const PLAN_FIELD_MAP: Array<{
  key: keyof RenovationPlanContext;
  label: string;
  changeItems: ChangeDetectionItem[];
}> = [
  { key: "flooring", label: "Flooring", changeItems: ["PODLAHA"] },
  { key: "wallColor", label: "Wall paint color", changeItems: ["MALBA"] },
  { key: "doors", label: "Interior doors", changeItems: ["DVERE"] },
  { key: "handles", label: "Door handles", changeItems: ["KLIKY"] },
  { key: "outletsSwitches", label: "Outlets and switches", changeItems: ["ZASUVKY", "VYPINACE"] },
  { key: "lighting", label: "Lighting fixtures", changeItems: ["SVETLA"] },
  { key: "kitchen", label: "Kitchen cabinetry/countertop", changeItems: ["KUCHYNSKA_LINKA", "PRACOVNI_DESKA"] },
  { key: "bathroomFixtures", label: "Bathroom fixtures (sink, faucet, shower/tub)", changeItems: ["SANITA", "BATERIE"] },
  { key: "tiles", label: "Wall and floor tiles", changeItems: ["OBKLADY_DLAZBY"] },
  { key: "sanitary", label: "Sanitary ware (toilet, etc.)", changeItems: ["SANITA"] },
  { key: "builtIns", label: "Built-in wardrobes/cabinets", changeItems: ["SKRINKY"] }
];

// Explicit structural-change signal (items 6/18) — detected from the
// user's own free-text request, never inferred from the image itself.
// Keeps the check auditable: the same keywords a human reviewer would look
// for in the request text before approving a structural visualization.
const STRUCTURAL_KEYWORDS = [
  "bourat",
  "bourání",
  "zbourat",
  "vybourat",
  "odstranění příčky",
  "odstranit příčku",
  "posunout příčku",
  "nosnou zeď",
  "nosná stěna",
  "nosné zdi",
  "propojit místnosti",
  "spojit pokoje",
  "otevřít dispozici",
  "otevřená dispozice",
  "sloučit kuchyň"
];

export function detectStructuralChange(text: string | null): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return STRUCTURAL_KEYWORDS.some((kw) => normalized.includes(kw));
}

export function deriveChangeDetection(planContext: RenovationPlanContext | null): ChangeDetectionItem[] {
  if (!planContext) return [];
  const items = new Set<ChangeDetectionItem>();
  for (const field of PLAN_FIELD_MAP) {
    if (planContext[field.key]) {
      for (const item of field.changeItems) items.add(item);
    }
  }
  return Array.from(items);
}

export function buildGeminiEditPrompt(input: {
  roomType: RoomType | null;
  planContext: RenovationPlanContext | null;
  roomAnalysis: ImageGenRoomAnalysis | null;
  userPrompt: string | null;
}): string {
  const roomLabel = input.roomType ? ROOM_TYPE_EN[input.roomType] ?? "room" : "room";

  const lines: string[] = [
    `Edit this EXISTING real photograph of a ${roomLabel} to show it after a renovation.`,
    "This is an image-editing task on the ORIGINAL photograph, not a request to generate a new, different room from scratch.",
    "Preserve as precisely as possible: the room's geometry, the camera perspective and position, window locations and shapes, door locations, load-bearing walls and structure, the overall room size and proportions, the layout, and every existing structural opening.",
    "Do not invent a different floor plan, different window placement, or a different room size."
  ];

  const changeLines = input.planContext
    ? PLAN_FIELD_MAP.filter((f) => input.planContext![f.key]).map((f) => `- ${f.label}: ${input.planContext![f.key]}`)
    : [];
  if (changeLines.length > 0) {
    lines.push("Change ONLY the following elements, according to this renovation design (leave everything else as in the original photo):");
    lines.push(...changeLines);
  }
  if (input.planContext?.style) lines.push(`Overall target style: ${input.planContext.style}.`);
  if (input.planContext?.priceLevel) lines.push(`Target price/quality level: ${input.planContext.priceLevel}.`);

  if (input.roomAnalysis?.currentCondition) {
    lines.push(`Current condition of this room (for context, do not re-describe it): ${input.roomAnalysis.currentCondition}`);
  }
  if (input.roomAnalysis?.replaceNotes) {
    lines.push(`Known items to replace: ${input.roomAnalysis.replaceNotes}`);
  }

  if (input.userPrompt) {
    lines.push(`Additional instructions from the user: ${input.userPrompt}`);
  }

  lines.push(
    "Output a single photorealistic edited photograph of this same room. Do not add any watermark or text overlay."
  );

  return lines.join("\n");
}
