import { describe, it, expect } from "vitest";
import { isDataStale } from "@/lib/staleData";

describe("isDataStale", () => {
  it("treats never-verified data as stale", () => {
    expect(isDataStale(null, 14)).toBe(true);
    expect(isDataStale(undefined, 14)).toBe(true);
  });

  it("is not stale when verified within the threshold", () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(isDataStale(recent, 14)).toBe(false);
  });

  it("is stale once the threshold has passed", () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    expect(isDataStale(old, 14)).toBe(true);
  });
});
