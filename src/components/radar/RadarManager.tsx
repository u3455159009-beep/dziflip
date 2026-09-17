"use client";

import { useState } from "react";
import { Button, Card, SectionTitle } from "@/components/ui";
import { WatcherForm, formValuesToPayload } from "./WatcherForm";
import { WatcherCard } from "./WatcherCard";
import type { WatcherDTO } from "@/lib/watcher-types";

export function RadarManager({ initialWatchers }: { initialWatchers: WatcherDTO[] }) {
  const [watchers, setWatchers] = useState(initialWatchers);
  const [creating, setCreating] = useState(false);

  async function createWatcher(values: Parameters<typeof formValuesToPayload>[0]) {
    const res = await fetch("/api/watchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formValuesToPayload(values))
    });
    if (res.ok) {
      const created = await res.json();
      setWatchers((w) => [{ ...created, _count: { projects: 0, alerts: 0 } }, ...w]);
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <SectionTitle subtitle="Hlídač automaticky vyhledává nemovitosti splňující vaše parametry, dedupuje proti již uloženým projektům, spouští cenový engine a v případě shody vytváří Deal Alert. Zdroje bez povoleného datového přístupu se nikdy neobcházejí — jsou označené jako čekající.">
          Deal Radar
        </SectionTitle>
        {!creating && <Button onClick={() => setCreating(true)}>+ Nový hlídač</Button>}
      </div>

      {creating && (
        <WatcherForm onSubmit={createWatcher} onCancel={() => setCreating(false)} submitLabel="Vytvořit hlídač" />
      )}

      {watchers.length === 0 && !creating && (
        <Card>
          <p className="text-sm text-muted">
            Zatím nemáte žádný hlídač. Vytvořte první a spusťte jej — pro ověření funkčnosti aplikace je vždy
            dostupný zdroj DEMO ukázková data.
          </p>
        </Card>
      )}

      <div className="space-y-4">
        {watchers.map((w) => (
          <WatcherCard key={w.id} watcher={w} onDeleted={(id) => setWatchers((prev) => prev.filter((x) => x.id !== id))} />
        ))}
      </div>
    </div>
  );
}
