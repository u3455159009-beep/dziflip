export interface PhotoGenerationDTO {
  id: string;
  photoId: string;
  style: string;
  prompt: string | null;
  generatedUrl: string | null;
  model: string | null;
  status: string;
  createdAt: string;
  generatedAt: string | null;
}

export interface PhotoDTO {
  id: string;
  projectId: string;
  url: string;
  room: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  roomType: string | null;
  currentCondition: string | null;
  visibleIssues: string | null;
  keepNotes: string | null;
  removeNotes: string | null;
  replaceNotes: string | null;
  renovationSuggestions: string | null;
  analysisConfidence: string | null;
  analysisSource: string;
  analyzedAt: string | null;
  generations: PhotoGenerationDTO[];
}

export interface ComparablePriceHistoryDTO {
  id: string;
  comparableId: string;
  price: number | null;
  recordedAt: string;
}

export interface ComparableDTO {
  id: string;
  projectId: string;
  title: string | null;
  url: string | null;
  portal: string | null;
  locality: string | null;
  disposition: string | null;
  areaM2: number | null;
  price: number | null;
  pricePerM2: number | null;
  condition: string | null;
  distanceKm: number | null;
  priceType: string;
  foundAt: string;
  createdAt: string;
  ownership: string | null;
  floor: string | null;
  totalFloors: string | null;
  elevator: boolean | null;
  balcony: boolean | null;
  terrace: boolean | null;
  loggia: boolean | null;
  parking: boolean | null;
  buildingType: string | null;
  construction: string | null;
  similarityScore: number | null;
  similarityBreakdown: string | null;
  qualityTier: string | null;
  sourceProvider: string | null;
  lastSeenAt: string;
  isOutlier: boolean;
  outlierReason: string | null;
  externalId: string | null;
  daysOnMarket: number | null;
  discountPercent: number | null;
  latitude: number | null;
  longitude: number | null;
  priceHistory: ComparablePriceHistoryDTO[];
}

export interface ListingEventDTO {
  id: string;
  projectId: string;
  eventType: string;
  detail: string | null;
  oldValue: string | null;
  newValue: string | null;
  occurredAt: string;
}

export interface RoomConditionDTO {
  id: string;
  projectId: string;
  room: string;
  element: string;
  status: string;
  notes: string | null;
  source: string;
  updatedAt: string;
}

export interface ProductBranchDTO {
  id: string;
  productId: string;
  name: string;
  address: string | null;
  stockStatus: string;
  stockQty: number | null;
  personalPickup: boolean;
  updatedAt: string;
}

export interface ProductPriceHistoryDTO {
  id: string;
  productId: string;
  price: number | null;
  availability: string | null;
  recordedAt: string;
}

export interface ProductDTO {
  id: string;
  productRequirementId: string;
  externalId: string | null;
  provider: string;
  source: string;
  name: string;
  brand: string | null;
  category: string;
  description: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  retailer: string | null;
  price: number | null;
  originalPrice: number | null;
  unitPrice: number | null;
  unit: string | null;
  packSize: number | null;
  packUnit: string | null;
  availability: string;
  tier: string | null;
  confidence: string;
  status: string;
  isSelected: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  branches: ProductBranchDTO[];
  priceHistory: ProductPriceHistoryDTO[];
}

export interface ProductRequirementDTO {
  id: string;
  projectId: string;
  room: string | null;
  category: string;
  shoppingCategory: string;
  description: string;
  budgetMin: number | null;
  budgetMax: number | null;
  dimensions: string | null;
  style: string | null;
  quantity: number;
  quantityNeeded: number | null;
  quantityUnit: string | null;
  reservePct: number;
  status: string;
  createdAt: string;
  products: ProductDTO[];
}

export interface PossibleDuplicateDTO {
  id: string;
  matchScore: number;
  classification: string;
  reasons: string;
  resolvedStatus: string;
  createdAt: string;
  resolvedAt: string | null;
  otherProject: {
    id: string;
    title: string | null;
    municipality: string | null;
    district: string | null;
    askingPrice: number | null;
    isDemo: boolean;
  };
}

export interface BudgetItemDTO {
  id: string;
  projectId: string;
  room: string | null;
  category: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  laborEstimate: number | null;
  materialEstimate: number | null;
  total: number | null;
  priceSource: string;
  productUrl: string | null;
  shop: string | null;
  verifiedAt: string | null;
  createdAt: string;
  sortOrder: number;
  productRequirementId: string | null;
}

export interface AssumptionsDTO {
  id: string;
  projectId: string;
  purchasePriceUsed: number | null;
  saleConservative: number | null;
  saleBase: number | null;
  saleOptimistic: number | null;
  renovationCost: number | null;
  furnishingCost: number | null;
  legalCosts: number | null;
  financingCost: number | null;
  otherCosts: number | null;
  reserve: number | null;
  minProfit: number | null;
  minMarginPct: number | null;
  minRoiPct: number | null;
  incomeTaxPct: number | null;
  bandWidthPct: number | null;
  updatedAt: string;
}

export interface PriceHistoryDTO {
  id: string;
  projectId: string;
  price: number;
  recordedAt: string;
  source: string;
}

export interface ContactDTO {
  id: string;
  projectId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  agency: string | null;
  lastContactedAt: string | null;
  status: string;
  updatedAt: string;
}

export interface OutreachMessageDTO {
  id: string;
  projectId: string;
  direction: string;
  mode: string | null;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  blockedReason: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface SmsMessageDTO {
  id: string;
  projectId: string | null;
  contactId: string | null;
  direction: string;
  kind: string;
  mode: string | null;
  phone: string;
  body: string;
  status: string;
  provider: string;
  isDemo: boolean;
  providerMessageId: string | null;
  blockedReason: string | null;
  classification: string | null;
  suggestedDateTimeRaw: string | null;
  suggestedDateTime: string | null;
  readAt: string | null;
  createdAt: string;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

export interface ProjectDTO {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceUrl: string | null;
  sourceText: string | null;
  portal: string | null;
  title: string | null;
  askingPrice: number | null;
  disposition: string | null;
  areaM2: number | null;
  pricePerM2: number | null;
  municipality: string | null;
  district: string | null;
  street: string | null;
  floor: string | null;
  totalFloors: string | null;
  buildingType: string | null;
  construction: string | null;
  ownership: string | null;
  condition: string | null;
  buildingCondition: string | null;
  penb: string | null;
  balcony: boolean | null;
  terrace: boolean | null;
  loggia: boolean | null;
  cellar: boolean | null;
  parking: boolean | null;
  elevator: boolean | null;
  orientation: string | null;
  legalNotes: string | null;
  fullText: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  fieldMeta: string | null;
  fieldSource: string | null;
  targetPrice: number | null;
  propertyType: string | null;
  airConditioning: boolean | null;
  electricalRewiring: boolean | null;
  masonryCore: boolean | null;
  windowsReplacedYear: number | null;
  insulationYear: number | null;
  roofYear: number | null;
  risersYear: number | null;
  landAreaM2: number | null;
  zoning: string | null;
  buildable: boolean | null;
  utilitiesAvailable: string | null;
  accessRoad: string | null;
  structuresOnLand: string | null;
  landRestrictions: string | null;
  garageDimensions: string | null;
  garageElectricity: boolean | null;
  garageLandOwnership: string | null;
  garageRentNote: string | null;
  discoveredListingUrl: string | null;
  discoveredListingConfidence: string | null;
  discoveredListingReasons: string | null;
  discoveredListingProvider: string | null;
  discoveredListingExternalId: string | null;
  lastComparableDiscoveryAt: string | null;
  comparableDiscoveryNote: string | null;
  externalId: string | null;
  isDemo: boolean;
  sourceWatcherId: string | null;
  sourceWatcher: { id: string; name: string } | null;
  analysisStage: string;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceUpdatedAt: string | null;
  lastVerifiedAt: string | null;
  photos: PhotoDTO[];
  comparables: ComparableDTO[];
  budgetItems: BudgetItemDTO[];
  assumptions: AssumptionsDTO | null;
  priceHistory: PriceHistoryDTO[];
  contact: ContactDTO | null;
  outreachMessages: OutreachMessageDTO[];
  smsMessages: SmsMessageDTO[];
  listingEvents: ListingEventDTO[];
  roomConditions: RoomConditionDTO[];
  productRequirements: ProductRequirementDTO[];
  duplicatesAsA: Array<{ id: string; matchScore: number; classification: string; reasons: string; resolvedStatus: string; createdAt: string; resolvedAt: string | null; projectB: PossibleDuplicateDTO["otherProject"] }>;
  duplicatesAsB: Array<{ id: string; matchScore: number; classification: string; reasons: string; resolvedStatus: string; createdAt: string; resolvedAt: string | null; projectA: PossibleDuplicateDTO["otherProject"] }>;
}
