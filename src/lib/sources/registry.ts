import type { ListingSourceProvider } from "./types";
import { mockDemoProvider } from "./mockProvider";
import { srealityProvider } from "./srealityProvider";

export const SOURCE_PROVIDERS: ListingSourceProvider[] = [mockDemoProvider, srealityProvider];

export function getSourceProvider(key: string): ListingSourceProvider | undefined {
  return SOURCE_PROVIDERS.find((p) => p.key === key);
}

export function parseSourceKeys(sources: string): string[] {
  return sources
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
