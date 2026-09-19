import type { ListingSourceProvider } from "./types";
import { mockDemoProvider } from "./mockProvider";
import { srealityProvider } from "./srealityProvider";
import { bezrealitkyProvider } from "./bezrealitkyProvider";
import { realityIdnesProvider } from "./realityIdnesProvider";
import { webSearchProvider } from "./searchProvider";
import { flatScanProvider } from "./flatScan/provider";

export const SOURCE_PROVIDERS: ListingSourceProvider[] = [
  mockDemoProvider,
  flatScanProvider,
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
