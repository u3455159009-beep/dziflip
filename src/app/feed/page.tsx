import { prisma } from "@/lib/prisma";
import { buildDealFeedItem } from "@/lib/dealFeed";
import { getSettings } from "@/lib/settings";
import type { CompQualityTier } from "@/lib/types";
import { FeedManager } from "@/components/deal/FeedManager";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const settings = await getSettings();
  const projects = await prisma.project.findMany({
    where: settings.showDemoData ? undefined : { isDemo: false },
    orderBy: { createdAt: "desc" },
    include: {
      photos: { take: 1, orderBy: { sortOrder: "asc" } },
      comparables: { select: { pricePerM2: true, qualityTier: true, priceType: true, condition: true } },
      budgetItems: { select: { id: true } },
      assumptions: true,
      smsMessages: { select: { status: true, direction: true, classification: true } }
    }
  });

  const opts = {
    minCompCount: settings.minCompCount,
    minCompQuality: settings.minCompQuality as CompQualityTier,
    staleDataThresholdDays: settings.staleDataThresholdDays
  };
  const items = projects.map((p) => buildDealFeedItem(p as any, opts));

  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl text-ink">Deal Feed</h1>
      <p className="mb-8 text-sm text-muted">
        Rychlý přehled všech nemovitostí — 30sekundová karta s cenovým pásmem a odůvodněním výpočtu.
      </p>
      <FeedManager items={JSON.parse(JSON.stringify(items))} />
    </div>
  );
}
