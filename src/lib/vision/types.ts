// AI Photo Analysis — Vision provider interface. No vision model is
// actually connected in this environment (no approved API key/service),
// so every provider here is either PENDING_ACCESS or, if a real one is
// wired in later, ACTIVE. The app must never claim a photo was AI-analyzed
// unless a provider actually ran and returned a result — the manual
// fallback (tagging photos by hand) always remains available regardless
// of provider status.
import type { RoomType } from "@/lib/types";

export type PhotoAnalysisConfidence = "HIGH" | "MEDIUM" | "LOW";

// Structured per-element description (item 3 of the Photo Understanding
// Engine). Each field is null when the provider genuinely can't determine
// it from the photo — never guessed/invented to fill a gap.
export interface PhotoElementDetails {
  floor: string | null;
  walls: string | null;
  ceiling: string | null;
  doors: string | null;
  windows: string | null;
  lighting: string | null;
  radiators: string | null;
  kitchen: string | null;
  bathroomFixtures: string | null;
  furniture: string | null;
  builtIns: string | null;
}

export interface PhotoAnalysisResult {
  roomType: RoomType;
  currentCondition: string | null;
  visibleIssues: string[];
  keepNotes: string | null;
  removeNotes: string | null;
  replaceNotes: string | null;
  renovationSuggestions: string | null;
  confidence: PhotoAnalysisConfidence;
  elementDetails: PhotoElementDetails | null;
}

export class VisionNotAvailableError extends Error {}

export interface VisionProvider {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote?: string;
  analyzePhoto(photoUrl: string): Promise<PhotoAnalysisResult>;
}
