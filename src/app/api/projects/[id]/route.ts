import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LISTING_FIELDS, type FieldMeta } from "@/lib/types";
import { parseFieldMeta, parseFieldSource, serializeFieldMeta, serializeFieldSource } from "@/lib/listing/fieldMeta";
import { getProjectWithRelations } from "@/lib/projectData";
import { rescoreAllComparables } from "@/lib/comparableScoring";

const COMPARABLE_RELEVANT_FIELDS = [
  "disposition",
  "areaM2",
  "condition",
  "buildingType",
  "construction",
  "ownership",
  "floor",
  "elevator",
  "balcony",
  "terrace",
  "loggia",
  "parking",
  "municipality",
  "district"
];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProjectWithRelations(params.id);
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

  const meta: FieldMeta = parseFieldMeta(existing.fieldMeta);
  const source = parseFieldSource(existing.fieldSource);
  const events: Array<{ eventType: string; detail: string; oldValue: string | null; newValue: string | null }> = [];

  if (body.fields && typeof body.fields === "object") {
    for (const key of LISTING_FIELDS) {
      if (key in body.fields) {
        const raw = body.fields[key];
        const nextValue = raw === "" ? null : raw;
        const prevValue = (existing as any)[key] ?? null;
        data[key] = nextValue;
        // A manual save is an explicit human confirmation of the value.
        meta[key] = raw === null || raw === "" ? "UNKNOWN" : "VERIFIED";
        source[key] = nextValue === null ? undefined : "ruční oprava";

        if (key === "condition" && String(prevValue ?? "") !== String(nextValue ?? "")) {
          events.push({
            eventType: "CONDITION_CHANGE",
            detail: "Stav nemovitosti ručně upraven.",
            oldValue: prevValue,
            newValue: nextValue
          });
        }
        if (key === "description" && String(prevValue ?? "") !== String(nextValue ?? "")) {
          events.push({
            eventType: "DESCRIPTION_CHANGE",
            detail: "Popis nemovitosti ručně upraven.",
            oldValue: prevValue,
            newValue: nextValue
          });
        }
      }
    }
    data.fieldMeta = serializeFieldMeta(meta);
    data.fieldSource = serializeFieldSource(source);
    // A human confirming a field's value is a fresh verification of it.
    data.lastVerifiedAt = new Date();
  }

  if (events.length > 0) {
    data.listingEvents = { create: events };
  }

  const project = await prisma.project.update({ where: { id: params.id }, data });

  if (body.fields && Object.keys(body.fields).some((k) => COMPARABLE_RELEVANT_FIELDS.includes(k))) {
    await rescoreAllComparables(params.id).catch(() => {});
  }

  return NextResponse.json(project);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.project.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
