import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const NUMERIC_FIELDS = [
  "purchasePriceUsed",
  "saleConservative",
  "saleBase",
  "saleOptimistic",
  "renovationCost",
  "furnishingCost",
  "legalCosts",
  "financingCost",
  "otherCosts",
  "reserve",
  "minProfit",
  "minMarginPct",
  "minRoiPct",
  "incomeTaxPct",
  "bandWidthPct"
];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const data: Record<string, any> = {};
  for (const key of NUMERIC_FIELDS) {
    if (key in body) data[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);
  }

  const assumptions = await prisma.assumptions.upsert({
    where: { projectId: params.id },
    update: data,
    create: { projectId: params.id, ...data }
  });

  return NextResponse.json(assumptions);
}
