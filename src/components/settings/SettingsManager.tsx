"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import {
  CONTACT_AUTOMATION_MODES,
  CONTACT_AUTOMATION_MODE_LABELS,
  SMS_AUTOMATION_MODES,
  SMS_AUTOMATION_MODE_LABELS,
  COMP_QUALITY_TIERS,
  COMP_QUALITY_TIER_LABELS,
  type CompQualityTier
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { ProviderHealthPanel } from "./ProviderHealthPanel";

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
  smsAutomationMode: string;
  smsAutomationConfirmedAt: string | null;
  maxAutoSmsPerDay: number;
  smsAutoReplyEnabled: boolean;
  showDemoData: boolean;
  minCompCount: number;
  minCompQuality: string;
  maxCompDistanceKm: number;
  maxCompAgeDays: number;
  aiPhotoAnalysisEnabled: boolean;
  staleDataThresholdDays: number;
  shoppingReferenceLocality: string | null;
  flatScanCacheTtlHours: number;
}

export interface TemplateDTO {
  id: string;
  name: string;
  body: string;
  channel: string;
  isDefault: boolean;
}

interface BlacklistEntry {
  id: string;
  phone: string;
  reason: string | null;
  createdAt: string;
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
  const [pendingSmsAutoConfirm, setPendingSmsAutoConfirm] = useState(false);
  const [smsAutoConfirmChecked, setSmsAutoConfirmChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [newBlacklistPhone, setNewBlacklistPhone] = useState("");
  const [newBlacklistReason, setNewBlacklistReason] = useState("");

  useEffect(() => {
    fetch("/api/sms/blacklist")
      .then((r) => r.json())
      .then(setBlacklist)
      .catch(() => {});
  }, []);

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

  async function handleSmsModeChange(next: string) {
    if (next === "AUTO" && settings.smsAutomationMode !== "AUTO") {
      setPendingSmsAutoConfirm(true);
      return;
    }
    setSettings((s) => ({ ...s, smsAutomationMode: next }));
    await patchSettings({ smsAutomationMode: next });
  }

  async function confirmSmsAuto() {
    const ok = await patchSettings({ smsAutomationMode: "AUTO", confirmSmsAuto: true });
    if (ok) {
      setSettings((s) => ({ ...s, smsAutomationMode: "AUTO" }));
      setPendingSmsAutoConfirm(false);
      setSmsAutoConfirmChecked(false);
    }
  }

  async function addBlacklistEntry() {
    if (!newBlacklistPhone.trim()) return;
    const res = await fetch("/api/sms/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: newBlacklistPhone.trim(), reason: newBlacklistReason.trim() || undefined })
    });
    if (res.ok) {
      const entry = await res.json();
      setBlacklist((b) => [entry, ...b.filter((x) => x.phone !== entry.phone)]);
      setNewBlacklistPhone("");
      setNewBlacklistReason("");
    }
  }

  async function removeBlacklistEntry(phone: string) {
    setBlacklist((b) => b.filter((x) => x.phone !== phone));
    await fetch(`/api/sms/blacklist/${encodeURIComponent(phone)}`, { method: "DELETE" });
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
        <SectionTitle subtitle='Výchozí SMS režim je "Návrh ke schválení". SMS telefonním číslům NEIMPLEMENTUJEME hovory — pouze textové zprávy. AUTO smí odeslat pouze pokud nabídka splňuje Deal Radar kritéria, telefon je ze zdrojových dat, data confidence je HIGH, nabídka není DEMO, nejde o duplicitu, není vyčerpán denní limit a číslo není na blacklistu.'>
          SMS automatizace
        </SectionTitle>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select value={settings.smsAutomationMode} onChange={(e) => handleSmsModeChange(e.target.value)} label="Režim">
            {SMS_AUTOMATION_MODES.map((m) => (
              <option key={m} value={m}>
                {SMS_AUTOMATION_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
          <Input
            label="Max. automatických SMS / den"
            type="number"
            defaultValue={settings.maxAutoSmsPerDay}
            onBlur={(e) => patchSettings({ maxAutoSmsPerDay: e.target.value || 3 })}
          />
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.smsAutoReplyEnabled}
            onChange={(e) => {
              setSettings((s) => ({ ...s, smsAutoReplyEnabled: e.target.checked }));
              patchSettings({ smsAutoReplyEnabled: e.target.checked });
            }}
          />
          Povolit automatické odpovědi na příchozí SMS
        </label>
        <p className="mt-1 text-xs text-muted">
          Výchozí = vypnuto. I při zapnutí aplikace nikdy sama nepotvrzuje termín prohlídky — odpověď si vždy
          nejprve připravíte tlačítkem a teprve poté schválíte k odeslání.
        </p>

        {settings.smsAutomationMode === "AUTO" && settings.smsAutomationConfirmedAt && (
          <p className="mt-3 text-xs text-muted">
            AUTO potvrzeno {formatDate(settings.smsAutomationConfirmedAt)}. Kdykoliv jej můžete okamžitě vypnout
            výběrem jiného režimu výše.
          </p>
        )}

        {pendingSmsAutoConfirm && (
          <div className="mt-4 rounded-lg border border-band-bad/40 bg-band-badBg p-4">
            <p className="text-sm font-medium text-band-bad">Potvrzení před zapnutím SMS AUTO</p>
            <p className="mt-1 text-xs text-band-bad">
              V režimu AUTO může aplikace sama odeslat SMS makléři/prodávajícímu bez vašeho schválení jednotlivé
              zprávy — pouze pokud nemovitost projde všemi bezpečnostními pravidly a je nakonfigurován skutečný SMS
              provider. Bez SMS_API_URL/SMS_API_KEY/SMS_SENDER_ID se SMS pouze připraví, nikdy neodešle naslepo.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-band-bad">
              <input
                type="checkbox"
                checked={smsAutoConfirmChecked}
                onChange={(e) => setSmsAutoConfirmChecked(e.target.checked)}
              />
              Rozumím a přeji si SMS AUTO aktivovat.
            </label>
            <div className="mt-3 flex gap-2">
              <Button onClick={confirmSmsAuto} disabled={!smsAutoConfirmChecked || saving}>
                Potvrdit a aktivovat AUTO
              </Button>
              <Button variant="ghost" onClick={() => setPendingSmsAutoConfirm(false)}>
                Zrušit
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle subtitle="Telefonní čísla označená NEKONTAKTOVAT nikdy nedostanou automatickou ani ručně schválenou SMS z DziFlip.">
          SMS blacklist (NEKONTAKTOVAT)
        </SectionTitle>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Input label="Telefon" value={newBlacklistPhone} onChange={(e) => setNewBlacklistPhone(e.target.value)} />
          <Input label="Důvod (volitelné)" value={newBlacklistReason} onChange={(e) => setNewBlacklistReason(e.target.value)} />
          <Button variant="secondary" onClick={addBlacklistEntry}>
            + Přidat na blacklist
          </Button>
        </div>
        {blacklist.length === 0 ? (
          <p className="text-sm text-muted">Blacklist je prázdný.</p>
        ) : (
          <div className="space-y-1.5 text-sm">
            {blacklist.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between border-b border-line/60 py-1.5">
                <span className="number-tabular">
                  {entry.phone}
                  {entry.reason && <span className="ml-2 text-xs text-muted">{entry.reason}</span>}
                </span>
                <button onClick={() => removeBlacklistEntry(entry.phone)} className="text-xs text-muted hover:text-band-bad">
                  odebrat
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle subtitle="Výchozí šablony pro e-mail a SMS. Upravte text dle potřeby — placeholdery {{title}} a {{address}} se nahradí údaji o nemovitosti (jen e-mail).">
          Šablony zpráv
        </SectionTitle>
        <div className="space-y-4">
          {templates.map((t) => (
            <div key={t.id}>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                {t.name}
                <span className="rounded-full bg-beige-100 px-2 py-0.5 text-[10px]">{t.channel}</span>
                {t.isDefault && <span className="rounded-full bg-beige-100 px-2 py-0.5 text-[10px]">výchozí</span>}
              </div>
              <Textarea defaultValue={t.body} rows={t.channel === "SMS" ? 3 : 5} onBlur={(e) => saveTemplate(t.id, e.target.value)} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle subtitle="Parametry Real Data Engine — kolik a jak kvalitních srovnání je potřeba pro spolehlivý odhad, jak staré smí data být, a zda AI analýza fotografií smí běžet.">
          Real Data Engine
        </SectionTitle>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.showDemoData}
              onChange={(e) => {
                setSettings((s) => ({ ...s, showDemoData: e.target.checked }));
                patchSettings({ showDemoData: e.target.checked });
              }}
            />
            Zobrazovat DEMO data v přehledech (Deal Feed, projekty)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.aiPhotoAnalysisEnabled}
              onChange={(e) => {
                setSettings((s) => ({ ...s, aiPhotoAnalysisEnabled: e.target.checked }));
                patchSettings({ aiPhotoAnalysisEnabled: e.target.checked });
              }}
            />
            AI analýza fotografií zapnuta (vyžaduje připojený Vision provider — zatím PENDING_ACCESS)
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Min. počet comparables"
            type="number"
            defaultValue={settings.minCompCount}
            onBlur={(e) => patchSettings({ minCompCount: e.target.value || 3 })}
          />
          <Select
            label="Min. kvalita comparables"
            defaultValue={settings.minCompQuality}
            onChange={(e) => patchSettings({ minCompQuality: e.target.value })}
          >
            {COMP_QUALITY_TIERS.map((t) => (
              <option key={t} value={t}>
                {COMP_QUALITY_TIER_LABELS[t as CompQualityTier]}
              </option>
            ))}
          </Select>
          <Input
            label="Max. vzdálenost comparables (km)"
            type="number"
            defaultValue={settings.maxCompDistanceKm}
            onBlur={(e) => patchSettings({ maxCompDistanceKm: e.target.value || 2 })}
          />
          <Input
            label="Max. stáří comparables (dny)"
            type="number"
            defaultValue={settings.maxCompAgeDays}
            onBlur={(e) => patchSettings({ maxCompAgeDays: e.target.value || 180 })}
          />
          <Input
            label="Hranice zastaralosti dat (dny)"
            type="number"
            defaultValue={settings.staleDataThresholdDays}
            onBlur={(e) => patchSettings({ staleDataThresholdDays: e.target.value || 14 })}
          />
          <Input
            label="TTL cache FlatScan dat (hodiny)"
            type="number"
            defaultValue={settings.flatScanCacheTtlHours}
            onBlur={(e) => patchSettings({ flatScanCacheTtlHours: e.target.value || 24 })}
          />
        </div>
      </Card>

      <Card>
        <SectionTitle subtitle="Referenční lokalita se používá pouze k vyhledávání poboček obchodů u produktů (Fáze 5) — aplikace nikdy neukládá ani nezjišťuje přesnou polohu tvého zařízení.">
          Real Product Shopping Engine
        </SectionTitle>
        <Input
          label="Referenční lokalita (např. 'Praha 5')"
          defaultValue={settings.shoppingReferenceLocality ?? ""}
          onBlur={(e) => patchSettings({ shoppingReferenceLocality: e.target.value || null })}
        />
      </Card>

      <ProviderHealthPanel />
    </div>
  );
}
