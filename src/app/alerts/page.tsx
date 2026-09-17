import { prisma } from "@/lib/prisma";
import { AlertsInbox } from "@/components/deal/AlertsInbox";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await prisma.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      project: { include: { photos: { take: 1, orderBy: { sortOrder: "asc" } } } },
      watcher: { select: { id: true, name: true } },
      notifications: true
    }
  });

  return (
    <div>
      <h1 className="mb-8 font-serif text-3xl text-ink">Deal Alerts</h1>
      <AlertsInbox initialAlerts={JSON.parse(JSON.stringify(alerts))} />
    </div>
  );
}
