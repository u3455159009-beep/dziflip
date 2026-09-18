import { NextRequest, NextResponse } from "next/server";
import { deselectProduct } from "@/lib/productSearch";

export async function POST(_req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  const product = await deselectProduct(params.productId).catch((err) => {
    console.error(err);
    return null;
  });
  if (!product) return NextResponse.json({ error: "Zrušení výběru selhalo." }, { status: 500 });
  return NextResponse.json(product);
}
