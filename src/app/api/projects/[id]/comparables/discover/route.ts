import { NextRequest, NextResponse } from "next/server";
import { discoverComparablesForProject } from "@/lib/comparableDiscovery";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  try {
    const result = await discoverComparablesForProject(params.id, { force: Boolean(body?.force) });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vyhledání srovnatelných nabídek selhalo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
