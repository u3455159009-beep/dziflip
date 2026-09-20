// Low-level Google Gemini image-editing REST client.
//
// Verified against the official Gemini API request/response shape (Google
// AI for Developers image-generation docs, the Firebase AI Logic "Generate
// & edit images using Gemini" guide, the Google Cloud Vertex AI image-
// editing docs, and the official `googleapis/python-genai` SDK README —
// ai.google.dev itself is unreachable from this sandbox's network egress
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
// Default model: gemini-2.5-flash-image — re-confirmed current at the time
// of this fix: it is Google's GA (non-preview) image-editing model,
// scheduled to shut down 2026-10-02 with gemini-3.1-flash-image-preview as
// Google's own named replacement (still a "-preview" id at the time of
// writing). Since it remains live today and this app never hardcodes a
// vendor model id as the only option, the default is left as-is —
// GEMINI_IMAGE_MODEL lets an operator switch the moment they choose to,
// without a code change or guessing a model name.
//
// The API key is read only from process.env at call time, trimmed (a
// trailing newline/space from pasting into Vercel's env var UI is a real,
// common cause of "fetch failed" — see getGeminiApiKey below), and is
// NEVER included in a thrown error, a log row, or anything returned to the
// UI or client.
import { PROVIDER_LABEL } from "./constants";

const DEFAULT_MODEL = "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 55000;
const MAX_ATTEMPTS = 2; // one real attempt + at most one bounded retry — never uncontrolled repetition of a paid call

/**
 * Reads IMAGE_GEN_API_KEY and trims surrounding whitespace. A trailing
 * newline or space is an extremely common artifact of pasting a secret
 * into a web UI (Vercel's env var field included) — left untrimmed, it
 * silently produces an INVALID HTTP HEADER VALUE, which makes the
 * underlying `fetch()` call throw before any request ever reaches the
 * network. That failure has no HTTP status, never appears in Vercel's
 * External API log (no connection was ever attempted), and previously
 * surfaced only as a generic "síťový požadavek selhal" — indistinguishable
 * from a real DNS/network outage. Trimming here removes the single most
 * likely real-world cause of that symptom outright.
 */
export function getGeminiApiKey(): string | undefined {
  const raw = process.env.IMAGE_GEN_API_KEY;
  if (raw === undefined) return undefined;
  return raw.trim();
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export function getGeminiModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
}

// Characters that make a string an invalid HTTP header value (control
// characters, in particular CR/LF/NUL) — undici's fetch() rejects these
// with a TypeError before opening any connection. Caught explicitly here
// (rather than only in the generic catch-all) so a still-malformed key
// (e.g. containing an internal newline, not just a trimmable trailing one)
// is reported as a precise, actionable GEMINI_AUTH_FAILED instead of a
// vague network failure.
const INVALID_HEADER_VALUE_CHARS = /[\r\n\0\t]/;

function apiKeyFormatError(key: string): string | null {
  if (!key) return `${PROVIDER_LABEL}: IMAGE_GEN_API_KEY je po ořezání prázdný.`;
  if (INVALID_HEADER_VALUE_CHARS.test(key)) {
    return `${PROVIDER_LABEL}: IMAGE_GEN_API_KEY obsahuje neplatné řídicí znaky (např. nový řádek nebo tabulátor uvnitř hodnoty) — zkontroluj proměnnou ve Vercelu (Project Settings → Environment Variables) a vlož klíč znovu bez okolních mezer/nových řádků.`;
  }
  return null;
}

export interface GeminiEditImageInput {
  imageBase64: string;
  imageMimeType: string;
  prompt: string;
}

// `status` stays a stable, narrow discriminant for existing callers/tests.
// `code` carries the exact diagnostic taxonomy requested for production
// debugging (logged server-side and safe to surface in Provider Health) —
// DOWNLOAD_ORIGINAL_FAILED is assigned by the caller (provider.ts), not
// here, since fetching the ORIGINAL photo happens outside this client.
export type GeminiDiagnosticCode =
  | "GEMINI_AUTH_FAILED"
  | "GEMINI_RATE_LIMITED"
  | "GEMINI_BAD_REQUEST"
  | "GEMINI_MODEL_NOT_AVAILABLE"
  | "GEMINI_SERVER_ERROR"
  | "GEMINI_DNS_OR_NETWORK_FAILED"
  | "GEMINI_TIMEOUT"
  | "GEMINI_RESPONSE_INVALID"
  | "GEMINI_SAFETY_BLOCKED";

export type GeminiImageEditOutcome =
  | { status: "OK"; imageBase64: string; mimeType: string; model: string }
  | { status: "SAFETY_BLOCKED"; code: "GEMINI_SAFETY_BLOCKED"; detail: string }
  | { status: "NO_IMAGE_RETURNED"; code: "GEMINI_RESPONSE_INVALID"; detail: string }
  | { status: "MALFORMED_RESPONSE"; code: "GEMINI_RESPONSE_INVALID"; detail: string }
  | { status: "RATE_LIMITED"; code: "GEMINI_RATE_LIMITED"; detail: string }
  | { status: "AUTH_ERROR"; code: "GEMINI_AUTH_FAILED"; detail: string }
  | { status: "BAD_REQUEST"; code: "GEMINI_BAD_REQUEST"; detail: string }
  | { status: "MODEL_NOT_AVAILABLE"; code: "GEMINI_MODEL_NOT_AVAILABLE"; detail: string }
  | { status: "TIMEOUT"; code: "GEMINI_TIMEOUT"; detail: string }
  | { status: "NETWORK_ERROR"; code: "GEMINI_DNS_OR_NETWORK_FAILED"; detail: string }
  | { status: "TRANSIENT_ERROR"; code: "GEMINI_SERVER_ERROR"; detail: string };

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
  error?: { message?: string; status?: string; code?: number };
}

const SAFETY_FINISH_REASONS = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);

function parseResponseBody(body: GeminiResponseBody, model: string): GeminiImageEditOutcome {
  const candidate = body.candidates?.[0];

  if (!candidate) {
    const blockReason = body.promptFeedback?.blockReason;
    if (blockReason) {
      return {
        status: "SAFETY_BLOCKED",
        code: "GEMINI_SAFETY_BLOCKED",
        detail: `Gemini odmítl požadavek z bezpečnostních důvodů (blockReason: ${blockReason}).`
      };
    }
    return {
      status: "MALFORMED_RESPONSE",
      code: "GEMINI_RESPONSE_INVALID",
      detail: "Odpověď Gemini API neobsahovala žádného kandidáta (candidates je prázdné)."
    };
  }

  if (candidate.finishReason && SAFETY_FINISH_REASONS.has(candidate.finishReason)) {
    return {
      status: "SAFETY_BLOCKED",
      code: "GEMINI_SAFETY_BLOCKED",
      detail: `Gemini vizualizaci nevygeneroval z bezpečnostních důvodů (finishReason: ${candidate.finishReason}).`
    };
  }

  const parts = candidate.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const textPart = parts.find((p) => p.text);
    if (textPart?.text) {
      return {
        status: "NO_IMAGE_RETURNED",
        code: "GEMINI_RESPONSE_INVALID",
        detail: `Gemini vrátil místo obrázku pouze text: "${textPart.text.slice(0, 200)}"`
      };
    }
    return { status: "NO_IMAGE_RETURNED", code: "GEMINI_RESPONSE_INVALID", detail: "Gemini nevrátil žádný obrázek ani text." };
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

function isModelNotAvailableMessage(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("not found") || m.includes("not supported") || m.includes("does not exist") || m.includes("no such model");
}

/**
 * Safe, structured, server-side-only diagnostic log line for a failed
 * Gemini call. Deliberately logs a fixed, reviewed set of fields — never
 * the API key, the Authorization/x-goog-api-key header, or the full
 * request/response body (which would carry the base64 image and could
 * carry the key in an echoed error). `causeDescription` is a short,
 * pre-sanitized string (e.g. a Node error `code` like "ENOTFOUND"), never
 * a raw error object that might embed the request.
 */
function logGeminiFailure(input: {
  stage: "download_original" | "generate_content";
  model: string;
  code: GeminiDiagnosticCode | "DOWNLOAD_ORIGINAL_FAILED" | "BLOB_SAVE_FAILED";
  httpStatus?: number;
  googleErrorMessage?: string;
  timeout?: boolean;
  responseContentType?: string | null;
  causeDescription?: string;
}) {
  console.error("[gemini-image-gen] request failed", {
    provider: PROVIDER_LABEL,
    model: input.model,
    stage: input.stage,
    code: input.code,
    httpStatus: input.httpStatus ?? null,
    googleErrorMessage: input.googleErrorMessage ? input.googleErrorMessage.slice(0, 300) : null,
    timeout: Boolean(input.timeout),
    responseContentType: input.responseContentType ?? null,
    cause: input.causeDescription ?? null
  });
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

    const contentType = res.headers.get("content-type");
    const body = (await res.json().catch(() => null)) as GeminiResponseBody | null;

    if (!res.ok) {
      const message = body?.error?.message;
      if (res.status === 429) {
        logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_RATE_LIMITED", httpStatus: res.status, googleErrorMessage: message, responseContentType: contentType });
        return { status: "RATE_LIMITED", code: "GEMINI_RATE_LIMITED", detail: `${PROVIDER_LABEL}: dosažen rate limit (HTTP 429).` };
      }
      if (res.status === 401 || res.status === 403 || isAuthErrorMessage(message)) {
        logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_AUTH_FAILED", httpStatus: res.status, googleErrorMessage: message, responseContentType: contentType });
        return { status: "AUTH_ERROR", code: "GEMINI_AUTH_FAILED", detail: `${PROVIDER_LABEL}: autentizace selhala (HTTP ${res.status}). Zkontrolujte IMAGE_GEN_API_KEY.` };
      }
      if (res.status === 404 || isModelNotAvailableMessage(message)) {
        logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_MODEL_NOT_AVAILABLE", httpStatus: res.status, googleErrorMessage: message, responseContentType: contentType });
        return {
          status: "MODEL_NOT_AVAILABLE",
          code: "GEMINI_MODEL_NOT_AVAILABLE",
          detail: `${PROVIDER_LABEL}: model "${model}" není dostupný (HTTP ${res.status}${message ? `: ${message}` : ""}). Zkontroluj GEMINI_IMAGE_MODEL / aktuální dostupnost modelu v Google dokumentaci.`
        };
      }
      if (res.status === 400) {
        logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_BAD_REQUEST", httpStatus: res.status, googleErrorMessage: message, responseContentType: contentType });
        return { status: "BAD_REQUEST", code: "GEMINI_BAD_REQUEST", detail: `${PROVIDER_LABEL}: neplatný požadavek (HTTP 400${message ? `: ${message}` : ""}).` };
      }
      if (res.status >= 500) {
        logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_SERVER_ERROR", httpStatus: res.status, googleErrorMessage: message, responseContentType: contentType });
        return { status: "TRANSIENT_ERROR", code: "GEMINI_SERVER_ERROR", detail: `${PROVIDER_LABEL}: server vrátil dočasnou chybu (HTTP ${res.status}).` };
      }
      logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_SERVER_ERROR", httpStatus: res.status, googleErrorMessage: message, responseContentType: contentType });
      return { status: "TRANSIENT_ERROR", code: "GEMINI_SERVER_ERROR", detail: `${PROVIDER_LABEL}: chyba požadavku (HTTP ${res.status}${message ? `: ${message}` : ""}).` };
    }

    if (!body) {
      logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_RESPONSE_INVALID", httpStatus: res.status, responseContentType: contentType });
      return { status: "MALFORMED_RESPONSE", code: "GEMINI_RESPONSE_INVALID", detail: `${PROVIDER_LABEL}: odpověď nebyla platný JSON.` };
    }

    const parsed = parseResponseBody(body, model);
    if (parsed.status !== "OK") {
      logGeminiFailure({ stage: "generate_content", model, code: parsed.code, httpStatus: res.status, responseContentType: contentType });
    }
    return parsed;
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_TIMEOUT", timeout: true });
      return { status: "TIMEOUT", code: "GEMINI_TIMEOUT", detail: `${PROVIDER_LABEL}: požadavek vypršel (timeout ${REQUEST_TIMEOUT_MS / 1000}s).` };
    }
    // Every other thrown error means fetch() never got an HTTP response at
    // all (DNS failure, connection refused/reset, TLS failure, or — before
    // the key-format guard above existed — an invalid header value). Node's
    // fetch (undici) wraps the real cause in `err.cause`; that `.code`
    // (e.g. ENOTFOUND, ECONNREFUSED, ECONNRESET) is exactly the signal a
    // real DNS/network outage produces, so it's surfaced in the log (never
    // to the user) to make this diagnosable without guessing.
    const cause = (err as any)?.cause;
    const causeCode: string | undefined = cause?.code || (err as any)?.code;
    const causeDescription = causeCode || (err instanceof Error ? err.message.slice(0, 200) : "unknown");
    logGeminiFailure({ stage: "generate_content", model, code: "GEMINI_DNS_OR_NETWORK_FAILED", causeDescription });
    return {
      status: "NETWORK_ERROR",
      code: "GEMINI_DNS_OR_NETWORK_FAILED",
      detail: `${PROVIDER_LABEL}: síťový požadavek selhal (DNS/spojení se serverem Google se nezdařilo). Původní fotografie zůstává beze změny.`
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Only these outcomes are worth one bounded retry — a transient network/5xx
// blip or a timeout. Safety rejections, malformed/no-image responses, auth
// errors, bad requests, an unavailable model, and rate limits are never
// retried: retrying an identical request against those wastes a paid call
// without any real chance of success.
const RETRYABLE_STATUSES = new Set(["TRANSIENT_ERROR", "TIMEOUT", "NETWORK_ERROR"]);

export async function editImageWithGemini(input: GeminiEditImageInput): Promise<GeminiImageEditOutcome> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { status: "AUTH_ERROR", code: "GEMINI_AUTH_FAILED", detail: `${PROVIDER_LABEL}: IMAGE_GEN_API_KEY není nastavený.` };
  }
  const formatError = apiKeyFormatError(apiKey);
  if (formatError) {
    logGeminiFailure({ stage: "generate_content", model: getGeminiModel(), code: "GEMINI_AUTH_FAILED", causeDescription: "invalid-header-value-in-api-key" });
    return { status: "AUTH_ERROR", code: "GEMINI_AUTH_FAILED", detail: formatError };
  }
  const model = getGeminiModel();

  let last: GeminiImageEditOutcome = { status: "TRANSIENT_ERROR", code: "GEMINI_SERVER_ERROR", detail: `${PROVIDER_LABEL}: neznámá chyba.` };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await attemptOnce(input, apiKey, model);
    if (last.status === "OK" || !RETRYABLE_STATUSES.has(last.status)) return last;
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1200));
  }
  return last;
}
