import { NextResponse } from "next/server";
import { PRODUCT_PROVIDERS } from "@/lib/products/registry";

export async function GET() {
  const providers = PRODUCT_PROVIDERS.map((p) => ({
    key: p.key,
    label: p.label,
    status: p.status,
    statusNote: p.statusNote ?? null
  }));
  return NextResponse.json(providers);
}
