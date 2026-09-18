// Photo Before/After — image-generation provider interface. Data
// architecture only: no real image-generation API is connected in this
// environment, so every request is recorded (style, prompt, status) but
// never produces a fabricated "generated" image or URL.
import type { PhotoGenerationStyle } from "@/lib/types";

export interface ImageGenRequest {
  photoUrl: string;
  style: PhotoGenerationStyle;
  prompt: string | null;
}

export interface ImageGenResult {
  generatedUrl: string;
  model: string;
}

export class ImageGenNotAvailableError extends Error {}

export interface ImageGenProvider {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote?: string;
  generate(request: ImageGenRequest): Promise<ImageGenResult>;
}
