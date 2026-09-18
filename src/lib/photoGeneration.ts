// Orchestration for Photo Before/After requests. Always records the
// request (style + prompt) so intent isn't lost; only actually calls a
// provider when one is ACTIVE. With no image-gen provider connected, every
// request is persisted as NOT_CONFIGURED — visible in the UI, never
// silently dropped or faked as a real generation.
import { prisma } from "@/lib/prisma";
import { getActiveImageGenProvider } from "@/lib/imageGen/registry";
import type { PhotoGenerationStyle } from "@/lib/types";

export async function requestPhotoGeneration(photoId: string, style: PhotoGenerationStyle, prompt: string | null) {
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) throw new Error("Fotografie nenalezena.");

  const provider = getActiveImageGenProvider();
  if (!provider) {
    return prisma.photoGeneration.create({
      data: { photoId, style, prompt, status: "NOT_CONFIGURED" }
    });
  }

  const pending = await prisma.photoGeneration.create({ data: { photoId, style, prompt, status: "PENDING" } });
  try {
    const result = await provider.generate({ photoUrl: photo.url, style, prompt });
    return prisma.photoGeneration.update({
      where: { id: pending.id },
      data: { status: "GENERATED", generatedUrl: result.generatedUrl, model: result.model, generatedAt: new Date() }
    });
  } catch {
    return prisma.photoGeneration.update({ where: { id: pending.id }, data: { status: "FAILED" } });
  }
}
