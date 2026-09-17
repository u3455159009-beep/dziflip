import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const history = await prisma.priceHistory.findMany({
    where: { projectId: params.id },
    orderBy: { recordedAt: "asc" }
  });
  return NextResponse.json(history);
}

// Manual price update — e.g. after a phone call with the agent revealed a
// new asking price. Updates the project's askingPrice/pricePerM2 too, so
// every downstream economics calculation (which reads live from the
// project + assumptions) reflects it immediately.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const price = Number(body?.price);
  if (!Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "Neplatná cena." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });

  await prisma.priceHistory.create({ data: { projectId: params.id, price, source: "MANUAL" } });

  const pricePerM2 = project.areaM2 ? price / project.areaM2 : null;
  await prisma.project.update({ where: { id: params.id }, data: { askingPrice: price, pricePerM2 } });

  const assumptions = await prisma.assumptions.findUnique({ where: { projectId: params.id } });
  if (assumptions && assumptions.purchasePriceUsed === project.askingPrice) {
    await prisma.assumptions.update({ where: { projectId: params.id }, data: { purchasePriceUsed: price } });
  }

  return NextResponse.json({ ok: true });
}
