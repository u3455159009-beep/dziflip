import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROOM_TYPES, ROOM_CONDITION_ELEMENTS, ROOM_CONDITION_STATUSES } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body?.room || !body?.element) {
    return NextResponse.json({ error: "Chybí místnost nebo prvek." }, { status: 400 });
  }
  if (!ROOM_TYPES.includes(body.room)) return NextResponse.json({ error: "Neplatná místnost." }, { status: 400 });
  if (!ROOM_CONDITION_ELEMENTS.includes(body.element)) return NextResponse.json({ error: "Neplatný prvek." }, { status: 400 });
  const status = ROOM_CONDITION_STATUSES.includes(body.status) ? body.status : "UNKNOWN";

  const condition = await prisma.roomCondition.upsert({
    where: { projectId_room_element: { projectId: params.id, room: body.room, element: body.element } },
    update: { status, notes: body.notes || null, source: "MANUAL" },
    create: {
      projectId: params.id,
      room: body.room,
      element: body.element,
      status,
      notes: body.notes || null,
      source: "MANUAL"
    }
  });
  return NextResponse.json(condition);
}
