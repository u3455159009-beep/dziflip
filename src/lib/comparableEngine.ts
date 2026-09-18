// Comparable Engine V2 — computes an explainable similarity score between
// the subject property and each candidate comparable, and classifies
// comparable quality. Every dimension is skipped (not penalized) when data
// is missing on either side, and the final score is the weighted average
// of only the dimensions that were actually compared — so a comparable
// with thin data gets a lower quality tier, never a fabricated high score.
import type { CompQualityTier } from "./types";

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const CONDITION_ORDER: Array<[RegExp, number]> = [
  [/novostavba/, 9],
  [/po kompletni rekonstrukci/, 8],
  [/po rekonstrukci/, 7],
  [/castecne po rekonstrukci/, 6],
  [/velmi dobry stav/, 6],
  [/dobry stav/, 5],
  [/puvodni stav/, 3],
  [/k rekonstrukci/, 2],
  [/pred rekonstrukci/, 2],
  [/spatny stav|havarijni stav/, 1]
];

export function conditionOrdinal(condition: string | null | undefined): number | null {
  if (!condition) return null;
  const norm = stripDiacritics(condition);
  for (const [re, value] of CONDITION_ORDER) {
    if (re.test(norm)) return value;
  }
  return null;
}

export interface SimilarityBreakdown {
  locality?: number;
  distance?: number;
  disposition?: number;
  area?: number;
  condition?: number;
  buildingType?: number;
  ownership?: number;
  floor?: number;
  elevator?: number;
  amenities?: number; // balcony/terrace/loggia combined
  parking?: number;
  recency?: number;
}

const DIMENSION_WEIGHTS: Record<keyof SimilarityBreakdown, number> = {
  locality: 0.2,
  distance: 0.13,
  disposition: 0.15,
  area: 0.15,
  condition: 0.1,
  buildingType: 0.07,
  ownership: 0.06,
  floor: 0.04,
  elevator: 0.02,
  amenities: 0.03,
  parking: 0.02,
  recency: 0.03
};

const DIMENSION_LABELS: Record<keyof SimilarityBreakdown, string> = {
  locality: "lokalita",
  distance: "vzdálenost",
  disposition: "dispozice",
  area: "plocha",
  condition: "stav",
  buildingType: "typ domu",
  ownership: "vlastnictví",
  floor: "patro",
  elevator: "výtah",
  amenities: "balkon/terasa/lodžie",
  parking: "parkování",
  recency: "stáří nabídky"
};

export interface SubjectProperty {
  municipality: string | null;
  district: string | null;
  disposition: string | null;
  areaM2: number | null;
  condition: string | null;
  buildingType: string | null;
  construction: string | null;
  ownership: string | null;
  floor: string | null;
  elevator: boolean | null;
  balcony: boolean | null;
  terrace: boolean | null;
  loggia: boolean | null;
  parking: boolean | null;
}

export interface ComparableForScoring {
  locality: string | null;
  distanceKm: number | null;
  disposition: string | null;
  areaM2: number | null;
  condition: string | null;
  buildingType: string | null;
  construction: string | null;
  ownership: string | null;
  floor: string | null;
  elevator: boolean | null;
  balcony: boolean | null;
  terrace: boolean | null;
  loggia: boolean | null;
  parking: boolean | null;
  foundAt: Date | string;
}

export interface ComparableEngineOptions {
  maxDistanceKm: number;
  maxAgeDays: number;
}

export interface SimilarityResult {
  score: number; // 0-1
  breakdown: SimilarityBreakdown;
  qualityTier: CompQualityTier;
  explanation: string[];
}

function boolMatch(a: boolean | null | undefined, b: boolean | null | undefined): number | undefined {
  if (a === null || a === undefined || b === null || b === undefined) return undefined;
  return a === b ? 1 : 0;
}

export function scoreComparable(
  subject: SubjectProperty,
  comp: ComparableForScoring,
  opts: ComparableEngineOptions
): SimilarityResult {
  const breakdown: SimilarityBreakdown = {};

  // Locality
  const subjectLoc = stripDiacritics(`${subject.municipality ?? ""} ${subject.district ?? ""}`).trim();
  const compLoc = stripDiacritics(comp.locality ?? "").trim();
  if (subjectLoc && compLoc) {
    const subjectMuni = stripDiacritics(subject.municipality ?? "");
    if (subject.district && compLoc.includes(stripDiacritics(subject.district))) {
      breakdown.locality = 1;
    } else if (subjectMuni && compLoc.includes(subjectMuni)) {
      breakdown.locality = 0.6;
    } else {
      breakdown.locality = 0.2;
    }
  }

  // Distance
  if (comp.distanceKm !== null && comp.distanceKm !== undefined) {
    breakdown.distance = Math.max(0, 1 - comp.distanceKm / Math.max(0.1, opts.maxDistanceKm));
  }

  // Disposition
  if (subject.disposition && comp.disposition) {
    const a = stripDiacritics(subject.disposition);
    const b = stripDiacritics(comp.disposition);
    if (a === b) breakdown.disposition = 1;
    else if (a[0] === b[0]) breakdown.disposition = 0.5; // same room count, different kk/1
    else breakdown.disposition = 0;
  }

  // Area
  if (subject.areaM2 && comp.areaM2) {
    const diff = Math.abs(subject.areaM2 - comp.areaM2);
    breakdown.area = Math.max(0, 1 - diff / (0.25 * subject.areaM2));
  }

  // Condition
  const subjectOrdinal = conditionOrdinal(subject.condition);
  const compOrdinal = conditionOrdinal(comp.condition);
  if (subjectOrdinal !== null && compOrdinal !== null) {
    breakdown.condition = Math.max(0, 1 - Math.abs(subjectOrdinal - compOrdinal) / 8);
  }

  // Building type / construction
  const subjectConstruction = stripDiacritics(subject.construction ?? "");
  const compConstruction = stripDiacritics(comp.construction ?? "");
  if (subjectConstruction && compConstruction) {
    breakdown.buildingType = subjectConstruction === compConstruction ? 1 : 0.3;
  } else if (subject.buildingType && comp.buildingType) {
    breakdown.buildingType = stripDiacritics(subject.buildingType) === stripDiacritics(comp.buildingType) ? 1 : 0.3;
  }

  // Ownership
  if (subject.ownership && comp.ownership) {
    breakdown.ownership = stripDiacritics(subject.ownership) === stripDiacritics(comp.ownership) ? 1 : 0;
  }

  // Floor
  const subjectFloor = subject.floor ? parseInt(subject.floor, 10) : NaN;
  const compFloor = comp.floor ? parseInt(comp.floor, 10) : NaN;
  if (Number.isFinite(subjectFloor) && Number.isFinite(compFloor)) {
    breakdown.floor = Math.max(0, 1 - Math.abs(subjectFloor - compFloor) / 5);
  }

  // Elevator
  const elevatorScore = boolMatch(subject.elevator, comp.elevator);
  if (elevatorScore !== undefined) breakdown.elevator = elevatorScore;

  // Amenities (balcony/terrace/loggia) — average of whichever sub-dimensions are known
  const amenityScores = [boolMatch(subject.balcony, comp.balcony), boolMatch(subject.terrace, comp.terrace), boolMatch(subject.loggia, comp.loggia)].filter(
    (v): v is number => v !== undefined
  );
  if (amenityScores.length > 0) {
    breakdown.amenities = amenityScores.reduce((s, v) => s + v, 0) / amenityScores.length;
  }

  // Parking
  const parkingScore = boolMatch(subject.parking, comp.parking);
  if (parkingScore !== undefined) breakdown.parking = parkingScore;

  // Recency
  const ageDays = (Date.now() - new Date(comp.foundAt).getTime()) / (1000 * 60 * 60 * 24);
  breakdown.recency = Math.max(0, 1 - ageDays / Math.max(1, opts.maxAgeDays));

  // Weighted average over known dimensions only
  let weightedSum = 0;
  let totalWeight = 0;
  const explanation: string[] = [];
  for (const key of Object.keys(breakdown) as Array<keyof SimilarityBreakdown>) {
    const value = breakdown[key];
    if (value === undefined) continue;
    const weight = DIMENSION_WEIGHTS[key];
    weightedSum += value * weight;
    totalWeight += weight;
    explanation.push(`${DIMENSION_LABELS[key]} ${Math.round(value * 100)} %`);
  }
  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
  explanation.push(`celkem ${Math.round(score * 100)} %`);

  // Quality tier: needs the core dimensions (locality, disposition, area,
  // condition) to actually be known — a high score built from only
  // peripheral dimensions (e.g. just recency + parking) is never HIGH.
  const coreKnown = [breakdown.locality, breakdown.disposition, breakdown.area, breakdown.condition].filter(
    (v) => v !== undefined
  ).length;
  const distanceOk = breakdown.distance === undefined || comp.distanceKm! <= opts.maxDistanceKm;
  const ageOk = ageDays <= opts.maxAgeDays;

  let qualityTier: CompQualityTier;
  if (coreKnown < 2) {
    qualityTier = "LOW";
  } else if (score >= 0.75 && coreKnown >= 3 && distanceOk && ageOk) {
    qualityTier = "HIGH";
  } else if (score >= 0.5 && coreKnown >= 2) {
    qualityTier = "MEDIUM";
  } else {
    qualityTier = "LOW";
  }

  return { score: Math.round(score * 1000) / 1000, breakdown, qualityTier, explanation };
}

export const COMP_QUALITY_RANK: Record<CompQualityTier, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export function meetsMinQuality(tier: CompQualityTier, minTier: CompQualityTier): boolean {
  return COMP_QUALITY_RANK[tier] >= COMP_QUALITY_RANK[minTier];
}
