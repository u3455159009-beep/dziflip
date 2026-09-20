// Provider Health for the image-generation/visualization pipeline (item
// 15 of the Gemini phase) — mirrors /api/sources/route.ts's derivation
// exactly: PENDING_ACCESS when no key, otherwise CONNECTED unless the most
// recent logged error is newer than the most recent successful generation,
// in which case ERROR. lastError only ever carries the sanitized message
// already produced by the provider — never the API key.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IMAGE_GEN_PROVIDERS } from "@/lib/imageGen/registry";

type ImageGenHealthStatus = "CONNECTED" | "PENDING_ACCESS" | "ERROR";

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
          lastError: null as { message: string; occurredAt: string } | null
        };
      }

      const [lastSuccess, totalGenerated, lastErrorLog] = await Promise.all([
        prisma.photoGeneration.findFirst({ where: { provider: p.key, status: "GENERATED" }, orderBy: { generatedAt: "desc" } }),
        prisma.photoGeneration.count({ where: { provider: p.key, status: "GENERATED" } }),
        prisma.providerErrorLog.findFirst({ where: { provider: p.key }, orderBy: { occurredAt: "desc" } })
      ]);

      const lastSuccessAt = lastSuccess?.generatedAt ?? null;
      const healthStatus: ImageGenHealthStatus =
        lastErrorLog && (!lastSuccessAt || lastErrorLog.occurredAt > lastSuccessAt) ? "ERROR" : "CONNECTED";

      return {
        key: p.key,
        label: p.label,
        status: p.status,
        statusNote: p.statusNote ?? null,
        healthStatus,
        lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
        totalGenerated,
        lastError: lastErrorLog ? { message: lastErrorLog.errorMessage, occurredAt: lastErrorLog.occurredAt.toISOString() } : null
      };
    })
  );

  return NextResponse.json(providers);
}
