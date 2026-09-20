// Low-level Google Gemini image-editing REST client.
//
// Verified against the official Gemini API request/response shape (Google
// AI for Developers image-generation docs, the Firebase AI Logic "Generate
// & edit images using Gemini" guide, the Google Cloud Vertex AI image-
// editing docs, and the official `googleapis/python-genai` SDK README —
// ai.google.dev itself was unreachable from this sandbox's network egress
// policy, so this was cross-checked across those independent mirrors
// instead of a single source):
//
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
//   Header: x-goog-api-key: <key>
//   Body:   { contents: [{ parts: [{ text }, { inlineData: { mimeType, data } }] }],
//             generationConfig: { responseModalities: ["TEXT","IMAGE"] } }
//   Response: candidates[0].content.parts[].inlineData.{mimeType,data(base64)},
//             candidates[0].finishReason, promptFeedback.blockReason.
//
// Default model: gemini-2.5-flash-image — the one image-editing model this
// research could confirm, across every independently reachable source, is
// GA/production (Google's own Developer Blog: "Gemini 2.5 Flash Image now
// ready for production"), not a "-preview" id. A newer preview model
// (gemini-3.1-flash-image-preview, "Nano Banana 2") also exists; operators
// who want it can set GEMINI_IMAGE_MODEL without a code change — this app
// never hardcodes a single vendor model id as the only option.
//
// The API key is read only from process.env at call time and is NEVER
// included in a thrown error, a log row, or anything returned to the UI.
import { PROVIDER_LABEL } from "./constants";

const DEFAULT_MODEL = "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 55000;
const MAX_ATTEMPTS = 2; // one real attempt + at most one bounded retry — never uncontrolled repetition of a paid call

export function getGeminiApiKey(): string | undefined {
  return process.env.IMAGE_GEN_API_KEY;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export function getGeminiModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
}

export interface GeminiEditImageInput {
  imageBase64: string;
  imageMimeType: string;
  prompt: string;
}

export type GeminiImageEditOutcome =
  | { status: "OK"; imageBase64: string; mimeType: string; model: string }
  | { status: "SAFETY_BLOCKED"; detail: string }
  | { status: "NO_IMAGE_RETURNED"; detail: string }
  | { status: "MALFORMED_RESPONSE"; detail: string }
  | { status: "RATE_LIMITED"; detail: string }
  | { status: "AUTH_ERROR"; detail: string }
  | { status: "TIMEOUT"; detail: string }
  | { status: "TRANSIENT_ERROR"; detail: string };

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

interface GeminiResponseBody {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

const SAFETY_FINISH_REASONS = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);

function parseResponseBody(body: GeminiResponseBody, model: string): GeminiImageEditOutcome {
  const candidate = body.candidates?.[0];

  if (!candidate) {
    const blockReason = body.promptFeedback?.blockReason;
    if (blockReason) {
      return { status: "SAFETY_BLOCKED", detail: `Gemini odmítl požadavek z bezpečnostních důvodů (blockReason: ${blockReason}).` };
    }
    return { status: "MALFORMED_RESPONSE", detail: "Odpověď Gemini API neobsahovala žádného kandidáta (candidates je prázdné)." };
  }

  if (candidate.finishReason && SAFETY_FINISH_REASONS.has(candidate.finishReason)) {
    return { status: "SAFETY_BLOCKED", detail: `Gemini vizualizaci nevygeneroval z bezpečnostních důvodů (finishReason: ${candidate.finishReason}).` };
  }

  const parts = candidate.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const textPart = parts.find((p) => p.text);
    if (textPart?.text) {
      return {
        status: "NO_IMAGE_RETURNED",
        detail: `Gemini vrátil místo obrázku pouze text: "${textPart.text.slice(0, 200)}"`
      };
    }
    return { status: "NO_IMAGE_RETURNED", detail: "Gemini nevrátil žádný obrázek ani text." };
  }

  return {
    status: "OK",
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
    model
  };
}

function isAuthErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("api key not valid") || m.includes("api_key_invalid") || m.includes("permission denied") || m.includes("unauthenticated");
}

async function attemptOnce(input: GeminiEditImageInput, apiKey: string, model: string): Promise<GeminiImageEditOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: input.prompt }, { inlineData: { mimeType: input.imageMimeType, data: input.imageBase64 } }]
          }
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
      })
    });

    const body = (await res.json().catch(() => null)) as GeminiResponseBody | null;

    if (!res.ok) {
      const message = body?.error?.message;
      if (res.status === 429) {
        return { status: "RATE_LIMITED", detail: `${PROVIDER_LABEL}: dosažen rate limit (HTTP 429).` };
      }
      if (res.status === 401 || res.status === 403 || isAuthErrorMessage(message)) {
        return { status: "AUTH_ERROR", detail: `${PROVIDER_LABEL}: autentizace selhala (HTTP ${res.status}). Zkontrolujte IMAGE_GEN_API_KEY.` };
      }
      if (res.status >= 500) {
        return { status: "TRANSIENT_ERROR", detail: `${PROVIDER_LABEL}: server vrátil dočasnou chybu (HTTP ${res.status}).` };
      }
      return { status: "TRANSIENT_ERROR", detail: `${PROVIDER_LABEL}: chyba požadavku (HTTP ${res.status}${message ? `: ${message}` : ""}).` };
    }

    if (!body) {
      return { status: "MALFORMED_RESPONSE", detail: `${PROVIDER_LABEL}: odpověď nebyla platný JSON.` };
    }

    return parseResponseBody(body, model);
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      return { status: "TIMEOUT", detail: `${PROVIDER_LABEL}: požadavek vypršel (timeout ${REQUEST_TIMEOUT_MS / 1000}s).` };
    }
    return { status: "TRANSIENT_ERROR", detail: `${PROVIDER_LABEL}: síťový požadavek selhal.` };
  } finally {
    clearTimeout(timeout);
  }
}

// Only these outcomes are worth one bounded retry — a transient network/5xx
// blip or a timeout. Safety rejections, malformed/no-image responses, auth
// errors, and rate limits are never retried: retrying an identical request
// against those wastes a paid call without any real chance of success.
const RETRYABLE_STATUSES = new Set(["TRANSIENT_ERROR", "TIMEOUT"]);

export async function editImageWithGemini(input: GeminiEditImageInput): Promise<GeminiImageEditOutcome> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { status: "AUTH_ERROR", detail: `${PROVIDER_LABEL}: IMAGE_GEN_API_KEY není nastavený.` };
  }
  const model = getGeminiModel();

  let last: GeminiImageEditOutcome = { status: "TRANSIENT_ERROR", detail: `${PROVIDER_LABEL}: neznámá chyba.` };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await attemptOnce(input, apiKey, model);
    if (last.status === "OK" || !RETRYABLE_STATUSES.has(last.status)) return last;
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1200));
  }
  return last;
}
