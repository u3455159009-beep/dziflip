// Token route for direct browser → Vercel Blob uploads (item 12 —
// "Vercel Blob server upload má limit nižší než 8 MB"). The actual file
// bytes never pass through this (or any) DziFlip serverless function —
// the browser uploads straight to Blob storage using a short-lived client
// token this route issues, so the real size ceiling is
// MAX_CLIENT_UPLOAD_FILE_SIZE_BYTES, not the ~4.5 MB Vercel Function body
// limit that constrains the older server-upload route.
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ALLOWED_PHOTO_MIME_TYPES, MAX_CLIENT_UPLOAD_FILE_SIZE_BYTES } from "@/lib/photoUpload";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...ALLOWED_PHOTO_MIME_TYPES],
        maximumSizeInBytes: MAX_CLIENT_UPLOAD_FILE_SIZE_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ projectId: params.id })
      })
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Nahrání fotografie selhalo." },
      { status: 400 }
    );
  }
}
