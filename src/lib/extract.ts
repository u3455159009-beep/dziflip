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
