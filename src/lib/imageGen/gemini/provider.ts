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

class OriginalPhotoUnavailableError extends Error {
  code = "DOWNLOAD_ORIGINAL_FAILED";
}

function logDownloadFailure(input: { httpStatus?: number; causeDescription?: string; reason: string }) {
  // Safe, structured — the photo URL is a public Blob/listing URL (never a
  // secret), so it's fine to log; nothing else here ever is.
  console.error("[gemini-image-gen] failed to download ORIGINAL photo", {
    stage: "download_original",
    code: "DOWNLOAD_ORIGINAL_FAILED",
    httpStatus: input.httpStatus ?? null,
    cause: input.causeDescription ?? null,
    reason: input.reason
  });
}

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
      logDownloadFailure({ httpStatus: res.status, reason: "non-ok-response" });
      throw new OriginalPhotoUnavailableError(`Původní fotografii se nepodařilo stáhnout (HTTP ${res.status}).`);
    }
    const contentType = res.headers.get("content-type");
    const mimeType = contentType && contentType.startsWith("image/") ? contentType.split(";")[0] : guessMimeTypeFromUrl(photoUrl);

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      logDownloadFailure({ reason: "empty-body" });
      throw new OriginalPhotoUnavailableError("Původní fotografie je prázdná.");
    }
    if (buffer.byteLength > MAX_SOURCE_IMAGE_BYTES) {
      logDownloadFailure({ reason: "too-large" });
      throw new OriginalPhotoUnavailableError("Původní fotografie je příliš velká pro úpravu (limit 15 MB).");
    }
    return { base64: Buffer.from(buffer).toString("base64"), mimeType };
  } catch (err) {
    if (err instanceof OriginalPhotoUnavailableError) throw err;
    if ((err as any)?.name === "AbortError") {
      logDownloadFailure({ reason: "timeout" });
      throw new OriginalPhotoUnavailableError("Stažení původní fotografie vypršelo (timeout).");
    }
    const cause = (err as any)?.cause;
    const causeDescription: string | undefined = cause?.code || (err as any)?.code;
    logDownloadFailure({ causeDescription, reason: "network-error" });
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
      const code = err instanceof OriginalPhotoUnavailableError ? err.code : "DOWNLOAD_ORIGINAL_FAILED";
      throw new ImageGenNotAvailableError(`${PROVIDER_LABEL}: ${detail}`, code);
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
      // (never the API key) and a machine-readable diagnostic code —
      // surfaced to the caller as the thrown error, which photoGeneration.ts
      // persists as failureReason/failureCode and shows in the UI. The app
      // must never crash here and must never fabricate a "generated" result
      // as a fallback (item 9/10).
      throw new ImageGenNotAvailableError(outcome.detail, outcome.code);
    }

    const structuralChange = detectStructuralChange(request.prompt) || detectStructuralChange(request.planContext?.style ?? null);

    return {
      imageBase64: outcome.imageBase64,
      mimeType: outcome.mimeType,
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

// A minimal, valid, real 1x1 white PNG — used only to make one real
// generateContent call against the exact same endpoint/model production
// uses, without depending on any listing photo. Real Gemini credentials
// and network path, real response parsing — never a mocked/fabricated
// "success" (item 6). Deliberately bypasses fetchOriginalImage/Blob save:
// this smoke test isolates exactly one question — is image-to-image
// generateContent reachable and authenticated right now — from the rest of
// the pipeline (downloading a real photo, saving to Blob), which are
// tested by real usage instead.
const SMOKE_TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const SMOKE_TEST_PROMPT =
  "This is a connectivity smoke test, not a real renovation request. Return the same 1x1 pixel image unchanged.";

export async function runGeminiImageSmokeTest() {
  return editImageWithGemini({
    imageBase64: SMOKE_TEST_IMAGE_BASE64,
    imageMimeType: "image/png",
    prompt: SMOKE_TEST_PROMPT
  });
}
