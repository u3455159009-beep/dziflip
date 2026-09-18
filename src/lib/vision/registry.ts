import { createPendingVisionProvider } from "./pendingProvider";
import type { VisionProvider } from "./types";

// No vision API is connected — see the status note for exactly what
// connecting one would require. Adding a real ACTIVE provider means
// implementing VisionProvider.analyzePhoto against a real, approved vision
// model and adding it to VISION_PROVIDERS; nothing here may be flipped to
// ACTIVE without that real implementation behind it.
export const aiVisionProvider: VisionProvider = createPendingVisionProvider(
  "AI_VISION",
  "AI Vision (rozpoznávání fotografií)",
  "Čeká na připojení schváleného vision modelu (API klíč, např. pro rozpoznávání místností a stavu z fotografií) a na explicitní souhlas s odesíláním fotografií nemovitosti externí službě. Do té doby lze fotografie analyzovat pouze ručně."
);

export const VISION_PROVIDERS: VisionProvider[] = [aiVisionProvider];

export function getActiveVisionProvider(): VisionProvider | null {
  return VISION_PROVIDERS.find((p) => p.status === "ACTIVE") ?? null;
}
