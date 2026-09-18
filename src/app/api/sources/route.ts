import { NextResponse } from "next/server";
import { SOURCE_PROVIDERS } from "@/lib/sources/registry";

export async function GET() {
  const providers = SOURCE_PROVIDERS.map((p) => ({
    key: p.key,
    label: p.label,
    status: p.status,
    statusNote: p.statusNote ?? null
  }));
  return NextResponse.json(providers);
}
