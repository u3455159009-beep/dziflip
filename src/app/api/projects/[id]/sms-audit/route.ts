import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const logs = await prisma.smsAuditLog.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return NextResponse.json(logs);
}
