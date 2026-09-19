import { describe, it, expect } from "vitest";
import { scoreListingMatch, discoverOriginalListing, type ListingMatchSubject } from "@/lib/listingDiscovery";
import type { ListingSourceItem } from "@/lib/sources/types";

function mkCandidate(overrides: Partial<ListingSourceItem> = {}): ListingSourceItem {
  return {
    externalId: "cand-1",
    url: "https://example.test/listing/1",
    portal: "Test Portal",
    title: "Byt 2+1, Božetěchova, Brno",
    askingPrice: 7490000,
    disposition: "2+1",
    areaM2: 64.3,
    municipality: "Brno",
    district: "Královo Pole",
    street: "Božetěchova",
    ownership: null,
    condition: "Dobrý stav",
    photos: [],
    publishedAt: new Date().toISOString(),
    isDemo: false,
    ...overrides
  };
}

const subject: ListingMatchSubject = {
  propertyType: "APARTMENT",
  disposition: "2+1",
  municipality: "Brno",
  district: "Královo Pole",
  street: "Božetěchova",
  areaM2: 64.3,
  askingPrice: 7490000
};

describe("scoreListingMatch — Listing Discovery Engine confidence (item 1)", () => {
  it("is EXACT_MATCH when the externalId is identical", () => {
    const result = scoreListingMatch({ ...subject, externalId: "abc" }, mkCandidate({ externalId: "abc" }));
    expect(result.confidence).toBe("EXACT_MATCH");
  });

  it("is EXACT_MATCH when street, area, price and disposition all line up tightly", () => {
    const result = scoreListingMatch(subject, mkCandidate());
    expect(result.confidence).toBe("EXACT_MATCH");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("is HIGH_CONFIDENCE_MATCH when locality+disposition+area+price agree but the street is unknown", () => {
    const result = scoreListingMatch({ ...subject, street: null }, mkCandidate({ street: null }));
    expect(result.confidence).toBe("HIGH_CONFIDENCE_MATCH");
  });

  it("is POSSIBLE_MATCH when only locality plus a loose price/area match", () => {
    const result = scoreListingMatch(
      { ...subject, street: null, disposition: "2+1" },
      mkCandidate({ street: null, areaM2: 70, askingPrice: 8_000_000 })
    );
    expect(result.confidence).toBe("POSSIBLE_MATCH");
  });

  it("is NOT_FOUND for a genuinely different property — never merges on title similarity alone", () => {
    const result = scoreListingMatch(subject, mkCandidate({ municipality: "Ostrava", district: "Poruba", street: "Jiná", areaM2: 30, askingPrice: 2_000_000, disposition: "1+kk" }));
    expect(result.confidence).toBe("NOT_FOUND");
  });

  it("never claims a match from title alone when every structured field disagrees", () => {
    const result = scoreListingMatch(subject, mkCandidate({ title: "Prodej bytu 2+1 64 m² Božetěchova Brno Královo Pole", municipality: "Plzeň", district: "Doubravka", street: null, areaM2: 40, askingPrice: 1_500_000, disposition: "1+1" }));
    expect(result.confidence).toBe("NOT_FOUND");
  });
});

describe("discoverOriginalListing — honest NOT_FOUND without a configured provider", () => {
  it("returns NOT_FOUND with an explanatory note when no ACTIVE search provider is configured (the default)", async () => {
    const result = await discoverOriginalListing(subject);
    expect(result.confidence).toBe("NOT_FOUND");
    expect(result.url).toBeNull();
    expect(result.note.length).toBeGreaterThan(0);
  });
});
