import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SHOPPING_CATEGORIES } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body?.category || !body?.description) {
    return NextResponse.json({ error: "Chybí kategorie nebo popis." }, { status: 400 });
  }

  const requirement = await prisma.productRequirement.create({
    data: {
      projectId: params.id,
      room: body.room || null,
      category: body.category,
      shoppingCategory: SHOPPING_CATEGORIES.includes(body.shoppingCategory) ? body.shoppingCategory : "OSTATNI",
      description: body.description,
      budgetMin: body.budgetMin ? Number(body.budgetMin) : null,
      budgetMax: body.budgetMax ? Number(body.budgetMax) : null,
      dimensions: body.dimensions || null,
      style: body.style || null,
      quantity: body.quantity ? Math.max(1, Math.round(Number(body.quantity))) : 1,
      quantityNeeded: body.quantityNeeded !== undefined && body.quantityNeeded !== "" ? Number(body.quantityNeeded) : null,
      quantityUnit: body.quantityUnit || null,
      reservePct: body.reservePct !== undefined && body.reservePct !== "" ? Number(body.reservePct) : 0.1,
      status: body.status || "NEEDED"
    }
  });
  return NextResponse.json(requirement);
}
