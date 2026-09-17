// Sreality.cz has no publicly documented, ToS-permitted API for automated
// bulk listing retrieval, and its site is JavaScript-rendered with anti-bot
// protection. This app never bypasses CAPTCHA, login walls, or anti-bot
// measures — so this provider stays PENDING_ACCESS until a legitimate data
// source (an official partner API, a licensed data feed, or the user's own
// manually-approved export) is available. Deal Radar skips it and reports
// why instead of silently returning nothing or fabricating results.
import type { ListingSourceProvider } from "./types";
import { SourceNotAvailableError } from "./types";

export const srealityProvider: ListingSourceProvider = {
  key: "SREALITY",
  label: "Sreality.cz",
  status: "PENDING_ACCESS",
  statusNote:
    "Čeká na povolený datový zdroj (např. oficiální API nebo licencovaný feed). Aplikace neobchází CAPTCHA ani anti-bot ochranu portálu.",
  async search() {
    throw new SourceNotAvailableError(
      "Sreality.cz zatím nemá povolený/stabilní datový přístup — integrace čeká na schválený zdroj dat."
    );
  }
};
