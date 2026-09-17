import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOutreachMessage, markOutreachSentManually } from "@/lib/outreach";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; messageId: string } }
) {
  const body = await req.json().catch(() => ({}));

  if (body.action === "send") {
    const updated = await sendOutreachMessage(params.messageId);
    return NextResponse.json(updated);
  }
  if (body.action === "mark-sent-manually") {
    const updated = await markOutreachSentManually(params.messageId);
    return NextResponse.json(updated);
  }

  const data: Record<string, any> = {};
  if ("subject" in body) data.subject = body.subject;
  if ("body" in body) data.body = body.body;
  const message = await prisma.outreachMessage.findUnique({ where: { id: params.messageId } });
  if (message?.status !== "DRAFT" && (data.subject !== undefined || data.body !== undefined)) {
    return NextResponse.json({ error: "Lze upravovat pouze zprávy ve stavu DRAFT." }, { status: 400 });
  }
  const updated = await prisma.outreachMessage.update({ where: { id: params.messageId }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; messageId: string } }
) {
  await prisma.outreachMessage.delete({ where: { id: params.messageId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
