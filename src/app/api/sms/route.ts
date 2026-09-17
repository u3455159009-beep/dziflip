import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const unassignedOnly = req.nextUrl.searchParams.get("unassigned") === "1";
  const messages = await prisma.smsMessage.findMany({
    where: unassignedOnly ? { projectId: null } : undefined,
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      project: { include: { photos: { take: 1, orderBy: { sortOrder: "asc" } }, contact: true } }
    }
  });
  return NextResponse.json(messages);
}
