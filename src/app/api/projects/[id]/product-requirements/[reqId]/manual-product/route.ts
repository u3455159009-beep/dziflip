import { NextRequest, NextResponse } from "next/server";
import { addManualProduct } from "@/lib/productSearch";

export async function POST(req: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "Chybí název produktu." }, { status: 400 });

  const product = await addManualProduct(params.reqId, {
    name: body.name,
    retailer: body.retailer || null,
    price: body.price !== undefined && body.price !== "" ? Number(body.price) : null,
    productUrl: body.productUrl || null,
    quantity: body.quantity !== undefined && body.quantity !== "" ? Number(body.quantity) : null,
    note: body.note || null,
    category: body.category || undefined
  });
  return NextResponse.json(product);
}
