import type { ImageGenProvider } from "./types";
import { ImageGenNotAvailableError } from "./types";

export function createPendingImageGenProvider(key: string, label: string, reason: string): ImageGenProvider {
  return {
    key,
    label,
    status: "PENDING_ACCESS",
    statusNote: reason,
    async generate() {
      throw new ImageGenNotAvailableError(`${label}: ${reason}`);
    }
  };
}
