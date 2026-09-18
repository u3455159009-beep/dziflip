import { createPendingImageGenProvider } from "./pendingProvider";
import type { ImageGenProvider } from "./types";

export const imageGenProvider: ImageGenProvider = createPendingImageGenProvider(
  "IMAGE_GEN",
  "Vizualizace před/po (image generation)",
  "Čeká na připojení schváleného image-generation API (např. pro vizualizaci vzhledu místnosti po rekonstrukci) a na explicitní souhlas s odesíláním fotografií nemovitosti externí službě. Do té doby se ukládá pouze zadání (styl, prompt) pro budoucí generování."
);

export const IMAGE_GEN_PROVIDERS: ImageGenProvider[] = [imageGenProvider];

export function getActiveImageGenProvider(): ImageGenProvider | null {
  return IMAGE_GEN_PROVIDERS.find((p) => p.status === "ACTIVE") ?? null;
}
