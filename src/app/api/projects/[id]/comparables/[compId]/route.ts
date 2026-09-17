import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; compId: string } }
) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const data: Record<string, any> = {};
  for (const key of [
    "title",
    "url",
    "portal",
    "locality",
    "disposition",
    "condition",
    "priceType"
  ]) {
    if (key in body) data[key] = body[key] || null;
  }
  for (const key of ["areaM2", "price", "pricePerM2", "distanceKm"]) {
    if (key in body) data[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);
  }
  if (data.price != null && data.areaM2 != null && !("pricePerM2" in body)) {
    data.pricePerM2 = data.price / data.areaM2;
  }

  const comparable = await prisma.comparable.update({
    where: { id: params.compId },
    data
  });
  return NextResponse.json(comparable);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; compId: string } }
) {
  await prisma.comparable.delete({ where: { id: params.compId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
