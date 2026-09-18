import { describe, it, expect } from "vitest";
import { scoreComparable, meetsMinQuality, type SubjectProperty, type ComparableForScoring } from "@/lib/comparableEngine";

const baseSubject: SubjectProperty = {
  municipality: "Praha",
  district: "Praha 5 - Smíchov",
  disposition: "3+kk",
  areaM2: 75,
  condition: "dobrý stav",
  buildingType: "cihla",
  construction: "cihla",
  ownership: "OSOBNI",
  floor: "3",
  elevator: true,
  balcony: true,
  terrace: false,
  loggia: false,
  parking: false
};

function comp(overrides: Partial<ComparableForScoring>): ComparableForScoring {
  return {
    locality: "Praha 5 - Smíchov",
    distanceKm: 0.5,
    disposition: "3+kk",
    areaM2: 74,
    condition: "dobrý stav",
    buildingType: "cihla",
    construction: "cihla",
    ownership: "OSOBNI",
    floor: "3",
    elevator: true,
    balcony: true,
    terrace: false,
    loggia: false,
    parking: false,
    foundAt: new Date(),
    ...overrides
  };
}

const opts = { maxDistanceKm: 2, maxAgeDays: 180 };

describe("scoreComparable", () => {
  it("gives a near-identical comparable a high score and HIGH quality tier", () => {
    const result = scoreComparable(baseSubject, comp({}), opts);
    expect(result.score).toBeGreaterThan(0.85);
    expect(result.qualityTier).toBe("HIGH");
  });

  it("never fabricates a dimension score when data is missing on either side — it's skipped, not penalized", () => {
    const result = scoreComparable(baseSubject, comp({ condition: null, ownership: null, floor: null }), opts);
    expect(result.breakdown.condition).toBeUndefined();
    expect(result.breakdown.ownership).toBeUndefined();
    expect(result.breakdown.floor).toBeUndefined();
    // still scores decently on the dimensions that ARE known
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("downgrades quality to LOW when fewer than 2 core dimensions are known, regardless of score", () => {
    const result = scoreComparable(
      { ...baseSubject, municipality: null, district: null, disposition: null, condition: null },
      comp({ locality: null, disposition: null, condition: null, areaM2: null, parking: true, elevator: true, balcony: true }),
      opts
    );
    expect(result.qualityTier).toBe("LOW");
  });

  it("penalizes a very different disposition and area", () => {
    const result = scoreComparable(baseSubject, comp({ disposition: "1+kk", areaM2: 30 }), opts);
    expect(result.breakdown.disposition).toBeLessThan(0.6);
    expect(result.breakdown.area).toBeLessThan(0.5);
  });

  it("scores distance relative to maxDistanceKm and caps at 0 beyond it", () => {
    const near = scoreComparable(baseSubject, comp({ distanceKm: 0.1 }), opts);
    const far = scoreComparable(baseSubject, comp({ distanceKm: 5 }), opts);
    expect(near.breakdown.distance).toBeGreaterThan(far.breakdown.distance ?? 1);
    expect(far.breakdown.distance).toBe(0);
  });
});

describe("meetsMinQuality", () => {
  it("ranks HIGH > MEDIUM > LOW", () => {
    expect(meetsMinQuality("HIGH", "MEDIUM")).toBe(true);
    expect(meetsMinQuality("MEDIUM", "HIGH")).toBe(false);
    expect(meetsMinQuality("LOW", "LOW")).toBe(true);
  });
});
