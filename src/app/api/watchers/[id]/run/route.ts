import { NextRequest, NextResponse } from "next/server";
import { runWatcher } from "@/lib/dealRadar";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const summary = await runWatcher(params.id);
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Spuštění hlídače selhalo." }, { status: 500 });
  }
}
