import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LISTING_FIELDS, type FieldMeta } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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
  if (!project) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const existing = await prisma.project.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });

  const data: Record<string, any> = {};

  if (typeof body.status === "string") data.status = body.status;
  if (body.targetPrice !== undefined) data.targetPrice = body.targetPrice === null ? null : Number(body.targetPrice);

  let meta: FieldMeta = {};
  try {
    meta = existing.fieldMeta ? JSON.parse(existing.fieldMeta) : {};
  } catch {
    meta = {};
  }

  if (body.fields && typeof body.fields === "object") {
    for (const key of LISTING_FIELDS) {
      if (key in body.fields) {
        const raw = body.fields[key];
        data[key] = raw === "" ? null : raw;
        // A manual save is an explicit human confirmation of the value.
        meta[key] = raw === null || raw === "" ? "UNKNOWN" : "VERIFIED";
      }
    }
    data.fieldMeta = JSON.stringify(meta);
  }

  const project = await prisma.project.update({ where: { id: params.id }, data });
  return NextResponse.json(project);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.project.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
