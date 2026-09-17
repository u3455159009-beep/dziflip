"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Textarea } from "@/components/ui";

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

export default function HomePage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Vložte prosím odkaz na inzerát nebo jeho text.");
      return;
    }
    setLoading(true);
    setError(null);

    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    const urlLine = lines.find((l) => looksLikeUrl(l));
    const restText = lines.filter((l) => l !== urlLine).join("\n");

    const payload: { url?: string; text?: string } = {};
    if (urlLine) payload.url = urlLine;
    if (restText || (!urlLine && trimmed)) payload.text = urlLine ? restText : trimmed;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analýza selhala.");
      router.push(`/project/${data.id}${data.warning ? "?warning=1" : ""}`);
    } catch (e: any) {
      setError(e.message || "Něco se pokazilo.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-14 mt-6 max-w-2xl text-center">
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Vložte odkaz nebo text inzerátu
        </h1>
        <p className="mt-4 text-base text-muted">
          Aplikace identifikuje nemovitost, provede cenovou analýzu a sestaví ekonomiku flipu.
          Vše, co se nepodaří ověřit, je jasně označeno — nic si nevymýšlí.
        </p>
      </div>

      <Card className="w-full max-w-2xl">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"Vložte URL inzerátu, zkopírovaný text inzerátu, nebo obojí…"}
          rows={9}
          className="resize-none text-[15px] leading-relaxed"
        />
        {error && <p className="mt-3 text-sm text-band-bad">{error}</p>}
        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-muted">
            Podporuje URL i vložený text. Chybějící údaje doplníte ručně u projektu.
          </p>
          <Button onClick={handleAnalyze} disabled={loading}>
            {loading ? "Analyzuji…" : "ANALYZOVAT NEMOVITOST"}
          </Button>
        </div>
      </Card>

      <div className="mt-16 grid w-full max-w-2xl grid-cols-3 gap-6 text-center text-xs text-muted">
        <div>
          <div className="mb-1 text-lg">📋</div>
          Extrakce údajů s vyznačením OVĚŘENO / ODHADNUTO / NEZNÁMÉ
        </div>
        <div>
          <div className="mb-1 text-lg">📊</div>
          Cenový engine, max. nákupní cena a ekonomika flipu
        </div>
        <div>
          <div className="mb-1 text-lg">🏗️</div>
          Rozpočet rekonstrukce a historie projektů
        </div>
      </div>
    </div>
  );
}
