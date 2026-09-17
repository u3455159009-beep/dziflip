import { prisma } from "./prisma";

const SETTINGS_ID = "singleton";

export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: SETTINGS_ID } });
}

export async function updateSettings(data: Record<string, any>) {
  await getSettings(); // ensure row exists
  return prisma.settings.update({ where: { id: SETTINGS_ID }, data });
}
