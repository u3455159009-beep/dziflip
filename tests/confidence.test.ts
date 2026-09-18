import { describe, it, expect } from "vitest";
import { computeDataConfidence } from "@/lib/confidence";
import type { FieldMeta } from "@/lib/types";

const verifiedMeta: FieldMeta = { askingPrice: "VERIFIED", areaM2: "VERIFIED" };

describe("computeDataConfidence", () => {
  it("is LOW when price or area isn't verified", () => {
    const result = computeDataConfidence({
      fieldMeta: { askingPrice: "ESTIMATED", areaM2: "VERIFIED" },
      comparablesCount: 5,
      hasRealBudgetItems: true,
      renovationCostSet: true,
      salePriceSet: true
    });
    expect(result.level).toBe("LOW");
  });

  it("is HIGH only when price/area verified, enough comparables, and renovation cost is real", () => {
    const result = computeDataConfidence({
      fieldMeta: verifiedMeta,
      comparablesCount: 5,
      hasRealBudgetItems: true,
      renovationCostSet: true,
      salePriceSet: true
    });
    expect(result.level).toBe("HIGH");
  });

  it("is MEDIUM when core fields are fine but comparables/renovation data is thin", () => {
    const result = computeDataConfidence({
      fieldMeta: verifiedMeta,
      comparablesCount: 1,
      hasRealBudgetItems: false,
      renovationCostSet: false,
      salePriceSet: true
    });
    expect(result.level).toBe("MEDIUM");
  });

  it("never lets stale critical data support a HIGH verdict — caps it at MEDIUM", () => {
    const result = computeDataConfidence({
      fieldMeta: verifiedMeta,
      comparablesCount: 5,
      hasRealBudgetItems: true,
      renovationCostSet: true,
      salePriceSet: true,
      isStale: true
    });
    expect(result.level).toBe("MEDIUM");
  });

  it("staleness never upgrades a LOW verdict", () => {
    const result = computeDataConfidence({
      fieldMeta: { askingPrice: "UNKNOWN", areaM2: "UNKNOWN" },
      comparablesCount: 0,
      hasRealBudgetItems: false,
      renovationCostSet: false,
      salePriceSet: false,
      isStale: false
    });
    expect(result.level).toBe("LOW");
  });
});
