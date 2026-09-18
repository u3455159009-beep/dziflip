// Pure quantity/pack math for the shopping list. Quantity is computed only
// from a verified base amount (ProductRequirement.quantityNeeded, or the
// plain integer `quantity` for count-based items) — never invented when
// the real dimension is unknown. Package rounding always rounds UP to a
// whole package, since a flip never wants to run short mid-installation.
export interface ShoppingLineInput {
  quantityNeeded: number | null; // verified base area/length quantity (e.g. 64 m²) — null when unknown
  fallbackQuantity: number; // ProductRequirement.quantity, used when quantityNeeded is unknown (count-based items)
  reservePct: number; // e.g. 0.1 — applied only when quantityNeeded (an area/length) is actually known
  packSize: number | null; // e.g. 2.2 (m² per balení) — null when the product is sold as loose units
  unitPrice: number | null; // Kč per base unit
}

export interface ShoppingLineResult {
  baseNeeded: number;
  reserveAmount: number;
  neededWithReserve: number;
  packs: number | null;
  orderedQuantity: number;
  totalPrice: number | null;
}

export function computeShoppingLine(input: ShoppingLineInput): ShoppingLineResult {
  const hasVerifiedQuantity = input.quantityNeeded != null;
  const baseNeeded = hasVerifiedQuantity ? (input.quantityNeeded as number) : input.fallbackQuantity;
  // Reserve only makes sense for a real, measured area/length — a plain
  // item count (e.g. "1 vana") is never padded by a waste percentage.
  const reserveAmount = hasVerifiedQuantity ? baseNeeded * input.reservePct : 0;
  const neededWithReserve = baseNeeded + reserveAmount;

  let packs: number | null = null;
  let orderedQuantity = neededWithReserve;
  if (input.packSize && input.packSize > 0) {
    packs = Math.ceil(neededWithReserve / input.packSize);
    orderedQuantity = Math.round(packs * input.packSize * 1000) / 1000;
  }

  const totalPrice = input.unitPrice != null ? Math.round(orderedQuantity * input.unitPrice) : null;

  return { baseNeeded, reserveAmount, neededWithReserve, packs, orderedQuantity, totalPrice };
}
