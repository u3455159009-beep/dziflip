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

export interface ImageGenRequest {
  photoUrl: string;
  style: PhotoGenerationStyle;
  prompt: string | null;
  roomType: RoomType | null;
  planContext: RenovationPlanContext | null;
}

export interface ImageGenResult {
  generatedUrl: string;
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

export class ImageGenNotAvailableError extends Error {}

export interface ImageGenProvider {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote?: string;
  generate(request: ImageGenRequest): Promise<ImageGenResult>;
}
