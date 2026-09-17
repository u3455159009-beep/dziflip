import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; photoId: string } }
) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });
  const data: Record<string, any> = {};
  if ("room" in body) data.room = body.room || null;
  if ("notes" in body) data.notes = body.notes || null;
  const photo = await prisma.photo.update({ where: { id: params.photoId }, data });
  return NextResponse.json(photo);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; photoId: string } }
) {
  await prisma.photo.delete({ where: { id: params.photoId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
