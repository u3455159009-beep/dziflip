export interface PhotoDTO {
  id: string;
  projectId: string;
  url: string;
  room: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
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
  fieldMeta: string | null;
  targetPrice: number | null;
  externalId: string | null;
  isDemo: boolean;
  sourceWatcherId: string | null;
  sourceWatcher: { id: string; name: string } | null;
  photos: PhotoDTO[];
  comparables: ComparableDTO[];
  budgetItems: BudgetItemDTO[];
  assumptions: AssumptionsDTO | null;
  priceHistory: PriceHistoryDTO[];
  contact: ContactDTO | null;
  outreachMessages: OutreachMessageDTO[];
  smsMessages: SmsMessageDTO[];
}
