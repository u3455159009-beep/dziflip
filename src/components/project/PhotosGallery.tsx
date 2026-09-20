"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { upload } from "@vercel/blob/client";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import {
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  PHOTO_GENERATION_STYLES,
  PHOTO_GENERATION_STYLE_LABELS,
  CHANGE_DETECTION_ITEM_LABELS,
  type RoomType,
  type PhotoGenerationStyle,
  type ChangeDetectionItem
} from "@/lib/types";
import { formatCZK } from "@/lib/format";
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

interface ImageGenProviderInfo {
  key: string;
  label: string;
  status: "ACTIVE" | "PENDING_ACCESS";
  statusNote: string | null;
  healthStatus: "CONNECTED" | "PENDING_ACCESS" | "ERROR";
}

const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: "vysoká jistota",
  MEDIUM: "střední jistota",
  LOW: "nízká jistota",
  VERIFIED: "ručně ověřeno"
};

// Must match src/lib/photoUpload.ts exactly — this is only a client-side
// pre-check for instant feedback; the server always re-validates for real.
const ALLOWED_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Real ceiling for the direct browser→Blob client upload this component
// actually uses (src/lib/photoUpload.ts MAX_CLIENT_UPLOAD_FILE_SIZE_BYTES)
// — not the older, much lower server-route limit, so this number always
// matches what the app can genuinely accept.
const MAX_UPLOAD_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export function PhotosGallery({ projectId, photos: initial }: { projectId: string; photos: PhotoDTO[] }) {
  const [photos, setPhotos] = useState(initial);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [showUrlField, setShowUrlField] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visionProvider, setVisionProvider] = useState<VisionProviderInfo | null>(null);
  const [imageGenProvider, setImageGenProvider] = useState<ImageGenProviderInfo | null>(null);
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
    fetch("/api/image-gen")
      .then((r) => r.json())
      .then((providers: ImageGenProviderInfo[]) => setImageGenProvider(providers.find((p) => p.status === "ACTIVE") ?? providers[0] ?? null))
      .catch(() => setImageGenProvider(null));
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
        setShowUrlField(false);
      } else {
        const body = await res.json().catch(() => null);
        setUploadError(body?.error || "Přidání fotografie podle URL selhalo.");
      }
    } finally {
      setAdding(false);
    }
  }

  function openFilePicker() {
    if (uploading) return; // guard against a double-trigger while one upload is already in flight
    setUploadError(null);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // Always reset the input value so selecting the exact same file again
    // still fires onChange next time.
    e.target.value = "";
    if (files.length === 0 || uploading) return;

    setUploading(true);
    setUploadError(null);
    try {
      for (const file of files) {
        if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) {
          setUploadError(`Nepodporovaný formát souboru „${file.name}" (${file.type || "neznámý typ"}). Povolené formáty: JPG, JPEG, PNG, WEBP.`);
          continue;
        }
        if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
          setUploadError(`Soubor „${file.name}" je příliš velký (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum je ${MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024)} MB.`);
          continue;
        }

        try {
          // Uploads straight from the browser to Vercel Blob storage — the
          // file never passes through this app's own server, so it's not
          // limited by a serverless function's request-body size.
          const blob = await upload(file.name, file, {
            access: "public",
            handleUploadUrl: `/api/projects/${projectId}/photos/client-upload`,
            contentType: file.type
          });

          const res = await fetch(`/api/projects/${projectId}/photos/finalize-upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: blob.url, contentType: blob.contentType, sizeBytes: file.size })
          });
          const body = await res.json().catch(() => null);
          if (res.ok && body) {
            setPhotos((p) => [...p, body]);
          } else {
            setUploadError(body?.error || `Nahrání souboru „${file.name}" selhalo.`);
          }
        } catch (err) {
          setUploadError(
            err instanceof Error && err.message ? `Nahrání souboru „${file.name}" selhalo: ${err.message}` : `Nahrání souboru „${file.name}" selhalo — zkontrolujte připojení a zkuste to znovu.`
          );
        }
      }
    } finally {
      setUploading(false);
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

      <div className="mb-5 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFileSelected}
            data-testid="photo-file-input"
          />
          <Button variant="secondary" onClick={openFilePicker} disabled={uploading}>
            {uploading ? "Nahrávám…" : "+ Přidat"}
          </Button>
          <button
            type="button"
            onClick={() => setShowUrlField((v) => !v)}
            className="text-[11px] font-medium text-beige-500 underline underline-offset-2"
          >
            {showUrlField ? "skrýt vložení přes URL" : "nebo vložit URL fotografie"}
          </button>
        </div>
        <p className="text-[11px] text-muted">Podporované formáty: JPG, JPEG, PNG, WEBP — max. {MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024)} MB na soubor.</p>

        {showUrlField && (
          <div className="flex gap-3">
            <Input
              placeholder="URL fotografie…"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-1"
            />
            <Button variant="secondary" onClick={addPhoto} disabled={adding}>
              {adding ? "Přidávám…" : "Přidat URL"}
            </Button>
          </div>
        )}

        {uploadError && (
          <p className="rounded-md bg-band-badBg px-3 py-2 text-xs text-band-bad" role="alert">
            {uploadError}
          </p>
        )}
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
                  {photo.sourceListingUrl && (
                    <span
                      className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[9px] font-medium text-white"
                      title={`Zkopírováno z nalezeného inzerátu (${photo.matchConfidence ?? "?"})`}
                    >
                      z inzerátu
                    </span>
                  )}
                  {photo.sourcePhotoProvider === "MANUAL_UPLOAD" && (
                    <span
                      className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[9px] font-medium text-white"
                      title="Nahráno ručně — použitelné jako ORIGINAL vstup pro AI vizualizaci"
                    >
                      PŮVODNÍ
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
                        {imageGenProvider?.healthStatus === "CONNECTED" ? (
                          <>
                            <div className="mt-0.5 text-[10px] text-muted">Připojeno: {imageGenProvider.label}</div>
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
                              data-testid={`generate-visualization-${photo.id}`}
                            >
                              {generating === photo.id ? "Ukládám zadání…" : "Vygenerovat vizualizaci"}
                            </Button>
                          </>
                        ) : (
                          <div className="mt-0.5 text-[10px] text-muted">
                            {imageGenProvider?.healthStatus === "ERROR"
                              ? `${imageGenProvider.label}: poslední pokus selhal — zkuste to prosím znovu později.`
                              : `AI vizualizace zatím není připojena${imageGenProvider?.statusNote ? ` — ${imageGenProvider.statusNote}` : ""}.`}
                          </div>
                        )}

                        {photo.generations.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {photo.generations.map((g) => (
                              <li key={g.id} className="rounded bg-card p-2 text-[11px]">
                                <div>
                                  <span className="font-medium">{PHOTO_GENERATION_STYLE_LABELS[g.style as PhotoGenerationStyle] ?? g.style}</span>
                                  {" — "}
                                  <GenerationStatus status={g.status} />
                                </div>

                                {g.status === "GENERATED" && g.generatedUrl && (
                                  <div className="mt-1.5 space-y-1.5">
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <div>
                                        <div className="mb-0.5 text-[9px] uppercase text-muted">Původní</div>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={photo.url} alt="Původní fotografie" className="aspect-[4/3] w-full rounded object-cover" />
                                      </div>
                                      <div>
                                        <div className="mb-0.5 text-[9px] uppercase text-muted">AI VIZUALIZACE</div>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={g.generatedUrl} alt="AI vizualizace po rekonstrukci" className="aspect-[4/3] w-full rounded object-cover" />
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted">
                                      {g.confidence && <span>jistota: {CONFIDENCE_LABELS[g.confidence] ?? g.confidence}</span>}
                                      {g.estimatedRoomCost != null && <span>· odhad nákladů místnosti: {formatCZK(g.estimatedRoomCost)}</span>}
                                    </div>

                                    {g.changeDetection && (
                                      <div className="flex flex-wrap gap-1">
                                        {safeParseArray(g.changeDetection).map((item) => (
                                          <span key={item} className="rounded-full bg-beige-100 px-2 py-0.5 text-[9px] text-ink">
                                            {CHANGE_DETECTION_ITEM_LABELS[item as ChangeDetectionItem] ?? item}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    {g.structuralChange && (
                                      <div className="rounded bg-band-warn/10 px-2 py-1 text-[10px] text-band-warn">
                                        ⚠ {g.structuralChangeNote || "Vizualizace předpokládá stavební zásah (např. odstranění příčky)."}
                                        {g.requiresTechnicalReview && " Vyžaduje technické ověření."}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {g.status === "FAILED" && (
                                  <div className="mt-1.5 rounded bg-band-badBg px-2 py-1 text-[10px] text-band-bad">
                                    {g.failureReason || "Generování vizualizace selhalo."} Původní fotografie zůstává beze změny.
                                    {g.failureCode && <span className="ml-1 font-mono opacity-70">({g.failureCode})</span>}
                                  </div>
                                )}
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
