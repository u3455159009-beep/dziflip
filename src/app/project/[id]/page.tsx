import { notFound } from "next/navigation";
import { getProjectWithRelations } from "@/lib/projectData";
import { ProjectView } from "@/components/project/ProjectView";
import { getSettings } from "@/lib/settings";
import { computeMarketValue, computeARV, type MarketValueComparable } from "@/lib/marketValue";
import type { CompQualityTier } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const project = await getProjectWithRelations(params.id);

  if (!project) notFound();

  const settings = await getSettings();
  const marketValueComparables: MarketValueComparable[] = project.comparables.map((c) => ({
    pricePerM2: c.pricePerM2,
    qualityTier: (c.qualityTier as CompQualityTier | null) ?? null,
    priceType: c.priceType,
    condition: c.condition
  }));
  const opts = {
    minCompCount: settings.minCompCount,
    minCompQuality: settings.minCompQuality as CompQualityTier
  };
  const marketValue = computeMarketValue(marketValueComparables, project.areaM2, opts);
  const arv = computeARV(marketValueComparables, project.areaM2, opts);

  const serialized = JSON.parse(JSON.stringify(project));

  return (
    <ProjectView
      project={serialized}
      marketValue={marketValue}
      arv={arv}
      staleDataThresholdDays={settings.staleDataThresholdDays}
    />
  );
}
