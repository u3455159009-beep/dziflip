import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRODUCT_REQUIREMENT_STATUSES } from "@/lib/types";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });
  const data: Record<string, any> = {};
  if ("status" in body && PRODUCT_REQUIREMENT_STATUSES.includes(body.status)) data.status = body.status;
  if ("description" in body) data.description = body.description;
  if ("dimensions" in body) data.dimensions = body.dimensions || null;

  const requirement = await prisma.productRequirement.update({ where: { id: params.reqId }, data });
  return NextResponse.json(requirement);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  await prisma.productRequirement.delete({ where: { id: params.reqId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
