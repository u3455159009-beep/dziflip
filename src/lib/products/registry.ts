import { createPendingProductProvider } from "./pendingProvider";
import { genericProductSearchProvider } from "./genericSearchProvider";
import type { ProductProvider } from "./types";

// None of these are connected — see each provider's statusNote for what
// real access would require. Flipping one to ACTIVE means implementing
// ProductProvider.search/refresh against that retailer's real, approved
// API or data feed (never scraping around CAPTCHA/anti-bot protection).
const REASON =
  "Čeká na povolený/stabilní přístup (API nebo datový feed obchodu). Aplikace neobchází CAPTCHA ani anti-bot ochranu — bez schváleného přístupu nelze vracet žádné produkty.";

export const hornbachProvider = createPendingProductProvider("HORNBACH", "Hornbach", REASON);
export const dekProvider = createPendingProductProvider("DEK", "DEK", REASON);
export const bauhausProvider = createPendingProductProvider("BAUHAUS", "Bauhaus", REASON);
export const mallProvider = createPendingProductProvider("MALL", "Mall.cz", REASON);
export const ikeaProvider = createPendingProductProvider("IKEA", "IKEA", REASON);

export const PRODUCT_PROVIDERS: ProductProvider[] = [
  genericProductSearchProvider,
  hornbachProvider,
  dekProvider,
  bauhausProvider,
  mallProvider,
  ikeaProvider
];

export function getProductProvider(key: string): ProductProvider | undefined {
  return PRODUCT_PROVIDERS.find((p) => p.key === key);
}

export function getActiveProductProviders(): ProductProvider[] {
  return PRODUCT_PROVIDERS.filter((p) => p.status === "ACTIVE");
}
