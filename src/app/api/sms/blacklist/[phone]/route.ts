import { NextRequest, NextResponse } from "next/server";
import { removeFromBlacklist } from "@/lib/smsHub";

export async function DELETE(_req: NextRequest, { params }: { params: { phone: string } }) {
  await removeFromBlacklist(params.phone);
  return NextResponse.json({ ok: true });
}
