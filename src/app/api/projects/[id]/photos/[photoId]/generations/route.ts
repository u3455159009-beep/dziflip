import { NextRequest, NextResponse } from "next/server";
import { requestPhotoGeneration } from "@/lib/photoGeneration";
import { PHOTO_GENERATION_STYLES } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: { id: string; photoId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body?.style || !PHOTO_GENERATION_STYLES.includes(body.style)) {
    return NextResponse.json({ error: "Neplatný styl." }, { status: 400 });
  }
  const generation = await requestPhotoGeneration(params.photoId, body.style, body.prompt || null);
  return NextResponse.json(generation);
}
