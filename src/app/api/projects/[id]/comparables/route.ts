import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
      priceType: body.priceType || "ASKING"
    }
  });

  return NextResponse.json(comparable);
}
