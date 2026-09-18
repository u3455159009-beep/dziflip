// Orchestration glue for AI Photo Analysis: checks the Settings toggle and
// provider availability, runs the vision provider, and persists the result
// onto the Photo row. Throws PhotoAnalysisNotAvailableError (never silently
// fabricates a result) whenever AI analysis isn't actually possible right
// now — callers should fall back to the manual tagging UI in that case.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getActiveVisionProvider } from "@/lib/vision/registry";

export class PhotoAnalysisNotAvailableError extends Error {}

export async function analyzePhotoWithAi(photoId: string) {
  const settings = await getSettings();
  if (!settings.aiPhotoAnalysisEnabled) {
    throw new PhotoAnalysisNotAvailableError(
      "AI analýza fotografií je v Nastavení vypnutá. Fotografie zatím taguj ručně, nebo AI analýzu zapni v Nastavení, jakmile bude k dispozici skutečný Vision provider."
    );
  }

  const provider = getActiveVisionProvider();
  if (!provider) {
    throw new PhotoAnalysisNotAvailableError(
      "Žádný AI Vision provider není aktivně připojen — chybí schválené API pro rozpoznávání fotografií. Fotografie zatím taguj ručně."
    );
  }

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) throw new Error("Fotografie nenalezena.");

  const result = await provider.analyzePhoto(photo.url);

  return prisma.photo.update({
    where: { id: photoId },
    data: {
      roomType: result.roomType,
      currentCondition: result.currentCondition,
      visibleIssues: JSON.stringify(result.visibleIssues),
      keepNotes: result.keepNotes,
      removeNotes: result.removeNotes,
      replaceNotes: result.replaceNotes,
      renovationSuggestions: result.renovationSuggestions,
      analysisConfidence: result.confidence,
      analysisSource: "AI_VISION",
      analyzedAt: new Date()
    }
  });
}
