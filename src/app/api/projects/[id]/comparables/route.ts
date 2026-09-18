import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rescoreComparable } from "@/lib/comparableScoring";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const price = body.price != null ? Number(body.price) : null;
  const areaM2 = body.areaM2 != null ? Number(body.areaM2) : null;
  const pricePerM2 =
    body.pricePerM2 != null
      ? Number(body.pricePerM2)
      : price && areaM2
        ? price / areaM2
        : null;

  const comparable = await prisma.comparable.create({
    data: {
      projectId: params.id,
      title: body.title || null,
      url: body.url || null,
      portal: body.portal || null,
      locality: body.locality || null,
      disposition: body.disposition || null,
      areaM2,
      price,
      pricePerM2,
      condition: body.condition || null,
      distanceKm: body.distanceKm != null ? Number(body.distanceKm) : null,
      priceType: body.priceType || "ASKING",
      ownership: body.ownership || null,
      floor: body.floor || null,
      totalFloors: body.totalFloors || null,
      elevator: body.elevator === "" || body.elevator === undefined ? null : Boolean(body.elevator),
      balcony: body.balcony === "" || body.balcony === undefined ? null : Boolean(body.balcony),
      terrace: body.terrace === "" || body.terrace === undefined ? null : Boolean(body.terrace),
      loggia: body.loggia === "" || body.loggia === undefined ? null : Boolean(body.loggia),
      parking: body.parking === "" || body.parking === undefined ? null : Boolean(body.parking),
      buildingType: body.buildingType || null,
      construction: body.construction || null
    }
  });

  const scored = await rescoreComparable(params.id, comparable.id);
  return NextResponse.json(scored ? { ...comparable, similarityScore: scored.score, similarityBreakdown: JSON.stringify(scored.breakdown), qualityTier: scored.qualityTier } : comparable);
}
