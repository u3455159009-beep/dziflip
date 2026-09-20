"use client";

// Zero-Click Pipeline status (item 11) — polls the advance endpoint on
// mount and repeatedly until the whole pipeline reports DONE, so the rest
// of the dashboard fills in automatically without a single click. Never
// blocks on a provider that isn't connected — those steps show
// WAITING_FOR_PROVIDER / PENDING_ACCESS and the rest keeps going.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionTitle } from "@/components/ui";

type StepStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "WAITING_FOR_PROVIDER";

interface PipelineStepState {
  step: string;
  status: StepStatus;
  detail: string | null;
}

interface PipelineState {
  overallStatus: "RUNNING" | "DONE" | "WAITING_FOR_PROVIDER";
  steps: PipelineStepState[];
  budgetStatus: string | null;
}

const STEP_LABELS: Record<string, string> = {
  EXTRACT: "Čtu inzerát",
  LISTING_VERIFICATION: "Ověřuji nemovitost",
  COMPARABLES: "Hledám srovnatelné nabídky",
  MARKET_VALUE: "Počítám tržní cenu",
  MAX_BUDGET: "Počítám maximální rozpočet rekonstrukce",
  PHOTO_ANALYSIS: "Analyzuji fotografie",
  RENOVATION_PLAN: "Navrhuji rekonstrukci",
  VISUALIZATION: "Generuji BEFORE/AFTER",
  PRODUCTS: "Hledám produkty",
  BUDGET_CHECK: "Kontroluji rozpočet",
  DONE: "Hotovo"
};

const STATUS_ICON: Record<StepStatus, string> = {
  DONE: "✓",
  RUNNING: "…",
  PENDING: "·",
  WAITING_FOR_PROVIDER: "⏸",
  FAILED: "!"
};

const STATUS_STYLE: Record<StepStatus, string> = {
  DONE: "text-band-good",
  RUNNING: "text-beige-500",
  PENDING: "text-muted",
  WAITING_FOR_PROVIDER: "text-band-warn",
  FAILED: "text-band-bad"
};

const ACTIVE_POLL_INTERVAL_MS = 1800;
// Once DONE, keep a slow idle check (via the cheap read-only status
// endpoint) so uploading a new photo later automatically resumes the full
// pipeline — the card never needs a page reload to notice new work.
const IDLE_POLL_INTERVAL_MS = 8000;

export function PipelineStatus({ projectId }: { projectId: string }) {
  const [state, setState] = useState<PipelineState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const stoppedRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick(previouslyDone: boolean) {
      if (stoppedRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        // While idle (already DONE last time), just check cheaply whether
        // new work appeared (e.g. a freshly uploaded photo) — only spend a
        // real advance call once there's actually something to do.
        const res = previouslyDone
          ? await fetch(`/api/projects/${projectId}/pipeline`)
          : await fetch(`/api/projects/${projectId}/pipeline/advance`, { method: "POST" });

        if (res.ok) {
          const next: PipelineState = await res.json();
          const stillDone = next.overallStatus === "DONE";
          setState(next);
          setError(null);
          if (!stillDone) router.refresh(); // reflect newly created photos/generations/products
          else if (!previouslyDone) router.refresh(); // final refresh the moment it completes
          if (!stoppedRef.current) {
            timer = setTimeout(() => tick(stillDone), stillDone ? IDLE_POLL_INTERVAL_MS : ACTIVE_POLL_INTERVAL_MS);
          }
        } else {
          setError("Pipeline se nepodařilo posunout dál — zkusím to znovu.");
          timer = setTimeout(() => tick(previouslyDone), ACTIVE_POLL_INTERVAL_MS * 2);
        }
      } catch {
        setError("Pipeline dočasně nedostupná — zkusím to znovu.");
        timer = setTimeout(() => tick(previouslyDone), ACTIVE_POLL_INTERVAL_MS * 2);
      } finally {
        inFlightRef.current = false;
      }
    }

    tick(false);
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!state || state.overallStatus === "DONE") return null;

  const visibleSteps = state.steps.filter((s) => s.step !== "DONE");

  return (
    <Card className="border-beige-400/40 bg-beige-50">
      <SectionTitle subtitle="Celá analýza probíhá automaticky na serveru — nic není potřeba klikat. Tato karta zmizí, jakmile bude vše hotové.">
        Probíhá automatická analýza
      </SectionTitle>
      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {visibleSteps.map((s) => (
          <li key={s.step} className={`flex items-center gap-2 text-sm ${STATUS_STYLE[s.status]}`}>
            <span className="w-4 text-center font-medium">{STATUS_ICON[s.status]}</span>
            <span>{STEP_LABELS[s.step] ?? s.step}</span>
            {s.status === "WAITING_FOR_PROVIDER" && <span className="text-xs">(čeká na připojení providera)</span>}
          </li>
        ))}
      </ol>
      {error && <p className="mt-3 text-xs text-band-bad">{error}</p>}
    </Card>
  );
}
