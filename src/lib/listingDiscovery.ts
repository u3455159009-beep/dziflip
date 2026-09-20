// Listing Discovery Engine (item 1) — when the user pastes only free text
// (no URL), tries to find the publicly-listed original ad so its real URL,
// portal and any fields the pasted text missed can be attached. Never
// claims a match without comparing multiple independent fields, and never
// merges on title similarity alone. Runs only against ACTIVE search
// providers (see src/lib/sources/registry.ts) — with none configured it
// always returns NOT_FOUND, honestly, rather than guessing.
import type { ListingMatchConfidence } from "./types";
import type { ListingSourceItem, ListingSourceQuery } from "./sources/types";
import { SourceNotAvailableError } from "./sources/types";
import { SOURCE_PROVIDERS } from "./sources/registry";

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function normStr(s: string | null | undefined): string {
  return stripDiacritics(s ?? "");
}

export interface ListingMatchSubject {
  propertyType: string | null;
  disposition: string | null;
  municipality: string | null;
  district: string | null;
  street: string | null;
  areaM2: number | null;
  askingPrice: number | null;
  externalId?: string | null;
}

export interface ListingMatchResult {
  confidence: ListingMatchConfidence;
  reasons: string[];
}

function withinPct(a: number, b: number, pct: number): boolean {
  return Math.abs(a - b) / Math.max(a, b) <= pct;
}

/**
 * Compares a subject listing against one candidate found by a search
 * provider. Every dimension actually compared is named in `reasons` (both
 * matches and mismatches), so the confidence level is always auditable —
 * never a black-box score.
 */
export function scoreListingMatch(subject: ListingMatchSubject, candidate: ListingSourceItem): ListingMatchResult {
  const reasons: string[] = [];

  if (subject.externalId && candidate.externalId && subject.externalId === candidate.externalId) {
    return { confidence: "EXACT_MATCH", reasons: ["shodné ID nabídky"] };
  }

  const streetMatch = subject.street && candidate.street ? normStr(subject.street) === normStr(candidate.street) : null;
  const municipalityMatch = subject.municipality && candidate.municipality ? normStr(subject.municipality) === normStr(candidate.municipality) : null;
  const districtMatch = subject.district && candidate.district ? normStr(subject.district) === normStr(candidate.district) : null;
  const dispositionMatch = subject.disposition && candidate.disposition ? normStr(subject.disposition) === normStr(candidate.disposition) : null;
  const areaClose = subject.areaM2 && candidate.areaM2 ? withinPct(subject.areaM2, candidate.areaM2, 0.05) : null;
  const areaLoose = subject.areaM2 && candidate.areaM2 ? withinPct(subject.areaM2, candidate.areaM2, 0.1) : null;
  const priceClose = subject.askingPrice && candidate.askingPrice ? withinPct(subject.askingPrice, candidate.askingPrice, 0.05) : null;
  const priceLoose = subject.askingPrice && candidate.askingPrice ? withinPct(subject.askingPrice, candidate.askingPrice, 0.15) : null;
  const propertyTypeMatch =
    subject.propertyType && candidate.propertyType ? normStr(subject.propertyType) === normStr(candidate.propertyType) : null;

  if (streetMatch === true) reasons.push("shodná ulice");
  if (municipalityMatch === true) reasons.push("shodná obec");
  if (districtMatch === true) reasons.push("shodná městská část");
  if (dispositionMatch === true) reasons.push("shodná dispozice");
  if (areaClose === true) reasons.push("téměř shodná plocha (do 5 %)");
  else if (areaLoose === true) reasons.push("podobná plocha (do 10 %)");
  if (priceClose === true) reasons.push("téměř shodná cena (do 5 %)");
  else if (priceLoose === true) reasons.push("podobná cena (do 15 %)");
  if (propertyTypeMatch === true) reasons.push("shodný typ nemovitosti");

  // EXACT_MATCH (short of an ID match, above): street + area + price + disposition all line up tightly.
  if (streetMatch === true && areaClose === true && priceClose === true && dispositionMatch !== false) {
    return { confidence: "EXACT_MATCH", reasons };
  }

  // HIGH_CONFIDENCE_MATCH: locality (obec+část) + dispozice + plocha + cena all agree closely.
  if (
    municipalityMatch === true &&
    districtMatch !== false &&
    dispositionMatch === true &&
    areaClose === true &&
    priceClose === true
  ) {
    return { confidence: "HIGH_CONFIDENCE_MATCH", reasons };
  }

  // POSSIBLE_MATCH: locality agrees, plus at least dispozice-or-plocha, plus a loosely matching price.
  if (municipalityMatch === true && (dispositionMatch === true || areaLoose === true) && priceLoose !== false) {
    if (reasons.length >= 2) return { confidence: "POSSIBLE_MATCH", reasons };
  }

  if (reasons.length === 0) reasons.push("žádná srovnatelná pole se neshodují");
  return { confidence: "NOT_FOUND", reasons };
}

export interface DiscoveryResult {
  confidence: ListingMatchConfidence;
  url: string | null;
  portal: string | null;
  reasons: string[];
  providersTried: string[];
  note: string;
  /** Which provider produced the best match — null when NOT_FOUND. Lets a
   * caller store a provider-specific follow-up reference (e.g. a FlatScan
   * listing id) without this module knowing about any specific provider. */
  matchProviderKey: string | null;
  matchExternalId: string | null;
  /** Candidate's own photo URLs (item 1/2) — only ever populated from the
   * matched listing's real source data, never invented. Empty when the
   * matched provider genuinely doesn't supply photos. */
  photos: string[];
}

const CONFIDENCE_RANK: Record<ListingMatchConfidence, number> = {
  NOT_FOUND: 0,
  POSSIBLE_MATCH: 1,
  HIGH_CONFIDENCE_MATCH: 2,
  EXACT_MATCH: 3
};

/**
 * Tries every ACTIVE search-capable provider, scores every candidate it
 * returns against the subject, and keeps the single best match. Never
 * invents a URL: with no ACTIVE provider (the default until SEARCH_API_KEY
 * is configured), always returns NOT_FOUND with an honest note explaining
 * why, rather than silently claiming success.
 */
export async function discoverOriginalListing(subject: ListingMatchSubject): Promise<DiscoveryResult> {
  const active = SOURCE_PROVIDERS.filter((p) => p.status === "ACTIVE" && p.key !== "MOCK_DEMO");
  const providersTried: string[] = [];

  if (active.length === 0) {
    return {
      confidence: "NOT_FOUND",
      url: null,
      portal: null,
      reasons: [],
      providersTried,
      note: "Žádný aktivní zdroj pro vyhledání původního inzerátu není připojen (viz Nastavení → Provider Health).",
      matchProviderKey: null,
      matchExternalId: null,
      photos: []
    };
  }

  const query: ListingSourceQuery = {
    municipality: subject.municipality,
    district: subject.district,
    dispositions: subject.disposition ? [subject.disposition] : undefined,
    minAreaM2: subject.areaM2 ? subject.areaM2 * 0.7 : undefined,
    maxAreaM2: subject.areaM2 ? subject.areaM2 * 1.3 : undefined,
    maxPrice: subject.askingPrice ? subject.askingPrice * 1.3 : undefined
  };

  let best: { result: ListingMatchResult; candidate: ListingSourceItem; providerKey: string } | null = null;

  for (const provider of active) {
    providersTried.push(provider.key);
    try {
      const candidates = await provider.search(query);
      for (const candidate of candidates) {
        const result = scoreListingMatch(subject, candidate);
        if (result.confidence === "NOT_FOUND") continue;
        if (!best || CONFIDENCE_RANK[result.confidence] > CONFIDENCE_RANK[best.result.confidence]) {
          best = { result, candidate, providerKey: provider.key };
        }
      }
    } catch (err) {
      // One provider failing must never abort discovery via the others.
      if (!(err instanceof SourceNotAvailableError)) throw err;
    }
  }

  if (!best) {
    return {
      confidence: "NOT_FOUND",
      url: null,
      portal: null,
      reasons: [],
      providersTried,
      note: `Prohledáno ${providersTried.length} aktivních zdrojů, žádná dostatečně jistá shoda nenalezena.`,
      matchProviderKey: null,
      matchExternalId: null,
      photos: []
    };
  }

  return {
    confidence: best.result.confidence,
    url: best.candidate.url,
    portal: best.candidate.portal,
    reasons: best.result.reasons,
    providersTried,
    note: `Nalezeno přes ${best.candidate.portal}.`,
    matchProviderKey: best.providerKey,
    matchExternalId: best.candidate.externalId,
    photos: best.candidate.photos ?? []
  };
}
