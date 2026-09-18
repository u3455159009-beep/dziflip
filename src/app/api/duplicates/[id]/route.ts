import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { DuplicateResolvedStatus } from "@/lib/types";

const VALID: DuplicateResolvedStatus[] = ["PENDING", "CONFIRMED_SAME", "CONFIRMED_DIFFERENT"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body?.resolvedStatus || !VALID.includes(body.resolvedStatus)) {
    return NextResponse.json({ error: "Neplatný resolvedStatus." }, { status: 400 });
  }
  const duplicate = await prisma.possibleDuplicate.update({
    where: { id: params.id },
    data: {
      resolvedStatus: body.resolvedStatus,
      resolvedAt: body.resolvedStatus === "PENDING" ? null : new Date()
    }
  });
  return NextResponse.json(duplicate);
}
