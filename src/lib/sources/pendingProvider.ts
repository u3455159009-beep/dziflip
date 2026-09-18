// Factory for portals we support in the provider registry but do not yet
// have an approved, stable, non-scraping data path for. Every one of these
// stays PENDING_ACCESS and refuses to run rather than guess or scrape.
import type { ListingSourceProvider } from "./types";
import { SourceNotAvailableError } from "./types";

export function createPendingAccessProvider(
  key: string,
  label: string,
  reason: string
): ListingSourceProvider {
  return {
    key,
    label,
    status: "PENDING_ACCESS",
    statusNote: reason,
    async search() {
      throw new SourceNotAvailableError(`${label}: ${reason}`);
    }
  };
}
