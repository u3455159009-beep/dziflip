import { describe, it, expect } from "vitest";
import { extractFromText, detectPropertyType } from "@/lib/extract";

describe("Property Type Engine — detectPropertyType (item 2)", () => {
  it("detects APARTMENT (scenario A: byt 2+1 64 m² Brno Královo Pole)", () => {
    expect(detectPropertyType("Prodej bytu 2+1 64 m² Božetěchova Brno Královo Pole 7 490 000 Kč")).toBe("APARTMENT");
  });

  it("detects HOUSE (scenario D: rodinný dům)", () => {
    expect(detectPropertyType("Prodej rodinného domu 5+1 se zahradou, Kladno")).toBe("HOUSE");
  });

  it("detects LAND (scenario E: stavební pozemek)", () => {
    expect(detectPropertyType("Prodej stavebního pozemku 850 m², Říčany")).toBe("LAND");
  });

  it("detects GARAGE (scenario F: garáž)", () => {
    expect(detectPropertyType("Prodej garáže v Praze 4, 18 m²")).toBe("GARAGE");
  });

  it("returns null rather than guessing when no keyword is present", () => {
    expect(detectPropertyType("Nádherná nemovitost v skvělé lokalitě, volejte")).toBeNull();
  });
});

describe("extractFromText — maximum data extraction (item 3)", () => {
  it("extracts every explicitly-stated field from the reference example and nothing invented", () => {
    const text = `
Prodej bytu 2+1, 64,3 m², Božetěchova, Brno - Královo Pole
Cena: 7 490 000 Kč

12. patro
Byt má balkon a sklepní kóji. V bytě je klimatizace.
Nové rozvody elektřiny. Zděné jádro.
PENB: C
Dům byl revitalizován, výměna oken 2006, zateplení 2008, nová střecha 2018, stoupačky 2024.
Osobní vlastnictví, cihlová stavba.
`;
    const result = extractFromText(text);
    expect(result.fields.propertyType).toBe("APARTMENT");
    expect(result.fields.disposition).toBe("2+1");
    expect(result.fields.areaM2).toBeCloseTo(64.3);
    expect(result.fields.askingPrice).toBe(7490000);
    expect(result.fields.municipality).toBe("Brno");
    expect(result.fields.district).toBe("Královo Pole");
    expect(result.fields.floor).toBe("12");
    expect(result.fields.balcony).toBe(true);
    expect(result.fields.cellar).toBe(true);
    expect(result.fields.airConditioning).toBe(true);
    expect(result.fields.electricalRewiring).toBe(true);
    expect(result.fields.masonryCore).toBe(true);
    expect(result.fields.penb).toBe("C");
    expect(result.fields.windowsReplacedYear).toBe(2006);
    expect(result.fields.insulationYear).toBe(2008);
    expect(result.fields.roofYear).toBe(2018);
    expect(result.fields.risersYear).toBe(2024);
    expect(result.fields.ownership).toBe("Osobní");
    expect(result.fields.construction).toBe("Cihla");

    // Every extracted value carries a confidence tag — nothing is silently assumed VERIFIED.
    expect(result.meta.askingPrice).toBe("VERIFIED");
    // propertyType is read from an explicit keyword ("bytu") actually
    // present in the text, so it's a verified reading, not a guess.
    expect(result.meta.propertyType).toBe("VERIFIED");
  });

  it("never fabricates fields that aren't actually in the text (scenario G: no price, scenario H: no exact address)", () => {
    const text = "Prodej bytu 3+kk, 72 m², Praha. Kontaktujte nás pro více informací.";
    const result = extractFromText(text);
    expect(result.fields.askingPrice).toBeUndefined();
    expect(result.fields.street).toBeUndefined();
    expect(result.meta.askingPrice).toBeUndefined();
    // what IS present is still extracted
    expect(result.fields.disposition).toBe("3+kk");
    expect(result.fields.municipality).toBe("Praha");
  });

  it("extracts LAND-specific fields only for a pozemek (scenario E)", () => {
    const text = `
Prodej stavebního pozemku, 850 m², Říčany.
Pozemek je zastavitelný dle územního plánu.
Elektřina na pozemku, vodovod, plyn i kanalizace v dosahu.
Přístupová komunikace: zpevněná cesta od hlavní silnice.
Cena: 3 200 000 Kč
`;
    const result = extractFromText(text);
    expect(result.fields.propertyType).toBe("LAND");
    expect(result.fields.landAreaM2).toBeUndefined(); // "plocha pozemku" label not used here — never guessed
    expect(result.fields.buildable).toBe(true);
    expect(result.fields.utilitiesAvailable).toContain("elektřina");
    expect(result.fields.utilitiesAvailable).toContain("voda");
  });

  it("extracts GARAGE-specific fields only for a garáž (scenario F)", () => {
    const text = "Prodej garáže 3x6 m v Praze 4. Elektřina zavedena. Cena: 350 000 Kč";
    const result = extractFromText(text);
    expect(result.fields.propertyType).toBe("GARAGE");
    expect(result.fields.garageDimensions).toBe("3x6 m");
    expect(result.fields.garageElectricity).toBe(true);
  });

  it("never applies apartment-only extraction (floor) as if a pozemek had it", () => {
    const text = "Prodej pozemku 500 m² v obci Ondřejov. Cena: 1 500 000 Kč";
    const result = extractFromText(text);
    expect(result.fields.propertyType).toBe("LAND");
    expect(result.fields.floor).toBeUndefined();
  });
});

// Regression test (Zero-Click pipeline, item 1) — a real Brno-Žabovřesky
// listing that a buggy `\bŽabovřesky\b` regex (JS `\b` is ASCII-only, so it
// never matches a Czech word starting with an accented letter) used to fail
// to detect, and explicit facts that used to be wrongly tagged ESTIMATED.
describe("extractFromText — Stránského, Brno-Žabovřesky regression (item 1)", () => {
  const text = `
Stránského, Brno–Žabovřesky
4+kk
11 490 000 Kč
cca 100/103 m²
3. NP ze 4
cihlový dům
bez výtahu
balkon
vlastní garáž
dům z roku 2002
koupelna + malování 2013
plynový kondenzační kotel
krb
plastová okna
měsíční náklady cca 4 000 Kč
`;
  const result = extractFromText(text);

  it("identifies Žabovřesky, never Komín or any other Brno district", () => {
    expect(result.fields.district).toBe("Žabovřesky");
    expect(result.fields.district).not.toBe("Komín");
    expect(result.meta.district).toBe("VERIFIED");
  });

  it("identifies the municipality Brno", () => {
    expect(result.fields.municipality).toBe("Brno");
    expect(result.meta.municipality).toBe("VERIFIED");
  });

  it("extracts disposition, price and both area figures as VERIFIED, not ESTIMATED/UNKNOWN", () => {
    expect(result.fields.disposition).toBe("4+kk");
    expect(result.meta.disposition).toBe("VERIFIED");
    expect(result.fields.askingPrice).toBe(11490000);
    expect(result.meta.askingPrice).toBe("VERIFIED");
    expect(result.fields.areaM2).toBe(100);
    expect(result.fields.usableAreaM2).toBe(103);
    expect(result.meta.areaM2).toBe("VERIFIED");
    expect(result.meta.usableAreaM2).toBe("VERIFIED");
  });

  it("extracts floor 3 of 4, construction, elevator=false, balcony, garage/parking — all VERIFIED", () => {
    expect(result.fields.floor).toBe("3");
    expect(result.fields.totalFloors).toBe("4");
    expect(result.fields.construction).toBe("Cihla");
    expect(result.fields.elevator).toBe(false);
    expect(result.fields.balcony).toBe(true);
    expect(result.fields.parking).toBe(true);
    for (const f of ["floor", "totalFloors", "construction", "elevator", "balcony", "parking"] as const) {
      expect(result.meta[f]).toBe("VERIFIED");
    }
  });

  it("extracts construction year, heating, and monthly costs — all VERIFIED", () => {
    expect(result.fields.constructionYear).toBe(2002);
    expect(result.meta.constructionYear).toBe("VERIFIED");
    expect(result.fields.heatingType).toBe("Plynový kondenzační kotel");
    expect(result.meta.heatingType).toBe("VERIFIED");
    expect(result.fields.monthlyCosts).toBe(4000);
    expect(result.meta.monthlyCosts).toBe("VERIFIED");
  });

  it("captures krb, plastová okna, vlastní garáž and the 2013 bathroom/paint renovation as important facts", () => {
    expect(result.fields.importantFacts).toBeDefined();
    const facts: string[] = JSON.parse(result.fields.importantFacts!);
    expect(facts).toContain("Krb");
    expect(facts).toContain("Plastová okna");
    expect(facts).toContain("Vlastní garáž");
    expect(facts.some((f) => f.includes("2013"))).toBe(true);
  });

  it("never invents legal defects or any fact not literally present in the text", () => {
    expect(result.fields.legalNotes).toBeUndefined();
    expect(result.meta.legalNotes).toBeUndefined();
  });

  it("a second, unrelated project's extraction never carries over this project's district", () => {
    // Simulates two independent projects processed back-to-back — proves
    // extractFromText is a pure function with no shared/leaked state.
    const other = extractFromText("Prodej bytu 3+1, Brno - Komín, 80 m², 5 000 000 Kč");
    expect(other.fields.district).toBe("Komín");
    // Re-running the Žabovřesky extraction again afterwards must still be Žabovřesky.
    const again = extractFromText(text);
    expect(again.fields.district).toBe("Žabovřesky");
  });
});
