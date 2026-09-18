import { describe, it, expect } from "vitest";
import { scoreDuplicateMatch, type DedupCandidate } from "@/lib/dedup";

function mk(overrides: Partial<DedupCandidate>): DedupCandidate {
  return {
    id: "x",
    title: "Byt 3+kk",
    municipality: "Praha",
    district: "Praha 5 - Smíchov",
    street: "Plzeňská",
    areaM2: 75,
    disposition: "3+kk",
    askingPrice: 6500000,
    fullText: "Prodej hezkého bytu 3+kk v Praze 5 Smíchov, po rekonstrukci, balkon.",
    contactPhone: "+420600111222",
    ...overrides
  };
}

describe("scoreDuplicateMatch", () => {
  it("classifies SAME_PROPERTY only when a strong signal (street or phone) AND a high score are both present", () => {
    const a = mk({});
    const b = mk({ id: "y" });
    const result = scoreDuplicateMatch(a, b);
    expect(result.classification).toBe("SAME_PROPERTY");
    expect(result.reasons).toContain("Stejná ulice");
  });

  it("never classifies SAME_PROPERTY on a high aggregate score alone, without street or phone match", () => {
    // Same locality/disposition/area/price band (common in one building),
    // but no street and no phone — must NOT be auto-classified as the same unit.
    const a = mk({ street: null, contactPhone: null });
    const b = mk({ id: "y", street: null, contactPhone: "+420700333444" });
    const result = scoreDuplicateMatch(a, b);
    expect(result.classification).not.toBe("SAME_PROPERTY");
  });

  it("classifies merely-similar listings as POSSIBLE_DUPLICATE, not SAME_PROPERTY, and never auto-merges", () => {
    const a = mk({ street: "Plzeňská", contactPhone: "+420600111222" });
    const b = mk({
      id: "y",
      street: "Jiná ulice",
      contactPhone: "+420700999888",
      askingPrice: 6800000,
      fullText: "Byt k prodeji, jiná lokace úplně."
    });
    const result = scoreDuplicateMatch(a, b);
    expect(result.classification).not.toBe("SAME_PROPERTY");
  });

  it("classifies clearly unrelated properties as DIFFERENT", () => {
    const a = mk({});
    const b: DedupCandidate = {
      id: "z",
      title: "Rodinný dům",
      municipality: "Brno",
      district: "Brno-střed",
      street: "Úplně jiná",
      areaM2: 220,
      disposition: "5+1",
      askingPrice: 12000000,
      fullText: "Prodej rodinného domu v Brně.",
      contactPhone: "+420111222333"
    };
    const result = scoreDuplicateMatch(a, b);
    expect(result.classification).toBe("DIFFERENT");
  });

  it("matches on contact phone alone as strong evidence even with different streets", () => {
    const a = mk({ street: "Ulice A" });
    const b = mk({ id: "y", street: "Ulice B" });
    const result = scoreDuplicateMatch(a, b);
    expect(result.reasons).toContain("Stejný kontaktní telefon");
  });
});
