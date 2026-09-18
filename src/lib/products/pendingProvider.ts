import type { ProductProvider } from "./types";
import { ProductNotAvailableError } from "./types";

export function createPendingProductProvider(key: string, label: string, reason: string): ProductProvider {
  return {
    key,
    label,
    status: "PENDING_ACCESS",
    statusNote: reason,
    async search() {
      throw new ProductNotAvailableError(`${label}: ${reason}`);
    },
    async refresh() {
      throw new ProductNotAvailableError(`${label}: ${reason}`);
    }
  };
}
