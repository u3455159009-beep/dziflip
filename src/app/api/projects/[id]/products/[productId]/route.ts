import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputeProjectEconomicsFromBudget, syncBudgetItemForRequirement } from "@/lib/productSearch";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  const product = await prisma.product.findUnique({ where: { id: params.productId } });
  if (!product) return NextResponse.json({ ok: true });

  await prisma.product.delete({ where: { id: params.productId } }).catch(() => null);

  if (product.isSelected) {
    await syncBudgetItemForRequirement(product.productRequirementId);
    await recomputeProjectEconomicsFromBudget(params.id);
  }

  return NextResponse.json({ ok: true });
}
