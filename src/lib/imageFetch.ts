// Shared helper for fetching a real photo's bytes server-side, used by
// providers that need to send an actual image to an external API (Gemini
// Vision here; the Gemini image-editing provider has its own copy of this
// logic already covered by its own tests, left untouched to avoid any risk
// of regressing it).
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

export class ImageFetchError extends Error {}

function guessMimeTypeFromUrl(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

export async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new ImageFetchError(`Fotografii se nepodařilo stáhnout (HTTP ${res.status}).`);
    const contentType = res.headers.get("content-type");
    const mimeType = contentType && contentType.startsWith("image/") ? contentType.split(";")[0] : guessMimeTypeFromUrl(url);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) throw new ImageFetchError("Fotografie je prázdná.");
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new ImageFetchError("Fotografie je příliš velká pro analýzu (limit 15 MB).");
    return { base64: Buffer.from(buffer).toString("base64"), mimeType };
  } catch (err) {
    if (err instanceof ImageFetchError) throw err;
    if ((err as any)?.name === "AbortError") throw new ImageFetchError("Stažení fotografie vypršelo (timeout).");
    throw new ImageFetchError("Fotografii se nepodařilo stáhnout.");
  } finally {
    clearTimeout(timeout);
  }
}
