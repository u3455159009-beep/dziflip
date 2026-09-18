import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const existing = await prisma.contact.findUnique({ where: { projectId: params.id } });

  const data: Record<string, any> = {};
  for (const key of ["name", "phone", "email", "agency", "status"]) {
    if (key in body) data[key] = body[key] || null;
  }
  if ("lastContactedAt" in body) {
    data.lastContactedAt = body.lastContactedAt ? new Date(body.lastContactedAt) : null;
  }

  const contactChanged =
    ("phone" in data && data.phone !== (existing?.phone ?? null)) ||
    ("email" in data && data.email !== (existing?.email ?? null));

  const contact = await prisma.contact.upsert({
    where: { projectId: params.id },
    update: data,
    create: { projectId: params.id, ...data, status: data.status || "NEKONTAKTOVANO" }
  });

  if (contactChanged) {
    await prisma.listingEvent.create({
      data: {
        projectId: params.id,
        eventType: "CONTACT_CHANGE",
        detail: "Kontaktní údaje ručně upraveny.",
        oldValue: existing?.phone || existing?.email || null,
        newValue: contact.phone || contact.email || null
      }
    });
  }

  return NextResponse.json(contact);
}
