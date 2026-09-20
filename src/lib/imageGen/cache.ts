// Idempotency / cache signature for a renovation visualization request
// (item 13). Two requests with the same original photo, the same style/
// prompt, the same RenovationPlan content and the same model hash to the
// same signature — a cache hit reuses the existing PhotoGeneration instead
// of spending another paid API call. Any change to the RenovationPlan (a
// different flooring, a different style, ...) changes the hash and forces
// a fresh generation.
import { createHash } from "crypto";
import type { RenovationPlanContext } from "./types";

export function computeRequestSignature(input: {
  photoUrl: string;
  style: string;
  prompt: string | null;
  providerKey: string;
  planContext: RenovationPlanContext | null;
}): string {
  // Sort keys explicitly (not relying on object insertion order surviving
  // a refactor) so the signature is stable regardless of how the caller
  // built the planContext object.
  const plan = input.planContext;
  const canonicalPlan = plan
    ? {
        style: plan.style,
        priceLevel: plan.priceLevel,
        flooring: plan.flooring,
        wallColor: plan.wallColor,
        doors: plan.doors,
        handles: plan.handles,
        outletsSwitches: plan.outletsSwitches,
        lighting: plan.lighting,
        kitchen: plan.kitchen,
        bathroomFixtures: plan.bathroomFixtures,
        tiles: plan.tiles,
        sanitary: plan.sanitary,
        builtIns: plan.builtIns
      }
    : null;

  const canonical = JSON.stringify({
    photoUrl: input.photoUrl,
    style: input.style,
    prompt: input.prompt,
    providerKey: input.providerKey,
    plan: canonicalPlan
  });

  return createHash("sha256").update(canonical).digest("hex");
}
