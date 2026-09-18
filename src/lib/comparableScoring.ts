// Orchestration glue between the pure Comparable Engine V2 math
// (comparableEngine.ts) and the database — scores one or all comparables
// of a project and persists the cached score/breakdown/tier.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { scoreComparable, type SubjectProperty, type ComparableForScoring } from "./comparableEngine";

export function projectToSubject(project: {
  municipality: string | null;
  district: string | null;
  disposition: string | null;
  areaM2: number | null;
  condition: string | null;
  buildingType: string | null;
  construction: string | null;
  ownership: string | null;
  floor: string | null;
  elevator: boolean | null;
  balcony: boolean | null;
  terrace: boolean | null;
  loggia: boolean | null;
  parking: boolean | null;
}): SubjectProperty {
  return {
    municipality: project.municipality,
    district: project.district,
    disposition: project.disposition,
    areaM2: project.areaM2,
    condition: project.condition,
    buildingType: project.buildingType,
    construction: project.construction,
    ownership: project.ownership,
    floor: project.floor,
    elevator: project.elevator,
    balcony: project.balcony,
    terrace: project.terrace,
    loggia: project.loggia,
    parking: project.parking
  };
}

function comparableToScoringInput(c: {
  locality: string | null;
  distanceKm: number | null;
  disposition: string | null;
  areaM2: number | null;
  condition: string | null;
  buildingType: string | null;
  construction: string | null;
  ownership: string | null;
  floor: string | null;
  elevator: boolean | null;
  balcony: boolean | null;
  terrace: boolean | null;
  loggia: boolean | null;
  parking: boolean | null;
  foundAt: Date;
}): ComparableForScoring {
  return c;
}

export async function rescoreComparable(projectId: string, comparableId: string) {
  const [project, comp, settings] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.comparable.findUnique({ where: { id: comparableId } }),
    getSettings()
  ]);
  if (!project || !comp) return null;

  const result = scoreComparable(projectToSubject(project), comparableToScoringInput(comp), {
    maxDistanceKm: settings.maxCompDistanceKm,
    maxAgeDays: settings.maxCompAgeDays
  });

  await prisma.comparable.update({
    where: { id: comparableId },
    data: {
      similarityScore: result.score,
      similarityBreakdown: JSON.stringify(result.breakdown),
      qualityTier: result.qualityTier
    }
  });

  return result;
}

export async function rescoreAllComparables(projectId: string) {
  const [project, comps, settings] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.comparable.findMany({ where: { projectId } }),
    getSettings()
  ]);
  if (!project) return;

  const subject = projectToSubject(project);
  const opts = { maxDistanceKm: settings.maxCompDistanceKm, maxAgeDays: settings.maxCompAgeDays };

  for (const comp of comps) {
    const result = scoreComparable(subject, comparableToScoringInput(comp), opts);
    await prisma.comparable.update({
      where: { id: comp.id },
      data: {
        similarityScore: result.score,
        similarityBreakdown: JSON.stringify(result.breakdown),
        qualityTier: result.qualityTier
      }
    });
  }
}
