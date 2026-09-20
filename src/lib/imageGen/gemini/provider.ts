// GeminiImageGenProvider — the real, vendor-specific ImageGenProvider
// implementation backed by Google Gemini's image-editing endpoint. Only
// this file (plus client.ts/prompt.ts) knows anything about Gemini; the
// rest of the app talks to it purely through the existing ImageGenProvider
// interface, so a future second provider (or a different Gemini model)
// plugs in the same way without touching photoGeneration.ts.
import { ImageGenNotAvailableError, type ImageGenProvider, type ImageGenRequest, type ImageGenResult } from "../types";
import { editImageWithGemini, getGeminiModel, isGeminiConfigured } from "./client";
import { buildGeminiEditPrompt, deriveChangeDetection, detectStructuralChange } from "./prompt";
import { PROVIDER_KEY, PROVIDER_LABEL } from "./constants";

const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024; // leaves headroom under Gemini's ~20MB total inline request limit
const FETCH_TIMEOUT_MS = 20000;

function guessMimeTypeFromUrl(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  return "image/jpeg"; // the overwhelmingly common case for listing photos, and Gemini's own safe default
}

class OriginalPhotoUnavailableError extends Error {}

/**
 * Fetches the ORIGINAL listing photo's real bytes so Gemini edits the
 * actual photograph (item 5/11) — this app never asks Gemini to invent a
 * room from nothing. Throws OriginalPhotoUnavailableError (never silently
 * falls back to a blank/placeholder generation) if the source photo can't
 * be fetched.
 */
async function fetchOriginalImage(photoUrl: string): Promise<{ base64: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(photoUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new OriginalPhotoUnavailableError(`Původní fotografii se nepodařilo stáhnout (HTTP ${res.status}).`);
    }
    const contentType = res.headers.get("content-type");
    const mimeType = contentType && contentType.startsWith("image/") ? contentType.split(";")[0] : guessMimeTypeFromUrl(photoUrl);

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new OriginalPhotoUnavailableError("Původní fotografie je prázdná.");
    }
    if (buffer.byteLength > MAX_SOURCE_IMAGE_BYTES) {
      throw new OriginalPhotoUnavailableError("Původní fotografie je příliš velká pro úpravu (limit 15 MB).");
    }
    return { base64: Buffer.from(buffer).toString("base64"), mimeType };
  } catch (err) {
    if (err instanceof OriginalPhotoUnavailableError) throw err;
    if ((err as any)?.name === "AbortError") {
      throw new OriginalPhotoUnavailableError("Stažení původní fotografie vypršelo (timeout).");
    }
    throw new OriginalPhotoUnavailableError("Původní fotografii se nepodařilo stáhnout.");
  } finally {
    clearTimeout(timeout);
  }
}

export const geminiImageGenProvider: ImageGenProvider = {
  key: PROVIDER_KEY,
  label: PROVIDER_LABEL,
  get status() {
    return isGeminiConfigured() ? "ACTIVE" : "PENDING_ACCESS";
  },
  get statusNote() {
    return isGeminiConfigured()
      ? undefined
      : "Čeká na IMAGE_GEN_API_KEY (Google Gemini API klíč, výhradně server-side). Bez klíče se nikdy nic negeneruje ani nefinguje jako hotová vizualizace.";
  },

  async generate(request: ImageGenRequest): Promise<ImageGenResult> {
    // item 11: never generate a new room from scratch — a missing/
    // unfetchable original photo is a hard stop, not a fallback.
    let original: { base64: string; mimeType: string };
    try {
      original = await fetchOriginalImage(request.photoUrl);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Původní fotografii se nepodařilo načíst.";
      throw new ImageGenNotAvailableError(`${PROVIDER_LABEL}: ${detail}`);
    }

    const prompt = buildGeminiEditPrompt({
      roomType: request.roomType,
      planContext: request.planContext,
      roomAnalysis: request.roomAnalysis,
      userPrompt: request.prompt
    });

    const outcome = await editImageWithGemini({
      imageBase64: original.base64,
      imageMimeType: original.mimeType,
      prompt
    });

    if (outcome.status !== "OK") {
      // Every non-OK outcome carries a safe, specific Czech-facing detail
      // (never the API key) — surfaced to the caller as the thrown error's
      // message, which photoGeneration.ts persists as failureReason and
      // shows in the UI. The app must never crash here and must never
      // fabricate a "generated" result as a fallback (item 9/10).
      throw new ImageGenNotAvailableError(outcome.detail);
    }

    const structuralChange = detectStructuralChange(request.prompt) || detectStructuralChange(request.planContext?.style ?? null);

    return {
      generatedUrl: `data:${outcome.mimeType};base64,${outcome.imageBase64}`,
      model: outcome.model,
      changeDetection: deriveChangeDetection(request.planContext),
      structuralChange,
      structuralChangeNote: structuralChange
        ? "Vizualizace předpokládá stavební zásah (např. odstranění příčky) podle zadaného rekonstrukčního plánu. Vyžaduje technické ověření (nosnost, stavební povolení)."
        : null,
      // No independent geometry-verification pass exists — this is a
      // deliberate, conservative default, never claimed HIGH by default.
      confidence: "MEDIUM"
    };
  }
};

export function getGeminiModelForDisplay(): string {
  return getGeminiModel();
}
