// Notification provider architecture for Deal Alerts. Each channel is an
// independent, swappable implementation. A provider must report honestly
// when it cannot actually deliver — it must never claim SENT unless the
// message genuinely left the application.

export interface AlertNotificationPayload {
  alertId: string;
  projectTitle: string;
  municipality: string | null;
  district: string | null;
  disposition: string | null;
  askingPrice: number | null;
  pricePerM2: number | null;
  maxBuyPrice: number | null;
  expectedProfit: number | null;
  roiPct: number | null;
  band: string | null;
  sourceUrl: string | null;
  reason: string; // NEW_MATCH | PRICE_DROP
}

export type NotificationDeliveryStatus = "SENT" | "NOT_CONFIGURED" | "FAILED" | "QUEUED";

export interface NotificationDeliveryResult {
  status: NotificationDeliveryStatus;
  detail?: string;
}

export interface NotificationProvider {
  channel: "IN_APP" | "EMAIL" | "PUSH" | "SMS";
  isConfigured(): boolean;
  send(payload: AlertNotificationPayload): Promise<NotificationDeliveryResult>;
}
