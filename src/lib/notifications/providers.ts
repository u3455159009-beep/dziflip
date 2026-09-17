import { formatCZK, formatPct } from "@/lib/format";
import type {
  AlertNotificationPayload,
  NotificationDeliveryResult,
  NotificationProvider
} from "./types";

function summarize(p: AlertNotificationPayload): string {
  const loc = [p.municipality, p.district].filter(Boolean).join(" · ");
  return `${p.projectTitle} (${loc}) — ${formatCZK(p.askingPrice)}, zisk ${formatCZK(
    p.expectedProfit
  )}, ROI ${formatPct(p.roiPct)}`;
}

// In-app is always "configured" — the Alert row itself is the notification,
// this just confirms it was recorded for the inbox.
export const inAppProvider: NotificationProvider = {
  channel: "IN_APP",
  isConfigured: () => true,
  async send(payload): Promise<NotificationDeliveryResult> {
    return { status: "SENT", detail: summarize(payload) };
  }
};

// Real e-mail delivery requires SMTP credentials the user hasn't provided
// yet. We never fake a send — an unconfigured provider reports
// NOT_CONFIGURED so the UI can say so honestly instead of implying an
// e-mail went out.
function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export const emailProvider: NotificationProvider = {
  channel: "EMAIL",
  isConfigured: emailConfigured,
  async send(): Promise<NotificationDeliveryResult> {
    if (!emailConfigured()) {
      return {
        status: "NOT_CONFIGURED",
        detail:
          "E-mailové upozornění nebylo odesláno — chybí SMTP_HOST/SMTP_FROM v prostředí. Doplňte SMTP údaje do .env."
      };
    }
    // Intentionally not implemented: wiring a real SMTP/API client is a
    // follow-up step once credentials are provided. Never fabricate SENT.
    return { status: "FAILED", detail: "SMTP klient zatím není implementován." };
  }
};

export const pushProvider: NotificationProvider = {
  channel: "PUSH",
  isConfigured: () => false,
  async send(): Promise<NotificationDeliveryResult> {
    return { status: "NOT_CONFIGURED", detail: "Push/mobilní notifikace zatím nejsou implementovány." };
  }
};

export const smsProvider: NotificationProvider = {
  channel: "SMS",
  isConfigured: () => false,
  async send(): Promise<NotificationDeliveryResult> {
    return { status: "NOT_CONFIGURED", detail: "SMS notifikace zatím nejsou implementovány." };
  }
};

export const NOTIFICATION_PROVIDERS: NotificationProvider[] = [
  inAppProvider,
  emailProvider,
  pushProvider,
  smsProvider
];
