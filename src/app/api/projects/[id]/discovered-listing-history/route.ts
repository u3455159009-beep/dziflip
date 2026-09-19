// Price history for the FlatScan-discovered original listing (item 8, item
// 3's "price history" field) — distinct from a comparable's price history.
// Only meaningful when the Listing Discovery Engine's best match for this
// project came from FlatScan; returns `available: false` otherwise. Never
// concludes "buy it" from a price drop — that stays the app's own math
// (calc.ts), never this endpoint or FlatScan's AI score.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFlatScanConfigured } from "@/lib/sources/flatScan/client";
import { getFlatScanPriceHistory, computePriceHistorySummary } from "@/lib/sources/flatScan/priceHistory";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });

  if (project.discoveredListingProvider !== "FLATSCAN" || !project.discoveredListingExternalId) {
    return NextResponse.json({ available: false, reason: "Původní inzerát nebyl nalezen přes FlatScan." });
  }
  if (!isFlatScanConfigured()) {
    return NextResponse.json({ available: false, reason: "FlatScan není připojen (chybí FLATSCAN_API_KEY)." });
  }

  const listingCache = await prisma.flatScanListingCache.findUnique({
    where: { flatScanId: project.discoveredListingExternalId }
  });
  if (!listingCache) {
    return NextResponse.json({ available: false, reason: "Nalezený inzerát zatím není v cache — otevřete detail znovu po další synchronizaci." });
  }

  const history = await getFlatScanPriceHistory(project.discoveredListingExternalId, listingCache.id).catch(() => []);
  const summary = computePriceHistorySummary(history, listingCache.daysOnMarket);

  return NextResponse.json({
    available: true,
    portal: listingCache.portal,
    url: listingCache.url,
    summary,
    history: history.map((h) => ({ price: h.price, recordedAt: h.recordedAt.toISOString() }))
  });
}
