import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function computeTotal(body: any, existing: any): number | null {
  if ("total" in body) return body.total === null || body.total === "" ? null : Number(body.total);
  const qty = body.quantity ?? existing.quantity ?? 1;
  const unitPrice = body.unitPrice ?? existing.unitPrice ?? 0;
  const labor = body.laborEstimate ?? existing.laborEstimate ?? 0;
  const material = body.materialEstimate ?? existing.materialEstimate ?? 0;
  if (!unitPrice && !labor && !material) return existing.total ?? null;
  return Number(qty || 1) * Number(unitPrice || 0) + Number(labor || 0) + Number(material || 0);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const existing = await prisma.budgetItem.findUnique({ where: { id: params.itemId } });
  if (!existing) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });

  const data: Record<string, any> = {};
  for (const key of ["room", "category", "name", "unit", "priceSource", "productUrl", "shop"]) {
    if (key in body) data[key] = body[key] || null;
  }
  for (const key of ["quantity", "unitPrice", "laborEstimate", "materialEstimate"]) {
    if (key in body) data[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);
  }
  data.total = computeTotal(body, existing);
  if (data.priceSource === "EXACT" && !existing.verifiedAt) data.verifiedAt = new Date();

  const item = await prisma.budgetItem.update({ where: { id: params.itemId }, data });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  await prisma.budgetItem.delete({ where: { id: params.itemId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
