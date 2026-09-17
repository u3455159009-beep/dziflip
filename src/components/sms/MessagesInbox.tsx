"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { CONTACT_STATUS_LABELS, SMS_STATUS_LABELS, type ContactStatus } from "@/lib/types";
import type { ContactDTO, SmsMessageDTO } from "@/lib/project-types";

interface ProjectWithSms {
  id: string;
  title: string | null;
  municipality: string | null;
  district: string | null;
  isDemo: boolean;
  photos: { url: string }[];
  contact: ContactDTO | null;
  smsMessages: SmsMessageDTO[];
}

interface LightProject {
  id: string;
  title: string | null;
  municipality: string | null;
  district: string | null;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

function ConversationCard({ project }: { project: ProjectWithSms }) {
  const sorted = [...project.smsMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = sorted[sorted.length - 1];
  return (
    <Link
      href={`/project/${project.id}`}
      className="flex gap-3 rounded-xl2 border border-line bg-card p-3 shadow-card hover:border-beige-400"
    >
      {project.photos[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.photos[0].url} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-beige-100 text-[10px] text-muted">
          Bez foto
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{project.title || "Nepojmenovaná nemovitost"}</span>
          {project.isDemo && (
            <span className="shrink-0 rounded-full bg-ink/80 px-1.5 py-0.5 text-[9px] font-medium uppercase text-paper">
              DEMO
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted">
          {project.contact?.phone || "bez telefonu"} ·{" "}
          {CONTACT_STATUS_LABELS[(project.contact?.status as ContactStatus) ?? "NEKONTAKTOVANO"]}
        </div>
        {last && (
          <div className="mt-1 truncate text-xs text-ink">
            <span className="text-muted">{formatTime(last.createdAt)}: </span>
            {last.body}
          </div>
        )}
      </div>
    </Link>
  );
}

export function MessagesInbox({
  projects,
  unassigned: initialUnassigned,
  allProjects
}: {
  projects: ProjectWithSms[];
  unassigned: SmsMessageDTO[];
  allProjects: LightProject[];
}) {
  const [unassigned, setUnassigned] = useState(initialUnassigned);
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const sections = useMemo(() => {
    const nove: ProjectWithSms[] = [];
    const cekajici: ProjectWithSms[] = [];
    const odeslane: ProjectWithSms[] = [];
    const archiv: ProjectWithSms[] = [];

    for (const p of projects) {
      const sorted = [...p.smsMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = sorted[sorted.length - 1];
      const hasUnreadInbound = sorted.some((m) => m.direction === "INBOUND" && !m.readAt);

      if (p.contact?.status === "ODMITNUTO") {
        archiv.push(p);
      } else if (hasUnreadInbound) {
        nove.push(p);
      } else if (last?.direction === "INBOUND") {
        cekajici.push(p);
      } else if (last) {
        odeslane.push(p);
      }
    }
    return { nove, cekajici, odeslane, archiv };
  }, [projects]);

  async function assignMessage(id: string) {
    const projectId = assignChoice[id];
    if (!projectId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/sms/${id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      if (res.ok) setUnassigned((u) => u.filter((m) => m.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-10">
      <Section title="Nové" count={sections.nove.length} empty="Žádné nepřečtené zprávy.">
        {sections.nove.map((p) => (
          <ConversationCard key={p.id} project={p} />
        ))}
      </Section>

      <Section title="Čekající na mou odpověď" count={sections.cekajici.length} empty="Nic nečeká na odpověď.">
        {sections.cekajici.map((p) => (
          <ConversationCard key={p.id} project={p} />
        ))}
      </Section>

      <Section title="Odeslané" count={sections.odeslane.length} empty="Zatím žádné odeslané konverzace.">
        {sections.odeslane.map((p) => (
          <ConversationCard key={p.id} project={p} />
        ))}
      </Section>

      <Section title="Nepřiřazené SMS" count={unassigned.length} empty="Žádné nepřiřazené zprávy.">
        {unassigned.map((m) => (
          <div key={m.id} className="rounded-xl2 border border-line bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-medium text-ink number-tabular">{m.phone}</span>
              <span>{formatDate(m.createdAt)}</span>
              <span className="rounded-full bg-beige-100 px-2 py-0.5 uppercase">
                {SMS_STATUS_LABELS[m.status as keyof typeof SMS_STATUS_LABELS] ?? m.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink">{m.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={assignChoice[m.id] ?? ""}
                onChange={(e) => setAssignChoice((c) => ({ ...c, [m.id]: e.target.value }))}
                className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs"
              >
                <option value="">Vyberte nemovitost…</option>
                {allProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || p.id} {p.municipality ? `— ${p.municipality}` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => assignMessage(m.id)}
                disabled={!assignChoice[m.id] || busyId === m.id}
                className="rounded-full border border-ink bg-ink px-3 py-1.5 text-xs text-paper disabled:opacity-40"
              >
                Přiřadit
              </button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Archiv" count={sections.archiv.length} empty="Archiv je prázdný.">
        {sections.archiv.map((p) => (
          <ConversationCard key={p.id} project={p} />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {title} · {count}
      </h2>
      {count === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </div>
  );
}
