"use client";

import { useState } from "react";
import Image from "next/image";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
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

export function PhotosGallery({ projectId, photos: initial }: { projectId: string; photos: PhotoDTO[] }) {
  const [photos, setPhotos] = useState(initial);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);

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

  async function remove(id: string) {
    setPhotos((p) => p.filter((ph) => ph.id !== id));
    await fetch(`/api/projects/${projectId}/photos/${id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <SectionTitle subtitle="AI analýza fotografií místnost po místnosti a vizualizace rekonstrukce budou dostupné po připojení Vision / image-generation API. Zatím lze fotografie roztřídit a okomentovat ručně.">
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
          {photos.map((photo) => (
            <div key={photo.id} className="overflow-hidden rounded-lg border border-line">
              <div className="relative aspect-[4/3] w-full bg-beige-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
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
                  placeholder="Poznámka: stav, co zachovat / odstranit / opravit / vyměnit…"
                  rows={2}
                  className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-xs"
                />
                <button onClick={() => remove(photo.id)} className="text-[11px] text-muted hover:text-band-bad">
                  odebrat fotografii
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
