export interface WatcherDTO {
  id: string;
  name: string;
  active: boolean;
  municipality: string | null;
  district: string | null;
  dispositions: string | null;
  minAreaM2: number | null;
  maxAreaM2: number | null;
  maxAskingPrice: number | null;
  maxPricePerM2: number | null;
  condition: string | null;
  ownership: string | null;
  minProfit: number | null;
  minRoiPct: number | null;
  maxRenovationEstimate: number | null;
  requiredReserve: number | null;
  onlyNewListings: boolean;
  trackPriceChanges: boolean;
  sources: string;
  lastRunAt: string | null;
  lastRunNote: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { projects: number; alerts: number };
}

export interface WatcherRunSummaryDTO {
  providers: Array<{ key: string; label: string; status: string; itemCount: number; note?: string }>;
  newProjects: number;
  updatedProjects: number;
  priceDrops: number;
  alerts: number;
}
