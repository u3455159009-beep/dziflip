// Notification provider architecture for Deal Alerts. Each channel is an
// independent, swappable implementation. A provider must report honestly
// when it cannot actually deliver — it must never claim SENT unless the
// message genuinely left the application.

export interface AlertNotificationPayload {
  alertId: string;
  projectId: string;
  projectTitle: string;
  propertyType: string | null; // APARTMENT | HOUSE | LAND | GARAGE | COMMERCIAL | OTHER
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
  reason: string; // NEW_MATCH | PRICE_DROP | LISTING_REMOVED | LISTING_RELISTED

  // Request E, item 3 — every one of these is null when the pipeline
  // genuinely couldn't compute it (never a guessed figure); the template
  // renders N/A for whatever is null.
  marketValueEstimate: number | null;
  arvEstimate: number | null;
  renovationEstimate: number | null;
  dziflipScore: number | null;
}

export type NotificationDeliveryStatus = "SENT" | "NOT_CONFIGURED" | "FAILED" | "QUEUED";

export interface NotificationDeliveryResult {
  status: NotificationDeliveryStatus;
  detail?: string;
}

// IN_APP and EMAIL are real, working channels. PUSH/SMS/TELEGRAM/WHATSAPP
// are architecture-only stubs (Request E, item 3 — "prepare the
// architecture for future channels") until a real provider is connected;
// each reports NOT_CONFIGURED honestly rather than pretending to send.
export type NotificationChannel = "IN_APP" | "EMAIL" | "PUSH" | "SMS" | "TELEGRAM" | "WHATSAPP";

export interface NotificationProvider {
  channel: NotificationChannel;
  isConfigured(): boolean;
  send(payload: AlertNotificationPayload): Promise<NotificationDeliveryResult>;
}
