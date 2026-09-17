import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultTemplate } from "@/lib/outreach";
import { getDefaultSmsTemplate } from "@/lib/smsHub";

export async function GET() {
  await getDefaultTemplate(); // ensure the default e-mail template exists
  await getDefaultSmsTemplate(); // ensure the default SMS template exists
  const templates = await prisma.messageTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.body) {
    return NextResponse.json({ error: "Chybí název nebo text šablony." }, { status: 400 });
  }
  const template = await prisma.messageTemplate.create({
    data: { name: body.name, body: body.body, channel: body.channel === "SMS" ? "SMS" : "EMAIL", isDefault: false }
  });
  return NextResponse.json(template);
}
