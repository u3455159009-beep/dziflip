import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const data: Record<string, any> = {};
  for (const key of ["name", "phone", "email", "agency", "status"]) {
    if (key in body) data[key] = body[key] || null;
  }
  if ("lastContactedAt" in body) {
    data.lastContactedAt = body.lastContactedAt ? new Date(body.lastContactedAt) : null;
  }

  const contact = await prisma.contact.upsert({
    where: { projectId: params.id },
    update: data,
    create: { projectId: params.id, ...data, status: data.status || "NEKONTAKTOVANO" }
  });
  return NextResponse.json(contact);
}
