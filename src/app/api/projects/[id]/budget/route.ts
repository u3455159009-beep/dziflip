import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function computeTotal(body: any): number | null {
  if (body.total != null && body.total !== "") return Number(body.total);
  const qty = body.quantity != null ? Number(body.quantity) : 1;
  const unitPrice = body.unitPrice != null ? Number(body.unitPrice) : 0;
  const labor = body.laborEstimate != null ? Number(body.laborEstimate) : 0;
  const material = body.materialEstimate != null ? Number(body.materialEstimate) : 0;
  if (!unitPrice && !labor && !material) return null;
  return qty * unitPrice + labor + material;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body || !body.name || !body.category) {
    return NextResponse.json({ error: "Chybí název nebo kategorie položky." }, { status: 400 });
  }

  const item = await prisma.budgetItem.create({
    data: {
      projectId: params.id,
      room: body.room || null,
      category: body.category,
      name: body.name,
      quantity: body.quantity != null ? Number(body.quantity) : null,
      unit: body.unit || null,
      unitPrice: body.unitPrice != null ? Number(body.unitPrice) : null,
      laborEstimate: body.laborEstimate != null ? Number(body.laborEstimate) : null,
      materialEstimate: body.materialEstimate != null ? Number(body.materialEstimate) : null,
      total: computeTotal(body),
      priceSource: body.priceSource || "ESTIMATE",
      productUrl: body.productUrl || null,
      shop: body.shop || null,
      verifiedAt: body.priceSource === "EXACT" ? new Date() : null
    }
  });

  return NextResponse.json(item);
}
