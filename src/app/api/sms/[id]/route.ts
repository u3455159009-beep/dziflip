import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms, markSmsSentManually } from "@/lib/smsHub";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));

  if (body.action === "send") {
    const updated = await sendSms(params.id);
    return NextResponse.json(updated);
  }
  if (body.action === "mark-sent-manually") {
    const updated = await markSmsSentManually(params.id);
    return NextResponse.json(updated);
  }
  if (body.action === "mark-read") {
    const updated = await prisma.smsMessage.update({
      where: { id: params.id },
      data: { readAt: body.read === false ? null : new Date() }
    });
    return NextResponse.json(updated);
  }
  if (body.action === "classify") {
    const updated = await prisma.smsMessage.update({
      where: { id: params.id },
      data: { classification: body.classification }
    });
    return NextResponse.json(updated);
  }

  const data: Record<string, any> = {};
  const existing = await prisma.smsMessage.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  if (existing.status !== "DRAFT" && (body.body !== undefined)) {
    return NextResponse.json({ error: "Lze upravovat pouze zprávy ve stavu DRAFT." }, { status: 400 });
  }
  if ("body" in body) data.body = body.body;

  const updated = await prisma.smsMessage.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.smsMessage.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
