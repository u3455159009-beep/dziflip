import { describe, it, expect } from "vitest";
import { computeShoppingLine } from "@/lib/productQuantity";

describe("computeShoppingLine", () => {
  it("computes base/reserve/needed exactly as the spec's example (64 m², 10% reserve, 2.2 m² balení)", () => {
    const line = computeShoppingLine({
      quantityNeeded: 64,
      fallbackQuantity: 1,
      reservePct: 0.1,
      packSize: 2.2,
      unitPrice: 449
    });
    expect(line.baseNeeded).toBe(64);
    expect(line.reserveAmount).toBeCloseTo(6.4, 5);
    expect(line.neededWithReserve).toBeCloseTo(70.4, 5);
    expect(line.packs).toBe(32); // ceil(70.4 / 2.2)
    expect(line.orderedQuantity).toBeCloseTo(70.4, 5);
    expect(line.totalPrice).toBe(Math.round(70.4 * 449));
  });

  it("rounds UP to a whole package, never down — never leaves the flip short", () => {
    const line = computeShoppingLine({
      quantityNeeded: 10,
      fallbackQuantity: 1,
      reservePct: 0,
      packSize: 3,
      unitPrice: 100
    });
    // 10 / 3 = 3.33 -> must round up to 4 packages (12 units), not 3
    expect(line.packs).toBe(4);
    expect(line.orderedQuantity).toBe(12);
  });

  it("never applies a reserve to a plain item count when no verified dimension is known", () => {
    const line = computeShoppingLine({
      quantityNeeded: null,
      fallbackQuantity: 1,
      reservePct: 0.1,
      packSize: null,
      unitPrice: 12000
    });
    expect(line.baseNeeded).toBe(1);
    expect(line.reserveAmount).toBe(0);
    expect(line.neededWithReserve).toBe(1);
    expect(line.packs).toBeNull();
    expect(line.totalPrice).toBe(12000);
  });

  it("never invents a quantity when neither a verified dimension nor a count is usable — falls back to the given count as-is", () => {
    const line = computeShoppingLine({
      quantityNeeded: null,
      fallbackQuantity: 3,
      reservePct: 0.1,
      packSize: null,
      unitPrice: null
    });
    expect(line.baseNeeded).toBe(3);
    expect(line.totalPrice).toBeNull(); // no price known — never fabricated
  });

  it("skips package rounding entirely when the product has no packSize (sold as loose units)", () => {
    const line = computeShoppingLine({
      quantityNeeded: 12.5,
      fallbackQuantity: 1,
      reservePct: 0.1,
      packSize: null,
      unitPrice: 200
    });
    expect(line.packs).toBeNull();
    expect(line.orderedQuantity).toBeCloseTo(13.75, 5);
    expect(line.totalPrice).toBe(Math.round(13.75 * 200));
  });
});
