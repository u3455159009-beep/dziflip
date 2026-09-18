"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import { ROOM_TYPES, ROOM_TYPE_LABELS, PHOTO_GENERATION_STYLES, PHOTO_GENERATION_STYLE_LABELS, type RoomType, type PhotoGenerationStyle } from "@/lib/types";
import type { PhotoDTO } from "@/lib/project-types";

const ROOMS = [
  "Kuchyň",
  "Obývací pokoj",
  "Ložnice",
  "Koupelna",
  "WC",
  "Chodba",
  "Balkon/terasa",
  "Jiné",
  "Neurčeno"
];

interface VisionProviderInfo {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote: string | null;
}

const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: "vysoká jistota",
  MEDIUM: "střední jistota",
  LOW: "nízká jistota",
  VERIFIED: "ručně ověřeno"
};

export function PhotosGallery({ projectId, photos: initial }: { projectId: string; photos: PhotoDTO[] }) {
  const [photos, setPhotos] = useState(initial);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visionProvider, setVisionProvider] = useState<VisionProviderInfo | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<Record<string, string>>({});
  const [genStyle, setGenStyle] = useState<Record<string, PhotoGenerationStyle>>({});
  const [genPrompt, setGenPrompt] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vision")
      .then((r) => r.json())
      .then((providers: VisionProviderInfo[]) => setVisionProvider(providers[0] ?? null))
      .catch(() => setVisionProvider(null));
  }, []);

  async function addPhoto() {
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim() })
      });
      if (res.ok) {
        const photo = await res.json();
        setPhotos((p) => [...p, photo]);
        setNewUrl("");
      }
    } finally {
      setAdding(false);
    }
  }

  async function updateRoom(id: string, room: string) {
    setPhotos((p) => p.map((ph) => (ph.id === id ? { ...ph, room } : ph)));
    await fetch(`/api/projects/${projectId}/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room })
    });
  }

  async function updateNotes(id: string, notes: string) {
    setPhotos((p) => p.map((ph) => (ph.id === id ? { ...ph, notes } : ph)));
  }

  async function saveNotes(id: string, notes: string) {
    await fetch(`/api/projects/${projectId}/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes })
    });
  }

  async function saveField(id: string, field: string, value: string) {
    setPhotos((p) => p.map((ph) => (ph.id === id ? { ...ph, [field]: value || null, analysisSource: "MANUAL", analysisConfidence: "VERIFIED" } : ph)));
    await fetch(`/api/projects/${projectId}/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value })
    });
  }

  async function saveVisibleIssues(id: string, text: string) {
    const issues = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setPhotos((p) => p.map((ph) => (ph.id === id ? { ...ph, visibleIssues: JSON.stringify(issues), analysisSource: "MANUAL", analysisConfidence: "VERIFIED" } : ph)));
    await fetch(`/api/projects/${projectId}/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibleIssues: issues })
    });
  }

  async function analyzeWithAi(id: string) {
    setAnalyzing(id);
    setAnalyzeError((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/projects/${projectId}/photos/${id}/analyze`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setPhotos((p) => p.map((ph) => (ph.id === id ? { ...ph, ...body } : ph)));
      } else {
        setAnalyzeError((e) => ({ ...e, [id]: body.error || "Analýza selhala." }));
      }
    } finally {
      setAnalyzing(null);
    }
  }

  async function remove(id: string) {
    setPhotos((p) => p.filter((ph) => ph.id !== id));
    await fetch(`/api/projects/${projectId}/photos/${id}`, { method: "DELETE" });
  }

  async function requestGeneration(id: string) {
    setGenerating(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/photos/${id}/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: genStyle[id] ?? PHOTO_GENERATION_STYLES[0], prompt: genPrompt[id] || null })
      });
      if (res.ok) {
        const generation = await res.json();
        setPhotos((p) => p.map((ph) => (ph.id === id ? { ...ph, generations: [generation, ...ph.generations] } : ph)));
      }
    } finally {
      setGenerating(null);
    }
  }

  return (
    <Card>
      <SectionTitle
        subtitle={
          visionProvider?.status === "ACTIVE"
            ? "AI analýza fotografií je připojena a rozpoznává místnost, stav a doporučení k rekonstrukci."
            : `AI analýza fotografií zatím není připojena${visionProvider?.statusNote ? ` — ${visionProvider.statusNote}` : ""}. Fotografie lze zatím roztřídit a okomentovat ručně.`
        }
      >
        Fotografie
      </SectionTitle>

      <div className="mb-5 flex gap-3">
        <Input
          placeholder="URL fotografie…"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          className="flex-1"
        />
        <Button variant="secondary" onClick={addPhoto} disabled={adding}>
          {adding ? "Přidávám…" : "+ Přidat"}
        </Button>
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-muted">Žádné fotografie zatím nejsou k dispozici.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => {
            const isExpanded = expanded === photo.id;
            const issues: string[] = photo.visibleIssues ? safeParseArray(photo.visibleIssues) : [];
            return (
              <div key={photo.id} className="overflow-hidden rounded-lg border border-line">
                <div className="relative aspect-[4/3] w-full bg-beige-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  {photo.analysisSource && photo.analysisSource !== "MANUAL" && (
                    <span className="absolute left-2 top-2 rounded-full bg-band-good/90 px-2 py-0.5 text-[10px] font-medium text-white">
                      AI Vision
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <select
                    value={photo.room ?? ""}
                    onChange={(e) => updateRoom(photo.id, e.target.value)}
                    className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-xs"
                  >
                    <option value="">Místnost — nerozpoznáno</option>
                    {ROOMS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={photo.notes ?? ""}
                    onChange={(e) => updateNotes(photo.id, e.target.value)}
                    onBlur={(e) => saveNotes(photo.id, e.target.value)}
                    placeholder="Poznámka…"
                    rows={2}
                    className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-xs"
                  />

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : photo.id)}
                      className="text-[11px] font-medium text-beige-500 underline underline-offset-2"
                    >
                      {isExpanded ? "Skrýt AI analýzu" : "AI analýza / stav místnosti"}
                    </button>
                    <button onClick={() => remove(photo.id)} className="text-[11px] text-muted hover:text-band-bad">
                      odebrat
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="space-y-2 rounded-md bg-beige-50 p-2.5">
                      {photo.analysisSource && (
                        <div className="text-[10px] uppercase tracking-wide text-muted">
                          Zdroj: {photo.analysisSource === "MANUAL" ? "ruční záznam" : "AI Vision"}
                          {photo.analysisConfidence ? ` · ${CONFIDENCE_LABELS[photo.analysisConfidence] ?? photo.analysisConfidence}` : ""}
                        </div>
                      )}

                      <select
                        value={photo.roomType ?? ""}
                        onChange={(e) => saveField(photo.id, "roomType", e.target.value)}
                        className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-xs"
                      >
                        <option value="">Typ místnosti — nezadáno</option>
                        {ROOM_TYPES.map((r) => (
                          <option key={r} value={r}>
                            {ROOM_TYPE_LABELS[r as RoomType]}
                          </option>
                        ))}
                      </select>

                      <LabeledTextarea
                        label="Aktuální stav"
                        value={photo.currentCondition ?? ""}
                        onSave={(v) => saveField(photo.id, "currentCondition", v)}
                      />
                      <LabeledTextarea
                        label="Viditelné problémy (jeden na řádek)"
                        value={issues.join("\n")}
                        onSave={(v) => saveVisibleIssues(photo.id, v)}
                      />
                      <LabeledTextarea
                        label="Co zachovat"
                        value={photo.keepNotes ?? ""}
                        onSave={(v) => saveField(photo.id, "keepNotes", v)}
                      />
                      <LabeledTextarea
                        label="Co odstranit"
                        value={photo.removeNotes ?? ""}
                        onSave={(v) => saveField(photo.id, "removeNotes", v)}
                      />
                      <LabeledTextarea
                        label="Co vyměnit"
                        value={photo.replaceNotes ?? ""}
                        onSave={(v) => saveField(photo.id, "replaceNotes", v)}
                      />
                      <LabeledTextarea
                        label="Doporučení k rekonstrukci"
                        value={photo.renovationSuggestions ?? ""}
                        onSave={(v) => saveField(photo.id, "renovationSuggestions", v)}
                      />

                      <Button
                        variant="secondary"
                        onClick={() => analyzeWithAi(photo.id)}
                        disabled={analyzing === photo.id}
                        className="w-full text-xs"
                      >
                        {analyzing === photo.id ? "Analyzuji…" : "Analyzovat pomocí AI"}
                      </Button>
                      {analyzeError[photo.id] && (
                        <p className="text-[11px] text-band-bad">{analyzeError[photo.id]}</p>
                      )}

                      <div className="border-t border-line/60 pt-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted">Vizualizace před/po</div>
                        <select
                          value={genStyle[photo.id] ?? PHOTO_GENERATION_STYLES[0]}
                          onChange={(e) => setGenStyle((s) => ({ ...s, [photo.id]: e.target.value as PhotoGenerationStyle }))}
                          className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5 text-xs"
                        >
                          {PHOTO_GENERATION_STYLES.map((s) => (
                            <option key={s} value={s}>
                              {PHOTO_GENERATION_STYLE_LABELS[s as PhotoGenerationStyle]}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={genPrompt[photo.id] ?? ""}
                          onChange={(e) => setGenPrompt((s) => ({ ...s, [photo.id]: e.target.value }))}
                          placeholder="Prompt / zadání pro vizualizaci (volitelné)…"
                          rows={2}
                          className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5 text-xs"
                        />
                        <Button
                          variant="secondary"
                          onClick={() => requestGeneration(photo.id)}
                          disabled={generating === photo.id}
                          className="mt-1 w-full text-xs"
                        >
                          {generating === photo.id ? "Ukládám zadání…" : "Vygenerovat"}
                        </Button>

                        {photo.generations.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {photo.generations.map((g) => (
                              <li key={g.id} className="rounded bg-card px-2 py-1 text-[11px]">
                                <span className="font-medium">{PHOTO_GENERATION_STYLE_LABELS[g.style as PhotoGenerationStyle] ?? g.style}</span>
                                {" — "}
                                <GenerationStatus status={g.status} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const GENERATION_STATUS_LABELS: Record<string, string> = {
  NOT_CONFIGURED: "čeká na připojení image-gen API",
  PENDING: "zpracovává se",
  GENERATED: "vygenerováno",
  FAILED: "selhalo"
};

function GenerationStatus({ status }: { status: string }) {
  return <span className="text-muted">{GENERATION_STATUS_LABELS[status] ?? status}</span>;
}

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function LabeledTextarea({
  label,
  value,
  onSave
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onSave(local)}
        rows={2}
        className="mt-0.5 w-full rounded-md border border-line bg-card px-2 py-1.5 text-xs"
      />
    </div>
  );
}
