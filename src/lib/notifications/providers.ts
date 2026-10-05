import { buildAlertText, buildAlertHtml, buildAlertSubject } from "./alertTemplate";
import { isSmtpConfigured, sendEmail } from "@/lib/email/smtpClient";
import { getSettings } from "@/lib/settings";
import type { AlertNotificationPayload, NotificationDeliveryResult, NotificationProvider } from "./types";

// In-app is always "configured" — the Alert row itself is the notification,
// this just confirms it was recorded for the inbox.
export const inAppProvider: NotificationProvider = {
  channel: "IN_APP",
  isConfigured: () => true,
  async send(payload): Promise<NotificationDeliveryResult> {
    return { status: "SENT", detail: buildAlertText(payload) };
  }
};

// Real e-mail delivery via the shared SMTP client (src/lib/email/smtpClient.ts).
// Never fakes a send — NOT_CONFIGURED when SMTP isn't set up, FAILED with
// the real error when a send attempt genuinely fails.
export const emailProvider: NotificationProvider = {
  channel: "EMAIL",
  isConfigured: isSmtpConfigured,
  async send(payload): Promise<NotificationDeliveryResult> {
    if (!isSmtpConfigured()) {
      return {
        status: "NOT_CONFIGURED",
        detail: "E-mailové upozornění nebylo odesláno — chybí SMTP_HOST/SMTP_FROM v prostředí. Doplňte SMTP údaje do .env."
      };
    }
    const settings = await getSettings();
    if (!settings.notifyEmailAddress) {
      return {
        status: "NOT_CONFIGURED",
        detail: "E-mailové upozornění nebylo odesláno — v Nastavení chybí e-mailová adresa pro upozornění."
      };
    }
    const result = await sendEmail({
      to: settings.notifyEmailAddress,
      subject: buildAlertSubject(payload),
      text: buildAlertText(payload),
      html: buildAlertHtml(payload)
    });
    if (result.status === "SENT") return { status: "SENT", detail: buildAlertText(payload) };
    return { status: result.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "FAILED", detail: result.detail };
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
    return { status: "NOT_CONFIGURED", detail: "SMS notifikace přes tento kanál zatím nejsou implementovány (viz samostatný SMS Hub pro komunikaci s makléři)." };
  }
};

// Architecture-only stubs (Request E, item 3: "prepare the architecture for
// future channels") — inert until a real Telegram Bot API / WhatsApp
// Business API token is connected. Never silently omitted from the
// provider list so Settings/Provider Health can show them as genuinely
// not-yet-available rather than non-existent.
export const telegramProvider: NotificationProvider = {
  channel: "TELEGRAM",
  isConfigured: () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  async send(): Promise<NotificationDeliveryResult> {
    return { status: "NOT_CONFIGURED", detail: "Telegram notifikace zatím nejsou implementovány (čeká na TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID a klienta)." };
  }
};

export const whatsappProvider: NotificationProvider = {
  channel: "WHATSAPP",
  isConfigured: () => Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  async send(): Promise<NotificationDeliveryResult> {
    return { status: "NOT_CONFIGURED", detail: "WhatsApp notifikace zatím nejsou implementovány (čeká na WhatsApp Business API přístup)." };
  }
};

export const NOTIFICATION_PROVIDERS: NotificationProvider[] = [
  inAppProvider,
  emailProvider,
  pushProvider,
  smsProvider,
  telegramProvider,
  whatsappProvider
];
