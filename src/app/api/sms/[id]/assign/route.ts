import { NextRequest, NextResponse } from "next/server";
import { assignSmsToProject } from "@/lib/smsHub";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body?.projectId) return NextResponse.json({ error: "Chybí projectId." }, { status: 400 });
  const updated = await assignSmsToProject(params.id, body.projectId);
  return NextResponse.json(updated);
}
