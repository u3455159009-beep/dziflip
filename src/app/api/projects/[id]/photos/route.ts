import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body?.url) return NextResponse.json({ error: "Chybí URL fotografie." }, { status: 400 });

  const count = await prisma.photo.count({ where: { projectId: params.id } });
  const photo = await prisma.photo.create({
    data: {
      projectId: params.id,
      url: body.url,
      room: body.room || null,
      notes: body.notes || null,
      sortOrder: count
    }
  });
  return NextResponse.json(photo);
}
