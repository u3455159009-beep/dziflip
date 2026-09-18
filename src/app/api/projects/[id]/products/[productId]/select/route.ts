import { NextRequest, NextResponse } from "next/server";
import { selectProduct } from "@/lib/productSearch";

export async function POST(_req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  const product = await selectProduct(params.productId).catch((err) => {
    console.error(err);
    return null;
  });
  if (!product) return NextResponse.json({ error: "Výběr produktu selhal." }, { status: 500 });
  return NextResponse.json(product);
}
