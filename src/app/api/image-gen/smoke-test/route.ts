// On-demand, real connectivity check for the Gemini image-to-image
// provider (item 6 — "udělej skutečný server-side smoke test, nikdy
// fake/mock výsledek jako důkaz"). Makes exactly one real generateContent
// call against a tiny embedded test image; never fabricates an outcome.
// A failure is also logged to ProviderErrorLog so it counts as a real,
// verified attempt for Provider Health (item 5) — a success has no natural
// row to attach to (it isn't tied to any real photo), so it's reported
// directly in this response only, never as a synthetic PhotoGeneration.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runGeminiImageSmokeTest } from "@/lib/imageGen/gemini/provider";
import { PROVIDER_KEY } from "@/lib/imageGen/gemini/constants";

export const maxDuration = 60;

export async function POST() {
  const result = await runGeminiImageSmokeTest();
  const checkedAt = new Date().toISOString();

  if (result.status !== "OK") {
    await prisma.providerErrorLog.create({ data: { provider: PROVIDER_KEY, errorMessage: result.detail } }).catch(() => {});
    return NextResponse.json({ ok: false, code: result.code, detail: result.detail, checkedAt });
  }

  return NextResponse.json({ ok: true, model: result.model, checkedAt });
}
