import { describe, it, expect } from "vitest";
import { computeDziFlipScore } from "@/lib/dziflipScore";

describe("computeDziFlipScore (Request E, item 3)", () => {
  it("returns null when there is no band / insufficient data, never a guessed score", () => {
    expect(computeDziFlipScore({ band: "UNKNOWN", roiPct: 0.1, marginPct: 0.1, dataConfidenceLevel: "HIGH", comparablesCount: 3 })).toBeNull();
    expect(computeDziFlipScore({ band: null, roiPct: 0.1, marginPct: 0.1, dataConfidenceLevel: "HIGH", comparablesCount: 3 })).toBeNull();
  });

  it("returns null when roi/margin/confidence is missing", () => {
    expect(computeDziFlipScore({ band: "GOOD", roiPct: null, marginPct: 0.1, dataConfidenceLevel: "HIGH", comparablesCount: 3 })).toBeNull();
    expect(computeDziFlipScore({ band: "GOOD", roiPct: 0.1, marginPct: null, dataConfidenceLevel: "HIGH", comparablesCount: 3 })).toBeNull();
    expect(computeDziFlipScore({ band: "GOOD", roiPct: 0.1, marginPct: 0.1, dataConfidenceLevel: null, comparablesCount: 3 })).toBeNull();
  });

  it("returns null with zero comparables — never scores blind", () => {
    expect(computeDziFlipScore({ band: "GOOD", roiPct: 0.15, marginPct: 0.2, dataConfidenceLevel: "HIGH", comparablesCount: 0 })).toBeNull();
  });

  it("a BUY_NOW band with high ROI/margin and HIGH confidence scores near the top of the range", () => {
    const score = computeDziFlipScore({ band: "BUY_NOW", roiPct: 0.25, marginPct: 0.35, dataConfidenceLevel: "HIGH", comparablesCount: 5 });
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(90);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it("a NORMAL band with low ROI and LOW confidence scores low", () => {
    const score = computeDziFlipScore({ band: "NORMAL", roiPct: 0.02, marginPct: 0.03, dataConfidenceLevel: "LOW", comparablesCount: 1 });
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(30);
  });

  it("is monotonic in ROI holding everything else fixed", () => {
    const low = computeDziFlipScore({ band: "GOOD", roiPct: 0.05, marginPct: 0.1, dataConfidenceLevel: "MEDIUM", comparablesCount: 3 })!;
    const high = computeDziFlipScore({ band: "GOOD", roiPct: 0.18, marginPct: 0.1, dataConfidenceLevel: "MEDIUM", comparablesCount: 3 })!;
    expect(high).toBeGreaterThan(low);
  });

  it("never exceeds 100 or drops below 0", () => {
    const score = computeDziFlipScore({ band: "BUY_NOW", roiPct: 5, marginPct: 5, dataConfidenceLevel: "HIGH", comparablesCount: 10 })!;
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
