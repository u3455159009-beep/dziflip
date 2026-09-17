import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const watchers = await prisma.watcher.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { projects: true, alerts: true } } }
  });
  return NextResponse.json(watchers);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "Chybí název hlídače." }, { status: 400 });

  const watcher = await prisma.watcher.create({
    data: {
      name: body.name,
      active: body.active ?? true,
      municipality: body.municipality || null,
      district: body.district || null,
      dispositions: body.dispositions || null,
      minAreaM2: numOrNull(body.minAreaM2),
      maxAreaM2: numOrNull(body.maxAreaM2),
      maxAskingPrice: numOrNull(body.maxAskingPrice),
      maxPricePerM2: numOrNull(body.maxPricePerM2),
      condition: body.condition || null,
      ownership: body.ownership || null,
      minProfit: numOrNull(body.minProfit),
      minRoiPct: numOrNull(body.minRoiPct),
      maxRenovationEstimate: numOrNull(body.maxRenovationEstimate),
      requiredReserve: numOrNull(body.requiredReserve),
      onlyNewListings: Boolean(body.onlyNewListings),
      trackPriceChanges: body.trackPriceChanges ?? true,
      sources: body.sources || "MOCK_DEMO"
    }
  });
  return NextResponse.json(watcher);
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
