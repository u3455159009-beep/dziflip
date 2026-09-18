// Stale Data tracking — a field's last-verified timestamp ages out after
// Settings.staleDataThresholdDays. Never verified counts as stale: absence
// of a verification date is not evidence of freshness.
export function isDataStale(lastVerifiedAt: Date | string | null | undefined, thresholdDays: number): boolean {
  if (!lastVerifiedAt) return true;
  const ageMs = Date.now() - new Date(lastVerifiedAt).getTime();
  return ageMs > thresholdDays * 24 * 60 * 60 * 1000;
}
