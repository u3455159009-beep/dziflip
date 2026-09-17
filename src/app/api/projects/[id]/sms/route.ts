import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDraftSms } from "@/lib/smsHub";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const messages = await prisma.smsMessage.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json(messages);
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const message = await createDraftSms(params.id, { kind: "INTRO" });
    return NextResponse.json(message);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Nepodařilo se připravit SMS." }, { status: 400 });
  }
}
