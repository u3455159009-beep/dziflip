import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRODUCT_REQUIREMENT_STATUSES, SHOPPING_CATEGORIES } from "@/lib/types";
import { recomputeProjectEconomicsFromBudget, syncBudgetItemForRequirement } from "@/lib/productSearch";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });
  const data: Record<string, any> = {};
  if ("status" in body && PRODUCT_REQUIREMENT_STATUSES.includes(body.status)) data.status = body.status;
  if ("description" in body) data.description = body.description;
  if ("dimensions" in body) data.dimensions = body.dimensions || null;
  if ("shoppingCategory" in body && SHOPPING_CATEGORIES.includes(body.shoppingCategory)) data.shoppingCategory = body.shoppingCategory;
  if ("quantityNeeded" in body) data.quantityNeeded = body.quantityNeeded === "" || body.quantityNeeded === null ? null : Number(body.quantityNeeded);
  if ("quantityUnit" in body) data.quantityUnit = body.quantityUnit || null;
  if ("reservePct" in body) data.reservePct = body.reservePct === "" || body.reservePct === null ? 0.1 : Number(body.reservePct);
  if ("budgetMin" in body) data.budgetMin = body.budgetMin === "" || body.budgetMin === null ? null : Number(body.budgetMin);
  if ("budgetMax" in body) data.budgetMax = body.budgetMax === "" || body.budgetMax === null ? null : Number(body.budgetMax);

  const requirement = await prisma.productRequirement.update({ where: { id: params.reqId }, data });

  // Quantity/reserve edits can change an already-selected product's real
  // line total — keep the linked budget line and economics in sync.
  if ("quantityNeeded" in body || "reservePct" in body || "quantityUnit" in body || "shoppingCategory" in body) {
    await syncBudgetItemForRequirement(params.reqId);
    await recomputeProjectEconomicsFromBudget(params.id);
  }

  return NextResponse.json(requirement);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  await prisma.productRequirement.delete({ where: { id: params.reqId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
