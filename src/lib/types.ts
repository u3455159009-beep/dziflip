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
  "legalNotes",
  "description",
  "propertyType",
  "airConditioning",
  "electricalRewiring",
  "masonryCore",
  "windowsReplacedYear",
  "insulationYear",
  "roofYear",
  "risersYear",
  "landAreaM2",
  "zoning",
  "buildable",
  "utilitiesAvailable",
  "accessRoad",
  "structuresOnLand",
  "landRestrictions",
  "garageDimensions",
  "garageElectricity",
  "garageLandOwnership",
  "garageRentNote"
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
  legalNotes: "Právní / jiné důležité informace",
  description: "Popis nemovitosti",
  propertyType: "Typ nemovitosti",
  airConditioning: "Klimatizace",
  electricalRewiring: "Nové rozvody elektřiny",
  masonryCore: "Zděné jádro",
  windowsReplacedYear: "Rok výměny oken",
  insulationYear: "Rok zateplení",
  roofYear: "Rok (nové) střechy",
  risersYear: "Rok výměny stoupaček",
  landAreaM2: "Plocha pozemku (m²)",
  zoning: "Územní plán / využití",
  buildable: "Zastavitelnost",
  utilitiesAvailable: "Sítě",
  accessRoad: "Přístupová komunikace",
  structuresOnLand: "Stavby na pozemku",
  landRestrictions: "Věcná břemena / omezení",
  garageDimensions: "Rozměry garáže",
  garageElectricity: "Elektřina v garáži",
  garageLandOwnership: "Vlastnictví pozemku (garáž)",
  garageRentNote: "Nájem pozemku (garáž)"
};

export const BOOLEAN_FIELDS: ListingField[] = [
  "balcony",
  "terrace",
  "loggia",
  "cellar",
  "parking",
  "elevator",
  "airConditioning",
  "electricalRewiring",
  "masonryCore",
  "buildable",
  "garageElectricity"
];

// --- Property Type Engine ---

export const PROPERTY_TYPES = ["APARTMENT", "HOUSE", "LAND", "GARAGE", "COMMERCIAL", "OTHER"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APARTMENT: "Byt",
  HOUSE: "Dům",
  LAND: "Pozemek",
  GARAGE: "Garáž",
  COMMERCIAL: "Komerční prostor",
  OTHER: "Jiné"
};

// Which LISTING_FIELDS are actually relevant to each property type — used to
// hide e.g. "patro"/"výtah" for a pozemek or garáž, and to skip apartment
// fields for a house/pozemek, without maintaining a second field list.
export const PROPERTY_TYPE_FIELDS: Record<PropertyType, ListingField[]> = {
  APARTMENT: [
    "disposition", "areaM2", "floor", "totalFloors", "buildingType", "construction", "ownership",
    "condition", "buildingCondition", "penb", "balcony", "terrace", "loggia", "cellar", "parking",
    "elevator", "orientation", "airConditioning", "electricalRewiring", "masonryCore",
    "windowsReplacedYear", "insulationYear", "roofYear", "risersYear"
  ],
  HOUSE: [
    "disposition", "areaM2", "landAreaM2", "construction", "ownership", "condition", "buildingCondition",
    "penb", "parking", "orientation", "airConditioning", "electricalRewiring", "windowsReplacedYear",
    "insulationYear", "roofYear"
  ],
  LAND: ["landAreaM2", "zoning", "buildable", "utilitiesAvailable", "accessRoad", "structuresOnLand", "landRestrictions"],
  GARAGE: ["areaM2", "garageDimensions", "garageElectricity", "garageLandOwnership", "garageRentNote", "condition"],
  COMMERCIAL: ["areaM2", "construction", "ownership", "condition", "parking", "orientation"],
  OTHER: [
    "disposition", "areaM2", "landAreaM2", "construction", "ownership", "condition", "buildingCondition",
    "penb", "balcony", "terrace", "loggia", "cellar", "parking", "elevator", "orientation"
  ]
};

// --- Listing Discovery Engine ---

export const LISTING_MATCH_CONFIDENCES = ["EXACT_MATCH", "HIGH_CONFIDENCE_MATCH", "POSSIBLE_MATCH", "NOT_FOUND"] as const;
export type ListingMatchConfidence = (typeof LISTING_MATCH_CONFIDENCES)[number];

export const LISTING_MATCH_CONFIDENCE_LABELS: Record<ListingMatchConfidence, string> = {
  EXACT_MATCH: "Přesná shoda",
  HIGH_CONFIDENCE_MATCH: "Vysoká jistota shody",
  POSSIBLE_MATCH: "Možná shoda",
  NOT_FOUND: "Nenalezeno"
};

// --- Renovation data status (item 10) ---

export const RENOVATION_DATA_STATUSES = ["KNOWN", "ESTIMATED", "UNKNOWN"] as const;
export type RenovationDataStatus = (typeof RENOVATION_DATA_STATUSES)[number];

export const RENOVATION_DATA_STATUS_LABELS: Record<RenovationDataStatus, string> = {
  KNOWN: "Známé (položkový rozpočet)",
  ESTIMATED: "Odhad (Kč/m²)",
  UNKNOWN: "Neznámé"
};

export type FieldMeta = Partial<Record<ListingField, Confidence>>;

export const BUDGET_CATEGORIES = [
  "DEMOLICE",
  "STAVEBNI_PRACE",
  "STAVEBNI_MATERIAL",
  "ELEKTRO",
  "VODA",
  "PODLAHY",
  "MALOVANI",
  "KOUPELNA",
  "KUCHYN",
  "NABYTEK",
  "SPOTREBICE",
  "SVETLA",
  "DEKORACE",
  "PRACE",
  "DOPRAVA",
  "OSTATNI",
  "REZERVA"
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  DEMOLICE: "Demolice",
  STAVEBNI_PRACE: "Stavební práce",
  STAVEBNI_MATERIAL: "Stavební materiál",
  ELEKTRO: "Elektro",
  VODA: "Voda",
  PODLAHY: "Podlahy",
  MALOVANI: "Malování",
  KOUPELNA: "Koupelna",
  KUCHYN: "Kuchyň",
  NABYTEK: "Nábytek",
  SPOTREBICE: "Spotřebiče",
  SVETLA: "Světla",
  DEKORACE: "Dekorace",
  PRACE: "Práce",
  DOPRAVA: "Doprava",
  OSTATNI: "Ostatní",
  REZERVA: "Rezerva"
};

export const BUDGET_TIERS = ["CHEAP", "RECOMMENDED", "PREMIUM"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

export const BUDGET_TIER_LABELS: Record<BudgetTier, string> = {
  CHEAP: "Levná varianta",
  RECOMMENDED: "Doporučená varianta",
  PREMIUM: "Premium varianta"
};

// --- Phase 2: Deal Radar, Alerts, Contact automation ---

export const CONTACT_STATUSES = [
  "NEKONTAKTOVANO",
  "ZPRAVA_PRIPRAVENA",
  "ODESLANO",
  "ODPOVEDEL",
  "PROHLIDKA",
  "JEDNANI",
  "ODMITNUTO"
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  NEKONTAKTOVANO: "Nekontaktováno",
  ZPRAVA_PRIPRAVENA: "Zpráva připravena",
  ODESLANO: "Odesláno",
  ODPOVEDEL: "Odpověděl",
  PROHLIDKA: "Prohlídka",
  JEDNANI: "Jednání",
  ODMITNUTO: "Odmítnuto"
};

export const CONTACT_AUTOMATION_MODES = ["OFF", "DRAFT", "AUTO"] as const;
export type ContactAutomationMode = (typeof CONTACT_AUTOMATION_MODES)[number];

export const CONTACT_AUTOMATION_MODE_LABELS: Record<ContactAutomationMode, string> = {
  OFF: "Vypnuto",
  DRAFT: "Návrh ke schválení",
  AUTO: "Automaticky"
};

export const OUTREACH_STATUSES = [
  "DRAFT",
  "SENT",
  "BLOCKED_NO_PROVIDER",
  "BLOCKED_RULES",
  "FAILED",
  "RECEIVED"
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  DRAFT: "Návrh",
  SENT: "Odesláno",
  BLOCKED_NO_PROVIDER: "Blokováno — e-mail nenakonfigurován",
  BLOCKED_RULES: "Blokováno pravidly",
  FAILED: "Selhalo",
  RECEIVED: "Přijato"
};

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "PUSH", "SMS"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: "V aplikaci",
  EMAIL: "E-mail",
  PUSH: "Push / mobil",
  SMS: "SMS"
};

export const ALERT_REASONS = ["NEW_MATCH", "PRICE_DROP"] as const;
export type AlertReason = (typeof ALERT_REASONS)[number];

export const ALERT_REASON_LABELS: Record<AlertReason, string> = {
  NEW_MATCH: "Nová shoda",
  PRICE_DROP: "Snížení ceny"
};

export const DATA_CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type DataConfidenceLevel = (typeof DATA_CONFIDENCE_LEVELS)[number];

export const DATA_CONFIDENCE_LABELS: Record<DataConfidenceLevel, string> = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW"
};

export const OWNERSHIP_FILTERS = ["OSOBNI", "DRUZSTEVNI"] as const;
export type OwnershipFilter = (typeof OWNERSHIP_FILTERS)[number];

export const OWNERSHIP_FILTER_LABELS: Record<OwnershipFilter, string> = {
  OSOBNI: "Osobní",
  DRUZSTEVNI: "Družstevní"
};

// --- Phase 3: SMS Hub ---

export const SMS_STATUSES = ["DRAFT", "QUEUED", "SENT", "DELIVERED", "FAILED", "RECEIVED"] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

export const SMS_STATUS_LABELS: Record<SmsStatus, string> = {
  DRAFT: "Návrh",
  QUEUED: "Ve frontě",
  SENT: "Odesláno",
  DELIVERED: "Doručeno",
  FAILED: "Selhalo",
  RECEIVED: "Přijato"
};

export const SMS_AUTOMATION_MODES = ["OFF", "DRAFT", "AUTO"] as const;
export type SmsAutomationMode = (typeof SMS_AUTOMATION_MODES)[number];

export const SMS_AUTOMATION_MODE_LABELS: Record<SmsAutomationMode, string> = {
  OFF: "Vypnuto",
  DRAFT: "Návrh ke schválení",
  AUTO: "Automaticky"
};

export const SMS_PROVIDERS = ["MOCK_SMS", "REAL_SMS"] as const;
export type SmsProviderKey = (typeof SMS_PROVIDERS)[number];

export const SMS_PROVIDER_LABELS: Record<SmsProviderKey, string> = {
  MOCK_SMS: "MOCK (testovací)",
  REAL_SMS: "Skutečný SMS provider"
};

export const SMS_CLASSIFICATIONS = [
  "NABIZI_PROHLIDKU",
  "CHCE_ZAVOLAT",
  "NEMOVITOST_PRODANA",
  "NEMA_ZAJEM",
  "CHCE_DALSI_INFORMACE",
  "JINE",
  "UNKNOWN"
] as const;
export type SmsClassification = (typeof SMS_CLASSIFICATIONS)[number];

export const SMS_CLASSIFICATION_LABELS: Record<SmsClassification, string> = {
  NABIZI_PROHLIDKU: "Nabízí prohlídku",
  CHCE_ZAVOLAT: "Chce zavolat",
  NEMOVITOST_PRODANA: "Nemovitost prodána",
  NEMA_ZAJEM: "Nemá zájem",
  CHCE_DALSI_INFORMACE: "Chce další informace",
  JINE: "Jiné",
  UNKNOWN: "Neurčeno"
};

export const SMS_KINDS = ["INTRO", "REPLY"] as const;
export type SmsKind = (typeof SMS_KINDS)[number];

// Deal Feed card SMS status — derived, not stored.
export const SMS_FEED_STATUSES = [
  "SMS_NEODESLANA",
  "SMS_DRAFT",
  "SMS_ODESLANA",
  "MAKLER_ODPOVEDEL",
  "PROHLIDKA_NAVRZENA"
] as const;
export type SmsFeedStatus = (typeof SMS_FEED_STATUSES)[number];

export const SMS_FEED_STATUS_LABELS: Record<SmsFeedStatus, string> = {
  SMS_NEODESLANA: "SMS neodeslána",
  SMS_DRAFT: "SMS draft",
  SMS_ODESLANA: "SMS odeslána",
  MAKLER_ODPOVEDEL: "Makléř odpověděl",
  PROHLIDKA_NAVRZENA: "Prohlídka navržena"
};

// --- Phase 4: Real Data Engine, Comparable Engine V2, AI Photo Analysis ---

export const ANALYSIS_STAGES = ["FOUND", "BASIC_ANALYSIS", "COMPARABLES", "PHOTO_ANALYSIS", "FULL_ANALYSIS"] as const;
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export const ANALYSIS_STAGE_LABELS: Record<AnalysisStage, string> = {
  FOUND: "Nalezeno",
  BASIC_ANALYSIS: "Základní analýza",
  COMPARABLES: "Srovnatelné nemovitosti",
  PHOTO_ANALYSIS: "Analýza fotografií",
  FULL_ANALYSIS: "Kompletní analýza"
};

export const SOURCE_TYPES = ["DEMO", "MANUAL", "REAL"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  DEMO: "DEMO",
  MANUAL: "Ruční zadání",
  REAL: "Reálný zdroj"
};

export const DUPLICATE_CLASSIFICATIONS = ["SAME_PROPERTY", "POSSIBLE_DUPLICATE", "DIFFERENT"] as const;
export type DuplicateClassification = (typeof DUPLICATE_CLASSIFICATIONS)[number];

export const DUPLICATE_CLASSIFICATION_LABELS: Record<DuplicateClassification, string> = {
  SAME_PROPERTY: "Stejná nemovitost",
  POSSIBLE_DUPLICATE: "Možná duplicita",
  DIFFERENT: "Odlišná nemovitost"
};

export const DUPLICATE_RESOLVED_STATUSES = ["PENDING", "CONFIRMED_SAME", "CONFIRMED_DIFFERENT"] as const;
export type DuplicateResolvedStatus = (typeof DUPLICATE_RESOLVED_STATUSES)[number];

export const LISTING_EVENT_TYPES = [
  "CAPTURED",
  "PRICE_CHANGE",
  "DESCRIPTION_CHANGE",
  "CONDITION_CHANGE",
  "CONTACT_CHANGE",
  "PHOTOS_CHANGED",
  "STATUS_CHANGE"
] as const;
export type ListingEventType = (typeof LISTING_EVENT_TYPES)[number];

export const LISTING_EVENT_TYPE_LABELS: Record<ListingEventType, string> = {
  CAPTURED: "Zachyceno",
  PRICE_CHANGE: "Změna ceny",
  DESCRIPTION_CHANGE: "Změna popisu",
  CONDITION_CHANGE: "Změna stavu",
  CONTACT_CHANGE: "Změna kontaktu",
  PHOTOS_CHANGED: "Změna fotografií",
  STATUS_CHANGE: "Změna stavu nabídky"
};

export const COMP_QUALITY_TIERS = ["HIGH", "MEDIUM", "LOW"] as const;
export type CompQualityTier = (typeof COMP_QUALITY_TIERS)[number];

export const COMP_QUALITY_TIER_LABELS: Record<CompQualityTier, string> = {
  HIGH: "Vysoká kvalita",
  MEDIUM: "Střední kvalita",
  LOW: "Nízká kvalita"
};

export const ROOM_TYPES = [
  "KUCHYN",
  "OBYVACI_POKOJ",
  "LOZNICE",
  "KOUPELNA",
  "WC",
  "CHODBA",
  "BALKON",
  "EXTERIER",
  "NEZNAME"
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  KUCHYN: "Kuchyň",
  OBYVACI_POKOJ: "Obývací pokoj",
  LOZNICE: "Ložnice",
  KOUPELNA: "Koupelna",
  WC: "WC",
  CHODBA: "Chodba",
  BALKON: "Balkon",
  EXTERIER: "Exteriér",
  NEZNAME: "Neznámé"
};

export const ROOM_CONDITION_ELEMENTS = [
  "podlaha",
  "steny",
  "strop",
  "elektro",
  "svetla",
  "dvere",
  "okna",
  "kuchyn",
  "koupelna",
  "sanita",
  "nabytek"
] as const;
export type RoomConditionElement = (typeof ROOM_CONDITION_ELEMENTS)[number];

export const ROOM_CONDITION_ELEMENT_LABELS: Record<RoomConditionElement, string> = {
  podlaha: "Podlaha",
  steny: "Stěny",
  strop: "Strop",
  elektro: "Elektro",
  svetla: "Světla",
  dvere: "Dveře",
  okna: "Okna",
  kuchyn: "Kuchyň",
  koupelna: "Koupelna",
  sanita: "Sanita",
  nabytek: "Nábytek"
};

export const ROOM_CONDITION_STATUSES = ["KEEP", "COSMETIC", "REPLACE", "FULL_RENOVATION", "UNKNOWN"] as const;
export type RoomConditionStatus = (typeof ROOM_CONDITION_STATUSES)[number];

export const ROOM_CONDITION_STATUS_LABELS: Record<RoomConditionStatus, string> = {
  KEEP: "Zachovat",
  COSMETIC: "Kosmetická úprava",
  REPLACE: "Vyměnit",
  FULL_RENOVATION: "Kompletní rekonstrukce",
  UNKNOWN: "Neznámé"
};

export const DATA_SOURCE_KINDS = ["MANUAL", "AI_VISION", "PROVIDER"] as const;
export type DataSourceKind = (typeof DATA_SOURCE_KINDS)[number];

export const PHOTO_GENERATION_STATUSES = ["NOT_CONFIGURED", "PENDING", "GENERATED", "FAILED"] as const;
export type PhotoGenerationStatus = (typeof PHOTO_GENERATION_STATUSES)[number];

export const PHOTO_GENERATION_STYLES = [
  "LEVNY_FLIP",
  "MODERNI",
  "PREMIUM",
  "MINIMALISTICKY",
  "SCANDI",
  "LUXURY",
  "CUSTOM"
] as const;
export type PhotoGenerationStyle = (typeof PHOTO_GENERATION_STYLES)[number];

export const PHOTO_GENERATION_STYLE_LABELS: Record<PhotoGenerationStyle, string> = {
  LEVNY_FLIP: "Levný flip",
  MODERNI: "Moderní",
  PREMIUM: "Premium",
  MINIMALISTICKY: "Minimalistický",
  SCANDI: "Scandi",
  LUXURY: "Luxury",
  CUSTOM: "Vlastní"
};

export const PRODUCT_REQUIREMENT_STATUSES = [
  "NEEDED",
  "SELECTED",
  "TO_BUY",
  "ORDERED",
  "BOUGHT",
  "PICKED_UP",
  "INSTALLED"
] as const;
export type ProductRequirementStatus = (typeof PRODUCT_REQUIREMENT_STATUSES)[number];

export const PRODUCT_REQUIREMENT_STATUS_LABELS: Record<ProductRequirementStatus, string> = {
  NEEDED: "Potřebujeme",
  SELECTED: "Vybráno",
  TO_BUY: "Koupit",
  ORDERED: "Objednáno",
  BOUGHT: "Koupeno",
  PICKED_UP: "Vyzvednuto",
  INSTALLED: "Namontováno"
};

// Deal Score V2 — when critical inputs are missing/low-confidence, the
// colored band must not be shown as a confident verdict.
export const DEAL_SCORE_CONFIDENCE = ["HIGH", "LOW_DATA"] as const;
export type DealScoreConfidence = (typeof DEAL_SCORE_CONFIDENCE)[number];

// --- Phase 5: Real Product Shopping & Renovation Engine ---

export const SHOPPING_CATEGORIES = [
  "STAVEBNI_MATERIAL",
  "KOUPELNA",
  "KUCHYN",
  "OSVETLENI",
  "NABYTEK",
  "SPOTREBICE",
  "DEKORACE",
  "OSTATNI"
] as const;
export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export const SHOPPING_CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  STAVEBNI_MATERIAL: "Stavební materiál",
  KOUPELNA: "Koupelna",
  KUCHYN: "Kuchyň",
  OSVETLENI: "Osvětlení",
  NABYTEK: "Nábytek",
  SPOTREBICE: "Spotřebiče",
  DEKORACE: "Dekorace",
  OSTATNI: "Ostatní"
};

export const PRODUCT_CATEGORIES = [
  "PODLAHY",
  "LISTY",
  "BARVY",
  "OBKLADY",
  "DLAZBY",
  "LEPIDLA",
  "SPAROVACI_HMOTY",
  "SVETLA",
  "ZASUVKY",
  "VYPINACE",
  "DVERE",
  "KLIKY",
  "SANITA",
  "WC",
  "UMYVADLA",
  "SPRCHY",
  "VANY",
  "VODOVODNI_BATERIE",
  "KUCHYNE",
  "PRACOVNI_DESKY",
  "DREZY",
  "SPOTREBICE",
  "POSTELE",
  "MATRACE",
  "SKRINE",
  "STOLY",
  "ZIDLE",
  "POHOVKY",
  "KRESLA",
  "KONFERENCNI_STOLKY",
  "ZRCADLA",
  "ZAVESY",
  "DEKORACE",
  "OSTATNI"
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  PODLAHY: "Podlahy",
  LISTY: "Lišty",
  BARVY: "Barvy",
  OBKLADY: "Obklady",
  DLAZBY: "Dlažby",
  LEPIDLA: "Lepidla",
  SPAROVACI_HMOTY: "Spárovací hmoty",
  SVETLA: "Světla",
  ZASUVKY: "Zásuvky",
  VYPINACE: "Vypínače",
  DVERE: "Dveře",
  KLIKY: "Kliky",
  SANITA: "Sanita",
  WC: "WC",
  UMYVADLA: "Umyvadla",
  SPRCHY: "Sprchy",
  VANY: "Vany",
  VODOVODNI_BATERIE: "Vodovodní baterie",
  KUCHYNE: "Kuchyně",
  PRACOVNI_DESKY: "Pracovní desky",
  DREZY: "Dřezy",
  SPOTREBICE: "Spotřebiče",
  POSTELE: "Postele",
  MATRACE: "Matrace",
  SKRINE: "Skříně",
  STOLY: "Stoly",
  ZIDLE: "Židle",
  POHOVKY: "Pohovky",
  KRESLA: "Křesla",
  KONFERENCNI_STOLKY: "Konferenční stolky",
  ZRCADLA: "Zrcadla",
  ZAVESY: "Závěsy",
  DEKORACE: "Dekorace",
  OSTATNI: "Ostatní"
};

export const PRODUCT_AVAILABILITIES = ["SKLADEM", "OMEZENE", "NENI_SKLADEM", "UNKNOWN"] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

export const PRODUCT_AVAILABILITY_LABELS: Record<ProductAvailability, string> = {
  SKLADEM: "Skladem",
  OMEZENE: "Omezeně skladem",
  NENI_SKLADEM: "Není skladem",
  UNKNOWN: "Neznámé"
};

export const PRODUCT_TIERS = ["BUDGET", "STANDARD", "PREMIUM"] as const;
export type ProductTier = (typeof PRODUCT_TIERS)[number];

export const PRODUCT_TIER_LABELS: Record<ProductTier, string> = {
  BUDGET: "Budget",
  STANDARD: "Standard",
  PREMIUM: "Premium"
};

export const PRODUCT_SOURCES = ["PROVIDER", "MANUAL"] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];

export const PRODUCT_STATUSES = ["CANDIDATE", "UNAVAILABLE"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
