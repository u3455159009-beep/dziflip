import * as cheerio from "cheerio";
import type { Confidence, FieldMeta, ListingField } from "./types";

export interface ExtractedListing {
  fields: Partial<{
    title: string;
    askingPrice: number;
    disposition: string;
    areaM2: number;
    pricePerM2: number;
    municipality: string;
    district: string;
    street: string;
    floor: string;
    totalFloors: string;
    buildingType: string;
    construction: string;
    ownership: string;
    condition: string;
    buildingCondition: string;
    penb: string;
    balcony: boolean;
    terrace: boolean;
    loggia: boolean;
    cellar: boolean;
    parking: boolean;
    elevator: boolean;
    orientation: string;
    legalNotes: string;
    description: string;
    latitude: number;
    longitude: number;
    propertyType: string;
    airConditioning: boolean;
    electricalRewiring: boolean;
    masonryCore: boolean;
    windowsReplacedYear: number;
    insulationYear: number;
    roofYear: number;
    risersYear: number;
    landAreaM2: number;
    zoning: string;
    buildable: boolean;
    utilitiesAvailable: string;
    accessRoad: string;
    structuresOnLand: string;
    landRestrictions: string;
    garageDimensions: string;
    garageElectricity: boolean;
    garageLandOwnership: string;
    garageRentNote: string;
  }>;
  meta: FieldMeta;
  fullText: string;
  portal: string | null;
  photos: string[];
}

const PORTAL_MAP: Array<[RegExp, string]> = [
  [/sreality\.cz/i, "Sreality.cz"],
  [/bezrealitky\.cz/i, "Bezrealitky.cz"],
  [/reality\.idnes\.cz/i, "iDNES Reality"],
  [/reality\.cz/i, "Reality.cz"],
  [/ceskereality\.cz/i, "České reality"],
  [/remax[-.]?czech\.cz|remax\.cz/i, "RE/MAX"],
  [/m-m-reality\.cz|mmreality\.cz/i, "M&M Reality"],
  [/century21\.cz/i, "Century 21"],
  [/realcity\.cz/i, "RealCity.cz"],
  [/idealninabytek/i, "Idealninabytek"]
];

export function detectPortal(url?: string | null): string | null {
  if (!url) return null;
  for (const [re, name] of PORTAL_MAP) {
    if (re.test(url)) return name;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const PRAGUE_DISTRICTS = [
  "Smíchov", "Vinohrady", "Karlín", "Žižkov", "Dejvice", "Vršovice", "Nusle",
  "Holešovice", "Libeň", "Bubeneč", "Strašnice", "Podolí", "Braník", "Modřany",
  "Krč", "Chodov", "Háje", "Stodůlky", "Řepy", "Zličín", "Motol", "Košíře",
  "Břevnov", "Střešovice", "Vokovice", "Liboc", "Troja", "Kobylisy", "Čimice",
  "Prosek", "Letňany", "Hloubětín", "Hostivař", "Malešice", "Vysočany",
  "Michle", "Záběhlice", "Kunratice", "Petrovice", "Radotín", "Zbraslav",
  "Lipence", "Horní Počernice", "Dolní Počernice", "Uhříněves", "Dolní Chabry"
];

const BRNO_DISTRICTS = [
  "Brno-střed", "Královo Pole", "Žabovřesky", "Bystrc", "Líšeň", "Slatina",
  "Žebětín", "Kohoutovice", "Starý Lískovec", "Bohunice", "Komín", "Řečkovice",
  "Medlánky", "Jundrov", "Maloměřice", "Černovice", "Vinohrady", "Tuřany",
  "Chrlice", "Bosonohy"
];

const MAJOR_CITIES = [
  "Praha", "Brno", "Ostrava", "Plzeň", "Liberec", "Olomouc",
  "Ústí nad Labem", "Hradec Králové", "České Budějovice", "Pardubice",
  "Zlín", "Havířov", "Kladno", "Most", "Opava", "Frýdek-Místek", "Karviná",
  "Jihlava", "Teplice", "Děčín", "Karlovy Vary", "Chomutov",
  "Jablonec nad Nisou", "Mladá Boleslav", "Prostějov", "Přerov", "Třebíč",
  "Třinec", "Znojmo", "Trutnov", "Příbram", "Cheb", "Kolín"
];

function setField(
  fields: ExtractedListing["fields"],
  meta: FieldMeta,
  key: ListingField,
  value: any,
  confidence: Confidence
) {
  if (value === undefined || value === null || value === "") return;
  (fields as any)[key] = value;
  meta[key] = confidence;
}

function normalizeNumber(raw: string): number {
  return parseFloat(raw.replace(/[\s ]/g, "").replace(",", "."));
}

// JS regex `\w` is ASCII-only (never matches accented Czech letters, with or
// without the `u` flag) — so a plain `\w*` silently stops dead the moment a
// declined Czech word hits an accented letter (e.g. "rodinn\w*" fails on
// "rodinného"). CZ_W is a word-character class that actually covers Czech,
// used everywhere a stem needs to absorb a declined suffix.
const CZ_W = "a-zA-Z0-9_ěščřžýáíéůúťďňĚŠČŘŽÝÁÍÉŮÚŤĎŇ";

// --- Property Type Engine (item 2) — detected from explicit keywords only,
// never inferred from ambiguous context. Order matters: more specific
// phrases (e.g. "garáž") are checked before the generic "byt" fallback.
const PROPERTY_TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/gar[aá]ž/i, "GARAGE"],
  [new RegExp(`\\bpozemk[${CZ_W}]*\\b|\\bparcel[ae]\\b`, "i"), "LAND"],
  [new RegExp(`rodinn[${CZ_W}]*\\s+d[oů]m[${CZ_W}]*|\\bchalup[${CZ_W}]*\\b|\\bvil[ae]\\b`, "i"), "HOUSE"],
  [/kancelář|komerční\s+prostor|obchodní\s+prostor|sklad(?:ový)?\s+prostor|provozovn[ay]/i, "COMMERCIAL"],
  [new RegExp(`\\bbyt[${CZ_W}]*\\b|\\b[1-6]\\s*\\+\\s*(?:kk|1)\\b`, "i"), "APARTMENT"]
];

export function detectPropertyType(text: string): string | null {
  for (const [re, type] of PROPERTY_TYPE_KEYWORDS) {
    if (re.test(text)) return type;
  }
  return null;
}

const CURRENT_YEAR = new Date().getFullYear();

function extractYear(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (year < 1900 || year > CURRENT_YEAR + 1) return null;
  return year;
}

export function extractFromText(text: string, sourceUrl?: string | null): ExtractedListing {
  const fields: ExtractedListing["fields"] = {};
  const meta: FieldMeta = {};
  const t = text.replace(/\r/g, "");

  // --- Title: first non-empty meaningful line ---
  const firstLine = t
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 8 && l.length < 140);
  if (firstLine) setField(fields, meta, "title", firstLine, "ESTIMATED");

  // --- Disposition ---
  const dispoMatch = t.match(/\b([1-6])\s*\+\s*(kk|KK|1)\b/);
  if (dispoMatch) {
    setField(fields, meta, "disposition", `${dispoMatch[1]}+${dispoMatch[2].toLowerCase()}`, "VERIFIED");
  }

  // --- Area m2 (labeled first) ---
  const areaLabeled = t.match(
    /(?:užitná\s+plocha|podlahová\s+plocha|plocha\s+bytu|celková\s+plocha)[^\d]{0,25}(\d{1,4}(?:[.,]\d+)?)\s*m/i
  );
  if (areaLabeled) {
    setField(fields, meta, "areaM2", normalizeNumber(areaLabeled[1]), "VERIFIED");
  } else {
    const areaAny = t.match(/(\d{2,4}(?:[.,]\d+)?)\s*m(?:²|2\b)(?!\s*pozemk)/i);
    if (areaAny) setField(fields, meta, "areaM2", normalizeNumber(areaAny[1]), "ESTIMATED");
  }

  // --- Price ---
  const priceMatch = t.match(/(\d{1,3}(?:[\s ]\d{3}){1,3})\s*(?:,-)?\s*Kč(?!\s*\/)/);
  if (priceMatch) {
    setField(fields, meta, "askingPrice", normalizeNumber(priceMatch[1]), "VERIFIED");
  }

  // --- Price per m2 ---
  const perM2Match = t.match(/(\d{1,3}(?:[\s ]\d{3})*)\s*Kč\s*\/\s*m/i);
  if (perM2Match) {
    setField(fields, meta, "pricePerM2", normalizeNumber(perM2Match[1]), "VERIFIED");
  } else if (fields.askingPrice && fields.areaM2) {
    setField(fields, meta, "pricePerM2", Math.round(fields.askingPrice / fields.areaM2), "ESTIMATED");
  }

  // --- Floor / total floors ---
  const floorMatch = t.match(/(\d{1,2})\.\s*(?:nadzemní\s*)?(?:podlaží|patro)(?:\s*z\s*(\d{1,2}))?/i);
  if (floorMatch) {
    setField(fields, meta, "floor", floorMatch[1], "VERIFIED");
    if (floorMatch[2]) setField(fields, meta, "totalFloors", floorMatch[2], "VERIFIED");
  } else if (/přízemí/i.test(t)) {
    setField(fields, meta, "floor", "přízemí", "VERIFIED");
  }
  if (!fields.totalFloors) {
    const totalMatch = t.match(/(?:počet\s+podlaží|podlažnost)[^\d]{0,10}(\d{1,2})/i);
    if (totalMatch) setField(fields, meta, "totalFloors", totalMatch[1], "VERIFIED");
  }

  // --- PENB ---
  const penbMatch = t.match(/PENB\s*[:\-]?\s*([A-G])\b/i) ||
    t.match(/energetick\w*\s+náročnost(?:\s+budovy)?\s*[:\-]?\s*([A-G])\b/i);
  if (penbMatch) setField(fields, meta, "penb", penbMatch[1].toUpperCase(), "VERIFIED");

  // --- Construction ---
  if (/cihlov/i.test(t)) setField(fields, meta, "construction", "Cihla", "VERIFIED");
  else if (/panelov/i.test(t)) setField(fields, meta, "construction", "Panel", "VERIFIED");
  else if (/skeletov/i.test(t)) setField(fields, meta, "construction", "Skelet", "VERIFIED");
  else if (/smíšen[áý]\s+konstrukc/i.test(t)) setField(fields, meta, "construction", "Smíšená", "VERIFIED");

  // --- Ownership ---
  if (/osobní\s+vlastnictví/i.test(t)) setField(fields, meta, "ownership", "Osobní", "VERIFIED");
  else if (/družstevní/i.test(t)) setField(fields, meta, "ownership", "Družstevní", "VERIFIED");
  else if (/(?:obecní|státní)\s+byt/i.test(t)) setField(fields, meta, "ownership", "Obecní/státní", "VERIFIED");

  // --- Condition ---
  const conditionKeywords: Array<[RegExp, string]> = [
    [/novostavba/i, "Novostavba"],
    [/po\s+kompletní\s+rekonstrukci/i, "Po kompletní rekonstrukci"],
    [/(?:po\s+)?částečn[áéí]\s+(?:zrekonstruován\w*|rekonstrukc\w*)/i, "Částečně po rekonstrukci"],
    [/po\s+rekonstrukci/i, "Po rekonstrukci"],
    [/před\s+rekonstrukcí/i, "Před rekonstrukcí"],
    [/k\s+rekonstrukci/i, "K rekonstrukci"],
    [/velmi\s+dobrý\s+stav/i, "Velmi dobrý stav"],
    [/dobrý\s+stav/i, "Dobrý stav"],
    [/původní\s+stav/i, "Původní stav"],
    [/špatný\s+stav|havarijní\s+stav/i, "Špatný / havarijní stav"]
  ];
  for (const [re, label] of conditionKeywords) {
    if (re.test(t)) {
      setField(fields, meta, "condition", label, "VERIFIED");
      break;
    }
  }

  // --- Building type ---
  if (/rodinný\s+dům/i.test(t)) setField(fields, meta, "buildingType", "Rodinný dům", "VERIFIED");
  else if (/bytový\s+dům/i.test(t)) setField(fields, meta, "buildingType", "Byt v bytovém domě", "VERIFIED");

  // --- Orientation ---
  const orientMatch = t.match(
    /orientac[ei][^\n:]{0,10}?[:\-]?\s*\b(severovýchod|severozápad|jihovýchod|jihozápad|sever|jih|východ|západ)\b/i
  );
  if (orientMatch) setField(fields, meta, "orientation", orientMatch[1], "VERIFIED");

  // --- Boolean amenities ---
  const boolChecks: Array<[ListingField, RegExp, RegExp]> = [
    ["balcony", /balk[oó]n/i, /bez\s+balk[oó]nu/i],
    ["terrace", /teras/i, /bez\s+terasy/i],
    ["loggia", /lodži|loggi/i, /bez\s+lodži/i],
    ["cellar", /\bsklep/i, /bez\s+sklep/i],
    ["parking", /parkov|garáž|garážov/i, /bez\s+parkování|bez\s+garáž/i],
    ["elevator", /výtah/i, /bez\s+výtahu/i]
  ];
  for (const [key, positive, negative] of boolChecks) {
    if (negative.test(t)) setField(fields, meta, key, false, "VERIFIED");
    else if (positive.test(t)) setField(fields, meta, key, true, "VERIFIED");
  }

  // --- Municipality ---
  for (const city of MAJOR_CITIES) {
    const re = new RegExp(`\\b${city.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (re.test(t)) {
      setField(fields, meta, "municipality", city, "VERIFIED");
      break;
    }
  }

  // --- District ---
  const districtList = fields.municipality === "Brno" ? BRNO_DISTRICTS : PRAGUE_DISTRICTS;
  if (fields.municipality === "Praha") {
    const prahaNum = t.match(/Praha[\s\-]?(\d{1,2})\b/i);
    if (prahaNum) setField(fields, meta, "district", `Praha ${prahaNum[1]}`, "VERIFIED");
  }
  if (!fields.district) {
    for (const d of districtList) {
      const re = new RegExp(`\\b${d.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
      if (re.test(t)) {
        setField(fields, meta, "district", d, "VERIFIED");
        break;
      }
    }
  }

  // --- Street (only from explicit label to avoid guessing) ---
  const streetMatch = t.match(/(?:^|\n)\s*(?:Ulice|Adresa)\s*[:\-]\s*([^\n]{3,60})/i);
  if (streetMatch) setField(fields, meta, "street", streetMatch[1].trim(), "VERIFIED");

  // --- Property type (item 2) ---
  const propertyType = detectPropertyType(t);
  if (propertyType) setField(fields, meta, "propertyType", propertyType, "ESTIMATED");

  // --- Extended renovation-history signals (item 3) — never guessed, only
  // ever set from an explicit textual mention. ---
  if (/klimatizac/i.test(t)) setField(fields, meta, "airConditioning", true, "VERIFIED");
  if (/nov[eé]\s+rozvody\s+elektřiny|nov[aá]\s+elektroinstalac/i.test(t)) {
    setField(fields, meta, "electricalRewiring", true, "VERIFIED");
  }
  if (/zděn[eé]\s+jádro/i.test(t)) setField(fields, meta, "masonryCore", true, "VERIFIED");
  else if (/(?:panelov|umakartov)[eé]\s+jádro/i.test(t)) setField(fields, meta, "masonryCore", false, "VERIFIED");

  const windowsYear = extractYear(
    t,
    new RegExp(`(?:výměn[${CZ_W}]*|vyměněn[${CZ_W}]*|nov[aá])\\s+ok[${CZ_W}]*\\D{0,15}(\\d{4})`, "i")
  );
  if (windowsYear) setField(fields, meta, "windowsReplacedYear", windowsYear, "VERIFIED");

  const insulationYear = extractYear(t, /zateplen\w*\D{0,15}(\d{4})/i);
  if (insulationYear) setField(fields, meta, "insulationYear", insulationYear, "VERIFIED");

  const roofYear = extractYear(t, /(?:nov[aá]|vyměněn\w*|rekonstruovan\w*)\s+střech\w*\D{0,15}(\d{4})|střech\w*\D{0,15}(\d{4})/i);
  if (roofYear) setField(fields, meta, "roofYear", roofYear, "VERIFIED");

  const risersYear = extractYear(t, /stoupačk\w*\D{0,15}(\d{4})/i);
  if (risersYear) setField(fields, meta, "risersYear", risersYear, "VERIFIED");

  // --- Land / house area (m² pozemku, distinct from the apartment-style areaM2) ---
  const landAreaMatch = t.match(/plocha\s+pozemku[^\d]{0,25}(\d{1,6}(?:[.,]\d+)?)\s*m/i);
  if (landAreaMatch) setField(fields, meta, "landAreaM2", normalizeNumber(landAreaMatch[1]), "VERIFIED");

  // --- LAND-specific fields ---
  if (propertyType === "LAND") {
    if (/(?:je\s+)?zastaviteln/i.test(t)) setField(fields, meta, "buildable", true, "VERIFIED");
    else if (/nen[ií]\s+zastaviteln|nezastaviteln/i.test(t)) setField(fields, meta, "buildable", false, "VERIFIED");

    const zoningMatch = t.match(/územní\s+plán[^\n:]{0,10}?[:\-]?\s*([^\n.]{3,80})/i);
    if (zoningMatch) setField(fields, meta, "zoning", zoningMatch[1].trim(), "VERIFIED");

    const utilities: string[] = [];
    if (/\belektřin\w*\s+(?:na\s+pozemku|v\s+dosahu|přípojk\w*)/i.test(t) || /přípojka\s+elektřiny/i.test(t)) utilities.push("elektřina");
    if (/vodovod|přípojka\s+vody/i.test(t)) utilities.push("voda");
    if (/plynovod|přípojka\s+plynu/i.test(t)) utilities.push("plyn");
    if (/kanalizac/i.test(t)) utilities.push("kanalizace");
    if (utilities.length > 0) setField(fields, meta, "utilitiesAvailable", utilities.join(", "), "VERIFIED");

    if (/přístupov[aá]\s+(?:komunikace|cesta)[^\n:]{0,10}?[:\-]?\s*([^\n.]{3,60})/i.test(t)) {
      const m = t.match(/přístupov[aá]\s+(?:komunikace|cesta)[^\n:]{0,10}?[:\-]?\s*([^\n.]{3,60})/i);
      if (m) setField(fields, meta, "accessRoad", m[1].trim(), "VERIFIED");
    }
  }

  // --- GARAGE-specific fields ---
  if (propertyType === "GARAGE") {
    const dimMatch = t.match(/(\d{1,2}(?:[.,]\d+)?\s*x\s*\d{1,2}(?:[.,]\d+)?\s*m)/i);
    if (dimMatch) setField(fields, meta, "garageDimensions", dimMatch[1].trim(), "VERIFIED");
    if (/elektřin/i.test(t)) setField(fields, meta, "garageElectricity", true, "VERIFIED");
  }

  return {
    fields,
    meta,
    fullText: t,
    portal: detectPortal(sourceUrl ?? undefined),
    photos: []
  };
}

const SKIP_IMAGE_PATTERN = /(logo|icon|sprite|avatar|favicon|placeholder|blank\.gif|spacer|pixel\.)/i;

export function extractFromHtml(html: string, sourceUrl: string): ExtractedListing {
  const $ = cheerio.load(html);
  $("script, style, noscript, header nav, footer").remove();

  const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();

  const result = extractFromText(text, sourceUrl);

  // og:title as a stronger title signal if present
  const ogTitle = $('meta[property="og:title"]').attr("content");
  if (ogTitle && ogTitle.trim().length > 3) {
    result.fields.title = ogTitle.trim();
    result.meta.title = "VERIFIED";
  }

  const ogDescription = $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content");
  if (ogDescription && ogDescription.trim().length > 10) {
    result.fields.description = ogDescription.trim();
    result.meta.description = "VERIFIED";
  }

  // JSON-LD structured data — real, site-published data, never geocoded or
  // guessed. Only used when the site itself embeds valid coordinates.
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of candidates) {
        const geo = node?.geo || node?.address?.geo;
        const lat = Number(geo?.latitude);
        const lng = Number(geo?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          // Not tracked in fieldMeta (latitude/longitude aren't manually
          // editable ListingFields) — a non-null value here is by
          // construction verified, since we only ever copy it from the
          // site's own structured data.
          result.fields.latitude = lat;
          result.fields.longitude = lng;
        }
        if (!result.fields.description && typeof node?.description === "string" && node.description.trim().length > 10) {
          result.fields.description = node.description.trim();
          result.meta.description = "VERIFIED";
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });

  // Collect candidate photo URLs
  const urls = new Set<string>();
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) urls.add(resolveUrl(ogImage, sourceUrl));

  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
    if (!src) return;
    if (SKIP_IMAGE_PATTERN.test(src)) return;
    try {
      urls.add(resolveUrl(src, sourceUrl));
    } catch {
      /* ignore invalid urls */
    }
  });

  result.photos = Array.from(urls).slice(0, 30);
  return result;
}

function resolveUrl(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

export interface ExtractedContact {
  phone?: string;
  email?: string;
}

const CZ_PHONE_RE = /(?:\+420[\s\-]?)?\b(\d{3}[\s\-]?\d{3}[\s\-]?\d{3})\b/;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;

/**
 * Only returns contact details literally present in the listing text —
 * never guessed or looked up. Most portals hide the agent's phone behind a
 * JS "show number" button, so this often finds nothing, which is correct:
 * the caller must leave the field UNKNOWN rather than invent it.
 */
export function extractContactInfo(text: string): ExtractedContact {
  const contact: ExtractedContact = {};
  const phoneMatch = text.match(CZ_PHONE_RE);
  if (phoneMatch) contact.phone = phoneMatch[0].trim();
  const emailMatch = text.match(EMAIL_RE);
  if (emailMatch) contact.email = emailMatch[0].trim();
  return contact;
}
