// Shared real SMTP client (Request E, item 3 / outreach item) — used by
// both Deal Radar/Watchdog alert e-mails (src/lib/notifications/providers.ts)
// and viewing-request contact automation (src/lib/outreach.ts), so there is
// exactly one place that ever talks to an SMTP server. Configuration alone
// is never claimed as "it works" — isSmtpConfigured() only gates whether a
// real attempt is even made; the caller still gets a real SENT/FAILED
// result from the actual send.
import nodemailer from "nodemailer";

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  status: "SENT" | "NOT_CONFIGURED" | "FAILED";
  detail?: string;
}

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let cachedTransporterKey: string | null = null;

function getTransporter() {
  // Keyed on the config that actually matters, so changing env vars
  // between calls (e.g. in tests) never reuses a stale connection pool.
  const key = `${process.env.SMTP_HOST}:${process.env.SMTP_PORT}:${process.env.SMTP_USER}:${process.env.SMTP_SECURE}`;
  if (cachedTransporter && cachedTransporterKey === key) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
  });
  cachedTransporterKey = key;
  return cachedTransporter;
}

/** Resets the cached transporter — tests call this when they swap SMTP env vars. */
export function resetSmtpTransporterCache(): void {
  cachedTransporter = null;
  cachedTransporterKey = null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isSmtpConfigured()) {
    return { status: "NOT_CONFIGURED", detail: "SMTP není nakonfigurováno (chybí SMTP_HOST/SMTP_FROM)." };
  }

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html
    });
    return { status: "SENT" };
  } catch (err) {
    return { status: "FAILED", detail: err instanceof Error ? err.message : "E-mail se nepodařilo odeslat." };
  }
}
