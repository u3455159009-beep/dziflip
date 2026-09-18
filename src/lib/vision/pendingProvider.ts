import type { VisionProvider } from "./types";
import { VisionNotAvailableError } from "./types";

export function createPendingVisionProvider(key: string, label: string, reason: string): VisionProvider {
  return {
    key,
    label,
    status: "PENDING_ACCESS",
    statusNote: reason,
    async analyzePhoto() {
      throw new VisionNotAvailableError(`${label}: ${reason}`);
    }
  };
}
