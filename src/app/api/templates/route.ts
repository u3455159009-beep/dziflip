import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultTemplate } from "@/lib/outreach";

export async function GET() {
  await getDefaultTemplate(); // ensure at least the default exists
  const templates = await prisma.messageTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.body) {
    return NextResponse.json({ error: "Chybí název nebo text šablony." }, { status: 400 });
  }
  const template = await prisma.messageTemplate.create({
    data: { name: body.name, body: body.body, isDefault: false }
  });
  return NextResponse.json(template);
}
