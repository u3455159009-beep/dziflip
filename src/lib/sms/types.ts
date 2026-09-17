// SMS provider architecture. Every implementation must either genuinely
// queue/send the message with a real provider or refuse — never fabricate
// a QUEUED/SENT/DELIVERED status for a message that didn't actually go
// anywhere. The MOCK provider is the only one allowed to simulate success,
// and it must always be unmistakably labeled as such upstream (isDemo /
// provider = "MOCK_SMS" on every message it touches).

export type SmsProviderStatus = "ACTIVE" | "PENDING_CONFIG";

export interface SmsSendResult {
  status: "QUEUED" | "SENT" | "FAILED";
  providerMessageId?: string;
  reason?: string;
}

export interface SmsProvider {
  key: "MOCK_SMS" | "REAL_SMS";
  label: string;
  status: SmsProviderStatus;
  statusNote?: string;
  isConfigured(): boolean;
  send(to: string, body: string): Promise<SmsSendResult>;
}
