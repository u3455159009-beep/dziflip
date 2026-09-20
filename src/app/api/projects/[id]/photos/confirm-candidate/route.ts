// POSSIBLE_MATCH photo confirmation (items 1/2) — a Listing Discovery
// candidate's photos are only ever copied into real Photo rows once the
// user has explicitly confirmed the candidate really is the same property.
// This endpoint is the only path that does that copy.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const confirmed = body?.confirmed === true;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Projekt nenalezen." }, { status: 404 });
  if (!project.discoveredListingCandidatePhotos) {
    return NextResponse.json({ error: "Žádné čekající fotografie ke schválení." }, { status: 400 });
  }

  const candidatePhotos: string[] = JSON.parse(project.discoveredListingCandidatePhotos);

  if (confirmed) {
    const existingCount = await prisma.photo.count({ where: { projectId: params.id } });
    const now = new Date();
    await prisma.photo.createMany({
      data: candidatePhotos.map((u, i) => ({
        projectId: params.id,
        url: u,
        sortOrder: existingCount + i,
        sourcePhotoProvider: project.discoveredListingProvider,
        sourceListingProvider: project.discoveredListingProvider,
        sourceListingExternalId: project.discoveredListingExternalId,
        sourceListingUrl: project.discoveredListingUrl,
        matchConfidence: project.discoveredListingConfidence,
        retrievedAt: now
      }))
    });
  }

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: {
      discoveredListingPhotosConfirmed: confirmed,
      discoveredListingCandidatePhotos: null
    }
  });

  return NextResponse.json({ project: updated, attachedCount: confirmed ? candidatePhotos.length : 0 });
}
