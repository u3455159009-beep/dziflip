"use client";

import { useState } from "react";
import { Button, Card, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { CONTACT_STATUSES, CONTACT_STATUS_LABELS, OUTREACH_STATUS_LABELS } from "@/lib/types";
import type { ContactDTO, OutreachMessageDTO } from "@/lib/project-types";

const OUTREACH_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-band-normalBg text-band-normal",
  SENT: "bg-band-goodBg text-band-good",
  BLOCKED_NO_PROVIDER: "bg-beige-100 text-muted",
  BLOCKED_RULES: "bg-band-badBg text-band-bad",
  FAILED: "bg-band-badBg text-band-bad",
  RECEIVED: "bg-band-goodBg text-band-good"
};

export function ContactOutreach({
  projectId,
  contact: initialContact,
  messages: initialMessages
}: {
  projectId: string;
  contact: ContactDTO | null;
  messages: OutreachMessageDTO[];
}) {
  const [contact, setContact] = useState<Partial<ContactDTO>>(initialContact ?? { status: "NEKONTAKTOVANO" });
  const [messages, setMessages] = useState(initialMessages);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function saveContact(patch: Partial<ContactDTO>) {
    const next = { ...contact, ...patch };
    setContact(next);
    await fetch(`/api/projects/${projectId}/contact`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
  }

  async function createDraft() {
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/outreach`, { method: "POST" });
      if (res.ok) {
        const message = await res.json();
        setMessages((m) => [message, ...m]);
        setContact((c) => ({ ...c, status: "ZPRAVA_PRIPRAVENA" }));
      }
    } finally {
      setCreating(false);
    }
  }

  async function updateDraftBody(id: string, body: string) {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, body } : x)));
  }

  async function saveDraftBody(id: string, body: string) {
    await fetch(`/api/projects/${projectId}/outreach/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
  }

  async function performAction(id: string, action: "send" | "mark-sent-manually") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/outreach/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages((m) => m.map((x) => (x.id === id ? updated : x)));
        if (updated.status === "SENT") setContact((c) => ({ ...c, status: "ODESLANO" }));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function discard(id: string) {
    setMessages((m) => m.filter((x) => x.id !== id));
    await fetch(`/api/projects/${projectId}/outreach/${id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <SectionTitle subtitle="Kontaktní údaje se nikdy nevymýšlí — doplňte je ručně nebo je aplikace převezme, pokud jsou doslovně uvedené v textu inzerátu.">
        Kontakt a žádost o prohlídku
      </SectionTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Jméno makléře / prodávajícího" value={contact.name ?? ""} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} onBlur={(e) => saveContact({ name: e.target.value || null })} />
        <Input label="Telefon" value={contact.phone ?? ""} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} onBlur={(e) => saveContact({ phone: e.target.value || null })} />
        <Input label="E-mail" value={contact.email ?? ""} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} onBlur={(e) => saveContact({ email: e.target.value || null })} />
        <Input label="Realitní kancelář" value={contact.agency ?? ""} onChange={(e) => setContact((c) => ({ ...c, agency: e.target.value }))} onBlur={(e) => saveContact({ agency: e.target.value || null })} />
        <Select label="Stav komunikace" value={contact.status ?? "NEKONTAKTOVANO"} onChange={(e) => saveContact({ status: e.target.value })}>
          {CONTACT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CONTACT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">Poslední kontakt</span>
          <div className="pt-2 text-sm text-ink">{contact.lastContactedAt ? formatDate(contact.lastContactedAt) : "—"}</div>
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-lg text-ink">Žádosti o prohlídku</h3>
          <Button variant="secondary" onClick={createDraft} disabled={creating}>
            {creating ? "Připravuji…" : "+ Připravit návrh zprávy"}
          </Button>
        </div>

        {messages.length === 0 ? (
          <p className="text-sm text-muted">Zatím žádné zprávy.</p>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg border border-line p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium uppercase ${OUTREACH_STATUS_STYLES[m.status] ?? ""}`}>
                    {OUTREACH_STATUS_LABELS[m.status as keyof typeof OUTREACH_STATUS_LABELS] ?? m.status}
                  </span>
                  {m.mode && <span className="text-muted">režim {m.mode}</span>}
                  <span className="text-muted">{formatDate(m.createdAt)}</span>
                </div>
                {m.blockedReason && <p className="mb-2 text-xs text-band-bad">{m.blockedReason}</p>}
                {m.status === "DRAFT" ? (
                  <Textarea
                    value={m.body}
                    onChange={(e) => updateDraftBody(m.id, e.target.value)}
                    onBlur={(e) => saveDraftBody(m.id, e.target.value)}
                    rows={5}
                  />
                ) : (
                  <p className="whitespace-pre-wrap rounded-md bg-beige-50 p-3 text-sm text-ink">{m.body}</p>
                )}
                {m.status === "DRAFT" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => performAction(m.id, "send")} disabled={busyId === m.id}>
                      Schválit a odeslat
                    </Button>
                    <Button variant="secondary" onClick={() => performAction(m.id, "mark-sent-manually")} disabled={busyId === m.id}>
                      Odeslal(a) jsem ručně
                    </Button>
                    <Button variant="ghost" onClick={() => discard(m.id)}>
                      Zahodit
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
