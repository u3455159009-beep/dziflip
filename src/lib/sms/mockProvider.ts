// MOCK_SMS — a safe, always-available testing channel. It never transmits
// anything over the network; it just simulates a provider accepting the
// message so the rest of the SMS Hub pipeline (rules, dedup, audit log,
// UI) can be exercised end-to-end without touching a real phone number.
import type { SmsProvider, SmsSendResult } from "./types";

export const mockSmsProvider: SmsProvider = {
  key: "MOCK_SMS",
  label: "MOCK SMS (testovací)",
  status: "ACTIVE",
  statusNote: "Zprávy se nikam skutečně neodesílají — pouze simulace pro bezpečné testování.",
  isConfigured: () => true,
  async send(_to: string, _body: string): Promise<SmsSendResult> {
    // Synchronous simulated success — no real transmission, no delivery
    // tracking needed, so it goes straight to SENT rather than lingering
    // in QUEUED like a real async gateway would.
    return {
      status: "SENT",
      providerMessageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
  }
};
