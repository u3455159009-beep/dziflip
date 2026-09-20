// Shared Google Gemini TEXT/structured-JSON client — used by the real
// Vision provider (room analysis) and the automatic RenovationPlan
// generator. Reuses the exact same server-side credential
// (IMAGE_GEN_API_KEY) as the image-editing client in
// src/lib/imageGen/gemini/ — Gemini's generateContent endpoint is
// natively multimodal, so one Google API key covers image editing, image
// (vision) understanding, and text generation; this app never asks for a
// second key for Vision.
//
// generationConfig.responseMimeType: "application/json" is a standard
// Gemini API option that forces the model to return only valid JSON —
// used here instead of free-form prose parsing so "structured JSON,
// validated by a schema" (the caller then runs it through zod) is met
// without relying on prompt-engineering alone.
import { getGeminiApiKey } from "../imageGen/gemini/client";

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 45000;
const MAX_ATTEMPTS = 2;

export function getGeminiTextModel(): string {
  return process.env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
}

export interface GeminiTextInput {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export type GeminiTextOutcome =
  | { status: "OK"; text: string; model: string }
  | { status: "SAFETY_BLOCKED"; detail: string }
  | { status: "NO_CONTENT"; detail: string }
  | { status: "MALFORMED_RESPONSE"; detail: string }
  | { status: "RATE_LIMITED"; detail: string }
  | { status: "AUTH_ERROR"; detail: string }
  | { status: "TIMEOUT"; detail: string }
  | { status: "TRANSIENT_ERROR"; detail: string };

interface GeminiPart {
  text?: string;
}
interface GeminiResponseBody {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

const SAFETY_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

function parseResponseBody(body: GeminiResponseBody, model: string): GeminiTextOutcome {
  const candidate = body.candidates?.[0];
  if (!candidate) {
    const blockReason = body.promptFeedback?.blockReason;
    if (blockReason) return { status: "SAFETY_BLOCKED", detail: `Gemini odmítl požadavek z bezpečnostních důvodů (blockReason: ${blockReason}).` };
    return { status: "MALFORMED_RESPONSE", detail: "Odpověď Gemini API neobsahovala žádného kandidáta." };
  }
  if (candidate.finishReason && SAFETY_FINISH_REASONS.has(candidate.finishReason)) {
    return { status: "SAFETY_BLOCKED", detail: `Gemini odpověď zamítl (finishReason: ${candidate.finishReason}).` };
  }
  const text = candidate.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) return { status: "NO_CONTENT", detail: "Gemini nevrátil žádný text." };
  return { status: "OK", text, model };
}

function isAuthErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("api key not valid") || m.includes("api_key_invalid") || m.includes("permission denied") || m.includes("unauthenticated");
}

async function attemptOnce(input: GeminiTextInput, apiKey: string, model: string): Promise<GeminiTextOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
    if (input.imageBase64 && input.imageMimeType) {
      parts.push({ inlineData: { mimeType: input.imageMimeType, data: input.imageBase64 } });
    }

    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const body = (await res.json().catch(() => null)) as GeminiResponseBody | null;

    if (!res.ok) {
      const message = body?.error?.message;
      if (res.status === 429) return { status: "RATE_LIMITED", detail: "Gemini: dosažen rate limit (HTTP 429)." };
      if (res.status === 401 || res.status === 403 || isAuthErrorMessage(message)) {
        return { status: "AUTH_ERROR", detail: `Gemini: autentizace selhala (HTTP ${res.status}). Zkontrolujte IMAGE_GEN_API_KEY.` };
      }
      if (res.status >= 500) return { status: "TRANSIENT_ERROR", detail: `Gemini: server vrátil dočasnou chybu (HTTP ${res.status}).` };
      return { status: "TRANSIENT_ERROR", detail: `Gemini: chyba požadavku (HTTP ${res.status}${message ? `: ${message}` : ""}).` };
    }
    if (!body) return { status: "MALFORMED_RESPONSE", detail: "Gemini: odpověď nebyla platný JSON." };
    return parseResponseBody(body, model);
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      return { status: "TIMEOUT", detail: `Gemini: požadavek vypršel (timeout ${REQUEST_TIMEOUT_MS / 1000}s).` };
    }
    return { status: "TRANSIENT_ERROR", detail: "Gemini: síťový požadavek selhal." };
  } finally {
    clearTimeout(timeout);
  }
}

const RETRYABLE_STATUSES = new Set(["TRANSIENT_ERROR", "TIMEOUT"]);

export async function generateJsonWithGemini(input: GeminiTextInput): Promise<GeminiTextOutcome> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { status: "AUTH_ERROR", detail: "Gemini: IMAGE_GEN_API_KEY není nastavený." };
  const model = getGeminiTextModel();

  let last: GeminiTextOutcome = { status: "TRANSIENT_ERROR", detail: "Gemini: neznámá chyba." };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await attemptOnce(input, apiKey, model);
    if (last.status === "OK" || !RETRYABLE_STATUSES.has(last.status)) return last;
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1200));
  }
  return last;
}
