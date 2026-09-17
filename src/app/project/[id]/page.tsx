import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectView } from "@/components/project/ProjectView";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      comparables: { orderBy: { foundAt: "desc" } },
      budgetItems: { orderBy: [{ room: "asc" }, { sortOrder: "asc" }] },
      assumptions: true,
      priceHistory: { orderBy: { recordedAt: "asc" } },
      contact: true,
      outreachMessages: { orderBy: { createdAt: "desc" } },
      sourceWatcher: { select: { id: true, name: true } }
    }
  });

  if (!project) notFound();

  const serialized = JSON.parse(JSON.stringify(project));

  return <ProjectView project={serialized} />;
}
