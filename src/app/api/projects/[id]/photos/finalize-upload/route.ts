// Called by the browser right after a successful direct-to-Blob client
// upload (see .../photos/client-upload) — creates the real Photo row from
// the already-stored blob's own metadata. Re-validates MIME/size
// server-side rather than trusting the client's claims.
import { NextRequest, NextResponse } from "next/server";
import {
  PhotoStorageNotConfiguredError,
  PhotoUploadValidationError,
  finalizeClientUpload,
  isBlobStorageConfigured
} from "@/lib/photoUpload";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isBlobStorageConfigured()) {
    return NextResponse.json({ error: "Úložiště fotografií (Vercel Blob) není připojeno." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.url || !body?.contentType || typeof body?.sizeBytes !== "number") {
    return NextResponse.json({ error: "Neplatná data nahrané fotografie." }, { status: 400 });
  }
  // Only ever accept a URL that's actually within this app's own Blob
  // store — never let an arbitrary client-supplied URL become a Photo row.
  if (!/\.public\.blob\.vercel-storage\.com\//.test(body.url)) {
    return NextResponse.json({ error: "Neplatná URL nahrané fotografie." }, { status: 400 });
  }

  try {
    const photo = await finalizeClientUpload(params.id, {
      url: body.url,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes
    });
    return NextResponse.json({ ...photo, generations: [] });
  } catch (err) {
    if (err instanceof PhotoUploadValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof PhotoStorageNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: "Uložení fotografie selhalo." }, { status: 500 });
  }
}
