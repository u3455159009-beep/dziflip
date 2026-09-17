import { prisma } from "@/lib/prisma";
import { RadarManager } from "@/components/radar/RadarManager";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const watchers = await prisma.watcher.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { projects: true, alerts: true } } }
  });

  return <RadarManager initialWatchers={JSON.parse(JSON.stringify(watchers))} />;
}
