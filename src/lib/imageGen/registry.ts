import { createPendingImageGenProvider } from "./pendingProvider";
import { geminiImageGenProvider } from "./gemini/provider";
import type { ImageGenProvider } from "./types";

// Kept as a second, always-PENDING_ACCESS entry for any deployment that
// hasn't configured IMAGE_GEN_API_KEY yet — geminiImageGenProvider above
// becomes the ACTIVE one automatically once that key is set.
export const imageGenProvider: ImageGenProvider = createPendingImageGenProvider(
  "IMAGE_GEN",
  "Vizualizace před/po (obecný fallback)",
  "Čeká na připojení schváleného image-generation API a na explicitní souhlas s odesíláním fotografií nemovitosti externí službě. Do té doby se ukládá pouze zadání (styl, prompt) pro budoucí generování."
);

export const IMAGE_GEN_PROVIDERS: ImageGenProvider[] = [geminiImageGenProvider, imageGenProvider];

export function getActiveImageGenProvider(): ImageGenProvider | null {
  return IMAGE_GEN_PROVIDERS.find((p) => p.status === "ACTIVE") ?? null;
}
