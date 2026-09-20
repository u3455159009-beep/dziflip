// Real photo file upload — multipart/form-data, stored in Vercel Blob
// (never the serverless function's own ephemeral filesystem). This is the
// only path that creates a Photo row with sourcePhotoProvider =
// "MANUAL_UPLOAD"; see src/lib/photoUpload.ts for the actual storage call.
import { NextRequest, NextResponse } from "next/server";
import {
  PhotoStorageError,
  PhotoStorageNotConfiguredError,
  PhotoUploadValidationError,
  saveUploadedPhoto
} from "@/lib/photoUpload";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Chybí soubor fotografie." }, { status: 400 });
  }

  try {
    const photo = await saveUploadedPhoto(params.id, file);
    // A freshly created Photo has no PhotoGeneration rows yet; the client
    // DTO always expects `generations` to be an array (never undefined).
    return NextResponse.json({ ...photo, generations: [] });
  } catch (err) {
    if (err instanceof PhotoUploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof PhotoStorageNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof PhotoStorageError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Nahrání fotografie selhalo." }, { status: 500 });
  }
}
