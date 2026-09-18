import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MANUAL_TEXT_FIELDS = [
  "roomType",
  "currentCondition",
  "keepNotes",
  "removeNotes",
  "replaceNotes",
  "renovationSuggestions"
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; photoId: string } }
) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });
  const data: Record<string, any> = {};
  if ("room" in body) data.room = body.room || null;
  if ("notes" in body) data.notes = body.notes || null;

  let manualEdit = false;
  for (const key of MANUAL_TEXT_FIELDS) {
    if (key in body) {
      data[key] = body[key] || null;
      manualEdit = true;
    }
  }
  if ("visibleIssues" in body) {
    data.visibleIssues = Array.isArray(body.visibleIssues) ? JSON.stringify(body.visibleIssues) : body.visibleIssues || null;
    manualEdit = true;
  }
  if (manualEdit) {
    // A human explicitly entering these values is a direct, verified
    // observation — never mixed with an AI confidence tier.
    data.analysisSource = "MANUAL";
    data.analysisConfidence = "VERIFIED";
    data.analyzedAt = new Date();
  }

  const photo = await prisma.photo.update({ where: { id: params.photoId }, data });
  return NextResponse.json(photo);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; photoId: string } }
) {
  await prisma.photo.delete({ where: { id: params.photoId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
