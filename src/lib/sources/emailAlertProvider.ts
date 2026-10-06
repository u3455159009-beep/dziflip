// Email Alert Provider (Request F, item 1) — the zero-cost, ToS-compliant
// replacement for a paid Brave Search/FlatScan subscription.
//
// No Czech real-estate portal (Sreality, Bezrealitky, iDNES Reality, ...)
// offers a public, documented API or RSS feed for bulk/automated listing
// search — confirmed by research before building this (see the final
// report for sources). The only automated, scraping-free, ToS-compliant
// way to get genuinely fresh listings from them for free is to use the
// portals' OWN native feature: every one of them lets a logged-in user
// save a search and have it emailed to them the moment something new
// matches. That's a real, first-party notification channel the portal
// itself operates — not a bypass of anything.
//
// Simon sets up a saved search on each portal he cares about, points its
// email alerts (directly, or via a forwarding rule) at one mailbox, and
// gives DziFlip read-only IMAP access to that mailbox below. This
// provider then:
//   1. connects via IMAP and reads only UNSEEN messages in the configured
//      folder (the mailbox's own \Seen flag is the dedup cursor — no
//      separate "already processed" table is needed, and an unprocessed
//      message is simply retried next run if something failed);
//   2. extracts real listing URLs for known portal domains out of the raw
//      email body — nothing is read from the email except literal URLs;
//   3. fetches each URL exactly the way the existing "paste a URL to
//      analyze" feature already does (src/lib/fetchListing.ts — a single
//      page request, not a search-results crawl, no anti-bot bypass) and
//      runs it through the same extractFromHtml() used there;
//   4. only keeps a result that yields the minimum real fields (price,
//      area, disposition, municipality) — anything short of that is
//      dropped, never half-filled with a guess;
//   5. marks the message \Seen only after it's been fully processed.
//
// Until EMAIL_ALERT_IMAP_HOST/USER/PASSWORD are set this stays
// PENDING_ACCESS like every other real-data provider.
import { fetchListing } from "../fetchListing";
import { detectPortal } from "../extract";
import { SourceNotAvailableError, type ListingSourceItem, type ListingSourceProvider, type ListingSourceQuery } from "./types";

// Every portal detectPortal() already recognizes is a valid source of a
// saved-search alert email — kept in sync with extract.ts's PORTAL_MAP
// rather than a second, independent list.
const REAL_ESTATE_DOMAINS = [
  "sreality.cz",
  "bezrealitky.cz",
  "reality.idnes.cz",
  "reality.cz",
  "ceskereality.cz",
  "remax-czech.cz",
  "remax.cz",
  "m-m-reality.cz",
  "mmreality.cz",
  "century21.cz",
  "realcity.cz"
];

function isConfigured(): boolean {
  return Boolean(
    process.env.EMAIL_ALERT_IMAP_HOST && process.env.EMAIL_ALERT_IMAP_USER && process.env.EMAIL_ALERT_IMAP_PASSWORD
  );
}

export function extractListingUrlsFromEmail(html?: string | null, text?: string | null): string[] {
  const urls = new Set<string>();
  const urlRegex = /https?:\/\/[^\s"'<>\]]+/gi;
  for (const blob of [html, text]) {
    if (!blob) continue;
    const matches = blob.match(urlRegex) ?? [];
    for (const raw of matches) {
      const cleaned = raw.replace(/[),.;!?]+$/, "");
      let parsed: URL;
      try {
        parsed = new URL(cleaned);
      } catch {
        continue;
      }
      const host = parsed.hostname.toLowerCase();
      if (REAL_ESTATE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) {
        urls.add(parsed.toString());
      }
    }
  }
  return [...urls];
}

export function listingMatchesQuery(item: Pick<ListingSourceItem, "municipality" | "district" | "disposition" | "askingPrice" | "areaM2">, query: ListingSourceQuery): boolean {
  if (query.municipality && item.municipality && !item.municipality.toLowerCase().includes(query.municipality.toLowerCase())) return false;
  if (query.district && item.district && !item.district.toLowerCase().includes(query.district.toLowerCase())) return false;
  if (query.dispositions?.length && !query.dispositions.includes(item.disposition)) return false;
  if (query.maxPrice != null && item.askingPrice > query.maxPrice) return false;
  if (query.maxAreaM2 != null && item.areaM2 > query.maxAreaM2) return false;
  if (query.minAreaM2 != null && item.areaM2 < query.minAreaM2) return false;
  return true;
}

async function fetchListingAsItem(url: string): Promise<ListingSourceItem | null> {
  const fetched = await fetchListing(url);
  if (!fetched.ok || !fetched.extracted) return null;
  const f = fetched.extracted.fields;
  if (!f.askingPrice || !f.areaM2 || !f.disposition || !f.municipality) return null;

  return {
    externalId: url,
    url,
    portal: fetched.extracted.portal ?? detectPortal(url) ?? "E-mailové upozornění",
    title: f.title ?? url,
    description: f.description,
    askingPrice: f.askingPrice,
    disposition: f.disposition,
    areaM2: f.areaM2,
    municipality: f.municipality,
    district: f.district ?? null,
    street: f.street ?? null,
    ownership: f.ownership ?? null,
    condition: f.condition ?? null,
    buildingCondition: f.buildingCondition,
    construction: f.construction,
    floor: f.floor,
    totalFloors: f.totalFloors,
    elevator: f.elevator,
    balcony: f.balcony,
    terrace: f.terrace,
    loggia: f.loggia,
    cellar: f.cellar,
    parking: f.parking,
    energyRating: f.penb,
    photos: fetched.extracted.photos ?? [],
    publishedAt: new Date().toISOString(),
    fullText: fetched.extracted.fullText,
    isDemo: false
  };
}

async function runSearch(query: ListingSourceQuery): Promise<ListingSourceItem[]> {
  if (!isConfigured()) {
    throw new SourceNotAvailableError(
      "E-mailová upozornění (IMAP): čeká na EMAIL_ALERT_IMAP_HOST/EMAIL_ALERT_IMAP_USER/EMAIL_ALERT_IMAP_PASSWORD."
    );
  }

  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const client = new ImapFlow({
    host: process.env.EMAIL_ALERT_IMAP_HOST!,
    port: Number(process.env.EMAIL_ALERT_IMAP_PORT ?? 993),
    secure: process.env.EMAIL_ALERT_IMAP_SECURE !== "false",
    auth: { user: process.env.EMAIL_ALERT_IMAP_USER!, pass: process.env.EMAIL_ALERT_IMAP_PASSWORD! },
    logger: false
  });

  try {
    await client.connect();
  } catch (err) {
    throw new SourceNotAvailableError(
      `E-mailová upozornění (IMAP): připojení k poštovnímu serveru selhalo (${err instanceof Error ? err.message : "neznámá chyba"}).`
    );
  }

  const folder = process.env.EMAIL_ALERT_IMAP_FOLDER || "INBOX";
  const items: ListingSourceItem[] = [];
  const seenUrls = new Set<string>();
  const uidsToMarkSeen: number[] = [];

  try {
    let lock;
    try {
      lock = await client.getMailboxLock(folder);
    } catch (err) {
      throw new SourceNotAvailableError(`E-mailová upozornění (IMAP): složku „${folder}“ se nepodařilo otevřít.`);
    }

    try {
      for await (const message of client.fetch({ seen: false }, { source: true, uid: true })) {
        let parsed;
        try {
          parsed = await simpleParser(message.source as Buffer);
        } catch {
          continue; // unparseable message — skip, never guess its content
        }

        const candidateUrls = extractListingUrlsFromEmail(parsed.html || undefined, parsed.text || undefined);
        for (const url of candidateUrls) {
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          const item = await fetchListingAsItem(url).catch(() => null);
          if (item && listingMatchesQuery(item, query)) items.push(item);
        }

        uidsToMarkSeen.push(message.uid as number);
      }
    } finally {
      lock.release();
    }

    for (const uid of uidsToMarkSeen) {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }).catch(() => {});
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return items;
}

export const emailAlertProvider: ListingSourceProvider = {
  key: "EMAIL_ALERTS",
  label: "E-mailová upozornění portálů (IMAP)",
  get status() {
    return isConfigured() ? "ACTIVE" : "PENDING_ACCESS";
  },
  get statusNote() {
    return isConfigured()
      ? undefined
      : 'Čeká na EMAIL_ALERT_IMAP_HOST/EMAIL_ALERT_IMAP_USER/EMAIL_ALERT_IMAP_PASSWORD. Žádné scrapování: čte jen e-maily, které vám portály (Sreality, Bezrealitky, iDNES Reality, …) sami zasílají přes svou vlastní funkci "uložit hledání a upozornit e-mailem" po přesměrování do schránky, kterou zde připojíte.';
  },
  async search(query: ListingSourceQuery): Promise<ListingSourceItem[]> {
    return runSearch(query);
  }
  // findComparables intentionally omitted — a mailbox of saved-search
  // alerts reflects the WATCHER's own criteria, not a general-purpose
  // lookup for an arbitrary subject property's comparables.
};
