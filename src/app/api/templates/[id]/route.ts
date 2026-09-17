import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });
  const data: Record<string, any> = {};
  if ("name" in body) data.name = body.name;
  if ("body" in body) data.body = body.body;
  const template = await prisma.messageTemplate.update({ where: { id: params.id }, data });
  return NextResponse.json(template);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const template = await prisma.messageTemplate.findUnique({ where: { id: params.id } });
  if (template?.isDefault) {
    return NextResponse.json({ error: "Výchozí šablonu nelze smazat." }, { status: 400 });
  }
  await prisma.messageTemplate.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
