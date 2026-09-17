import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { emailProvider, inAppProvider } from "./providers";
import type { AlertNotificationPayload } from "./types";

/**
 * Dispatches a freshly-created Alert through every channel enabled in
 * Settings, recording one NotificationLog row per channel with an honest
 * delivery status. In-app is implicit (the Alert row is the inbox entry)
 * but still logged for a consistent audit trail.
 */
export async function dispatchAlert(payload: AlertNotificationPayload) {
  const settings = await getSettings();

  const channels: Array<{ enabled: boolean; provider: typeof inAppProvider }> = [
    { enabled: settings.notifyInApp, provider: inAppProvider },
    { enabled: settings.notifyEmail, provider: emailProvider }
    // PUSH and SMS have no settings toggle yet — they're architecture-only
    // (see pushProvider/smsProvider) until a real channel is implemented.
  ];

  for (const { enabled, provider } of channels) {
    if (!enabled) continue;
    const result = await provider.send(payload);
    await prisma.notificationLog.create({
      data: {
        alertId: payload.alertId,
        channel: provider.channel,
        status: result.status,
        detail: result.detail ?? null
      }
    });
  }
  // PUSH and SMS providers exist (see providers.ts) but have no Settings
  // toggle yet since neither can actually deliver anything until a real
  // channel is implemented — see README for what's needed to wire them up.
}
