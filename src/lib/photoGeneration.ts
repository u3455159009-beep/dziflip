// Orchestration for Photo Before/After requests. Always records the
// request (style + prompt) so intent isn't lost; only actually calls a
// provider when one is ACTIVE. With no image-gen provider connected, every
// request is persisted as NOT_CONFIGURED — visible in the UI, never
// silently dropped or faked as a real generation.
//
// Cache (item 13): before spending a paid API call, checks whether a
// GENERATED result already exists for the exact same (photo, style,
// prompt, RenovationPlan, provider) signature and reuses it instead.
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getActiveImageGenProvider } from "@/lib/imageGen/registry";
import type { ImageGenRoomAnalysis, RenovationPlanContext } from "@/lib/imageGen/types";
import { computeRequestSignature } from "@/lib/imageGen/cache";
import { createRequirementsFromChangeDetection } from "@/lib/productSearch";
import { isBlobStorageConfigured } from "@/lib/photoUpload";
import type { ChangeDetectionItem, PhotoGenerationStyle, RoomType } from "@/lib/types";

class BlobSaveError extends Error {
  code = "BLOB_SAVE_FAILED";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Uploads a provider's raw generated image bytes to Vercel Blob (item 7 —
 * the AFTER image is real, persistent object storage, exactly like the
 * ORIGINAL, never a base64 data: URI stuffed into a database column) and
 * returns the resulting durable URL. Never touches the ORIGINAL Photo row.
 * Throws BlobSaveError (code BLOB_SAVE_FAILED) rather than silently
 * falling back to anything — a successful Gemini call whose result can't
 * be durably saved is not a successful generation.
 */
async function saveGeneratedImageToBlob(
  photo: { id: string; projectId: string },
  imageBase64: string,
  mimeType: string
): Promise<string> {
  if (!isBlobStorageConfigured()) {
    throw new BlobSaveError("Úložiště fotografií (Vercel Blob) není připojeno — chybí proměnná prostředí BLOB_READ_WRITE_TOKEN.");
  }
  const extension = mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1] || "png";
  const pathname = `projects/${photo.projectId}/generations/${photo.id}-${Date.now()}-${randomSuffix()}.${extension}`;
  try {
    const buffer = Buffer.from(imageBase64, "base64");
    const blob = await put(pathname, buffer, { access: "public", contentType: mimeType });
    return blob.url;
  } catch (err) {
    console.error("[gemini-image-gen] failed to save AFTER image to Vercel Blob", {
      stage: "blob_save",
      code: "BLOB_SAVE_FAILED",
      reason: err instanceof Error ? err.message.slice(0, 200) : "unknown"
    });
    throw new BlobSaveError(`Uložení vygenerovaného obrázku do úložiště selhalo${err instanceof Error && err.message ? `: ${err.message}` : "."}`);
  }
}

function toPlanContext(plan: {
  style: string | null;
  priceLevel: string | null;
  flooring: string | null;
  wallColor: string | null;
  doors: string | null;
  handles: string | null;
  outletsSwitches: string | null;
  lighting: string | null;
  kitchen: string | null;
  bathroomFixtures: string | null;
  tiles: string | null;
  sanitary: string | null;
  builtIns: string | null;
} | null): RenovationPlanContext | null {
  if (!plan) return null;
  const {
    style,
    priceLevel,
    flooring,
    wallColor,
    doors,
    handles,
    outletsSwitches,
    lighting,
    kitchen,
    bathroomFixtures,
    tiles,
    sanitary,
    builtIns
  } = plan;
  return { style, priceLevel, flooring, wallColor, doors, handles, outletsSwitches, lighting, kitchen, bathroomFixtures, tiles, sanitary, builtIns };
}

function toRoomAnalysis(photo: {
  currentCondition: string | null;
  visibleIssues: string | null;
  replaceNotes: string | null;
  renovationSuggestions: string | null;
}): ImageGenRoomAnalysis | null {
  if (!photo.currentCondition && !photo.visibleIssues && !photo.replaceNotes && !photo.renovationSuggestions) return null;
  let visibleIssues: string[] = [];
  if (photo.visibleIssues) {
    try {
      const parsed = JSON.parse(photo.visibleIssues);
      if (Array.isArray(parsed)) visibleIssues = parsed;
    } catch {
      // malformed stored JSON — never let a parsing quirk break generation
    }
  }
  return {
    currentCondition: photo.currentCondition,
    visibleIssues,
    replaceNotes: photo.replaceNotes,
    renovationSuggestions: photo.renovationSuggestions
  };
}

async function logProviderFailure(providerKey: string, message: string) {
  await prisma.providerErrorLog.create({ data: { provider: providerKey, errorMessage: message } }).catch(() => {});
}

export async function requestPhotoGeneration(photoId: string, style: PhotoGenerationStyle, prompt: string | null) {
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) throw new Error("Fotografie nenalezena.");

  const plan = await prisma.renovationPlan.findUnique({ where: { projectId: photo.projectId } });
  const renovationPlanId = plan?.id ?? null;
  const planContext = toPlanContext(plan);
  const roomType = (photo.roomType as RoomType | null) ?? null;
  const roomAnalysis = toRoomAnalysis(photo);

  const provider = getActiveImageGenProvider();
  if (!provider) {
    return prisma.photoGeneration.create({
      data: { photoId, style, prompt, status: "NOT_CONFIGURED", renovationPlanId }
    });
  }

  // Idempotency cache (item 13) — an identical (photo, style, prompt, plan,
  // provider) request reuses the existing GENERATED result rather than
  // spending another paid API call. A changed RenovationPlan (or style/
  // prompt) produces a different signature, so it always misses the cache.
  const signature = computeRequestSignature({ photoUrl: photo.url, style, prompt, providerKey: provider.key, planContext });
  const cached = await prisma.photoGeneration.findFirst({
    where: { photoId, requestSignature: signature, status: "GENERATED" },
    orderBy: { generatedAt: "desc" }
  });
  if (cached) return cached;

  const pending = await prisma.photoGeneration.create({
    data: { photoId, style, prompt, status: "PENDING", renovationPlanId, provider: provider.key, requestSignature: signature }
  });
  try {
    const result = await provider.generate({ photoUrl: photo.url, style, prompt, roomType, planContext, roomAnalysis });
    // A successful Gemini call whose image can't be durably saved is not a
    // successful generation (item 7) — this throws BlobSaveError, caught
    // below like any other failure, before any GENERATED row is written.
    const afterUrl = await saveGeneratedImageToBlob({ id: photo.id, projectId: photo.projectId }, result.imageBase64, result.mimeType);
    const generated = await prisma.photoGeneration.update({
      where: { id: pending.id },
      data: {
        status: "GENERATED",
        generatedUrl: afterUrl,
        model: result.model,
        generatedAt: new Date(),
        changeDetection: JSON.stringify(result.changeDetection),
        structuralChange: result.structuralChange,
        structuralChangeNote: result.structuralChangeNote,
        requiresTechnicalReview: result.structuralChange,
        confidence: result.confidence
      }
    });
    if (result.changeDetection.length > 0) {
      await createRequirementsFromChangeDetection(
        generated.id,
        result.changeDetection as ChangeDetectionItem[],
        roomType,
        photo.projectId
      );
    }
    return generated;
  } catch (err) {
    // Never crash, never fabricate a result as a fallback — the original
    // Photo row is untouched; only this generation attempt is marked
    // FAILED with a safe, human-readable reason (never the API key) and a
    // machine-readable diagnostic code (item 3), so a real failure — auth,
    // network/DNS, timeout, rate limit, bad request, unavailable model,
    // an invalid response, a failed ORIGINAL download, or a failed Blob
    // save — is never reported as an undifferentiated generic error.
    const message = err instanceof Error ? err.message : "Vizualizaci se nepodařilo vygenerovat.";
    const code = typeof (err as any)?.code === "string" ? (err as any).code : "GEMINI_RESPONSE_INVALID";
    await logProviderFailure(provider.key, message);
    return prisma.photoGeneration.update({
      where: { id: pending.id },
      data: { status: "FAILED", failureReason: message, failureCode: code }
    });
  }
}
