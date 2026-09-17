import { prisma } from "@/lib/prisma";
import { MessagesInbox } from "@/components/sms/MessagesInbox";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const [projectsWithSms, unassigned, allProjects] = await Promise.all([
    prisma.project.findMany({
      where: { smsMessages: { some: {} } },
      include: {
        photos: { take: 1, orderBy: { sortOrder: "asc" } },
        contact: true,
        smsMessages: { orderBy: { createdAt: "asc" } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.smsMessage.findMany({
      where: { projectId: null },
      orderBy: { createdAt: "desc" }
    }),
    prisma.project.findMany({
      select: { id: true, title: true, municipality: true, district: true },
      orderBy: { createdAt: "desc" },
      take: 200
    })
  ]);

  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl text-ink">Zprávy</h1>
      <p className="mb-8 text-sm text-muted">SMS Hub — konverzace s makléři a prodávajícími napříč všemi nemovitostmi.</p>
      <MessagesInbox
        projects={JSON.parse(JSON.stringify(projectsWithSms))}
        unassigned={JSON.parse(JSON.stringify(unassigned))}
        allProjects={JSON.parse(JSON.stringify(allProjects))}
      />
    </div>
  );
}
