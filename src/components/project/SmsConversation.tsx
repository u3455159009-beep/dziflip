"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, SectionTitle, Textarea } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  CONTACT_STATUS_LABELS,
  SMS_CLASSIFICATION_LABELS,
  SMS_STATUS_LABELS,
  type ContactStatus
} from "@/lib/types";
import type { ContactDTO, SmsMessageDTO } from "@/lib/project-types";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-band-normalBg text-band-normal",
  QUEUED: "bg-band-normalBg text-band-normal",
  SENT: "bg-band-goodBg text-band-good",
  DELIVERED: "bg-band-goodBg text-band-good",
  FAILED: "bg-band-badBg text-band-bad",
  RECEIVED: "bg-beige-100 text-ink"
};

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

function nextStepLabel(contactStatus: string | undefined, lastMessage: SmsMessageDTO | undefined): string {
  if (!lastMessage) return "Připravit úvodní SMS";
  if (lastMessage.direction === "INBOUND") return "Makléř odpověděl — připravte odpověď";
  if (lastMessage.status === "DRAFT") return "Schválit a odeslat návrh SMS";
  if (lastMessage.status === "FAILED") return "Zkontrolujte důvod selhání a zkuste znovu";
  return "Čeká se na odpověď makléře";
}

export function SmsConversation({
  projectId,
  contact,
  messages: initial
}: {
  projectId: string;
  contact: ContactDTO | null;
  messages: SmsMessageDTO[];
}) {
  const [messages, setMessages] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [blacklisted, setBlacklisted] = useState<boolean | null>(null);

  const phone = contact?.phone ?? null;

  useEffect(() => {
    const unread = initial.filter((m) => m.direction === "INBOUND" && !m.readAt);
    if (unread.length === 0) return;
    Promise.all(
      unread.map((m) =>
        fetch(`/api/sms/${m.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark-read" })
        })
      )
    ).then(() => {
      setMessages((prev) => prev.map((m) => (unread.some((u) => u.id === m.id) ? { ...m, readAt: new Date().toISOString() } : m)));
    });
    // Only run once per mount — re-fetching on every `initial` identity
    // change would re-mark messages that arrive later in the same session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!phone) {
      setBlacklisted(null);
      return;
    }
    fetch("/api/sms/blacklist")
      .then((r) => r.json())
      .then((entries: Array<{ phone: string }>) => {
        setBlacklisted(entries.some((e) => e.phone.replace(/\s/g, "") === phone.replace(/\s/g, "")));
      })
      .catch(() => setBlacklisted(null));
  }, [phone]);

  const sorted = useMemo(() => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [messages]);
  const lastMessage = sorted[sorted.length - 1];
  const lastInboundWithSuggestion = [...sorted].reverse().find((m) => m.direction === "INBOUND" && m.suggestedDateTime);

  async function createIntroDraft() {
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sms`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setMessages((m) => [...m, data]);
      else alert(data.error || "Nepodařilo se připravit SMS.");
    } finally {
      setCreating(false);
    }
  }

  async function createReply(smsId: string, kind: "CONFIRM" | "ALTERNATIVE" | "BLANK") {
    setBusyId(smsId);
    try {
      const res = await fetch(`/api/sms/${smsId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind })
      });
      const data = await res.json();
      if (res.ok) setMessages((m) => [...m, data]);
      else alert(data.error || "Nepodařilo se připravit odpověď.");
    } finally {
      setBusyId(null);
    }
  }

  function updateDraftBody(id: string, body: string) {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, body } : x)));
  }

  async function saveDraftBody(id: string, body: string) {
    await fetch(`/api/sms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
  }

  async function performAction(id: string, action: "send" | "mark-sent-manually") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/sms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const updated = await res.json();
      if (res.ok) setMessages((m) => m.map((x) => (x.id === id ? updated : x)));
    } finally {
      setBusyId(null);
    }
  }

  async function discard(id: string) {
    setMessages((m) => m.filter((x) => x.id !== id));
    await fetch(`/api/sms/${id}`, { method: "DELETE" });
  }

  async function toggleBlacklist() {
    if (!phone) return;
    if (blacklisted) {
      await fetch(`/api/sms/blacklist/${encodeURIComponent(phone)}`, { method: "DELETE" });
      setBlacklisted(false);
    } else {
      await fetch("/api/sms/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, reason: "Ručně označeno u nemovitosti" })
      });
      setBlacklisted(true);
    }
  }

  return (
    <Card>
      <SectionTitle subtitle="Konverzace se čte shora dolů jako běžné zprávy. Úvodní SMS i odpovědi se vždy nejprve připraví jako návrh — bez vašeho schválení se nic neodešle, pokud výslovně nezapnete AUTO v Nastavení.">
        SMS
      </SectionTitle>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-beige-50 p-4 text-sm sm:grid-cols-5">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Kontakt</div>
          <div className="font-medium text-ink">{contact?.name || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Telefon</div>
          <div className="font-medium text-ink number-tabular">{phone || "Neznámý"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Poslední SMS</div>
          <div className="font-medium text-ink">{lastMessage ? formatTime(lastMessage.createdAt) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Stav komunikace</div>
          <div className="font-medium text-ink">
            {CONTACT_STATUS_LABELS[(contact?.status as ContactStatus) ?? "NEKONTAKTOVANO"]}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Další krok</div>
          <div className="font-medium text-ink">{nextStepLabel(contact?.status, lastMessage)}</div>
        </div>
      </div>

      {phone && (
        <div className="mb-6">
          <button
            onClick={toggleBlacklist}
            className={`text-xs underline underline-offset-2 ${blacklisted ? "text-band-bad" : "text-muted hover:text-ink"}`}
          >
            {blacklisted ? "Odebrat z blacklistu (NEKONTAKTOVAT)" : "Označit NEKONTAKTOVAT (blacklist)"}
          </button>
          {blacklisted && (
            <span className="ml-2 rounded-full bg-band-badBg px-2 py-0.5 text-[10px] font-medium uppercase text-band-bad">
              Na blacklistu
            </span>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="mb-6 text-sm text-muted">Zatím žádné SMS zprávy.</p>
      ) : (
        <div className="mb-6 space-y-3">
          {sorted
            .filter((m) => m.status !== "DRAFT")
            .map((m) => (
              <div key={m.id} className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-xl2 px-4 py-2.5 text-sm ${
                    m.direction === "OUTBOUND" ? "bg-ink text-paper" : "bg-beige-100 text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <div
                    className={`mt-1.5 flex flex-wrap items-center gap-2 text-[10px] ${
                      m.direction === "OUTBOUND" ? "text-paper/70" : "text-muted"
                    }`}
                  >
                    <span>{formatTime(m.createdAt)}</span>
                    <span className={`rounded-full px-1.5 py-0.5 font-medium uppercase ${STATUS_STYLES[m.status] ?? ""}`}>
                      {SMS_STATUS_LABELS[m.status as keyof typeof SMS_STATUS_LABELS] ?? m.status}
                    </span>
                    <span className="rounded-full bg-black/10 px-1.5 py-0.5 uppercase">
                      {m.isDemo ? "DEMO" : m.provider === "MOCK_SMS" ? "MOCK" : "REAL"}
                    </span>
                    {m.direction === "INBOUND" && m.classification && (
                      <span className="rounded-full bg-black/10 px-1.5 py-0.5">
                        {SMS_CLASSIFICATION_LABELS[m.classification as keyof typeof SMS_CLASSIFICATION_LABELS]}
                      </span>
                    )}
                  </div>
                  {m.blockedReason && <p className="mt-1 text-[11px] text-band-bad">{m.blockedReason}</p>}
                  {m.direction === "INBOUND" && m.suggestedDateTimeRaw && (
                    <div className="mt-2 rounded-lg bg-band-normalBg p-2 text-[11px] text-band-normal">
                      Makléř pravděpodobně nabízí: <b>{m.suggestedDateTimeRaw}</b>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => createReply(m.id, "BLANK")}
                          className="rounded-full border border-band-normal/40 px-2 py-0.5 hover:bg-band-normal/10"
                          disabled={busyId === m.id}
                        >
                          Připravit odpověď
                        </button>
                        <button
                          onClick={() => createReply(m.id, "CONFIRM")}
                          className="rounded-full border border-band-normal/40 px-2 py-0.5 hover:bg-band-normal/10"
                          disabled={busyId === m.id}
                        >
                          Potvrdit text
                        </button>
                        <button
                          onClick={() => createReply(m.id, "ALTERNATIVE")}
                          className="rounded-full border border-band-normal/40 px-2 py-0.5 hover:bg-band-normal/10"
                          disabled={busyId === m.id}
                        >
                          Navrhnout jiný termín
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="border-t border-line pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-lg text-ink">Návrhy ke schválení</h3>
          <Button variant="secondary" onClick={createIntroDraft} disabled={creating}>
            {creating ? "Připravuji…" : "+ Připravit úvodní SMS"}
          </Button>
        </div>

        {sorted.filter((m) => m.status === "DRAFT").length === 0 ? (
          <p className="text-sm text-muted">Žádné návrhy ke schválení.</p>
        ) : (
          <div className="space-y-4">
            {sorted
              .filter((m) => m.status === "DRAFT")
              .map((m) => (
                <div key={m.id} className="rounded-lg border border-line p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-band-normalBg px-2 py-0.5 font-medium uppercase text-band-normal">
                      Návrh ({m.kind === "INTRO" ? "úvodní" : "odpověď"})
                    </span>
                    {m.mode && <span className="text-muted">režim {m.mode}</span>}
                    <span className="text-muted">{formatDate(m.createdAt)}</span>
                  </div>
                  {m.blockedReason && <p className="mb-2 text-xs text-band-bad">{m.blockedReason}</p>}
                  <Textarea
                    value={m.body}
                    onChange={(e) => updateDraftBody(m.id, e.target.value)}
                    onBlur={(e) => saveDraftBody(m.id, e.target.value)}
                    rows={3}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => performAction(m.id, "send")} disabled={busyId === m.id || !phone}>
                      Schválit a odeslat
                    </Button>
                    <Button variant="secondary" onClick={() => performAction(m.id, "mark-sent-manually")} disabled={busyId === m.id}>
                      Odeslal(a) jsem ručně
                    </Button>
                    <Button variant="ghost" onClick={() => discard(m.id)}>
                      Zahodit
                    </Button>
                  </div>
                  {!phone && <p className="mt-2 text-[11px] text-band-bad">Chybí telefonní číslo kontaktu.</p>}
                </div>
              ))}
          </div>
        )}
      </div>
    </Card>
  );
}
