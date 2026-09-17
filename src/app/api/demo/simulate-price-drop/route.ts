import { NextRequest, NextResponse } from "next/server";
import { simulateDemoPriceChange } from "@/lib/sources/mockProvider";

// Testing helper only: mutates the MOCK_DEMO fixture's current price so a
// subsequent watcher run can exercise the real Price Drop Watch pipeline.
// Never touches real project data directly.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.externalId || !Number.isFinite(Number(body?.newPrice))) {
    return NextResponse.json({ error: "Chybí externalId nebo newPrice." }, { status: 400 });
  }
  const updated = await simulateDemoPriceChange(body.externalId, Number(body.newPrice));
  return NextResponse.json(updated);
}
