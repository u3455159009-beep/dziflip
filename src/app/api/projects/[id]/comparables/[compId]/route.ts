import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rescoreComparable } from "@/lib/comparableScoring";

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
    "priceType",
    "ownership",
    "floor",
    "totalFloors",
    "buildingType",
    "construction"
  ]) {
    if (key in body) data[key] = body[key] || null;
  }
  for (const key of ["areaM2", "price", "pricePerM2", "distanceKm"]) {
    if (key in body) data[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);
  }
  for (const key of ["elevator", "balcony", "terrace", "loggia", "parking"]) {
    if (key in body) data[key] = body[key] === null || body[key] === "" ? null : Boolean(body[key]);
  }
  if (data.price != null && data.areaM2 != null && !("pricePerM2" in body)) {
    data.pricePerM2 = data.price / data.areaM2;
  }

  await prisma.comparable.update({
    where: { id: params.compId },
    data
  });
  await rescoreComparable(params.id, params.compId);
  const comparable = await prisma.comparable.findUnique({ where: { id: params.compId } });
  return NextResponse.json(comparable);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; compId: string } }
) {
  await prisma.comparable.delete({ where: { id: params.compId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
