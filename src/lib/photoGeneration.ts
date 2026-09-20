// Orchestration for Photo Before/After requests. Always records the
// request (style + prompt) so intent isn't lost; only actually calls a
// provider when one is ACTIVE. With no image-gen provider connected, every
// request is persisted as NOT_CONFIGURED — visible in the UI, never
// silently dropped or faked as a real generation.
import { prisma } from "@/lib/prisma";
import { getActiveImageGenProvider } from "@/lib/imageGen/registry";
import type { RenovationPlanContext } from "@/lib/imageGen/types";
import { createRequirementsFromChangeDetection } from "@/lib/productSearch";
import type { ChangeDetectionItem, PhotoGenerationStyle, RoomType } from "@/lib/types";

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

export async function requestPhotoGeneration(photoId: string, style: PhotoGenerationStyle, prompt: string | null) {
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) throw new Error("Fotografie nenalezena.");

  const plan = await prisma.renovationPlan.findUnique({ where: { projectId: photo.projectId } });
  const renovationPlanId = plan?.id ?? null;
  const planContext = toPlanContext(plan);
  const roomType = (photo.roomType as RoomType | null) ?? null;

  const provider = getActiveImageGenProvider();
  if (!provider) {
    return prisma.photoGeneration.create({
      data: { photoId, style, prompt, status: "NOT_CONFIGURED", renovationPlanId }
    });
  }

  const pending = await prisma.photoGeneration.create({
    data: { photoId, style, prompt, status: "PENDING", renovationPlanId }
  });
  try {
    const result = await provider.generate({ photoUrl: photo.url, style, prompt, roomType, planContext });
    const generated = await prisma.photoGeneration.update({
      where: { id: pending.id },
      data: {
        status: "GENERATED",
        generatedUrl: result.generatedUrl,
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
  } catch {
    return prisma.photoGeneration.update({ where: { id: pending.id }, data: { status: "FAILED" } });
  }
}
