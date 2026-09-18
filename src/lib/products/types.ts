// Real Product Shopping — provider interface. No retailer API/feed is
// actually connected in this environment, so every provider here is
// PENDING_ACCESS until a real, approved integration exists. A provider
// must never invent a product, price, discount, URL, retailer, stock
// level, or branch — every field it can't genuinely source stays
// undefined, and unknown availability is reported as "UNKNOWN", not
// guessed.
import type { ProductCategory, ProductAvailability } from "@/lib/types";

export interface ProductBranchAvailability {
  name: string;
  address?: string;
  stockStatus: ProductAvailability;
  stockQty?: number; // only when the source genuinely reports a count
  personalPickup?: boolean;
}

export interface ProductCandidate {
  productId: string; // the provider's own product id
  name: string;
  brand?: string;
  category: ProductCategory;
  description?: string;
  imageUrl?: string;
  productUrl: string; // must resolve to the specific product, never a homepage/category page
  retailer: string;
  price: number | null;
  originalPrice?: number | null;
  unitPrice?: number | null;
  unit?: string;
  packSize?: number; // e.g. 2.2 (m² per balení) — omitted when sold as single units
  packUnit?: string;
  availability: ProductAvailability;
  branchAvailability?: ProductBranchAvailability[];
  lastCheckedAt: string; // ISO timestamp — when the provider actually checked this, not "now" by default
  source: string; // provider key
  confidence: "VERIFIED" | "ESTIMATED" | "UNKNOWN";
}

export interface ProductSearchQuery {
  category: ProductCategory;
  description: string;
  style?: string | null;
  budgetMax?: number | null; // per unit, if the requirement specifies one
  referenceLocality?: string | null; // from Settings.shoppingReferenceLocality — never a precise device location
}

export class ProductNotAvailableError extends Error {}

export interface ProductProvider {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote?: string;
  search(query: ProductSearchQuery): Promise<ProductCandidate[]>;
  /** Re-check one already-found candidate's current price/availability/URL. */
  refresh(productId: string): Promise<ProductCandidate | null>;
}
