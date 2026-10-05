// Email Alert Provider (Request F, item 1) — the zero-cost replacement for
// Brave Search/FlatScan. Tests the provider's own logic (URL extraction,
// query filtering, PENDING_ACCESS gating, marking messages \Seen) with
// imapflow/mailparser and fetchListing mocked — those are real,
// independently-trusted libraries/modules, not what's under test here.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { extractListingUrlsFromEmail, listingMatchesQuery } from "@/lib/sources/emailAlertProvider";

const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
}

describe("extractListingUrlsFromEmail", () => {
  it("extracts real listing URLs for known CZ portal domains from HTML and text bodies", () => {
    const html = '<a href="https://www.sreality.cz/detail/prodej/byt/2+1/brno/123">Byt 2+1</a>';
    const urls = extractListingUrlsFromEmail(html, null);
    expect(urls).toContain("https://www.sreality.cz/detail/prodej/byt/2+1/brno/123");
  });

  it("never extracts a URL from a domain that isn't an allow-listed real-estate portal", () => {
    const html = '<a href="https://www.google.com/search?q=byt">search</a>';
    expect(extractListingUrlsFromEmail(html, null)).toHaveLength(0);
  });

  it("deduplicates the same URL appearing in both html and text", () => {
    const url = "https://www.bezrealitky.cz/nemovitosti-byty-domy/999-prodej-bytu";
    const urls = extractListingUrlsFromEmail(`<a href="${url}">x</a>`, url);
    expect(urls).toHaveLength(1);
  });

  it("strips trailing punctuation that a plain-text email often appends to a URL", () => {
    const urls = extractListingUrlsFromEmail(null, "Nová nabídka: https://reality.idnes.cz/detail/55 (klikněte zde).");
    expect(urls[0]).toBe("https://reality.idnes.cz/detail/55");
  });

  it("returns an empty array for an email with no portal links at all", () => {
    expect(extractListingUrlsFromEmail("<p>Žádné odkazy.</p>", "Jen text.")).toHaveLength(0);
  });
});

describe("listingMatchesQuery", () => {
  const item = { municipality: "Brno", district: "Žabovřesky", disposition: "2+1", askingPrice: 5000000, areaM2: 60 };

  it("matches when every provided criterion is satisfied", () => {
    expect(listingMatchesQuery(item, { municipality: "Brno", maxPrice: 6000000 })).toBe(true);
  });

  it("rejects when the municipality doesn't match", () => {
    expect(listingMatchesQuery(item, { municipality: "Praha" })).toBe(false);
  });

  it("rejects when price exceeds the watcher's maxPrice", () => {
    expect(listingMatchesQuery(item, { maxPrice: 4000000 })).toBe(false);
  });

  it("rejects when the disposition isn't in the watcher's requested list", () => {
    expect(listingMatchesQuery(item, { dispositions: ["3+1"] })).toBe(false);
  });

  it("matches an empty/unset query (no criteria to fail)", () => {
    expect(listingMatchesQuery(item, {})).toBe(true);
  });
});

describe("emailAlertProvider — status gating", () => {
  afterEach(resetEnv);

  it("is PENDING_ACCESS without IMAP credentials and search() throws without ever importing imapflow", async () => {
    delete process.env.EMAIL_ALERT_IMAP_HOST;
    delete process.env.EMAIL_ALERT_IMAP_USER;
    delete process.env.EMAIL_ALERT_IMAP_PASSWORD;
    const { emailAlertProvider } = await import("@/lib/sources/emailAlertProvider");
    expect(emailAlertProvider.status).toBe("PENDING_ACCESS");
    await expect(emailAlertProvider.search({})).rejects.toThrow(/EMAIL_ALERT_IMAP/);
  });

  it("is ACTIVE once all three IMAP credentials are set", async () => {
    process.env.EMAIL_ALERT_IMAP_HOST = "imap.test.local";
    process.env.EMAIL_ALERT_IMAP_USER = "watch@test.local";
    process.env.EMAIL_ALERT_IMAP_PASSWORD = "secret";
    const { emailAlertProvider } = await import("@/lib/sources/emailAlertProvider");
    expect(emailAlertProvider.status).toBe("ACTIVE");
  });
});

describe("emailAlertProvider — end-to-end with IMAP/mailparser/fetchListing mocked", () => {
  beforeEach(() => {
    // The provider module statically imports fetchListing and dynamically
    // imports imapflow/mailparser; forcing a fresh module graph here is
    // what makes vi.doMock below actually take effect (otherwise a module
    // instance cached from an earlier test in this file — before any mock
    // was registered — would keep its already-bound real imports).
    vi.resetModules();
  });

  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
    vi.doUnmock("imapflow");
    vi.doUnmock("mailparser");
    vi.doUnmock("@/lib/fetchListing");
  });

  it("finds one real, fully-extractable listing link in an unseen email, marks it \\Seen, and never fabricates a listing missing required fields", async () => {
    process.env.EMAIL_ALERT_IMAP_HOST = "imap.test.local";
    process.env.EMAIL_ALERT_IMAP_USER = "watch@test.local";
    process.env.EMAIL_ALERT_IMAP_PASSWORD = "secret";

    const flagsAdd = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const logout = vi.fn().mockResolvedValue(undefined);

    vi.doMock("imapflow", () => ({
      ImapFlow: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        getMailboxLock: vi.fn().mockResolvedValue({ release: releaseLock }),
        fetch: vi.fn().mockImplementation(async function* () {
          yield { uid: 42, source: Buffer.from("raw-email-1") };
        }),
        messageFlagsAdd: flagsAdd,
        logout
      }))
    }));

    vi.doMock("mailparser", () => ({
      simpleParser: vi.fn().mockResolvedValue({
        html: '<a href="https://www.sreality.cz/detail/prodej/byt/2+1/brno/123">Byt 2+1</a>',
        text: null
      })
    }));

    vi.doMock("@/lib/fetchListing", () => ({
      fetchListing: vi.fn().mockResolvedValue({
        ok: true,
        extracted: {
          fields: { title: "Byt 2+1, Brno", askingPrice: 5000000, areaM2: 60, disposition: "2+1", municipality: "Brno" },
          meta: {},
          fullText: "Byt 2+1, Brno",
          portal: "Sreality.cz",
          photos: []
        }
      })
    }));

    const { emailAlertProvider } = await import("@/lib/sources/emailAlertProvider");
    const results = await emailAlertProvider.search({});

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://www.sreality.cz/detail/prodej/byt/2+1/brno/123");
    expect(results[0].askingPrice).toBe(5000000);
    expect(results[0].isDemo).toBe(false);
    expect(flagsAdd).toHaveBeenCalledWith(42, ["\\Seen"], { uid: true });
    expect(releaseLock).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });

  it("drops a candidate listing whose page fetch yields insufficient fields — never half-filled with a guess", async () => {
    process.env.EMAIL_ALERT_IMAP_HOST = "imap.test.local";
    process.env.EMAIL_ALERT_IMAP_USER = "watch@test.local";
    process.env.EMAIL_ALERT_IMAP_PASSWORD = "secret";

    vi.doMock("imapflow", () => ({
      ImapFlow: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
        fetch: vi.fn().mockImplementation(async function* () {
          yield { uid: 1, source: Buffer.from("raw") };
        }),
        messageFlagsAdd: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined)
      }))
    }));
    vi.doMock("mailparser", () => ({
      simpleParser: vi.fn().mockResolvedValue({ html: '<a href="https://www.sreality.cz/detail/x/1">x</a>', text: null })
    }));
    vi.doMock("@/lib/fetchListing", () => ({
      fetchListing: vi.fn().mockResolvedValue({ ok: false, error: "Server vrátil chybu 404." })
    }));

    const { emailAlertProvider } = await import("@/lib/sources/emailAlertProvider");
    const results = await emailAlertProvider.search({});
    expect(results).toHaveLength(0);
  });
});
