// Zero-Click pipeline step runner (item 11) — performs exactly one bounded
// unit of outstanding pipeline work (one photo analysis, one visualization,
// one product search, or one value-engineering swap) and returns the
// freshly recomputed state. The client polls this repeatedly until
// overallStatus is DONE; a no-op call (nothing outstanding, or everything
// left is WAITING_FOR_PROVIDER) is a normal, safe response.
//
// maxDuration gives one call enough headroom for a single Gemini call
// (up to ~55s including its own bounded retry) to finish within one
// serverless invocation — actual ceiling still depends on the Vercel plan.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { advancePipeline } from "@/lib/pipeline";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await advancePipeline(params.id);
  return NextResponse.json(state);
}
