import { NextRequest, NextResponse } from "next/server";
import { receiveInboundSms } from "@/lib/smsHub";

// Inbound SMS webhook — the future entry point for a real SMS provider's
// delivery/inbound callbacks. No signature verification scheme is wired in
// yet because no real provider is configured; once you pick one, add its
// specific verification here (most send a shared-secret header or HMAC).
// SMS_WEBHOOK_SECRET, if set, is checked as a simple bearer-style guard in
// the meantime.
export async function POST(req: NextRequest) {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Neplatný webhook secret." }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body?.from || typeof body.body !== "string") {
    return NextResponse.json({ error: "Chybí 'from' nebo 'body'." }, { status: 400 });
  }

  const message = await receiveInboundSms({
    from: body.from,
    body: body.body,
    providerMessageId: body.providerMessageId,
    provider: body.provider === "MOCK_SMS" ? "MOCK_SMS" : "REAL_SMS"
  });

  return NextResponse.json({ ok: true, id: message.id, assigned: Boolean(message.projectId) });
}
