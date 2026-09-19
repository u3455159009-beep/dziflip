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
}

const HEALTH_STYLES: Record<ProviderHealthInfo["healthStatus"], string> = {
  CONNECTED: "bg-band-goodBg text-band-good border-band-good/40",
  PENDING_ACCESS: "bg-beige-100 text-muted border-line",
  ERROR: "bg-band-badBg text-band-bad border-band-bad/40",
  DISABLED: "bg-beige-100 text-muted border-line"
};

const HEALTH_LABELS: Record<ProviderHealthInfo["healthStatus"], string> = {
  CONNECTED: "PŘIPOJENO",
  PENDING_ACCESS: "ČEKÁ NA PŘÍSTUP",
  ERROR: "CHYBA",
  DISABLED: "VYPNUTO"
};

export function ProviderHealthPanel() {
  const [providers, setProviders] = useState<ProviderHealthInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((data) => {
        setProviders(data);
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
                      <div>Poslední úspěšný request: {p.lastSuccessAt ? formatDateTime(p.lastSuccessAt) : "zatím žádný"}</div>
                      <div>Získáno nabídek celkem: {p.totalFound}</div>
                      <div>{p.lastError ? `Poslední chyba: ${p.lastError.message} (${formatDateTime(p.lastError.occurredAt)})` : "Žádná chyba v logu"}</div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </>
      )}
    </Card>
  );
}
