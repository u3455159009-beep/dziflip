import type { ListingSourceProvider } from "./types";
import { mockDemoProvider } from "./mockProvider";
import { srealityProvider } from "./srealityProvider";
import { bezrealitkyProvider } from "./bezrealitkyProvider";
import { realityIdnesProvider } from "./realityIdnesProvider";
import { webSearchProvider } from "./searchProvider";
import { braveSearchProvider } from "./braveSearchProvider";
import { flatScanProvider } from "./flatScan/provider";
import { emailAlertProvider } from "./emailAlertProvider";

// FlatScan is one optional source among several, never a hard dependency —
// discoverComparablesForProject already runs every ACTIVE provider here and
// isolates one provider's failure from the rest (see comparableDiscovery.ts),
// so the real fallback behavior is: whichever of these are actually
// configured all contribute, and if none are, the app says so honestly
// instead of ever fabricating a comparable. Brave Search costs money per
// request; the Email Alert provider (IMAP) is the zero-cost alternative —
// see emailAlertProvider.ts for why it's the best currently-available free,
// ToS-compliant path to real Sreality/Bezrealitky/iDNES Reality listings.
export const SOURCE_PROVIDERS: ListingSourceProvider[] = [
  mockDemoProvider,
  emailAlertProvider,
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
