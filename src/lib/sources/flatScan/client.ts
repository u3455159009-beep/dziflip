// Low-level FlatScan Data API client. Handles auth, timeouts, and request
// logging (FlatScanRequestLog — the source of truth for "how many real API
// calls has DziFlip made this month," item 10). The API key is read only
// from process.env at call time and is NEVER included in a thrown error
// message, a log row, or anything returned to the UI — every error path
// below is checked for this.
import { prisma } from "@/lib/prisma";
import { SourceNotAvailableError } from "../types";

const DEFAULT_BASE_URL = "https://flatscan.cz/api/v1";
const REQUEST_TIMEOUT_MS = 12000;

export function getFlatScanApiKey(): string | undefined {
  return process.env.FLATSCAN_API_KEY;
}

function getBaseUrl(): string {
  return process.env.FLATSCAN_API_BASE_URL || DEFAULT_BASE_URL;
}

export function isFlatScanConfigured(): boolean {
  return Boolean(getFlatScanApiKey());
}

async function logRequest(endpoint: string, ok: boolean, statusCode: number | null, errorMessage: string | null) {
  await prisma.flatScanRequestLog
    .create({ data: { endpoint, ok, statusCode, errorMessage } })
    .catch(() => {}); // logging must never itself break a real request
}

/**
 * Performs one real GET request against the FlatScan Data API and logs it.
 * Callers are responsible for cache-checking BEFORE calling this — every
 * invocation counts against the monthly call budget (item 10).
 */
export async function flatScanGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const apiKey = getFlatScanApiKey();
  if (!apiKey) {
    throw new SourceNotAvailableError(
      "FLATSCAN_API_KEY není nastavený. FlatScan provider čeká na připojení (viz DEPLOY.md)."
    );
  }

  const url = new URL(`${getBaseUrl()}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  }

  const endpointLabel = `GET ${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      await logRequest(endpointLabel, false, res.status, `HTTP ${res.status}`);
      throw new SourceNotAvailableError(`FlatScan API: server vrátil chybu ${res.status}.`);
    }

    const data = (await res.json().catch(() => null)) as T | null;
    await logRequest(endpointLabel, true, res.status, null);
    if (data === null) {
      throw new SourceNotAvailableError("FlatScan API: odpověď nebyla platný JSON.");
    }
    return data;
  } catch (err) {
    if (err instanceof SourceNotAvailableError) {
      // Already logged above for the HTTP-error branch; log the remaining
      // throw sites (invalid JSON) here without ever including the key.
      if (err.message.includes("platný JSON")) await logRequest(endpointLabel, false, null, "invalid JSON");
      throw err;
    }
    if ((err as any)?.name === "AbortError") {
      await logRequest(endpointLabel, false, null, "timeout");
      throw new SourceNotAvailableError("FlatScan API: požadavek vypršel (timeout).");
    }
    await logRequest(endpointLabel, false, null, "network error");
    throw new SourceNotAvailableError("FlatScan API: požadavek selhal.");
  } finally {
    clearTimeout(timeout);
  }
}

/** Current-month request count — the number Provider Health shows against the 1 000/month Starter budget. */
export async function getFlatScanMonthlyRequestCount(): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return prisma.flatScanRequestLog.count({ where: { requestedAt: { gte: startOfMonth } } });
}
