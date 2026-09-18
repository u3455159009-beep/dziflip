import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { analyzePhotoWithAi, PhotoAnalysisNotAvailableError } from "@/lib/photoAnalysis";
import { maybeSendAutoSms } from "@/lib/smsHub";
import { updateSettings } from "@/lib/settings";

async function wipeDb() {
  await prisma.smsMessage.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.project.deleteMany();
}

describe("AI Photo Analysis — manual fallback (no Vision provider connected)", () => {
  beforeAll(wipeDb);
  afterAll(wipeDb);

  it("throws PhotoAnalysisNotAvailableError instead of fabricating a result when AI analysis is disabled", async () => {
    await updateSettings({ aiPhotoAnalysisEnabled: false });
    const project = await prisma.project.create({ data: { title: "Test" } });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/a.jpg", sortOrder: 0 } });

    await expect(analyzePhotoWithAi(photo.id)).rejects.toBeInstanceOf(PhotoAnalysisNotAvailableError);

    const unchanged = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(unchanged.analysisSource).toBe("MANUAL");
    expect(unchanged.roomType).toBeNull();
  });

  it("still throws even when the setting is enabled, because no Vision provider is actually ACTIVE", async () => {
    await updateSettings({ aiPhotoAnalysisEnabled: true });
    const project = await prisma.project.create({ data: { title: "Test 2" } });
    const photo = await prisma.photo.create({ data: { projectId: project.id, url: "https://example.test/b.jpg", sortOrder: 0 } });

    await expect(analyzePhotoWithAi(photo.id)).rejects.toBeInstanceOf(PhotoAnalysisNotAvailableError);
    await updateSettings({ aiPhotoAnalysisEnabled: false });
  });
});

describe("SMS automation safety — no test in this suite may send a real SMS", () => {
  beforeAll(wipeDb);
  afterAll(wipeDb);

  it("the default DRAFT automation mode only ever prepares a DRAFT message, never SENT", async () => {
    await updateSettings({ smsAutomationMode: "DRAFT" });
    const project = await prisma.project.create({
      data: {
        title: "SMS test",
        askingPrice: 5000000,
        contact: { create: { phone: "+420600123456", status: "NEKONTAKTOVANO" } }
      }
    });

    await maybeSendAutoSms(project.id);

    const messages = await prisma.smsMessage.findMany({ where: { projectId: project.id } });
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) {
      expect(m.status).not.toBe("SENT");
      expect(m.status).not.toBe("DELIVERED");
    }
  });

  it("OFF mode sends nothing at all", async () => {
    await updateSettings({ smsAutomationMode: "OFF" });
    const project = await prisma.project.create({
      data: {
        title: "SMS test OFF",
        askingPrice: 5000000,
        contact: { create: { phone: "+420600999888", status: "NEKONTAKTOVANO" } }
      }
    });

    await maybeSendAutoSms(project.id);

    const messages = await prisma.smsMessage.findMany({ where: { projectId: project.id } });
    expect(messages.length).toBe(0);
    await updateSettings({ smsAutomationMode: "DRAFT" });
  });
});
