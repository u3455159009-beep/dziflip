// Pure prompt + zod schema for the Gemini Vision room-analysis call —
// separated from the network call so both are directly unit-testable.
// Every field the model can't confidently determine must come back null
// (or "NEZNAME" for roomType) — the prompt says so explicitly, and the
// zod schema coerces anything malformed to the same safe default rather
// than throwing, so a slightly-off model response never crashes the app
// or gets silently invented into something more confident than it is.
import { z } from "zod";
import { ROOM_TYPES } from "@/lib/types";

export const PhotoElementDetailsSchema = z.object({
  floor: z.string().nullable().catch(null),
  walls: z.string().nullable().catch(null),
  ceiling: z.string().nullable().catch(null),
  doors: z.string().nullable().catch(null),
  windows: z.string().nullable().catch(null),
  lighting: z.string().nullable().catch(null),
  radiators: z.string().nullable().catch(null),
  kitchen: z.string().nullable().catch(null),
  bathroomFixtures: z.string().nullable().catch(null),
  furniture: z.string().nullable().catch(null),
  builtIns: z.string().nullable().catch(null)
});

export const GeminiVisionResponseSchema = z.object({
  roomType: z.enum(ROOM_TYPES).catch("NEZNAME"),
  currentCondition: z.string().nullable().catch(null),
  visibleIssues: z.array(z.string()).catch([]),
  keepNotes: z.string().nullable().catch(null),
  removeNotes: z.string().nullable().catch(null),
  replaceNotes: z.string().nullable().catch(null),
  renovationSuggestions: z.string().nullable().catch(null),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).catch("LOW"),
  elementDetails: PhotoElementDetailsSchema.nullable().catch(null)
});

export type GeminiVisionResponse = z.infer<typeof GeminiVisionResponseSchema>;

const SCHEMA_DESCRIPTION = `{
  "roomType": one of ${JSON.stringify(ROOM_TYPES)},
  "currentCondition": string or null,
  "visibleIssues": string[] (empty array if none visible),
  "keepNotes": string or null — what looks worth keeping as-is,
  "removeNotes": string or null — what should be removed,
  "replaceNotes": string or null — what should be replaced,
  "renovationSuggestions": string or null,
  "confidence": "HIGH" | "MEDIUM" | "LOW" — your own confidence in this analysis,
  "elementDetails": {
    "floor": string or null, "walls": string or null, "ceiling": string or null,
    "doors": string or null, "windows": string or null, "lighting": string or null,
    "radiators": string or null, "kitchen": string or null,
    "bathroomFixtures": string or null, "furniture": string or null, "builtIns": string or null
  } or null
}`;

export function buildVisionAnalysisPrompt(): string {
  return [
    "Analyze this real photograph of a room in a Czech real-estate listing.",
    "Respond with ONLY a single valid JSON object, no markdown, no commentary, matching exactly this shape:",
    SCHEMA_DESCRIPTION,
    "Only describe what is actually visible in the photo. If you cannot determine a field with reasonable confidence, use null for it (or an empty array for visibleIssues) — never guess or invent a detail that isn't visible.",
    "roomType must be your best classification of the room type from the given list; use \"NEZNAME\" only if truly indeterminate.",
    "Write all free-text field values in Czech."
  ].join("\n");
}
