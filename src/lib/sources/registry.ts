import type { ListingSourceProvider } from "./types";
import { mockDemoProvider } from "./mockProvider";
import { srealityProvider } from "./srealityProvider";
import { bezrealitkyProvider } from "./bezrealitkyProvider";
import { realityIdnesProvider } from "./realityIdnesProvider";
import { webSearchProvider } from "./searchProvider";
import { braveSearchProvider } from "./braveSearchProvider";
import { flatScanProvider } from "./flatScan/provider";

// FlatScan is one optional source among several, never a hard dependency —
// discoverComparablesForProject already runs every ACTIVE provider here and
// isolates one provider's failure from the rest (see comparableDiscovery.ts),
// so the real fallback behavior is: whichever of these are actually
// configured all contribute, and if none are, the app says so honestly
// instead of ever fabricating a comparable. Brave Search is the currently
// concretely obtainable replacement for a FlatScan-style feed — see
// braveSearchProvider.ts for why.
export const SOURCE_PROVIDERS: ListingSourceProvider[] = [
  mockDemoProvider,
  flatScanProvider,
  braveSearchProvider,
  webSearchProvider,
  srealityProvider,
  bezrealitkyProvider,
  realityIdnesProvider
];

export function getSourceProvider(key: string): ListingSourceProvider | undefined {
  return SOURCE_PROVIDERS.find((p) => p.key === key);
}

export function parseSourceKeys(sources: string): string[] {
  return sources
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
