// Read-only pipeline status (Zero-Click pipeline, item 11) — never performs
// any work itself, just reports what computePipelineState derives from
// real data. Polled by PipelineStatus.tsx alongside the advance endpoint.
import { NextRequest, NextResponse } from "next/server";
import { computePipelineState } from "@/lib/pipeline";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await computePipelineState(params.id);
  return NextResponse.json(state);
}
