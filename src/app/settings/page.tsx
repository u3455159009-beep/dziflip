import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getDefaultTemplate } from "@/lib/outreach";
import { SettingsManager } from "@/components/settings/SettingsManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  await getDefaultTemplate();
  const templates = await prisma.messageTemplate.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div>
      <h1 className="mb-8 font-serif text-3xl text-ink">Nastavení</h1>
      <SettingsManager
        initialSettings={JSON.parse(JSON.stringify(settings))}
        initialTemplates={JSON.parse(JSON.stringify(templates))}
      />
    </div>
  );
}
