// "K dokončení analýzy chybí:" banner (item 14) — shown at the very top of
// the project detail page whenever the analysis is incomplete, so the user
// immediately knows why they don't see a full investment result yet. Not
// rendered at all once every gap is closed.
import { computeAnalysisGaps, type AnalysisGapsInput } from "@/lib/analysisGaps";

export function AnalysisGapsBanner(input: AnalysisGapsInput) {
  const gaps = computeAnalysisGaps(input);
  if (gaps.length === 0) return null;

  return (
    <div className="rounded-lg border border-band-normal/40 bg-band-normalBg p-4 text-sm text-band-normal">
      <div className="font-medium">K dokončení analýzy chybí:</div>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
        {gaps.map((gap, i) => (
          <li key={i}>{gap}</li>
        ))}
      </ul>
    </div>
  );
}
