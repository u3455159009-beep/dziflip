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

// Real ceiling for the server-side upload route (POST .../photos/upload),
// which buffers the whole request body inside a Vercel Function — those
// have a real platform request-body limit (~4.5 MB on standard Vercel
// Serverless Functions) that this code cannot exceed no matter what value
// is configured here, so it's set safely under that, not at a number that
// only sounds generous. The UI's primary upload path is the client-upload
// flow below instead, which bypasses this limit entirely by sending the
// file straight from the browser to Blob storage.
export const MAX_PHOTO_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB — real limit for the server-upload route

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
 * exact allow-list or over the given size ceiling, with a specific, honest
 * reason. `maxBytes` lets callers apply the ceiling that actually matches
 * how the file is being transported (server route vs. direct client
 * upload) — the error message always states the real number checked.
 */
export function validatePhotoUpload(candidate: PhotoUploadCandidate, maxBytes: number = MAX_PHOTO_FILE_SIZE_BYTES): void {
  if (!ALLOWED_PHOTO_MIME_TYPES.includes(candidate.mimeType as AllowedPhotoMimeType)) {
    throw new PhotoUploadValidationError(
      `Nepodporovaný formát souboru (${candidate.mimeType || "neznámý"}). Podporované formáty: JPG, JPEG, PNG, WEBP.`
    );
  }
  if (candidate.sizeBytes <= 0) {
    throw new PhotoUploadValidationError("Soubor je prázdný.");
  }
  if (candidate.sizeBytes > maxBytes) {
    throw new PhotoUploadValidationError(
      `Soubor je příliš velký (${(candidate.sizeBytes / (1024 * 1024)).toFixed(1)} MB). Maximální velikost je ${maxBytes / (1024 * 1024)} MB.`
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

// Real ceiling for a direct browser→Blob client upload (bypasses this
// app's own serverless function entirely, so it is NOT limited by Vercel's
// Function request-body size limit — only by what's a sane photo size).
export const MAX_CLIENT_UPLOAD_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Creates the Photo row for a file that was uploaded directly from the
 * browser to Vercel Blob storage (client upload — see
 * /api/projects/[id]/photos/client-upload for the token route). This
 * function never touches the file bytes itself; it only records the real,
 * already-stored blob's metadata, re-validated server-side.
 */
export async function finalizeClientUpload(
  projectId: string,
  blob: { url: string; contentType: string; sizeBytes: number }
) {
  validatePhotoUpload({ mimeType: blob.contentType, sizeBytes: blob.sizeBytes }, MAX_CLIENT_UPLOAD_FILE_SIZE_BYTES);

  const count = await prisma.photo.count({ where: { projectId } });
  return prisma.photo.create({
    data: {
      projectId,
      url: blob.url,
      sortOrder: count,
      sourcePhotoProvider: "MANUAL_UPLOAD",
      retrievedAt: new Date(),
      mimeType: blob.contentType,
      fileSizeBytes: blob.sizeBytes
    }
  });
}
