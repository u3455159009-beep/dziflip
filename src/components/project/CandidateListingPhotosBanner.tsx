"use client";

// POSSIBLE_MATCH photo confirmation (items 1/2) — the Listing Discovery
// Engine found a candidate it isn't fully sure is the same property, so its
// photos are shown here for explicit confirmation instead of being
// silently attached to the project.
import { useState } from "react";
import { Button, Card } from "@/components/ui";

export function CandidateListingPhotosBanner({
  projectId,
  candidatePhotosJson,
  discoveredListingUrl,
  confidence,
  onResolved
}: {
  projectId: string;
  candidatePhotosJson: string;
  discoveredListingUrl: string | null;
  confidence: string | null;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const photos: string[] = (() => {
    try {
      const parsed = JSON.parse(candidatePhotosJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  async function resolve(confirmed: boolean) {
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/photos/confirm-candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed })
      });
      onResolved();
    } finally {
      setBusy(false);
    }
  }

  if (photos.length === 0) return null;

  return (
    <Card className="border-band-normal/40 bg-band-normalBg">
      <div className="mb-2 text-sm font-medium text-ink">
        Nalezena {confidence === "POSSIBLE_MATCH" ? "možná" : ""} shoda inzerátu s fotografiemi — potvrďte, že jde o stejnou nemovitost
      </div>
      <p className="mb-3 text-xs text-muted">
        Fotografie NIKDY nepřebíráme z nabídky, u které si nejsme dostatečně jistí, že jde o stejnou nemovitost.
        {discoveredListingUrl && (
          <>
            {" "}
            Kandidát:{" "}
            <a href={discoveredListingUrl} target="_blank" rel="noreferrer" className="text-beige-500 underline underline-offset-2">
              zobrazit inzerát
            </a>
            .
          </>
        )}
      </p>
      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.slice(0, 10).map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="" className="aspect-square w-full rounded object-cover" />
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => resolve(true)} disabled={busy}>
          Ano, je to stejná nemovitost — použít fotografie
        </Button>
        <Button variant="secondary" onClick={() => resolve(false)} disabled={busy}>
          Ne, zamítnout
        </Button>
      </div>
    </Card>
  );
}
