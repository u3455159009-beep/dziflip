import { NextRequest, NextResponse } from "next/server";
import { searchProductsForRequirement } from "@/lib/productSearch";

export async function POST(_req: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  try {
    const outcome = await searchProductsForRequirement(params.reqId);
    return NextResponse.json(outcome);
  } catch {
    return NextResponse.json({ error: "Vyhledávání produktů selhalo." }, { status: 500 });
  }
}
