// Builds an absolute DziFlip URL for deep links in e-mail notifications
// (the "OTEVŘÍT V DZIFLIPU" button). Only ever uses a real configured base
// — APP_BASE_URL, or Vercel's own auto-injected VERCEL_URL in production —
// never a guessed/hardcoded domain. Returns null when neither is set, so
// callers can fall back to an honest "open project #id in DziFlip" instead
// of a broken link.
export function buildAbsoluteAppUrl(path: string): string | null {
  const base = process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!base) return null;
  const normalizedBase = base.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
