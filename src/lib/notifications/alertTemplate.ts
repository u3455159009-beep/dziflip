// Builds the exact Czech alert content (Request E, item 3) shared by every
// channel (in-app summary, e-mail text + HTML). Any figure the pipeline
// genuinely couldn't compute is shown as "N/A" — never a guessed number.
import { formatCZK, formatPct } from "@/lib/format";
import { buildAbsoluteAppUrl } from "@/lib/appUrl";
import type { AlertNotificationPayload } from "./types";

const REASON_HEADERS: Record<string, string> = {
  NEW_MATCH: "NOVÁ FLIP PŘÍLEŽITOST",
  PRICE_DROP: "POKLES CENY",
  LISTING_REMOVED: "INZERÁT STAŽEN Z NABÍDKY",
  LISTING_RELISTED: "INZERÁT SE VRÁTIL DO NABÍDKY"
};

function propertyLine(p: AlertNotificationPayload): string {
  const kind =
    p.propertyType === "HOUSE"
      ? "Dům"
      : p.propertyType === "LAND"
        ? "Pozemek"
        : p.propertyType === "GARAGE"
          ? "Garáž"
          : p.disposition
            ? `Byt ${p.disposition}`
            : p.projectTitle ?? "Nemovitost";
  const loc = [p.municipality, p.district].filter(Boolean).join(", ");
  return loc ? `${kind} — ${loc}` : kind;
}

/** The ordered lines of the alert body, identical across every channel. */
export function buildAlertLines(p: AlertNotificationPayload): string[] {
  return [
    REASON_HEADERS[p.reason] ?? p.reason,
    propertyLine(p),
    `Cena: ${p.askingPrice != null ? formatCZK(p.askingPrice) : "N/A"}`,
    `Cena/m²: ${p.pricePerM2 != null ? formatCZK(p.pricePerM2) : "N/A"}`,
    `Odhad trhu: ${p.marketValueEstimate != null ? formatCZK(p.marketValueEstimate) : "N/A"}`,
    `Odhad ARV: ${p.arvEstimate != null ? formatCZK(p.arvEstimate) : "N/A"}`,
    `Odhad rekonstrukce: ${p.renovationEstimate != null ? formatCZK(p.renovationEstimate) : "N/A"}`,
    `Potenciální zisk: ${p.expectedProfit != null ? formatCZK(p.expectedProfit) : "N/A"}`,
    `ROI: ${p.roiPct != null ? formatPct(p.roiPct) : "N/A"}`,
    `DziFlip Score: ${p.dziflipScore != null ? `${p.dziflipScore}/100` : "N/A"}`
  ];
}

export function buildDeepLink(p: AlertNotificationPayload): string | null {
  return buildAbsoluteAppUrl(`/projects/${p.projectId}`);
}

export function buildAlertText(p: AlertNotificationPayload): string {
  const lines = buildAlertLines(p);
  const deepLink = buildDeepLink(p);
  if (p.sourceUrl) lines.push("", `Inzerát: ${p.sourceUrl}`);
  lines.push(deepLink ? `OTEVŘÍT V DZIFLIPU: ${deepLink}` : `OTEVŘÍT V DZIFLIPU: projekt č. ${p.projectId}`);
  return lines.join("\n");
}

export function buildAlertHtml(p: AlertNotificationPayload): string {
  const [header, ...rest] = buildAlertLines(p);
  const deepLink = buildDeepLink(p);
  const body = rest.map((l) => `<p style="margin:2px 0;font-family:sans-serif;font-size:14px;color:#1a1a1a;">${l}</p>`).join("\n");
  const sourceLinkHtml = p.sourceUrl
    ? `<p style="margin:10px 0 2px;font-family:sans-serif;font-size:13px;"><a href="${p.sourceUrl}">Zobrazit inzerát na portálu</a></p>`
    : "";
  const buttonHtml = deepLink
    ? `<p style="margin:14px 0;"><a href="${deepLink}" style="display:inline-block;padding:10px 18px;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;">OTEVŘÍT V DZIFLIPU</a></p>`
    : `<p style="margin:10px 0;font-family:sans-serif;font-size:13px;color:#666;">Otevřete projekt č. ${p.projectId} v DziFlipu.</p>`;
  return `<div>\n<h2 style="font-family:sans-serif;margin:0 0 8px;">${header}</h2>\n${body}\n${sourceLinkHtml}\n${buttonHtml}\n</div>`;
}

export function buildAlertSubject(p: AlertNotificationPayload): string {
  const header = REASON_HEADERS[p.reason] ?? p.reason;
  return `DziFlip — ${header}: ${propertyLine(p)}`;
}
