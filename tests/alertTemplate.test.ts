// Request E, item 3 — exact alert content template, N/A on missing data,
// and the real SMTP email provider (NOT_CONFIGURED/FAILED/SENT, never a
// fabricated send).
import { describe, it, expect, afterEach, vi } from "vitest";
import { buildAlertLines, buildAlertText, buildAlertHtml } from "@/lib/notifications/alertTemplate";
import { emailProvider } from "@/lib/notifications/providers";
import { resetSmtpTransporterCache } from "@/lib/email/smtpClient";
import type { AlertNotificationPayload } from "@/lib/notifications/types";

const fullPayload: AlertNotificationPayload = {
  alertId: "alert-1",
  projectId: "proj-1",
  projectTitle: "Byt 2+1",
  propertyType: "APARTMENT",
  municipality: "Brno",
  district: "Královo Pole",
  disposition: "2+1",
  askingPrice: 4290000,
  pricePerM2: 76600,
  maxBuyPrice: 4500000,
  expectedProfit: 600000,
  roiPct: 0.124,
  band: "GOOD",
  sourceUrl: "https://example.test/listing",
  reason: "NEW_MATCH",
  marketValueEstimate: 5100000,
  arvEstimate: 5700000,
  renovationEstimate: 550000,
  dziflipScore: 87
};

describe("buildAlertLines — exact Czech template", () => {
  it("matches the exact field order and labels from the spec", () => {
    const lines = buildAlertLines(fullPayload);
    expect(lines[0]).toBe("NOVÁ FLIP PŘÍLEŽITOST");
    expect(lines[1]).toBe("Byt 2+1 — Brno, Královo Pole");
    expect(lines[2]).toMatch(/^Cena: 4\s?290\s?000 Kč$/);
    expect(lines[3]).toMatch(/^Cena\/m²: 76\s?600 Kč$/);
    expect(lines[4]).toMatch(/^Odhad trhu: 5\s?100\s?000 Kč$/);
    expect(lines[5]).toMatch(/^Odhad ARV: 5\s?700\s?000 Kč$/);
    expect(lines[6]).toMatch(/^Odhad rekonstrukce: 550\s?000 Kč$/);
    expect(lines[7]).toMatch(/^Potenciální zisk: 600\s?000 Kč$/);
    expect(lines[8]).toMatch(/^ROI: 12,4\s?%$/);
    expect(lines[9]).toBe("DziFlip Score: 87/100");
  });

  it("shows N/A — never a fabricated number — for every field the pipeline genuinely couldn't compute", () => {
    const thin: AlertNotificationPayload = {
      ...fullPayload,
      marketValueEstimate: null,
      arvEstimate: null,
      renovationEstimate: null,
      dziflipScore: null
    };
    const lines = buildAlertLines(thin);
    expect(lines[4]).toBe("Odhad trhu: N/A");
    expect(lines[5]).toBe("Odhad ARV: N/A");
    expect(lines[6]).toBe("Odhad rekonstrukce: N/A");
    expect(lines[9]).toBe("DziFlip Score: N/A");
  });

  it("uses the correct header per reason", () => {
    expect(buildAlertLines({ ...fullPayload, reason: "PRICE_DROP" })[0]).toBe("POKLES CENY");
    expect(buildAlertLines({ ...fullPayload, reason: "LISTING_REMOVED" })[0]).toBe("INZERÁT STAŽEN Z NABÍDKY");
    expect(buildAlertLines({ ...fullPayload, reason: "LISTING_RELISTED" })[0]).toBe("INZERÁT SE VRÁTIL DO NABÍDKY");
  });

  it("text output includes the source listing link and an OTEVŘÍT V DZIFLIPU reference", () => {
    const text = buildAlertText(fullPayload);
    expect(text).toContain("https://example.test/listing");
    expect(text).toMatch(/OTEVŘÍT V DZIFLIPU/);
  });

  it("HTML output renders a real OTEVŘÍT V DZIFLIPU button when an app base URL is configured", () => {
    const original = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://dziflip.example.com";
    try {
      const html = buildAlertHtml(fullPayload);
      expect(html).toContain("OTEVŘÍT V DZIFLIPU");
      expect(html).toContain("https://dziflip.example.com/projects/proj-1");
    } finally {
      process.env.APP_BASE_URL = original;
    }
  });
});

describe("emailProvider — real SMTP send path (never fabricates SENT)", () => {
  const originalHost = process.env.SMTP_HOST;
  const originalFrom = process.env.SMTP_FROM;

  afterEach(() => {
    process.env.SMTP_HOST = originalHost;
    process.env.SMTP_FROM = originalFrom;
    resetSmtpTransporterCache();
    vi.restoreAllMocks();
  });

  it("without SMTP_HOST/SMTP_FROM, reports NOT_CONFIGURED and never attempts a send", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    expect(emailProvider.isConfigured()).toBe(false);
    const result = await emailProvider.send(fullPayload);
    expect(result.status).toBe("NOT_CONFIGURED");
  });
});
