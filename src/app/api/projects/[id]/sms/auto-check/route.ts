import { NextRequest, NextResponse } from "next/server";
import { checkAutoSmsAllowed, maybeSendAutoSms } from "@/lib/smsHub";

// Diagnostic endpoint: evaluate (GET) or run (POST) the AUTO SMS gate for a
// project on demand, instead of waiting for the next Deal Radar run. Every
// check it performs is still fully audit-logged — this is not a bypass of
// the rules, just a manual trigger point for the same pipeline.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const result = await checkAutoSmsAllowed(params.id);
  return NextResponse.json(result);
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  await maybeSendAutoSms(params.id);
  return NextResponse.json({ ok: true });
}
