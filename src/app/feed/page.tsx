import { prisma } from "@/lib/prisma";
import { buildDealFeedItem } from "@/lib/dealFeed";
import { FeedManager } from "@/components/deal/FeedManager";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      photos: { take: 1, orderBy: { sortOrder: "asc" } },
      comparables: { select: { pricePerM2: true } },
      budgetItems: { select: { id: true } },
      assumptions: true
    }
  });

  const items = projects.map((p) => buildDealFeedItem(p as any));

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
