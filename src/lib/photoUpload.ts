// Real Photo Upload — persistent storage via Vercel Blob
// (https://vercel.com/docs/storage/vercel-blob), the correct persistent
// object storage for a Vercel serverless deployment. A serverless
// function's own filesystem is ephemeral and wiped between invocations, so
// this app never writes an uploaded photo there — every uploaded photo's
// real bytes live in Blob storage, and only the resulting public URL is
// stored on the Photo row (same shape as every other photo source already
// in this app: a URL DziFlip can always re-fetch, e.g. for the Gemini
// image-to-image pipeline).
//
// Until BLOB_READ_WRITE_TOKEN is configured, upload honestly fails with a
// clear message — it never pretends to store the file, and never falls
// back to a fake/local/mock URL.
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedPhotoMimeType = (typeof ALLOWED_PHOTO_MIME_TYPES)[number];

// Our own application-level ceiling. Vercel's platform itself also caps a
// serverless Route Handler's request body (historically ~4.5MB on many
// plans) — a file under this limit can still be rejected by the platform
// before this code even runs; that shows up to the user as a generic
// network/HTTP error, not one of the messages below.
export const MAX_PHOTO_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

export class PhotoUploadValidationError extends Error {}
export class PhotoStorageNotConfiguredError extends Error {}
export class PhotoStorageError extends Error {}

export interface PhotoUploadCandidate {
  mimeType: string;
  sizeBytes: number;
}

/**
 * Pure validation — checked both client-side (for instant feedback) and
 * server-side (never trust the client alone). Rejects anything outside the
 * exact allow-list or over the size ceiling, with a specific, honest reason.
 */
export function validatePhotoUpload(candidate: PhotoUploadCandidate): void {
  if (!ALLOWED_PHOTO_MIME_TYPES.includes(candidate.mimeType as AllowedPhotoMimeType)) {
    throw new PhotoUploadValidationError(
      `Nepodporovaný formát souboru (${candidate.mimeType || "neznámý"}). Podporované formáty: JPG, JPEG, PNG, WEBP.`
    );
  }
  if (candidate.sizeBytes <= 0) {
    throw new PhotoUploadValidationError("Soubor je prázdný.");
  }
  if (candidate.sizeBytes > MAX_PHOTO_FILE_SIZE_BYTES) {
    throw new PhotoUploadValidationError(
      `Soubor je příliš velký (${(candidate.sizeBytes / (1024 * 1024)).toFixed(1)} MB). Maximální velikost je ${MAX_PHOTO_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
    );
  }
}

export function isBlobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Uploads one real photo file to Vercel Blob storage and creates the
 * linked Photo row — the single write path for a user-uploaded photo, so
 * every uploaded photo carries the same MANUAL_UPLOAD provenance and is
 * immediately usable as the ORIGINAL input for the Gemini image-to-image
 * pipeline (which just fetches Photo.url like any other photo source).
 */
export async function saveUploadedPhoto(
  projectId: string,
  file: { arrayBuffer: () => Promise<ArrayBuffer>; type: string; size: number; name: string }
): Promise<ReturnType<typeof prisma.photo.create>> {
  validatePhotoUpload({ mimeType: file.type, sizeBytes: file.size });

  if (!isBlobStorageConfigured()) {
    throw new PhotoStorageNotConfiguredError(
      "Úložiště fotografií (Vercel Blob) není připojeno. Přidej BLOB_READ_WRITE_TOKEN do proměnných prostředí (viz DEPLOY.md)."
    );
  }

  const extension = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const pathname = `projects/${projectId}/photos/${Date.now()}-${randomSuffix()}.${extension}`;

  let blob: Awaited<ReturnType<typeof put>>;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    blob = await put(pathname, buffer, { access: "public", contentType: file.type });
  } catch (err) {
    throw new PhotoStorageError(
      `Nahrání fotografie do úložiště selhalo${err instanceof Error && err.message ? `: ${err.message}` : "."}`
    );
  }

  const count = await prisma.photo.count({ where: { projectId } });
  const now = new Date();

  return prisma.photo.create({
    data: {
      projectId,
      url: blob.url,
      sortOrder: count,
      sourcePhotoProvider: "MANUAL_UPLOAD",
      retrievedAt: now,
      mimeType: file.type,
      fileSizeBytes: file.size
    }
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
