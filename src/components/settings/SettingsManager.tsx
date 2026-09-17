"use client";

import { useState } from "react";
import { Button, Card, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import { CONTACT_AUTOMATION_MODES, CONTACT_AUTOMATION_MODE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/format";

export interface SettingsDTO {
  defaultMinProfit: number | null;
  defaultMinRoiPct: number | null;
  defaultReserve: number | null;
  defaultRenovationCostPerM2: number | null;
  preferredLocalities: string | null;
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifyEmailAddress: string | null;
  contactAutomationMode: string;
  contactAutomationConfirmedAt: string | null;
  dailyContactLimit: number;
}

export interface TemplateDTO {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
}

export function SettingsManager({
  initialSettings,
  initialTemplates
}: {
  initialSettings: SettingsDTO;
  initialTemplates: TemplateDTO[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [templates, setTemplates] = useState(initialTemplates);
  const [pendingAutoConfirm, setPendingAutoConfirm] = useState(false);
  const [autoConfirmChecked, setAutoConfirmChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  async function patchSettings(data: Record<string, any>) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const updated = await res.json();
      if (res.ok) setSettings((s) => ({ ...s, ...updated }));
      else alert(updated.error || "Uložení selhalo.");
      return res.ok;
    } finally {
      setSaving(false);
    }
  }

  async function handleModeChange(next: string) {
    if (next === "AUTO" && settings.contactAutomationMode !== "AUTO") {
      setPendingAutoConfirm(true);
      return;
    }
    setSettings((s) => ({ ...s, contactAutomationMode: next }));
    await patchSettings({ contactAutomationMode: next });
  }

  async function confirmAuto() {
    const ok = await patchSettings({ contactAutomationMode: "AUTO", confirmAuto: true });
    if (ok) {
      setSettings((s) => ({ ...s, contactAutomationMode: "AUTO" }));
      setPendingAutoConfirm(false);
      setAutoConfirmChecked(false);
    }
  }

  async function saveTemplate(id: string, body: string) {
    setTemplates((t) => t.map((x) => (x.id === id ? { ...x, body } : x)));
    await fetch(`/api/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
  }

  return (
    <div className="space-y-8">
      <Card>
        <SectionTitle subtitle="Výchozí hodnoty se použijí při automatickém vytvoření projektu z Deal Radaru, pokud je hlídač sám nespecifikuje.">
          Výchozí parametry flipu
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Výchozí min. zisk (Kč)"
            type="number"
            defaultValue={settings.defaultMinProfit ?? ""}
            onBlur={(e) => patchSettings({ defaultMinProfit: e.target.value || null })}
          />
          <Input
            label="Výchozí min. ROI (%)"
            type="number"
            defaultValue={settings.defaultMinRoiPct != null ? settings.defaultMinRoiPct * 100 : ""}
            onBlur={(e) => patchSettings({ defaultMinRoiPct: e.target.value ? Number(e.target.value) / 100 : null })}
          />
          <Input
            label="Výchozí rezerva (Kč)"
            type="number"
            defaultValue={settings.defaultReserve ?? ""}
            onBlur={(e) => patchSettings({ defaultReserve: e.target.value || null })}
          />
          <Input
            label="Výchozí cena rekonstrukce (Kč/m²)"
            type="number"
            defaultValue={settings.defaultRenovationCostPerM2 ?? ""}
            onBlur={(e) => patchSettings({ defaultRenovationCostPerM2: e.target.value || null })}
          />
        </div>
        <div className="mt-4">
          <Input
            label="Preferované lokality (oddělené čárkou)"
            defaultValue={settings.preferredLocalities ? JSON.parse(settings.preferredLocalities).join(", ") : ""}
            onBlur={(e) =>
              patchSettings({
                preferredLocalities: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
          />
        </div>
      </Card>

      <Card>
        <SectionTitle subtitle="V-app upozornění se zapisují vždy do Deal Alerts inboxu. E-mail vyžaduje nastavení SMTP_HOST/SMTP_FROM v prostředí serveru — bez toho aplikace nikdy nepředstírá odeslání.">
          Notifikace
        </SectionTitle>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.notifyInApp}
              onChange={(e) => {
                setSettings((s) => ({ ...s, notifyInApp: e.target.checked }));
                patchSettings({ notifyInApp: e.target.checked });
              }}
            />
            V aplikaci (Deal Alerts)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.notifyEmail}
              onChange={(e) => {
                setSettings((s) => ({ ...s, notifyEmail: e.target.checked }));
                patchSettings({ notifyEmail: e.target.checked });
              }}
            />
            E-mail
          </label>
          {settings.notifyEmail && (
            <Input
              label="E-mailová adresa pro upozornění"
              defaultValue={settings.notifyEmailAddress ?? ""}
              onBlur={(e) => patchSettings({ notifyEmailAddress: e.target.value || null })}
            />
          )}
          <p className="text-xs text-muted">
            Push/mobilní notifikace a SMS jsou připravené jako architektura (viz src/lib/notifications), zatím bez
            funkčního providera.
          </p>
        </div>
      </Card>

      <Card>
        <SectionTitle subtitle='Výchozí režim je "Návrh ke schválení". Režim AUTO smí odeslat zprávu pouze při splnění všech pravidel (HIGH data confidence, denní limit, ochrana proti duplicitě) a jeho první aktivace vyžaduje výslovné potvrzení.'>
          Automatizace kontaktování
        </SectionTitle>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select value={settings.contactAutomationMode} onChange={(e) => handleModeChange(e.target.value)} label="Režim">
            {CONTACT_AUTOMATION_MODES.map((m) => (
              <option key={m} value={m}>
                {CONTACT_AUTOMATION_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
          <Input
            label="Denní limit zpráv"
            type="number"
            defaultValue={settings.dailyContactLimit}
            onBlur={(e) => patchSettings({ dailyContactLimit: e.target.value || 5 })}
          />
        </div>

        {settings.contactAutomationMode === "AUTO" && settings.contactAutomationConfirmedAt && (
          <p className="mt-3 text-xs text-muted">
            AUTO potvrzeno {formatDate(settings.contactAutomationConfirmedAt)}. Kdykoliv jej můžete okamžitě vypnout
            výběrem jiného režimu výše.
          </p>
        )}

        {pendingAutoConfirm && (
          <div className="mt-4 rounded-lg border border-band-bad/40 bg-band-badBg p-4">
            <p className="text-sm font-medium text-band-bad">Potvrzení před zapnutím AUTO</p>
            <p className="mt-1 text-xs text-band-bad">
              V režimu AUTO může aplikace sama odeslat zprávu makléři/prodávajícímu bez vašeho schválení
              jednotlivé zprávy — pouze pokud nemovitost splní všechna vaše pravidla (cenové pásmo, min. zisk/ROI,
              HIGH data confidence, denní limit, ochrana proti duplicitě) a pouze pokud je e-mailový provider
              skutečně nakonfigurován. Bez SMTP nastavení se zpráva pouze připraví, nikdy neodešle naslepo.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-band-bad">
              <input type="checkbox" checked={autoConfirmChecked} onChange={(e) => setAutoConfirmChecked(e.target.checked)} />
              Rozumím a přeji si AUTO aktivovat.
            </label>
            <div className="mt-3 flex gap-2">
              <Button onClick={confirmAuto} disabled={!autoConfirmChecked || saving}>
                Potvrdit a aktivovat AUTO
              </Button>
              <Button variant="ghost" onClick={() => setPendingAutoConfirm(false)}>
                Zrušit
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle subtitle="Výchozí šablona žádosti o prohlídku. Upravte text dle potřeby — placeholdery {{title}} a {{address}} se nahradí údaji o nemovitosti.">
          Šablony zpráv
        </SectionTitle>
        <div className="space-y-4">
          {templates.map((t) => (
            <div key={t.id}>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                {t.name}
                {t.isDefault && <span className="rounded-full bg-beige-100 px-2 py-0.5 text-[10px]">výchozí</span>}
              </div>
              <Textarea defaultValue={t.body} rows={5} onBlur={(e) => saveTemplate(t.id, e.target.value)} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
