import { NextRequest, NextResponse } from "next/server";
import { refreshProductPricing, ManualProductRefreshError } from "@/lib/productSearch";
import { ProductNotAvailableError } from "@/lib/products/types";

export async function POST(_req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  try {
    const product = await refreshProductPricing(params.productId);
    return NextResponse.json(product);
  } catch (err) {
    if (err instanceof ProductNotAvailableError || err instanceof ManualProductRefreshError) {
      return NextResponse.json({ error: err.message, available: false }, { status: 409 });
    }
    return NextResponse.json({ error: "Aktualizace ceny selhala." }, { status: 500 });
  }
}
