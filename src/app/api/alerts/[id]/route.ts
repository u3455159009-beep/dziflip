import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const alert = await prisma.alert.update({
    where: { id: params.id },
    data: { readAt: body.read === false ? null : new Date() }
  });
  return NextResponse.json(alert);
}
