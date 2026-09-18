// Duplicate detection: the same physical property is often listed on
// several portals (or re-listed later at a different price). This module
// scores how likely two Project rows are the same property, using only
// data actually on file — never guessing an address match from coincidence
// alone. A classification of SAME_PROPERTY always requires a strong,
// independent signal (matching street or matching contact phone), not just
// a high aggregate score, so ordinary "similar flat in the same building"
// coincidences never get auto-merged.
import { prisma } from "@/lib/prisma";
import type { DuplicateClassification } from "./types";

export interface DedupCandidate {
  id: string;
  title: string | null;
  municipality: string | null;
  district: string | null;
  street: string | null;
  areaM2: number | null;
  disposition: string | null;
  askingPrice: number | null;
  fullText: string | null;
  contactPhone: string | null;
}

export interface DedupMatchResult {
  score: number; // 0-1
  classification: DuplicateClassification;
  reasons: string[];
}

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhone(s: string | null | undefined): string {
  return (s ?? "").replace(/[^\d]/g, "").replace(/^420/, "");
}

function jaccardTokens(a: string, b: string): number {
  const setA = new Set(normalize(a).split(" ").filter((t) => t.length > 3));
  const setB = new Set(normalize(b).split(" ").filter((t) => t.length > 3));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function scoreDuplicateMatch(a: DedupCandidate, b: DedupCandidate): DedupMatchResult {
  const reasons: string[] = [];
  let strongEvidence = false;
  let weightedScore = 0;
  let totalWeight = 0;

  // Street — strong, independent signal.
  const streetA = normalize(a.street);
  const streetB = normalize(b.street);
  if (streetA && streetB) {
    if (streetA === streetB) {
      strongEvidence = true;
      weightedScore += 0.3;
      reasons.push("Stejná ulice");
    }
    totalWeight += 0.3;
  }

  // Contact phone — strong, independent signal.
  const phoneA = normalizePhone(a.contactPhone);
  const phoneB = normalizePhone(b.contactPhone);
  if (phoneA && phoneB) {
    if (phoneA === phoneB) {
      strongEvidence = true;
      weightedScore += 0.25;
      reasons.push("Stejný kontaktní telefon");
    }
    totalWeight += 0.25;
  }

  // Locality (municipality + district) — weaker, supporting signal.
  const locA = normalize(`${a.municipality ?? ""} ${a.district ?? ""}`);
  const locB = normalize(`${b.municipality ?? ""} ${b.district ?? ""}`);
  if (locA && locB) {
    if (locA === locB) {
      weightedScore += 0.1;
      reasons.push("Stejná lokalita");
    }
    totalWeight += 0.1;
  }

  // Area
  if (a.areaM2 && b.areaM2) {
    const diff = Math.abs(a.areaM2 - b.areaM2);
    const similarity = Math.max(0, 1 - diff / Math.max(a.areaM2, b.areaM2));
    if (diff <= 2) reasons.push(`Téměř shodná plocha (${a.areaM2} m² vs ${b.areaM2} m²)`);
    weightedScore += 0.15 * similarity;
    totalWeight += 0.15;
  }

  // Disposition
  if (a.disposition && b.disposition) {
    if (normalize(a.disposition) === normalize(b.disposition)) {
      weightedScore += 0.1;
      reasons.push("Stejná dispozice");
    }
    totalWeight += 0.1;
  }

  // Price proximity (within 5% counted as strong match)
  if (a.askingPrice && b.askingPrice) {
    const diff = Math.abs(a.askingPrice - b.askingPrice);
    const rel = diff / Math.max(a.askingPrice, b.askingPrice);
    const similarity = Math.max(0, 1 - rel / 0.1); // linear falloff, 0 at 10% difference
    if (rel <= 0.05) reasons.push("Téměř shodná cena");
    weightedScore += 0.1 * similarity;
    totalWeight += 0.1;
  }

  // Text similarity
  if (a.fullText && b.fullText) {
    const sim = jaccardTokens(a.fullText, b.fullText);
    if (sim > 0.3) reasons.push(`Podobný text inzerátu (${Math.round(sim * 100)} % shoda slov)`);
    weightedScore += 0.1 * sim;
    totalWeight += 0.1;
  }

  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

  let classification: DuplicateClassification;
  if (strongEvidence && score >= 0.7) {
    classification = "SAME_PROPERTY";
  } else if (score >= 0.45) {
    classification = "POSSIBLE_DUPLICATE";
  } else {
    classification = "DIFFERENT";
  }

  return { score: Math.round(score * 1000) / 1000, classification, reasons };
}

/**
 * Compares `projectId` against every other project and upserts a
 * PossibleDuplicate row for anything that isn't clearly DIFFERENT. Never
 * merges anything automatically — SAME_PROPERTY is just the strongest
 * classification shown to the user, who still resolves it manually.
 */
export async function findPossibleDuplicates(projectId: string): Promise<number> {
  const target = await prisma.project.findUnique({
    where: { id: projectId },
    include: { contact: true }
  });
  if (!target) return 0;

  const others = await prisma.project.findMany({
    where: { id: { not: projectId } },
    include: { contact: true }
  });

  const toCandidate = (p: typeof target): DedupCandidate => ({
    id: p!.id,
    title: p!.title,
    municipality: p!.municipality,
    district: p!.district,
    street: p!.street,
    areaM2: p!.areaM2,
    disposition: p!.disposition,
    askingPrice: p!.askingPrice,
    fullText: p!.fullText,
    contactPhone: p!.contact?.phone ?? null
  });

  const targetCandidate = toCandidate(target);
  let created = 0;

  for (const other of others) {
    const result = scoreDuplicateMatch(targetCandidate, toCandidate(other));
    if (result.classification === "DIFFERENT") continue;

    // Canonical ordering so (A,B) and (B,A) never both get created.
    const [projectAId, projectBId] = [projectId, other.id].sort();

    const existing = await prisma.possibleDuplicate.findUnique({
      where: { projectAId_projectBId: { projectAId, projectBId } }
    });
    if (existing?.resolvedStatus && existing.resolvedStatus !== "PENDING") continue; // user already decided

    await prisma.possibleDuplicate.upsert({
      where: { projectAId_projectBId: { projectAId, projectBId } },
      update: {
        matchScore: result.score,
        classification: result.classification,
        reasons: JSON.stringify(result.reasons)
      },
      create: {
        projectAId,
        projectBId,
        matchScore: result.score,
        classification: result.classification,
        reasons: JSON.stringify(result.reasons)
      }
    });
    created++;
  }

  return created;
}
