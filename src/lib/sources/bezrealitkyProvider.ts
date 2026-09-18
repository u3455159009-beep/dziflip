// Bezrealitky.cz — same story as Sreality: no approved bulk API access.
// Stays PENDING_ACCESS until a legitimate data source is available.
import { createPendingAccessProvider } from "./pendingProvider";

export const bezrealitkyProvider = createPendingAccessProvider(
  "BEZREALITKY",
  "Bezrealitky.cz",
  "Čeká na povolený datový zdroj (např. oficiální API nebo licencovaný feed). Aplikace neobchází CAPTCHA ani anti-bot ochranu portálu."
);
