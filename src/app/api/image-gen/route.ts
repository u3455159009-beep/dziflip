// Provider Health for the image-generation/visualization pipeline (item
// 15 of the Gemini phase; item 5 of the production-fix phase). Real,
// verified status only: PENDING_ACCESS when no key, UNVERIFIED when a key
// is configured but no real request has ever succeeded or failed,
// otherwise CONNECTED/ERROR from whichever real attempt (success or
// logged failure) is most recent. A configured key alone is NEVER reported
// as CONNECTED — that claim requires at least one real, observed outcome
// (real usage, or the on-demand smoke test at POST .../smoke-test).
// lastError only ever carries the sanitized message already produced by
// the provider — never the API key.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IMAGE_GEN_PROVIDERS } from "@/lib/imageGen/registry";
import { deriveImageGenHealthStatus, type ImageGenHealthStatus } from "@/lib/imageGen/health";

export async function GET() {
  const providers = await Promise.all(
    IMAGE_GEN_PROVIDERS.map(async (p) => {
      if (p.status === "PENDING_ACCESS") {
        return {
          key: p.key,
          label: p.label,
          status: p.status,
          statusNote: p.statusNote ?? null,
          healthStatus: "PENDING_ACCESS" as ImageGenHealthStatus,
          lastSuccessAt: null as string | null,
          totalGenerated: 0,
          lastError: null as { message: string; occurredAt: string } | null,
          lastFailureCode: null as string | null
        };
      }

      const [lastSuccess, totalGenerated, lastErrorLog, lastFailedGeneration] = await Promise.all([
        prisma.photoGeneration.findFirst({ where: { provider: p.key, status: "GENERATED" }, orderBy: { generatedAt: "desc" } }),
        prisma.photoGeneration.count({ where: { provider: p.key, status: "GENERATED" } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } }),
        prisma.photoGeneration.findFirst({ where: { provider: p.key, status: "FAILED" }, orderBy: { createdAt: "desc" } })
      ]);

      const lastSuccessAt = lastSuccess?.generatedAt ?? null;
      const healthStatus = deriveImageGenHealthStatus({
        configured: true,
        lastSuccessAt,
        lastErrorAt: lastErrorLog?.occurredAt ?? null
      });

      return {
        key: p.key,
        label: p.label,
        status: p.status,
        statusNote: p.statusNote ?? null,
        healthStatus,
        lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
        totalGenerated,
        lastError: lastErrorLog ? { message: lastErrorLog.errorMessage, occurredAt: lastErrorLog.occurredAt.toISOString() } : null,
        lastFailureCode: lastFailedGeneration?.failureCode ?? null
      };
    })
  );

  return NextResponse.json(providers);
}
