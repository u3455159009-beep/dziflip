export const PROJECT_STATUSES = [
  "ACTIVE",
  "WATCHED",
  "BOUGHT",
  "RENOVATING",
  "SOLD",
  "REJECTED"
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Aktivní",
  WATCHED: "Sledované",
  BOUGHT: "Koupeno",
  RENOVATING: "Rekonstrukce",
  SOLD: "Prodáno",
  REJECTED: "Odmítnuto"
};

export const PRICE_TYPES = ["ASKING", "ESTIMATE", "REALIZED"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  ASKING: "Nabídková cena",
  ESTIMATE: "Odhadovaná tržní hodnota",
  REALIZED: "Realizovaná cena"
};

export const PRICE_SOURCES = ["EXACT", "ESTIMATE", "MANUAL"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  EXACT: "Přesná cena z produktu",
  ESTIMATE: "Odhad",
  MANUAL: "Manuálně zadaná cena"
};

export const CONFIDENCE = ["VERIFIED", "ESTIMATED", "UNKNOWN"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  VERIFIED: "OVĚŘENO",
  ESTIMATED: "ODHADNUTO",
  UNKNOWN: "NEZNÁMÉ"
};

// Fields extracted from a listing, each with a confidence tag.
export const LISTING_FIELDS = [
  "title",
  "askingPrice",
  "disposition",
  "areaM2",
  "pricePerM2",
  "municipality",
  "district",
  "street",
  "floor",
  "totalFloors",
  "buildingType",
  "construction",
  "ownership",
  "condition",
  "buildingCondition",
  "penb",
  "balcony",
  "terrace",
  "loggia",
  "cellar",
  "parking",
  "elevator",
  "orientation",
  "legalNotes"
] as const;
export type ListingField = (typeof LISTING_FIELDS)[number];

export const LISTING_FIELD_LABELS: Record<ListingField, string> = {
  title: "Název",
  askingPrice: "Nabídková cena",
  disposition: "Dispozice",
  areaM2: "Podlahová plocha (m²)",
  pricePerM2: "Cena za m²",
  municipality: "Obec",
  district: "Městská část",
  street: "Ulice",
  floor: "Patro",
  totalFloors: "Počet pater",
  buildingType: "Typ budovy",
  construction: "Konstrukce",
  ownership: "Vlastnictví",
  condition: "Stav nemovitosti",
  buildingCondition: "Stav domu",
  penb: "PENB",
  balcony: "Balkon",
  terrace: "Terasa",
  loggia: "Lodžie",
  cellar: "Sklep",
  parking: "Parkování",
  elevator: "Výtah",
  orientation: "Orientace",
  legalNotes: "Právní / jiné důležité informace"
};

export const BOOLEAN_FIELDS: ListingField[] = [
  "balcony",
  "terrace",
  "loggia",
  "cellar",
  "parking",
  "elevator"
];

export type FieldMeta = Partial<Record<ListingField, Confidence>>;

export const BUDGET_CATEGORIES = [
  "DEMOLICE",
  "STAVEBNI_PRACE",
  "ELEKTRO",
  "VODA",
  "PODLAHY",
  "MALOVANI",
  "KOUPELNA",
  "KUCHYN",
  "NABYTEK",
  "SVETLA",
  "DEKORACE",
  "PRACE",
  "DOPRAVA",
  "REZERVA"
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  DEMOLICE: "Demolice",
  STAVEBNI_PRACE: "Stavební práce",
  ELEKTRO: "Elektro",
  VODA: "Voda",
  PODLAHY: "Podlahy",
  MALOVANI: "Malování",
  KOUPELNA: "Koupelna",
  KUCHYN: "Kuchyň",
  NABYTEK: "Nábytek",
  SVETLA: "Světla",
  DEKORACE: "Dekorace",
  PRACE: "Práce",
  DOPRAVA: "Doprava",
  REZERVA: "Rezerva"
};

export const BUDGET_TIERS = ["CHEAP", "RECOMMENDED", "PREMIUM"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

export const BUDGET_TIER_LABELS: Record<BudgetTier, string> = {
  CHEAP: "Levná varianta",
  RECOMMENDED: "Doporučená varianta",
  PREMIUM: "Premium varianta"
};
