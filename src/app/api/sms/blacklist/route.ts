import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addToBlacklist } from "@/lib/smsHub";

export async function GET() {
  const entries = await prisma.smsBlacklist.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.phone) return NextResponse.json({ error: "Chybí telefonní číslo." }, { status: 400 });
  const entry = await addToBlacklist(body.phone, body.reason || undefined);
  return NextResponse.json(entry);
}
