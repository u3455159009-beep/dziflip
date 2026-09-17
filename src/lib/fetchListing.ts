import { extractFromHtml, type ExtractedListing } from "./extract";

export interface FetchListingResult {
  ok: boolean;
  extracted?: ExtractedListing;
  error?: string;
}

/**
 * Best-effort server-side fetch of a listing URL. Many Czech real-estate
 * portals (e.g. sreality.cz) render content client-side via JavaScript, so
 * a plain HTML fetch may return little usable text — the caller must treat
 * a thin result as a signal to ask the user to paste the listing text
 * instead, never fabricate the missing fields.
 */
export async function fetchListing(url: string): Promise<FetchListingResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Neplatná URL adresa." };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, error: "Podporovány jsou pouze http/https odkazy." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    if (!res.ok) {
      return { ok: false, error: `Server vrátil chybu ${res.status}.` };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return { ok: false, error: "Odkaz nevede na HTML stránku." };
    }

    const html = await res.text();
    const extracted = extractFromHtml(html, parsed.toString());
    return { ok: true, extracted };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, error: "Stažení stránky vypršelo (timeout)." };
    }
    return { ok: false, error: "Stránku se nepodařilo stáhnout." };
  } finally {
    clearTimeout(timeout);
  }
}
