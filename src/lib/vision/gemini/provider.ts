// GeminiVisionProvider — real AI Photo Analysis using the same Gemini API
// key already configured for image editing (IMAGE_GEN_API_KEY). No second
// credential is ever required for Vision.
import { fetchImageAsBase64, ImageFetchError } from "@/lib/imageFetch";
import { generateJsonWithGemini, getGeminiTextModel } from "@/lib/gemini/textClient";
import { isGeminiConfigured } from "@/lib/imageGen/gemini/client";
import { buildVisionAnalysisPrompt, GeminiVisionResponseSchema } from "./schema";
import { VisionNotAvailableError, type PhotoAnalysisResult, type VisionProvider } from "../types";

export const geminiVisionProvider: VisionProvider = {
  key: "GEMINI_VISION",
  label: "Google Gemini Vision (rozpoznávání fotografií)",
  get status() {
    return isGeminiConfigured() ? "ACTIVE" : "PENDING_ACCESS";
  },
  get statusNote() {
    return isGeminiConfigured()
      ? undefined
      : "Čeká na IMAGE_GEN_API_KEY (stejný Google Gemini klíč jako pro AI vizualizaci) — Vision nevyžaduje druhý klíč.";
  },

  async analyzePhoto(photoUrl: string): Promise<PhotoAnalysisResult> {
    let image: { base64: string; mimeType: string };
    try {
      image = await fetchImageAsBase64(photoUrl);
    } catch (err) {
      const detail = err instanceof ImageFetchError ? err.message : "Fotografii se nepodařilo načíst.";
      throw new VisionNotAvailableError(`Google Gemini Vision: ${detail}`);
    }

    const outcome = await generateJsonWithGemini({
      prompt: buildVisionAnalysisPrompt(),
      imageBase64: image.base64,
      imageMimeType: image.mimeType
    });

    if (outcome.status !== "OK") {
      throw new VisionNotAvailableError(`Google Gemini Vision: ${outcome.detail}`);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outcome.text);
    } catch {
      throw new VisionNotAvailableError(
        `Google Gemini Vision: odpověď nebyla platný JSON (model: ${getGeminiTextModel()}).`
      );
    }

    const validated = GeminiVisionResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new VisionNotAvailableError("Google Gemini Vision: odpověď neodpovídala očekávanému schématu.");
    }
    return validated.data as PhotoAnalysisResult;
  }
};
