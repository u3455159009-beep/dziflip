import { NextResponse } from "next/server";
import { VISION_PROVIDERS } from "@/lib/vision/registry";

export async function GET() {
  const providers = VISION_PROVIDERS.map((p) => ({
    key: p.key,
    label: p.label,
    status: p.status,
    statusNote: p.statusNote ?? null
  }));
  return NextResponse.json(providers);
}
