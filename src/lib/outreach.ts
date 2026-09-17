// Contact automation: DRAFT/AUTO viewing-request messages. This module
// never invents a contact address, never claims a message was delivered
// unless it genuinely was, and enforces the daily limit / dedup / data
// confidence rules before anything resembling "AUTO" runs.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { computeDataConfidence } from "@/lib/confidence";
import type { DataConfidenceLevel, FieldMeta } from "@/lib/types";

export const DEFAULT_TEMPLATE_BODY = `Dobrý den,
mám vážný zájem o nabízenou nemovitost a rád bych se domluvil na osobní prohlídku.
Prosím o informaci, jaké jsou nejbližší možné termíny prohlídky.
Děkuji a přeji hezký den.`;

export async function getDefaultTemplate() {
  const existing = await prisma.messageTemplate.findFirst({ where: { isDefault: true } });
  if (existing) return existing;
  return prisma.messageTemplate.create({
    data: { name: "Žádost o prohlídku (výchozí)", body: DEFAULT_TEMPLATE_BODY, isDefault: true }
  });
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

interface DedupCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkOutreachAllowed(projectId: string): Promise<DedupCheckResult> {
  const settings = await getSettings();
  const contact = await prisma.contact.findUnique({ where: { projectId } });
  if (!contact?.email) {
    return { allowed: false, reason: "Chybí e-mail kontaktní osoby — nelze automaticky kontaktovat." };
  }

  const alreadySent = await prisma.outreachMessage.findFirst({
    where: { projectId, direction: "OUTBOUND", status: "SENT" }
  });
  if (alreadySent) {
    return { allowed: false, reason: "Nemovitost už byla kontaktována (ochrana proti duplicitě)." };
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await prisma.outreachMessage.count({
    where: { direction: "OUTBOUND", status: "SENT", createdAt: { gte: startOfDay } }
  });
  if (sentToday >= settings.dailyContactLimit) {
    return { allowed: false, reason: `Vyčerpán denní limit zpráv (${settings.dailyContactLimit}/den).` };
  }

  return { allowed: true };
}

interface EmailSendResult {
  status: "SENT" | "BLOCKED_NO_PROVIDER" | "FAILED";
  reason?: string;
}

async function attemptEmailSend(to: string, subject: string, body: string): Promise<EmailSendResult> {
  if (!emailConfigured()) {
    return {
      status: "BLOCKED_NO_PROVIDER",
      reason: "E-mail nebyl odeslán — SMTP není nakonfigurováno (chybí SMTP_HOST/SMTP_FROM v .env)."
    };
  }
  // Real SMTP dispatch is a follow-up step once credentials exist — never
  // fabricate a SENT status before that client is wired in.
  return { status: "FAILED", reason: "SMTP klient zatím není implementován." };
}

async function buildMessageBody(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const template = await getDefaultTemplate();
  const body = renderTemplate(template.body, {
    title: project?.title ?? "",
    address: [project?.street, project?.district, project?.municipality].filter(Boolean).join(", ")
  });
  return { body, subject: `Zájem o prohlídku — ${project?.title ?? "nemovitost"}` };
}

export async function createDraftOutreach(projectId: string, note?: string) {
  const { body, subject } = await buildMessageBody(projectId);
  const message = await prisma.outreachMessage.create({
    data: {
      projectId,
      direction: "OUTBOUND",
      mode: "DRAFT",
      channel: "EMAIL",
      subject,
      body,
      status: "DRAFT",
      blockedReason: note ?? null
    }
  });
  await prisma.contact.upsert({
    where: { projectId },
    update: { status: "ZPRAVA_PRIPRAVENA" },
    create: { projectId, status: "ZPRAVA_PRIPRAVENA" }
  });
  return message;
}

/** User-initiated: approve a draft and attempt to actually send it. */
export async function sendOutreachMessage(messageId: string) {
  const message = await prisma.outreachMessage.findUnique({ where: { id: messageId } });
  if (!message) throw new Error("Zpráva nenalezena.");

  const check = await checkOutreachAllowed(message.projectId);
  if (!check.allowed) {
    return prisma.outreachMessage.update({
      where: { id: messageId },
      data: { status: "BLOCKED_RULES", blockedReason: check.reason }
    });
  }

  const contact = await prisma.contact.findUnique({ where: { projectId: message.projectId } });
  const result = await attemptEmailSend(contact!.email!, message.subject ?? "", message.body);

  const updated = await prisma.outreachMessage.update({
    where: { id: messageId },
    data: {
      status: result.status,
      blockedReason: result.status === "SENT" ? null : result.reason,
      sentAt: result.status === "SENT" ? new Date() : null
    }
  });

  if (result.status === "SENT") {
    await prisma.contact.update({
      where: { projectId: message.projectId },
      data: { status: "ODESLANO", lastContactedAt: new Date() }
    });
  }

  return updated;
}

/** User asserts they sent the message themselves (e.g. via their own e-mail client). */
export async function markOutreachSentManually(messageId: string) {
  const message = await prisma.outreachMessage.update({
    where: { id: messageId },
    data: { status: "SENT", sentAt: new Date(), blockedReason: null }
  });
  await prisma.contact.upsert({
    where: { projectId: message.projectId },
    update: { status: "ODESLANO", lastContactedAt: new Date() },
    create: { projectId: message.projectId, status: "ODESLANO", lastContactedAt: new Date() }
  });
  return message;
}

/**
 * Called by the Deal Radar pipeline after a qualifying alert. OFF does
 * nothing. DRAFT prepares a message for manual approval. AUTO additionally
 * tries to send it, but only when explicit confirmation was given, data
 * confidence is HIGH, and the daily-limit/dedup rules pass — otherwise it
 * safely falls back to a DRAFT so the opportunity isn't lost silently.
 */
export async function maybeSendAutoOutreach(projectId: string, confidenceLevel: DataConfidenceLevel) {
  const settings = await getSettings();
  if (settings.contactAutomationMode === "OFF") return;

  const existingPending = await prisma.outreachMessage.findFirst({
    where: { projectId, direction: "OUTBOUND", status: { in: ["DRAFT", "SENT"] } }
  });
  if (existingPending) return; // already prepared or sent — no duplicate drafts

  if (settings.contactAutomationMode === "DRAFT") {
    await createDraftOutreach(projectId);
    return;
  }

  // AUTO from here on.
  if (!settings.contactAutomationConfirmedAt) {
    await createDraftOutreach(projectId, "AUTO není potvrzeno v nastavení — zpráva připravena jako návrh.");
    return;
  }
  if (confidenceLevel !== "HIGH") {
    await createDraftOutreach(
      projectId,
      `AUTO odesílání zablokováno — kvalita dat je ${confidenceLevel}, ne HIGH. Zpráva připravena jako návrh ke schválení.`
    );
    return;
  }

  const check = await checkOutreachAllowed(projectId);
  const { body, subject } = await buildMessageBody(projectId);

  if (!check.allowed) {
    await prisma.outreachMessage.create({
      data: {
        projectId,
        direction: "OUTBOUND",
        mode: "AUTO",
        channel: "EMAIL",
        subject,
        body,
        status: "BLOCKED_RULES",
        blockedReason: check.reason
      }
    });
    return;
  }

  const contact = await prisma.contact.findUnique({ where: { projectId } });
  const result = await attemptEmailSend(contact!.email!, subject, body);

  const message = await prisma.outreachMessage.create({
    data: {
      projectId,
      direction: "OUTBOUND",
      mode: "AUTO",
      channel: "EMAIL",
      subject,
      body,
      status: result.status,
      blockedReason: result.status === "SENT" ? null : result.reason,
      sentAt: result.status === "SENT" ? new Date() : null
    }
  });

  if (result.status === "SENT") {
    await prisma.contact.update({
      where: { projectId },
      data: { status: "ODESLANO", lastContactedAt: new Date() }
    });
  } else {
    await prisma.contact.upsert({
      where: { projectId },
      update: { status: "ZPRAVA_PRIPRAVENA" },
      create: { projectId, status: "ZPRAVA_PRIPRAVENA" }
    });
  }

  return message;
}

export function computeProjectConfidence(project: {
  fieldMeta: string | null;
}, comparablesCount: number, hasRealBudgetItems: boolean, renovationCostSet: boolean, salePriceSet: boolean) {
  const fieldMeta: FieldMeta = project.fieldMeta ? JSON.parse(project.fieldMeta) : {};
  return computeDataConfidence({ fieldMeta, comparablesCount, hasRealBudgetItems, renovationCostSet, salePriceSet });
}
