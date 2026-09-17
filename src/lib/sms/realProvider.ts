// REAL_SMS — interface for a future real SMS gateway. No vendor is wired
// in yet, and no credentials are invented anywhere in this file. Until
// SMS_API_URL/SMS_API_KEY/SMS_SENDER_ID are set in the environment, this
// provider reports PENDING_CONFIG and send() always fails closed — it
// never attempts a network call without real configuration.
//
// The request shape below is a generic "POST JSON with a bearer token"
// convention chosen so it's easy to adapt — most Czech SMS gateways
// (SMSbrana.cz, GoSMS, SmsManager, Twilio, …) use some variant of this.
// Adjust `send()` to match whichever provider you actually connect.
import type { SmsProvider, SmsSendResult } from "./types";

function isConfigured(): boolean {
  return Boolean(process.env.SMS_API_URL && process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);
}

export const realSmsProvider: SmsProvider = {
  key: "REAL_SMS",
  label: "Skutečný SMS provider",
  status: isConfigured() ? "ACTIVE" : "PENDING_CONFIG",
  statusNote:
    "Vyžaduje SMS_API_URL, SMS_API_KEY a SMS_SENDER_ID v .env. Bez nich se žádná SMS neodešle.",
  isConfigured,
  async send(to: string, body: string): Promise<SmsSendResult> {
    if (!isConfigured()) {
      return {
        status: "FAILED",
        reason:
          "Skutečný SMS provider není nakonfigurován (chybí SMS_API_URL/SMS_API_KEY/SMS_SENDER_ID v .env)."
      };
    }

    try {
      const res = await fetch(process.env.SMS_API_URL as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SMS_API_KEY}`
        },
        body: JSON.stringify({
          from: process.env.SMS_SENDER_ID,
          to,
          text: body
        })
      });

      if (!res.ok) {
        return { status: "FAILED", reason: `Provider vrátil chybu ${res.status}.` };
      }

      const data = await res.json().catch(() => ({}) as any);
      return {
        status: "QUEUED",
        providerMessageId: typeof data?.id === "string" ? data.id : undefined
      };
    } catch {
      return { status: "FAILED", reason: "Odeslání na SMS providera selhalo (síťová chyba)." };
    }
  }
};
