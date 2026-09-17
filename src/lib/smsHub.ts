// SMS Hub orchestration: the single place that decides whether an SMS may
// be sent, logs every decision (including why a send was refused), and
// talks to the provider layer. Nothing here ever invents a phone number,
// silently upgrades a DEMO contact to a real send, or reports a status
// stronger than what actually happened.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { computeDataConfidence, type DataConfidenceResult } from "@/lib/confidence";
import { computeBands, classifyPrice, type AssumptionsInput } from "@/lib/calc";
import { mockSmsProvider } from "@/lib/sms/mockProvider";
import { realSmsProvider } from "@/lib/sms/realProvider";
import type { FieldMeta, SmsClassification, SmsProviderKey, SmsStatus } from "@/lib/types";

export const DEFAULT_SMS_TEMPLATE_BODY =
  "Dobrý den, mám vážný zájem o nabízenou nemovitost a rád bych se domluvil na prohlídce. Jaké jsou prosím nejbližší možné termíny? Děkuji, Šimon Džiuban.";

// ---------------------------------------------------------------------------
// Phone helpers
// ---------------------------------------------------------------------------

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00420")) digits = `+420${digits.slice(5)}`;
  else if (digits.startsWith("420") && digits.length > 9) digits = `+${digits}`;
  else if (!digits.startsWith("+") && digits.length === 9) digits = `+420${digits}`;
  return digits;
}

export function looksLikePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  return /^\+\d{9,15}$/.test(normalized);
}

// ---------------------------------------------------------------------------
// Default template
// ---------------------------------------------------------------------------

export async function getDefaultSmsTemplate() {
  const existing = await prisma.messageTemplate.findFirst({ where: { isDefault: true, channel: "SMS" } });
  if (existing) return existing;
  return prisma.messageTemplate.create({
    data: { name: "Žádost o prohlídku SMS (výchozí)", body: DEFAULT_SMS_TEMPLATE_BODY, channel: "SMS", isDefault: true }
  });
}

async function buildIntroSmsBody(): Promise<string> {
  const template = await getDefaultSmsTemplate();
  return template.body;
}

// ---------------------------------------------------------------------------
// Blacklist
// ---------------------------------------------------------------------------

export async function isBlacklisted(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const entry = await prisma.smsBlacklist.findUnique({ where: { phone: normalized } });
  return Boolean(entry);
}

export async function addToBlacklist(phone: string, reason?: string) {
  const normalized = normalizePhone(phone);
  return prisma.smsBlacklist.upsert({
    where: { phone: normalized },
    update: { reason: reason ?? null },
    create: { phone: normalized, reason: reason ?? null }
  });
}

export async function removeFromBlacklist(phone: string) {
  const normalized = normalizePhone(phone);
  await prisma.smsBlacklist.delete({ where: { phone: normalized } }).catch(() => null);
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function logAudit(
  projectId: string | null,
  phone: string | null,
  step: string,
  result: "PASS" | "FAIL" | "INFO",
  detail?: string
) {
  await prisma.smsAuditLog.create({
    data: { projectId, phone, step, result, detail: detail ?? null }
  });
}

// ---------------------------------------------------------------------------
// Deal Radar criteria (reuses the exact same math as Flip Score bands)
// ---------------------------------------------------------------------------

export function passesDealRadarCriteria(
  askingPrice: number | null,
  assumptions: AssumptionsInput | null | undefined
): boolean {
  if (askingPrice === null || !assumptions || assumptions.saleConservative === null) return false;
  const bands = computeBands(assumptions);
  const band = classifyPrice(askingPrice, bands);
  return band === "GOOD" || band === "BUY_NOW";
}

// ---------------------------------------------------------------------------
// Data confidence for a project (self-contained DB read)
// ---------------------------------------------------------------------------

export async function computeConfidenceForProject(projectId: string): Promise<DataConfidenceResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      comparables: true,
      budgetItems: true,
      assumptions: true
    }
  });
  const fieldMeta: FieldMeta = project?.fieldMeta ? JSON.parse(project.fieldMeta) : {};
  return computeDataConfidence({
    fieldMeta,
    comparablesCount: project?.comparables.length ?? 0,
    hasRealBudgetItems: (project?.budgetItems.length ?? 0) > 0,
    renovationCostSet: Boolean(project?.assumptions?.renovationCost && project.assumptions.renovationCost > 0),
    salePriceSet: Boolean(project?.assumptions?.saleBase)
  });
}

// ---------------------------------------------------------------------------
// Provider dispatch — the DEMO/REAL firewall lives here
// ---------------------------------------------------------------------------

interface SendAttemptResult {
  status: SmsStatus;
  provider: SmsProviderKey;
  providerMessageId?: string;
  reason?: string;
}

async function attemptProviderSend(isDemoProject: boolean, phone: string, body: string): Promise<SendAttemptResult> {
  // A DEMO project's contact is never real — it must never reach a real
  // provider, no matter how REAL_SMS is configured.
  if (isDemoProject) {
    const result = await mockSmsProvider.send(phone, body);
    return {
      status: result.status,
      provider: "MOCK_SMS",
      providerMessageId: result.providerMessageId,
      reason: result.reason
    };
  }
  if (!realSmsProvider.isConfigured()) {
    return {
      status: "FAILED",
      provider: "REAL_SMS",
      reason:
        "Skutečný SMS provider není nakonfigurován (chybí SMS_API_URL/SMS_API_KEY/SMS_SENDER_ID v .env) — SMS nebyla odeslána."
    };
  }
  const result = await realSmsProvider.send(phone, body);
  return {
    status: result.status,
    provider: "REAL_SMS",
    providerMessageId: result.providerMessageId,
    reason: result.reason
  };
}

// ---------------------------------------------------------------------------
// Draft creation
// ---------------------------------------------------------------------------

export async function createDraftSms(
  projectId: string,
  opts?: { kind?: "INTRO" | "REPLY"; body?: string; blockedNote?: string }
) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { contact: true } });
  if (!project) throw new Error("Projekt nenalezen.");

  const phone = project.contact?.phone ? normalizePhone(project.contact.phone) : "";
  const body = opts?.body ?? (await buildIntroSmsBody());

  const message = await prisma.smsMessage.create({
    data: {
      projectId,
      contactId: project.contact?.id ?? null,
      direction: "OUTBOUND",
      kind: opts?.kind ?? "INTRO",
      mode: "DRAFT",
      phone,
      body,
      status: "DRAFT",
      provider: project.isDemo ? "MOCK_SMS" : "REAL_SMS",
      isDemo: project.isDemo,
      blockedReason: opts?.blockedNote ?? null
    }
  });

  await prisma.contact.upsert({
    where: { projectId },
    update: { status: project.contact?.status === "NEKONTAKTOVANO" ? "ZPRAVA_PRIPRAVENA" : undefined },
    create: { projectId, status: "ZPRAVA_PRIPRAVENA" }
  });

  await logAudit(projectId, phone || null, "DRAFT_CREATED", "INFO", opts?.blockedNote ?? "SMS připravena jako návrh.");

  return message;
}

// ---------------------------------------------------------------------------
// Manual send (DRAFT approval) — safety rules apply here too, not just AUTO
// ---------------------------------------------------------------------------

export interface ManualSendCheck {
  allowed: boolean;
  reason?: string;
}

async function checkManualSendAllowed(projectId: string, phone: string, kind: "INTRO" | "REPLY", excludeMessageId?: string): Promise<ManualSendCheck> {
  if (!looksLikePhone(phone)) {
    await logAudit(projectId, phone || null, "PHONE_CHECK", "FAIL", "Telefonní číslo chybí nebo nevypadá jako platné číslo.");
    return { allowed: false, reason: "Chybí platné telefonní číslo." };
  }
  await logAudit(projectId, phone, "PHONE_CHECK", "PASS", `Telefon ${phone}.`);

  if (await isBlacklisted(phone)) {
    await logAudit(projectId, phone, "BLACKLIST_CHECK", "FAIL", "Číslo je na blacklistu (NEKONTAKTOVAT).");
    return { allowed: false, reason: "Telefonní číslo je na blacklistu (NEKONTAKTOVAT)." };
  }
  await logAudit(projectId, phone, "BLACKLIST_CHECK", "PASS", "Číslo není na blacklistu.");

  if (kind === "INTRO") {
    const dup = await prisma.smsMessage.findFirst({
      where: {
        projectId,
        phone,
        kind: "INTRO",
        direction: "OUTBOUND",
        status: { in: ["QUEUED", "SENT", "DELIVERED"] },
        ...(excludeMessageId ? { id: { not: excludeMessageId } } : {})
      }
    });
    if (dup) {
      await logAudit(projectId, phone, "DUPLICATE_CHECK", "FAIL", "Úvodní SMS na toto číslo k této nemovitosti už byla odeslána.");
      return { allowed: false, reason: "Úvodní SMS už byla na toto číslo odeslána (ochrana proti duplicitě)." };
    }
  }
  await logAudit(projectId, phone, "DUPLICATE_CHECK", "PASS", "Žádná dřívější úvodní SMS na toto číslo k této nemovitosti.");

  const settings = await getSettings();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await prisma.smsMessage.count({
    where: { direction: "OUTBOUND", status: { in: ["QUEUED", "SENT", "DELIVERED"] }, createdAt: { gte: startOfDay } }
  });
  if (sentToday >= settings.maxAutoSmsPerDay) {
    await logAudit(projectId, phone, "DAILY_LIMIT_CHECK", "FAIL", `Dnes odesláno ${sentToday}/${settings.maxAutoSmsPerDay} SMS.`);
    return { allowed: false, reason: `Vyčerpán denní limit SMS (${settings.maxAutoSmsPerDay}/den).` };
  }
  await logAudit(projectId, phone, "DAILY_LIMIT_CHECK", "PASS", `Dnes odesláno ${sentToday}/${settings.maxAutoSmsPerDay} SMS.`);

  return { allowed: true };
}

/** User-initiated: approve a DRAFT and attempt to actually send it. */
export async function sendSms(smsMessageId: string) {
  const message = await prisma.smsMessage.findUnique({ where: { id: smsMessageId } });
  if (!message) throw new Error("Zpráva nenalezena.");
  if (!message.projectId) throw new Error("Zprávu bez přiřazené nemovitosti nelze odeslat — nejprve ji přiřaďte.");

  const project = await prisma.project.findUnique({ where: { id: message.projectId } });
  if (!project) throw new Error("Projekt nenalezen.");

  const phone = normalizePhone(message.phone);
  const check = await checkManualSendAllowed(message.projectId, phone, message.kind as "INTRO" | "REPLY", smsMessageId);
  if (!check.allowed) {
    return prisma.smsMessage.update({
      where: { id: smsMessageId },
      data: { status: "FAILED", blockedReason: check.reason }
    });
  }

  const result = await attemptProviderSend(project.isDemo, phone, message.body);
  await logAudit(
    message.projectId,
    phone,
    "PROVIDER_RESULT",
    result.status === "FAILED" ? "FAIL" : "PASS",
    result.reason ?? `Provider ${result.provider} přijal zprávu (${result.status}).`
  );

  const now = new Date();
  const updated = await prisma.smsMessage.update({
    where: { id: smsMessageId },
    data: {
      status: result.status,
      provider: result.provider,
      isDemo: project.isDemo,
      providerMessageId: result.providerMessageId ?? null,
      blockedReason: result.status === "FAILED" ? (result.reason ?? "Odeslání selhalo.") : null,
      queuedAt: result.status === "QUEUED" ? now : null,
      sentAt: result.status === "SENT" ? now : null
    }
  });

  if (result.status !== "FAILED") {
    await prisma.contact.upsert({
      where: { projectId: message.projectId },
      update: { status: "ODESLANO", lastContactedAt: now },
      create: { projectId: message.projectId, status: "ODESLANO", lastContactedAt: now }
    });
  }

  return updated;
}

/** User asserts they sent the message themselves (e.g. by phone directly). */
export async function markSmsSentManually(smsMessageId: string) {
  const message = await prisma.smsMessage.update({
    where: { id: smsMessageId },
    data: { status: "SENT", sentAt: new Date(), blockedReason: null }
  });
  if (message.projectId) {
    await prisma.contact.upsert({
      where: { projectId: message.projectId },
      update: { status: "ODESLANO", lastContactedAt: new Date() },
      create: { projectId: message.projectId, status: "ODESLANO", lastContactedAt: new Date() }
    });
  }
  return message;
}

// ---------------------------------------------------------------------------
// AUTO gate — every one of the spec's required checks, in order, fully
// audited, short-circuiting on the first failure (which becomes the
// recorded reason the SMS was NOT sent).
// ---------------------------------------------------------------------------

export interface SmsRuleStep {
  step: string;
  result: "PASS" | "FAIL" | "INFO";
  detail?: string;
}

export interface AutoSmsGateResult {
  allowed: boolean;
  reason?: string;
  steps: SmsRuleStep[];
}

export async function checkAutoSmsAllowed(projectId: string): Promise<AutoSmsGateResult> {
  const steps: SmsRuleStep[] = [];
  const record = async (step: string, result: "PASS" | "FAIL" | "INFO", detail: string, phone?: string | null) => {
    steps.push({ step, result, detail });
    await logAudit(projectId, phone ?? null, step, result, detail);
  };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assumptions: true, contact: true }
  });
  if (!project) {
    await record("PROJECT_LOOKUP", "FAIL", "Projekt nenalezen.");
    return { allowed: false, reason: "Projekt nenalezen.", steps };
  }

  // 1. Deal Radar criteria
  const radarPass = passesDealRadarCriteria(project.askingPrice, project.assumptions as AssumptionsInput | null);
  await record(
    "DEAL_RADAR_CHECK",
    radarPass ? "PASS" : "FAIL",
    radarPass
      ? "Nabídka splňuje matematická kritéria Deal Radaru (cenové pásmo DOBRÁ / KUPUJ HNED)."
      : "Nabídka nesplňuje matematická kritéria Deal Radaru — chybí prodejní cena nebo cena není v dobrém pásmu."
  );
  if (!radarPass) return { allowed: false, reason: steps[steps.length - 1].detail, steps };

  // 2 + 3. Phone exists in source data and is not a guess
  const rawPhone = project.contact?.phone ?? null;
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const phoneOk = Boolean(phone) && looksLikePhone(phone);
  await record(
    "PHONE_CHECK",
    phoneOk ? "PASS" : "FAIL",
    phoneOk
      ? `Telefon ${phone} je uveden ve zdrojových datech kontaktu (nikdy neodhadován).`
      : "Chybí ověřené telefonní číslo kontaktu — SMS se nikdy neposílá na vymyšlené/odhadnuté číslo.",
    phone
  );
  if (!phoneOk) return { allowed: false, reason: steps[steps.length - 1].detail, steps };

  // 4. Data confidence HIGH
  const confidence = await computeConfidenceForProject(projectId);
  const confidenceOk = confidence.level === "HIGH";
  await record(
    "CONFIDENCE_CHECK",
    confidenceOk ? "PASS" : "FAIL",
    `Data confidence = ${confidence.level}${confidenceOk ? "" : " (vyžadováno HIGH)"}.`,
    phone
  );
  if (!confidenceOk) return { allowed: false, reason: steps[steps.length - 1].detail, steps };

  // 5. Not a DEMO listing
  const demoOk = !project.isDemo;
  await record(
    "DEMO_CHECK",
    demoOk ? "PASS" : "FAIL",
    demoOk ? "Nemovitost není DEMO." : "Nemovitost je DEMO — AUTO SMS se na DEMO data nikdy neodesílá.",
    phone
  );
  if (!demoOk) return { allowed: false, reason: steps[steps.length - 1].detail, steps };

  // 6. Duplicate intro protection
  const alreadySent = await prisma.smsMessage.findFirst({
    where: { projectId, phone: phone!, kind: "INTRO", direction: "OUTBOUND", status: { in: ["QUEUED", "SENT", "DELIVERED"] } }
  });
  const dedupOk = !alreadySent;
  await record(
    "DUPLICATE_CHECK",
    dedupOk ? "PASS" : "FAIL",
    dedupOk ? "Úvodní SMS na toto číslo k této nemovitosti ještě nebyla odeslána." : "Úvodní SMS už byla odeslána (ochrana proti duplicitě).",
    phone
  );
  if (!dedupOk) return { allowed: false, reason: steps[steps.length - 1].detail, steps };

  // 7. Daily limit
  const settings = await getSettings();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await prisma.smsMessage.count({
    where: { direction: "OUTBOUND", status: { in: ["QUEUED", "SENT", "DELIVERED"] }, createdAt: { gte: startOfDay } }
  });
  const limitOk = sentToday < settings.maxAutoSmsPerDay;
  await record(
    "DAILY_LIMIT_CHECK",
    limitOk ? "PASS" : "FAIL",
    `Dnes odesláno ${sentToday}/${settings.maxAutoSmsPerDay} automatických SMS.`,
    phone
  );
  if (!limitOk) return { allowed: false, reason: steps[steps.length - 1].detail, steps };

  // 8. Blacklist
  const blacklisted = await isBlacklisted(phone!);
  await record(
    "BLACKLIST_CHECK",
    blacklisted ? "FAIL" : "PASS",
    blacklisted ? "Číslo je na blacklistu (NEKONTAKTOVAT)." : "Číslo není na blacklistu.",
    phone
  );
  if (blacklisted) return { allowed: false, reason: steps[steps.length - 1].detail, steps };

  // 9. AUTO mode explicitly active and confirmed
  const modeOk = settings.smsAutomationMode === "AUTO" && Boolean(settings.smsAutomationConfirmedAt);
  await record(
    "MODE_CHECK",
    modeOk ? "PASS" : "FAIL",
    modeOk ? "Režim SMS automatizace = AUTO a je potvrzený." : `Režim SMS automatizace = ${settings.smsAutomationMode} (AUTO není aktivní/potvrzené).`,
    phone
  );
  if (!modeOk) return { allowed: false, reason: steps[steps.length - 1].detail, steps };

  return { allowed: true, steps };
}

/**
 * Called by the Deal Radar pipeline after a qualifying alert. Mirrors the
 * e-mail outreach pattern: OFF does nothing, DRAFT prepares a message for
 * approval, AUTO runs the full gate above and only truly sends when every
 * rule passes — otherwise it safely falls back to a DRAFT with the exact
 * reason recorded.
 */
export async function maybeSendAutoSms(projectId: string) {
  const settings = await getSettings();
  if (settings.smsAutomationMode === "OFF") return;

  const existingPending = await prisma.smsMessage.findFirst({
    where: { projectId, direction: "OUTBOUND", kind: "INTRO", status: { in: ["DRAFT", "QUEUED", "SENT", "DELIVERED"] } }
  });
  if (existingPending) return;

  if (settings.smsAutomationMode === "DRAFT") {
    await createDraftSms(projectId);
    return;
  }

  const gate = await checkAutoSmsAllowed(projectId);
  if (!gate.allowed) {
    await createDraftSms(projectId, { blockedNote: `AUTO odesílání zablokováno: ${gate.reason}` });
    return;
  }

  const draft = await createDraftSms(projectId, { blockedNote: undefined });
  await prisma.smsMessage.update({ where: { id: draft.id }, data: { mode: "AUTO" } });
  await sendSms(draft.id);
}

// ---------------------------------------------------------------------------
// Deterministic inbound classification (no AI — explicit rules only)
// ---------------------------------------------------------------------------

const MONTHS_CZ = 12;

export function parseSuggestedDateTime(body: string): { raw: string | null; date: Date | null } {
  const dateMatch = body.match(/\b(\d{1,2})\s?\.\s?(\d{1,2})\s?\.(?:\s?(\d{4}))?/);
  if (!dateMatch) return { raw: null, date: null };

  const day = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();
  if (month < 1 || month > MONTHS_CZ || day < 1 || day > 31) return { raw: null, date: null };

  const afterDate = body.slice((dateMatch.index ?? 0) + dateMatch[0].length, (dateMatch.index ?? 0) + dateMatch[0].length + 15);
  const timeMatch = afterDate.match(/(\d{1,2})[:.](\d{2})/);
  let hour = 12;
  let minute = 0;
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = parseInt(timeMatch[2], 10);
    if (hour > 23 || minute > 59) {
      hour = 12;
      minute = 0;
    }
  }

  const date = new Date(year, month - 1, day, hour, minute);
  // Keep the raw snippet limited to the matched date (and time, if any) —
  // no surrounding context — so it never cuts a neighboring word in half.
  const raw = timeMatch ? `${dateMatch[0].trim()} v ${timeMatch[0]}` : dateMatch[0].trim();

  return { raw, date };
}

// Many real SMS are typed without diacritics (Czech phone keyboards make
// accented text cost more segments), so classification must not depend on
// them. This strips diacritics for matching only — the stored body keeps
// whatever the sender actually wrote.
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function classifyInbound(body: string): SmsClassification {
  const t = stripDiacritics(body.toLowerCase());

  if (/\bprodano\b|\b(uz|jiz)\s+(je\s+)?prodan\w*|prodali jsme|nemovitost\s+(byla\s+|je\s+)?prodan\w*/.test(t)) {
    return "NEMOVITOST_PRODANA";
  }
  if (/\bnemam\w*(\s+\w+){0,2}\s+zajem\b|\bnemame\w*(\s+\w+){0,2}\s+zajem\b|bez zajmu|\bnezajem\b/.test(t)) {
    return "NEMA_ZAJEM";
  }
  if (parseSuggestedDateTime(body).date) {
    return "NABIZI_PROHLIDKU";
  }
  if (/\b(zavolejte|zavolej|radsi zavolam|muzete (mi )?zavolat|zavolam vam|radeji telefonicky)\b/.test(t)) {
    return "CHCE_ZAVOLAT";
  }
  if (/\b(dalsi informace|vic informaci|vice informaci|podrobnosti|poslete prosim|potreboval(a)? bych vedet)\b/.test(t)) {
    return "CHCE_DALSI_INFORMACE";
  }
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Inbound matching — never guesses when ambiguous
// ---------------------------------------------------------------------------

async function matchProjectForPhone(phone: string): Promise<{ projectId: string | null; contactId: string | null }> {
  const priorOutbound = await prisma.smsMessage.findMany({
    where: { direction: "OUTBOUND", phone, projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"]
  });
  const distinctProjectIds = Array.from(new Set(priorOutbound.map((m) => m.projectId).filter(Boolean))) as string[];

  if (distinctProjectIds.length === 1) {
    const contact = await prisma.contact.findUnique({ where: { projectId: distinctProjectIds[0] } });
    return { projectId: distinctProjectIds[0], contactId: contact?.id ?? null };
  }
  if (distinctProjectIds.length > 1) return { projectId: null, contactId: null }; // ambiguous — never guess

  const contacts = await prisma.contact.findMany({ where: { phone } });
  if (contacts.length === 1) {
    return { projectId: contacts[0].projectId, contactId: contacts[0].id };
  }
  return { projectId: null, contactId: null }; // none or ambiguous
}

export interface InboundSmsPayload {
  from: string;
  body: string;
  providerMessageId?: string;
  provider?: SmsProviderKey;
}

export async function receiveInboundSms(payload: InboundSmsPayload) {
  const phone = normalizePhone(payload.from);
  const { projectId, contactId } = await matchProjectForPhone(phone);
  const classification = classifyInbound(payload.body);
  const suggested = parseSuggestedDateTime(payload.body);

  const message = await prisma.smsMessage.create({
    data: {
      projectId,
      contactId,
      direction: "INBOUND",
      kind: "REPLY",
      phone,
      body: payload.body,
      status: "RECEIVED",
      provider: payload.provider ?? "REAL_SMS",
      isDemo: false,
      providerMessageId: payload.providerMessageId ?? null,
      classification,
      suggestedDateTimeRaw: suggested.raw,
      suggestedDateTime: suggested.date
    }
  });

  await logAudit(
    projectId,
    phone,
    "INBOUND_RECEIVED",
    "INFO",
    projectId
      ? `Příchozí SMS přiřazena k projektu (klasifikace: ${classification}).`
      : "Příchozí SMS nešlo bezpečně přiřadit — čeká v Nepřiřazených SMS."
  );

  if (projectId) {
    await prisma.contact.upsert({
      where: { projectId },
      update: { status: "ODPOVEDEL" },
      create: { projectId, status: "ODPOVEDEL" }
    });
  }

  return message;
}

export async function assignSmsToProject(smsMessageId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { contact: true } });
  if (!project) throw new Error("Projekt nenalezen.");

  const message = await prisma.smsMessage.update({
    where: { id: smsMessageId },
    data: { projectId, contactId: project.contact?.id ?? null }
  });

  await logAudit(projectId, message.phone, "MANUAL_ASSIGN", "INFO", "SMS ručně přiřazena k nemovitosti.");

  await prisma.contact.upsert({
    where: { projectId },
    update: { status: "ODPOVEDEL" },
    create: { projectId, status: "ODPOVEDEL" }
  });

  return message;
}

// ---------------------------------------------------------------------------
// Reply drafting (section 11) — always DRAFT-first unless auto-reply is
// explicitly enabled, and even then this app never auto-confirms a viewing
// time on your behalf; it only prepares text for you to approve.
// ---------------------------------------------------------------------------

export async function createReplyDraft(originalSmsId: string, kind: "CONFIRM" | "ALTERNATIVE" | "BLANK") {
  const original = await prisma.smsMessage.findUnique({ where: { id: originalSmsId } });
  if (!original) throw new Error("Zpráva nenalezena.");
  if (!original.projectId) throw new Error("SMS není přiřazena k nemovitosti — nejprve ji přiřaďte.");

  let body: string;
  if (kind === "CONFIRM" && original.suggestedDateTimeRaw) {
    body = `Dobrý den, termín ${original.suggestedDateTimeRaw} mi vyhovuje, potvrzuji prohlídku. Děkuji.`;
  } else if (kind === "ALTERNATIVE") {
    body = "Dobrý den, bohužel navržený termín mi nevyhovuje. Byl by možný jiný termín? Děkuji.";
  } else {
    body = "";
  }

  return createDraftSms(original.projectId, { kind: "REPLY", body });
}
