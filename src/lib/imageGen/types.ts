// Photo Before/After — image-generation provider interface. Data
// architecture only: no real image-generation API is connected in this
// environment, so every request is recorded (style, prompt, status) but
// never produces a fabricated "generated" image or URL.
import type { ChangeDetectionItem, PhotoGenerationStyle, RoomType } from "@/lib/types";

// Shared design-system context (item 4) — passed on every request so a real
// provider generates visually consistent rooms across the whole project
// instead of independently inventing a different look per photo.
export interface RenovationPlanContext {
  style: string | null;
  priceLevel: string | null;
  flooring: string | null;
  wallColor: string | null;
  doors: string | null;
  handles: string | null;
  outletsSwitches: string | null;
  lighting: string | null;
  kitchen: string | null;
  bathroomFixtures: string | null;
  tiles: string | null;
  sanitary: string | null;
  builtIns: string | null;
}

// Relevant room analysis (item 5 of Photo Understanding) passed through so
// the provider's prompt can reference the room's actual current condition
// instead of guessing it — every field here comes straight from the Photo
// row (manual or AI Vision), never invented by the image-gen provider.
export interface ImageGenRoomAnalysis {
  currentCondition: string | null;
  visibleIssues: string[];
  replaceNotes: string | null;
  renovationSuggestions: string | null;
}

export interface ImageGenRequest {
  photoUrl: string;
  style: PhotoGenerationStyle;
  prompt: string | null;
  roomType: RoomType | null;
  planContext: RenovationPlanContext | null;
  roomAnalysis: ImageGenRoomAnalysis | null;
}

export interface ImageGenResult {
  // Raw generated image bytes — the caller (photoGeneration.ts) owns
  // persistence (uploading to Vercel Blob and computing the final,
  // durable URL), so a vendor provider never has to know anything about
  // object storage. Never a data: URI here — that would get base64-encoded
  // straight into the database, which is exactly what this replaces.
  imageBase64: string;
  mimeType: string;
  model: string;
  // Change Detection (item 8) — which item kinds the visualization actually
  // changed vs. the original photo, as reported by the provider itself.
  changeDetection: ChangeDetectionItem[];
  // Structural-change disclosure (items 6/18) — true only when the
  // visualization assumes e.g. removing a wall; note carries the Czech
  // warning text shown in the UI.
  structuralChange: boolean;
  structuralChangeNote: string | null;
  // How faithfully the result preserves the original photo's geometry/
  // perspective/proportions (item 6) — never claimed HIGH by default.
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

// `code` carries the machine-readable diagnostic taxonomy (e.g.
// "GEMINI_AUTH_FAILED", "DOWNLOAD_ORIGINAL_FAILED", "BLOB_SAVE_FAILED") end
// to end from the client that detected the failure, through the provider,
// to photoGeneration.ts, which persists it as PhotoGeneration.failureCode
// — never inferred later from parsing the human-readable message.
export class ImageGenNotAvailableError extends Error {
  code: string;
  constructor(message: string, code: string = "GEMINI_RESPONSE_INVALID") {
    super(message);
    this.code = code;
  }
}

export interface ImageGenProvider {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote?: string;
  generate(request: ImageGenRequest): Promise<ImageGenResult>;
}
