"use client";

import { useMemo, useState } from "react";
import { Button, Card, Select, SectionTitle } from "@/components/ui";
import {
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  ROOM_CONDITION_ELEMENTS,
  ROOM_CONDITION_ELEMENT_LABELS,
  ROOM_CONDITION_STATUSES,
  ROOM_CONDITION_STATUS_LABELS,
  type RoomType,
  type RoomConditionElement,
  type RoomConditionStatus
} from "@/lib/types";
import type { RoomConditionDTO } from "@/lib/project-types";

const STATUS_STYLES: Record<string, string> = {
  KEEP: "bg-band-good/10 text-band-good",
  COSMETIC: "bg-band-normalBg text-band-normal",
  REPLACE: "bg-band-warn/10 text-band-warn",
  FULL_RENOVATION: "bg-band-bad/10 text-band-bad",
  UNKNOWN: "bg-beige-100 text-muted"
};

export function RoomConditionPanel({
  projectId,
  conditions: initial
}: {
  projectId: string;
  conditions: RoomConditionDTO[];
}) {
  const [conditions, setConditions] = useState(initial);
  const [room, setRoom] = useState<RoomType>("KUCHYN");
  const [element, setElement] = useState<RoomConditionElement>("podlaha");
  const [status, setStatus] = useState<RoomConditionStatus>("UNKNOWN");
  const [saving, setSaving] = useState(false);

  const byRoom = useMemo(() => {
    const map = new Map<string, RoomConditionDTO[]>();
    for (const c of conditions) {
      if (!map.has(c.room)) map.set(c.room, []);
      map.get(c.room)!.push(c);
    }
    return map;
  }, [conditions]);

  async function addOrUpdate() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/room-conditions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, element, status })
      });
      if (res.ok) {
        const saved: RoomConditionDTO = await res.json();
        setConditions((prev) => {
          const rest = prev.filter((c) => !(c.room === saved.room && c.element === saved.element));
          return [...rest, saved];
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, nextStatus: string) {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, status: nextStatus } : c)));
    await fetch(`/api/projects/${projectId}/room-conditions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
  }

  async function remove(id: string) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/projects/${projectId}/room-conditions/${id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <SectionTitle subtitle="Strukturované hodnocení stavu jednotlivých prvků po místnostech — základ pro rekonstrukční rozpočet. Bez záznamu zůstává prvek NEZNÁMÉ, nikdy se nedomýšlí.">
        Renovation Condition Score
      </SectionTitle>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-beige-50 p-4">
        <Select label="Místnost" value={room} onChange={(e) => setRoom(e.target.value as RoomType)} className="w-44">
          {ROOM_TYPES.map((r) => (
            <option key={r} value={r}>
              {ROOM_TYPE_LABELS[r as RoomType]}
            </option>
          ))}
        </Select>
        <Select
          label="Prvek"
          value={element}
          onChange={(e) => setElement(e.target.value as RoomConditionElement)}
          className="w-44"
        >
          {ROOM_CONDITION_ELEMENTS.map((e) => (
            <option key={e} value={e}>
              {ROOM_CONDITION_ELEMENT_LABELS[e as RoomConditionElement]}
            </option>
          ))}
        </Select>
        <Select label="Stav" value={status} onChange={(e) => setStatus(e.target.value as RoomConditionStatus)} className="w-48">
          {ROOM_CONDITION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ROOM_CONDITION_STATUS_LABELS[s as RoomConditionStatus]}
            </option>
          ))}
        </Select>
        <Button onClick={addOrUpdate} disabled={saving}>
          {saving ? "Ukládám…" : "Uložit hodnocení"}
        </Button>
      </div>

      {conditions.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádné hodnocení prvků. Přidejte první výše.</p>
      ) : (
        <div className="space-y-5">
          {Array.from(byRoom.entries()).map(([r, items]) => (
            <div key={r}>
              <h3 className="mb-2 font-serif text-lg text-ink">{ROOM_TYPE_LABELS[r as RoomType] ?? r}</h3>
              <div className="flex flex-wrap gap-2">
                {items.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 rounded-full border border-line/60 px-2.5 py-1 text-xs ${STATUS_STYLES[c.status] ?? ""}`}
                  >
                    <span className="font-medium">{ROOM_CONDITION_ELEMENT_LABELS[c.element as RoomConditionElement] ?? c.element}</span>
                    <select
                      value={c.status}
                      onChange={(e) => updateStatus(c.id, e.target.value)}
                      className="rounded bg-transparent text-xs"
                    >
                      {ROOM_CONDITION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {ROOM_CONDITION_STATUS_LABELS[s as RoomConditionStatus]}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => remove(c.id)} className="text-muted hover:text-band-bad">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
