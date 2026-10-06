// DziFlip Score (Request E, item 3) — a transparent, deterministic 0-100
// composite of numbers DziFlip has already computed elsewhere (price band,
// ROI, margin, data confidence). It is NOT a prediction or an AI estimate,
// and it is never shown unless every input that feeds it is a real,
// already-computed value — any missing input returns null (shown as N/A
// in the alert), never a guessed score.
import type { FlipBand } from "./calc";
import type { DataConfidenceLevel } from "./types";

export interface DziFlipScoreInput {
  band: FlipBand | null;
  roiPct: number | null; // 0-1
  marginPct: number | null; // 0-1
  dataConfidenceLevel: DataConfidenceLevel | null;
  comparablesCount: number;
}

const BAND_POINTS: Record<FlipBand, number> = {
  BUY_NOW: 40,
  GOOD: 28,
  NORMAL: 12,
  BAD: 0,
  UNKNOWN: 0
};

const CONFIDENCE_POINTS: Record<DataConfidenceLevel, number> = {
  HIGH: 20,
  MEDIUM: 10,
  LOW: 0
};

/** 0% ROI -> 0 pts, 20%+ ROI -> the full point allowance, linear between. */
function scaledPoints(value: number, fullAt: number, maxPoints: number): number {
  return Math.max(0, Math.min(maxPoints, (value / fullAt) * maxPoints));
}

export function computeDziFlipScore(input: DziFlipScoreInput): number | null {
  if (!input.band || input.band === "UNKNOWN") return null;
  if (input.roiPct == null || !Number.isFinite(input.roiPct)) return null;
  if (input.marginPct == null || !Number.isFinite(input.marginPct)) return null;
  if (!input.dataConfidenceLevel) return null;
  if (input.comparablesCount < 1) return null; // no comparable evidence at all — never score blind

  const total =
    BAND_POINTS[input.band] +
    CONFIDENCE_POINTS[input.dataConfidenceLevel] +
    scaledPoints(input.roiPct, 0.2, 25) +
    scaledPoints(input.marginPct, 0.3, 15);

  return Math.max(0, Math.min(100, Math.round(total)));
}
