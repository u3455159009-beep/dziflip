// District/locality context (item 9) — only ever returns numbers FlatScan's
// own /districts or /localities endpoint actually reported. Returns
// `available: false` (never a fabricated value) when FlatScan isn't
// configured or has no data for this area.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFlatScanLocalityContext, computeLocalityDeviation } from "@/lib/sources/flatScan/localityContext";
import { isFlatScanConfigured } from "@/lib/sources/flatScan/client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!isFlatScanConfigured()) {
    return NextResponse.json({ available: false, reason: "FlatScan není připojen (chybí FLATSCAN_API_KEY)." });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });

  if (!project.municipality) {
    return NextResponse.json({ available: false, reason: "Nemovitost nemá určenou obec." });
  }

  const context = await getFlatScanLocalityContext(project.municipality, project.district).catch(() => null);
  if (!context || (context.medianPricePerM2 == null && context.avgPricePerM2 == null)) {
    return NextResponse.json({ available: false, reason: "FlatScan pro tuto lokalitu nemá data." });
  }

  const listingPricePerM2 = project.pricePerM2 ?? (project.askingPrice && project.areaM2 ? project.askingPrice / project.areaM2 : null);
  const referencePrice = context.medianPricePerM2 ?? context.avgPricePerM2;
  const deviation = listingPricePerM2 && referencePrice ? computeLocalityDeviation(listingPricePerM2, referencePrice) : null;

  return NextResponse.json({
    available: true,
    municipality: context.municipality,
    district: context.district,
    medianPricePerM2: context.medianPricePerM2,
    avgPricePerM2: context.avgPricePerM2,
    activeListingCount: context.activeListingCount,
    trendPct: context.trendPct,
    fetchedAt: context.fetchedAt.toISOString(),
    listingPricePerM2,
    deviation
  });
}
