import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

// @vercel/blob's put() uses its own internal `undici` fetch, not the
// global one — mocking global.fetch (like every other provider test in
// this suite) would never intercept it, so the module itself is mocked.
vi.mock("@vercel/blob", () => ({
  put: vi.fn()
}));

import { put } from "@vercel/blob";
import {
  validatePhotoUpload,
  saveUploadedPhoto,
  isBlobStorageConfigured,
  PhotoUploadValidationError,
  PhotoStorageNotConfiguredError,
  PhotoStorageError,
  MAX_PHOTO_FILE_SIZE_BYTES
} from "@/lib/photoUpload";
import { requestPhotoGeneration } from "@/lib/photoGeneration";
import { IMAGE_GEN_PROVIDERS } from "@/lib/imageGen/registry";
import type { ImageGenProvider } from "@/lib/imageGen/types";

const putMock = vi.mocked(put);

async function wipeDb() {
  await prisma.productRequirement.deleteMany();
  await prisma.photoGeneration.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.project.deleteMany();
}

function fakeUploadFile(overrides: Partial<{ type: string; size: number; name: string; bytes: string }> = {}) {
  const bytes = overrides.bytes ?? "fake-jpeg-bytes";
  const buf = new TextEncoder().encode(bytes);
  return {
    type: overrides.type ?? "image/jpeg",
    size: overrides.size ?? buf.byteLength,
    name: overrides.name ?? "kuchyn.jpg",
    arrayBuffer: async () => buf.buffer
  };
}

function mockBlobSuccess(url = "https://abc123.public.blob.vercel-storage.com/projects/x/photos/1-abc.jpg") {
  putMock.mockResolvedValueOnce({
    url,
    downloadUrl: `${url}?download=1`,
    pathname: url.split("/").slice(3).join("/"),
    contentType: "image/jpeg",
    contentDisposition: "",
    size: 123
  } as any);
}

describe("validatePhotoUpload (pure) — MIME + size checks", () => {
  it("7. rejects a disallowed MIME type", () => {
    expect(() => validatePhotoUpload({ mimeType: "application/pdf", sizeBytes: 1000 })).toThrow(PhotoUploadValidationError);
    expect(() => validatePhotoUpload({ mimeType: "image/gif", sizeBytes: 1000 })).toThrow(PhotoUploadValidationError);
  });

  it("accepts exactly JPG/JPEG, PNG, and WEBP", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(() => validatePhotoUpload({ mimeType, sizeBytes: 1000 })).not.toThrow();
    }
  });

  it("8. rejects a file over the size ceiling", () => {
    expect(() => validatePhotoUpload({ mimeType: "image/jpeg", sizeBytes: MAX_PHOTO_FILE_SIZE_BYTES + 1 })).toThrow(PhotoUploadValidationError);
  });

  it("rejects an empty file", () => {
    expect(() => validatePhotoUpload({ mimeType: "image/jpeg", sizeBytes: 0 })).toThrow(PhotoUploadValidationError);
  });
});

describe("saveUploadedPhoto — real persistent storage, real DB row", () => {
  beforeAll(wipeDb);
  afterAll(wipeDb);
  afterEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    putMock.mockReset();
  });

  it("9. throws a clear PhotoStorageNotConfiguredError (never a silent failure) when Blob storage isn't connected", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(isBlobStorageConfigured()).toBe(false);
    const project = await prisma.project.create({ data: { title: "No blob" } });

    await expect(saveUploadedPhoto(project.id, fakeUploadFile())).rejects.toBeInstanceOf(PhotoStorageNotConfiguredError);
    expect(putMock).not.toHaveBeenCalled(); // never even attempts the call without a token
  });

  it("2. a valid image is uploaded to Blob storage and a real Photo row is created", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mockBlobSuccess();
    const project = await prisma.project.create({ data: { title: "Upload test" } });

    const photo = await saveUploadedPhoto(project.id, fakeUploadFile({ name: "obyvak.jpg" }));

    expect(photo.url).toMatch(/^https:\/\/.*\.blob\.vercel-storage\.com\//);
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("3. the uploaded photo persists in the real database — not just local/in-memory state", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mockBlobSuccess();
    const project = await prisma.project.create({ data: { title: "Persistence test" } });
    const photo = await saveUploadedPhoto(project.id, fakeUploadFile());

    // Simulates "page reload" — a completely fresh read from the database,
    // independent of whatever in-memory object saveUploadedPhoto returned.
    const reread = await prisma.photo.findUnique({ where: { id: photo.id } });
    expect(reread).not.toBeNull();
    expect(reread!.url).toBe(photo.url);
    expect(reread!.projectId).toBe(project.id);
  });

  it("5. the uploaded photo is tagged MANUAL_UPLOAD — i.e. an ORIGINAL, not an AI-generated variant", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mockBlobSuccess();
    const project = await prisma.project.create({ data: { title: "Provenance test" } });
    const photo = await saveUploadedPhoto(project.id, fakeUploadFile());

    expect(photo.sourcePhotoProvider).toBe("MANUAL_UPLOAD");
    expect(photo.retrievedAt).not.toBeNull();
    expect(photo.mimeType).toBe("image/jpeg");
  });

  it("6. the uploaded photo's URL is a real, fetchable original the Gemini pipeline can use as ORIGINAL input", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const blobUrl = "https://abc123.public.blob.vercel-storage.com/projects/x/photos/kitchen.jpg";
    mockBlobSuccess(blobUrl);
    const project = await prisma.project.create({ data: { title: "Gemini pipeline test" } });
    const photo = await saveUploadedPhoto(project.id, fakeUploadFile({ name: "kitchen.jpg" }));
    expect(photo.url).toBe(blobUrl);

    const mockImageGen: ImageGenProvider = {
      key: "TEST_GEMINI_FOR_UPLOAD",
      label: "Test Gemini",
      status: "ACTIVE",
      async generate(request) {
        // Proves the pipeline was handed the uploaded photo's real Blob URL
        // as the ORIGINAL to edit — not a placeholder, not a new room.
        expect(request.photoUrl).toBe(blobUrl);
        return {
          generatedUrl: "data:image/png;base64,ZmFrZQ==",
          model: "test-model",
          changeDetection: [],
          structuralChange: false,
          structuralChangeNote: null,
          confidence: "MEDIUM"
        };
      }
    };
    IMAGE_GEN_PROVIDERS.push(mockImageGen);
    try {
      const generation = await requestPhotoGeneration(photo.id, "MODERNI", null);
      expect(generation.status).toBe("GENERATED");
    } finally {
      const idx = IMAGE_GEN_PROVIDERS.indexOf(mockImageGen);
      if (idx >= 0) IMAGE_GEN_PROVIDERS.splice(idx, 1);
    }
  });

  it("a Blob storage failure surfaces as a clear PhotoStorageError, never a silent/fake success", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    putMock.mockRejectedValueOnce(new Error("simulated Blob outage"));
    const project = await prisma.project.create({ data: { title: "Storage error test" } });

    await expect(saveUploadedPhoto(project.id, fakeUploadFile())).rejects.toBeInstanceOf(PhotoStorageError);
    const photos = await prisma.photo.findMany({ where: { projectId: project.id } });
    expect(photos.length).toBe(0); // no half-saved row on failure
  });

  it("7b. server-side rejects a disallowed MIME type before ever calling Blob storage", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const project = await prisma.project.create({ data: { title: "Bad mime test" } });
    await expect(saveUploadedPhoto(project.id, fakeUploadFile({ type: "application/pdf" }))).rejects.toBeInstanceOf(Error);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("8b. server-side rejects an oversized file before ever calling Blob storage", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const project = await prisma.project.create({ data: { title: "Too big test" } });
    await expect(
      saveUploadedPhoto(project.id, fakeUploadFile({ size: MAX_PHOTO_FILE_SIZE_BYTES + 1 }))
    ).rejects.toBeInstanceOf(Error);
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("10. no secret is ever sent to the browser", () => {
  afterEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    putMock.mockReset();
  });

  it("the saved Photo row and its JSON-serializable fields never contain the storage token", async () => {
    const secretToken = "vercel_blob_rw_THIS_IS_SECRET_1234567890";
    process.env.BLOB_READ_WRITE_TOKEN = secretToken;
    mockBlobSuccess();
    const project = await prisma.project.create({ data: { title: "No secret test" } });

    const photo = await saveUploadedPhoto(project.id, fakeUploadFile());
    const serialized = JSON.stringify(photo);
    expect(serialized).not.toContain(secretToken);

    // put() must never have been asked to embed the token in the pathname
    // or any argument this app controls (it's picked up from env by the SDK).
    const call = putMock.mock.calls[0];
    expect(JSON.stringify(call)).not.toContain(secretToken);
  });

  it("no client component source references BLOB_READ_WRITE_TOKEN directly", async () => {
    const fs = await import("fs/promises");
    const source = await fs.readFile(new URL("../src/components/project/PhotosGallery.tsx", import.meta.url), "utf-8");
    expect(source).not.toContain("BLOB_READ_WRITE_TOKEN");
    expect(source).not.toMatch(/process\.env\.\w*(TOKEN|KEY|SECRET)/);
  });
});
