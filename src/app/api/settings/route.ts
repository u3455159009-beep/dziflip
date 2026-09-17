import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

const NUMERIC_FIELDS = ["defaultMinProfit", "defaultMinRoiPct", "defaultReserve", "defaultRenovationCostPerM2"];
const INT_FIELDS = ["dailyContactLimit", "maxAutoSmsPerDay"];
const BOOL_FIELDS = ["notifyInApp", "notifyEmail", "smsAutoReplyEnabled"];
const STRING_FIELDS = ["notifyEmailAddress", "defaultTemplateId", "defaultSmsTemplateId"];

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const data: Record<string, any> = {};
  for (const key of STRING_FIELDS) if (key in body) data[key] = body[key] || null;
  for (const key of BOOL_FIELDS) if (key in body) data[key] = Boolean(body[key]);
  for (const key of NUMERIC_FIELDS)
    if (key in body) data[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);
  for (const key of INT_FIELDS)
    if (key in body) data[key] = body[key] === null || body[key] === "" ? null : Math.round(Number(body[key]));

  if ("preferredLocalities" in body) {
    data.preferredLocalities = Array.isArray(body.preferredLocalities)
      ? JSON.stringify(body.preferredLocalities)
      : body.preferredLocalities || null;
  }

  if ("contactAutomationMode" in body) {
    const current = await getSettings();
    const nextMode = body.contactAutomationMode;
    if (nextMode === "AUTO" && current.contactAutomationMode !== "AUTO") {
      if (body.confirmAuto !== true) {
        return NextResponse.json(
          {
            error:
              "Zapnutí režimu AUTO vyžaduje výslovné potvrzení. Odešlete požadavek s confirmAuto: true poté, co uživatel potvrdí nastavení."
          },
          { status: 400 }
        );
      }
      data.contactAutomationConfirmedAt = new Date();
    }
    data.contactAutomationMode = nextMode;
    // Confirmation is required only before the FIRST activation of AUTO
    // (per spec) — switching OFF/DRAFT and back to AUTO later reuses it.
  }

  if ("smsAutomationMode" in body) {
    const current = await getSettings();
    const nextMode = body.smsAutomationMode;
    if (nextMode === "AUTO" && current.smsAutomationMode !== "AUTO") {
      if (body.confirmSmsAuto !== true) {
        return NextResponse.json(
          {
            error:
              "Zapnutí SMS režimu AUTO vyžaduje výslovné potvrzení. Odešlete požadavek s confirmSmsAuto: true poté, co uživatel potvrdí nastavení."
          },
          { status: 400 }
        );
      }
      data.smsAutomationConfirmedAt = new Date();
    }
    data.smsAutomationMode = nextMode;
  }

  const settings = await updateSettings(data);
  return NextResponse.json(settings);
}
