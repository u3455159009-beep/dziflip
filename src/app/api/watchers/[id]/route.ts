import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const NUMERIC_FIELDS = [
  "minAreaM2",
  "maxAreaM2",
  "maxAskingPrice",
  "maxPricePerM2",
  "minProfit",
  "minRoiPct",
  "maxRenovationEstimate",
  "requiredReserve"
];
const STRING_FIELDS = ["name", "municipality", "district", "dispositions", "condition", "ownership", "sources"];
const BOOL_FIELDS = ["active", "onlyNewListings", "trackPriceChanges"];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const watcher = await prisma.watcher.findUnique({
    where: { id: params.id },
    include: {
      projects: { orderBy: { createdAt: "desc" }, take: 20, include: { photos: { take: 1 } } },
      alerts: { orderBy: { createdAt: "desc" }, take: 20 }
    }
  });
  if (!watcher) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  return NextResponse.json(watcher);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const data: Record<string, any> = {};
  for (const key of STRING_FIELDS) if (key in body) data[key] = body[key] || null;
  for (const key of BOOL_FIELDS) if (key in body) data[key] = Boolean(body[key]);
  for (const key of NUMERIC_FIELDS)
    if (key in body) data[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);

  const watcher = await prisma.watcher.update({ where: { id: params.id }, data });
  return NextResponse.json(watcher);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.watcher.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
