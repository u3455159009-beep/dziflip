import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDraftOutreach } from "@/lib/outreach";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const messages = await prisma.outreachMessage.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(messages);
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const message = await createDraftOutreach(params.id);
  return NextResponse.json(message);
}
