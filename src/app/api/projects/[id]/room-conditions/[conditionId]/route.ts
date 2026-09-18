import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROOM_CONDITION_STATUSES } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; conditionId: string } }
) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });
  const data: Record<string, any> = {};
  if ("status" in body && ROOM_CONDITION_STATUSES.includes(body.status)) data.status = body.status;
  if ("notes" in body) data.notes = body.notes || null;
  if (Object.keys(data).length > 0) data.source = "MANUAL";

  const condition = await prisma.roomCondition.update({ where: { id: params.conditionId }, data });
  return NextResponse.json(condition);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; conditionId: string } }
) {
  await prisma.roomCondition.delete({ where: { id: params.conditionId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
