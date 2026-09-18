// REAL/MANUAL/DEMO distinction — shown everywhere a listing appears, so
// it's never ambiguous whether a number came from a connected data source,
// a human typing it in, or the built-in DEMO fixtures.
export type DataOrigin = "DEMO" | "REAL" | "MANUAL";

export function computeDataOrigin(project: { isDemo: boolean; sourceWatcherId: string | null }): DataOrigin {
  if (project.isDemo) return "DEMO";
  if (project.sourceWatcherId) return "REAL";
  return "MANUAL";
}

export const DATA_ORIGIN_LABELS: Record<DataOrigin, string> = {
  DEMO: "DEMO",
  REAL: "REÁLNÁ DATA",
  MANUAL: "MANUÁLNÍ VSTUP"
};
