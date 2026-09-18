// Reality.iDNES.cz — same story as Sreality: no approved bulk API access.
// Stays PENDING_ACCESS until a legitimate data source is available.
import { createPendingAccessProvider } from "./pendingProvider";

export const realityIdnesProvider = createPendingAccessProvider(
  "REALITY_IDNES",
  "Reality.iDNES.cz",
  "Čeká na povolený datový zdroj (např. oficiální API nebo licencovaný feed). Aplikace neobchází CAPTCHA ani anti-bot ochranu portálu."
);
