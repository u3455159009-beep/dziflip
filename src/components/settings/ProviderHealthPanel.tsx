"use client";

import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface ProviderHealthInfo {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote: string | null;
  healthStatus: "CONNECTED" | "PENDING_ACCESS" | "ERROR" | "DISABLED";
  lastSuccessAt: string | null;
  totalFound: number;
  lastError: { message: string; occurredAt: string } | null;
  monthlyRequestCount: number | null;
  monthlyRequestBudget: number | null;
}

// UNVERIFIED (item 5): a key is configured, but no real request — success
// or failure — has ever been recorded. A configured key is NOT the same
// claim as "connected and working"; this state exists specifically so the
// UI never conflates the two.
interface ImageGenHealthInfo {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote: string | null;
  healthStatus: "CONNECTED" | "PENDING_ACCESS" | "ERROR" | "UNVERIFIED";
  lastSuccessAt: string | null;
  totalGenerated: number;
  lastError: { message: string; occurredAt: string } | null;
  lastFailureCode: string | null;
}

type AnyHealthStatus = ProviderHealthInfo["healthStatus"] | ImageGenHealthInfo["healthStatus"];

const HEALTH_STYLES: Record<AnyHealthStatus, string> = {
  CONNECTED: "bg-band-goodBg text-band-good border-band-good/40",
  PENDING_ACCESS: "bg-beige-100 text-muted border-line",
  ERROR: "bg-band-badBg text-band-bad border-band-bad/40",
  DISABLED: "bg-beige-100 text-muted border-line",
  UNVERIFIED: "bg-band-normalBg text-band-normal border-band-normal/40"
};

const HEALTH_LABELS: Record<AnyHealthStatus, string> = {
  CONNECTED: "PŘIPOJENO A OVĚŘENO",
  PENDING_ACCESS: "ČEKÁ NA PŘÍSTUP",
  ERROR: "CHYBA",
  DISABLED: "VYPNUTO",
  UNVERIFIED: "KLÍČ NASTAVEN, NEOVĚŘENO"
};

type SmokeTestState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "ok"; model: string; checkedAt: string }
  | { phase: "failed"; code: string; detail: string; checkedAt: string };

export function ProviderHealthPanel() {
  const [providers, setProviders] = useState<ProviderHealthInfo[]>([]);
  const [imageGenProviders, setImageGenProviders] = useState<ImageGenHealthInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [smokeTest, setSmokeTest] = useState<SmokeTestState>({ phase: "idle" });

  function reloadImageGenHealth() {
    fetch("/api/image-gen")
      .then((r) => r.json())
      .then(setImageGenProviders)
      .catch(() => {});
  }

  async function runSmokeTest() {
    setSmokeTest({ phase: "running" });
    try {
      const res = await fetch("/api/image-gen/smoke-test", { method: "POST" });
      const data = await res.json();
      setSmokeTest(
        data.ok
          ? { phase: "ok", model: data.model, checkedAt: data.checkedAt }
          : { phase: "failed", code: data.code, detail: data.detail, checkedAt: data.checkedAt }
      );
    } catch {
      setSmokeTest({ phase: "failed", code: "GEMINI_DNS_OR_NETWORK_FAILED", detail: "Test se nepodařilo spustit (síťová chyba prohlížeče).", checkedAt: new Date().toISOString() });
    }
    // A failed smoke test is also logged server-side (ProviderErrorLog), so
    // the real-usage-derived health status above should reflect it too.
    reloadImageGenHealth();
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/sources").then((r) => r.json()),
      fetch("/api/image-gen").then((r) => r.json())
    ])
      .then(([sources, imageGen]) => {
        setProviders(sources);
        setImageGenProviders(imageGen);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const anyConnected = providers.some((p) => p.healthStatus === "CONNECTED");

  return (
    <Card>
      <SectionTitle subtitle="Skutečný stav každého zdroje dat pro srovnatelné nabídky a Deal Radar — nikdy nenahrazujeme chybějící reálný zdroj mock daty v produkční analýze.">
        Provider Health
      </SectionTitle>
      {!loaded ? (
        <p className="text-sm text-muted">Načítám…</p>
      ) : (
        <>
          {!anyConnected && (
            <div className="mb-4 rounded-lg border border-band-normal/40 bg-band-normalBg p-3 text-sm text-band-normal">
              Žádný REAL provider není aktuálně připojen. Automatické vyhledávání srovnatelných nabídek proto zatím
              nenajde žádná data — comparables je nutné přidávat ručně, dokud nebude aktivován alespoň jeden zdroj
              (viz statusNote u jednotlivých providerů níže).
            </div>
          )}
          <div className="space-y-2">
            {providers
              .filter((p) => p.key !== "MOCK_DEMO")
              .map((p) => (
                <div key={p.key} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{p.label}</span>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase ${HEALTH_STYLES[p.healthStatus]}`}>
                      {HEALTH_LABELS[p.healthStatus]}
                    </span>
                  </div>
                  {p.statusNote && <p className="mt-1 text-xs text-muted">{p.statusNote}</p>}
                  {p.status === "ACTIVE" && (
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-3">
                      <div>Poslední synchronizace: {p.lastSuccessAt ? formatDateTime(p.lastSuccessAt) : "zatím žádná"}</div>
                      <div>Získáno nabídek celkem: {p.totalFound}</div>
                      <div>{p.lastError ? `Poslední chyba: ${p.lastError.message} (${formatDateTime(p.lastError.occurredAt)})` : "Žádná chyba v logu"}</div>
                      {p.monthlyRequestBudget != null && (
                        <div>
                          API volání tento měsíc: {p.monthlyRequestCount} / {p.monthlyRequestBudget}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <h4 className="mb-2 text-sm font-medium text-ink">AI Renovation Visualization (image-to-image)</h4>
            <div className="space-y-2">
              {imageGenProviders.map((p) => (
                <div key={p.key} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{p.label}</span>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase ${HEALTH_STYLES[p.healthStatus]}`}>
                      {HEALTH_LABELS[p.healthStatus]}
                    </span>
                  </div>
                  {p.statusNote && <p className="mt-1 text-xs text-muted">{p.statusNote}</p>}
                  {p.status === "ACTIVE" && (
                    <>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-3">
                        <div>Poslední úspěšná vizualizace: {p.lastSuccessAt ? formatDateTime(p.lastSuccessAt) : "zatím žádná"}</div>
                        <div>Vygenerováno celkem: {p.totalGenerated}</div>
                        <div>
                          {p.lastError
                            ? `Poslední chyba${p.lastFailureCode ? ` (${p.lastFailureCode})` : ""}: ${p.lastError.message} (${formatDateTime(p.lastError.occurredAt)})`
                            : "Žádná chyba v logu"}
                        </div>
                      </div>
                      {p.key === "GEMINI" && (
                        <div className="mt-3 border-t border-line pt-3">
                          <button
                            type="button"
                            onClick={runSmokeTest}
                            disabled={smokeTest.phase === "running"}
                            className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-beige-50 disabled:opacity-60"
                          >
                            {smokeTest.phase === "running" ? "Testuji připojení…" : "Otestovat připojení (skutečný požadavek na Gemini)"}
                          </button>
                          {smokeTest.phase === "ok" && (
                            <p className="mt-2 text-xs text-band-good">
                              ✓ Test úspěšný — Gemini odpověděl reálným obrázkem (model: {smokeTest.model}, {formatDateTime(smokeTest.checkedAt)}).
                            </p>
                          )}
                          {smokeTest.phase === "failed" && (
                            <p className="mt-2 text-xs text-band-bad">
                              ✗ Test selhal ({smokeTest.code}): {smokeTest.detail} ({formatDateTime(smokeTest.checkedAt)})
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
