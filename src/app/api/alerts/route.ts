import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const alerts = await prisma.alert.findMany({
    where: unreadOnly ? { readAt: null } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      project: { include: { photos: { take: 1, orderBy: { sortOrder: "asc" } } } },
      watcher: { select: { id: true, name: true } },
      notifications: true
    }
  });
  return NextResponse.json(alerts);
}
