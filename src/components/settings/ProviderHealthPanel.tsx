"use client";

import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

// The exact six Provider Health states (Request E, item 6) — shared by
// every provider family (sources, image-gen, products). A provider is
// NEVER CONNECTED purely because an API key/env var exists; see
// src/lib/providerHealth.ts for the real derivation.
type HealthStatus = "CONNECTED" | "DEGRADED" | "UNVERIFIED" | "PENDING_ACCESS" | "UNAVAILABLE" | "ERROR";

interface ProviderHealthInfo {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote: string | null;
  healthStatus: HealthStatus;
  lastSuccessAt: string | null;
  totalFound: number;
  lastError: { message: string; occurredAt: string } | null;
  lastSuccessLatencyMs?: number | null;
  lastErrorLatencyMs?: number | null;
  rateLimitEncountered?: boolean;
  keyOrBillingRequired?: boolean;
  monthlyRequestCount: number | null;
  monthlyRequestBudget: number | null;
}

interface ImageGenHealthInfo {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote: string | null;
  healthStatus: HealthStatus;
  lastSuccessAt: string | null;
  totalGenerated: number;
  lastError: { message: string; occurredAt: string } | null;
  lastSuccessLatencyMs?: number | null;
  lastErrorLatencyMs?: number | null;
  rateLimitEncountered?: boolean;
  keyOrBillingRequired?: boolean;
  lastFailureCode: string | null;
}

const HEALTH_STYLES: Record<HealthStatus, string> = {
  CONNECTED: "bg-band-goodBg text-band-good border-band-good/40",
  DEGRADED: "bg-band-normalBg text-band-normal border-band-normal/40",
  PENDING_ACCESS: "bg-beige-100 text-muted border-line",
  UNAVAILABLE: "bg-band-badBg text-band-bad border-band-bad/40",
  ERROR: "bg-band-badBg text-band-bad border-band-bad/40",
  UNVERIFIED: "bg-band-normalBg text-band-normal border-band-normal/40"
};

const HEALTH_LABELS: Record<HealthStatus, string> = {
  CONNECTED: "PŘIPOJENO A OVĚŘENO",
  DEGRADED: "OMEZENO (RATE LIMIT)",
  PENDING_ACCESS: "ČEKÁ NA PŘÍSTUP",
  UNAVAILABLE: "NEDOSTUPNÉ",
  ERROR: "CHYBA",
  UNVERIFIED: "KLÍČ NASTAVEN, NEOVĚŘENO"
};

function ProviderHealthRow({
  p,
  totalLabel,
  totalValue,
  extra
}: {
  p: { key: string; label: string; status: string; statusNote: string | null; healthStatus: HealthStatus; lastSuccessAt: string | null; lastError: { message: string; occurredAt: string } | null; lastSuccessLatencyMs?: number | null; lastErrorLatencyMs?: number | null; rateLimitEncountered?: boolean; keyOrBillingRequired?: boolean };
  totalLabel: string;
  totalValue: number;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink">{p.label}</span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase ${HEALTH_STYLES[p.healthStatus]}`}>
          {HEALTH_LABELS[p.healthStatus]}
        </span>
      </div>
      {p.statusNote && <p className="mt-1 text-xs text-muted">{p.statusNote}</p>}
      {p.status === "ACTIVE" && (
        <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-2">
          <div>Poslední úspěšný požadavek: {p.lastSuccessAt ? formatDateTime(p.lastSuccessAt) : "zatím žádný"}</div>
          <div>
            {totalLabel}: {totalValue}
          </div>
          <div>
            {p.lastError ? `Poslední chyba: ${p.lastError.message} (${formatDateTime(p.lastError.occurredAt)})` : "Žádná chyba v logu"}
          </div>
          <div>
            Latence: {p.lastSuccessLatencyMs != null ? `${p.lastSuccessLatencyMs} ms` : p.lastErrorLatencyMs != null ? `${p.lastErrorLatencyMs} ms (chyba)` : "neznámá"}
          </div>
          {p.rateLimitEncountered && <div className="text-band-normal">Zaznamenán rate limit / kvóta API.</div>}
          {p.keyOrBillingRequired && <div className="text-band-bad">Vyžaduje platný klíč nebo aktivní billing.</div>}
          {extra}
        </div>
      )}
    </div>
  );
}

type SmokeTestState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "ok"; model: string; checkedAt: string }
  | { phase: "failed"; code: string; detail: string; checkedAt: string };

export function ProviderHealthPanel() {
  const [providers, setProviders] = useState<ProviderHealthInfo[]>([]);
  const [imageGenProviders, setImageGenProviders] = useState<ImageGenHealthInfo[]>([]);
  const [productProviders, setProductProviders] = useState<ProviderHealthInfo[]>([]);
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
      fetch("/api/image-gen").then((r) => r.json()),
      fetch("/api/products/providers").then((r) => r.json())
    ])
      .then(([sources, imageGen, products]) => {
        setProviders(sources);
        setImageGenProviders(imageGen);
        setProductProviders(products);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const anyConnected = providers.some((p) => p.healthStatus === "CONNECTED");

  return (
    <Card>
      <SectionTitle subtitle="Skutečný stav každého zdroje dat (nabídky, vizualizace, produkty) — nikdy nenahrazujeme chybějící reálný zdroj mock daty v produkční analýze.">
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
          <h4 className="mb-2 text-sm font-medium text-ink">Zdroje nabídek (Deal Radar / srovnatelné nabídky)</h4>
          <div className="space-y-2">
            {providers
              .filter((p) => p.key !== "MOCK_DEMO")
              .map((p) => (
                <ProviderHealthRow
                  key={p.key}
                  p={p}
                  totalLabel="Získáno nabídek celkem"
                  totalValue={p.totalFound}
                  extra={
                    p.monthlyRequestBudget != null ? (
                      <div>
                        API volání tento měsíc: {p.monthlyRequestCount} / {p.monthlyRequestBudget}
                      </div>
                    ) : undefined
                  }
                />
              ))}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <h4 className="mb-2 text-sm font-medium text-ink">AI Renovation Visualization (image-to-image)</h4>
            <div className="space-y-2">
              {imageGenProviders.map((p) => (
                <ProviderHealthRow
                  key={p.key}
                  p={p}
                  totalLabel="Vygenerováno celkem"
                  totalValue={p.totalGenerated}
                  extra={
                    <>
                      {p.lastFailureCode && <div>Poslední chybový kód: {p.lastFailureCode}</div>}
                      {p.key === "GEMINI" && (
                        <div className="col-span-full mt-2 border-t border-line pt-3">
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
                  }
                />
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <h4 className="mb-2 text-sm font-medium text-ink">Vyhledávání produktů (Shopping List)</h4>
            <div className="space-y-2">
              {productProviders.map((p) => (
                <ProviderHealthRow key={p.key} p={p} totalLabel="Nalezeno produktů celkem" totalValue={p.totalFound} />
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
