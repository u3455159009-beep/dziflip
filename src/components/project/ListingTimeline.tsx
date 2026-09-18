"use client";

import { useMemo } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { formatCZK, formatDate } from "@/lib/format";
import { LISTING_EVENT_TYPE_LABELS, type ListingEventType } from "@/lib/types";
import type { ListingEventDTO, PriceHistoryDTO } from "@/lib/project-types";

type TimelineItem =
  | { kind: "price"; at: string; price: number; source: string }
  | { kind: "event"; at: string; eventType: string; detail: string | null; oldValue: string | null; newValue: string | null };

export function ListingTimeline({
  priceHistory,
  events
}: {
  priceHistory: PriceHistoryDTO[];
  events: ListingEventDTO[];
}) {
  const items = useMemo<TimelineItem[]>(() => {
    const priceItems: TimelineItem[] = priceHistory.map((h) => ({
      kind: "price",
      at: h.recordedAt,
      price: h.price,
      source: h.source
    }));
    const eventItems: TimelineItem[] = events
      .filter((e) => e.eventType !== "PRICE_CHANGE") // price changes are already shown via priceHistory
      .map((e) => ({
        kind: "event",
        at: e.occurredAt,
        eventType: e.eventType,
        detail: e.detail,
        oldValue: e.oldValue,
        newValue: e.newValue
      }));
    return [...priceItems, ...eventItems].sort((a, b) => a.at.localeCompare(b.at));
  }, [priceHistory, events]);

  if (items.length === 0) return null;

  return (
    <Card>
      <SectionTitle subtitle="Chronologický přehled toho, co se u této nemovitosti od prvního zachycení změnilo — cena, stav, popis, kontakt.">
        Historie nabídky
      </SectionTitle>
      <ol className="space-y-2 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex items-start justify-between gap-3 border-b border-line/60 pb-2">
            <div>
              <span className="text-xs text-muted">{formatDate(item.at)} — </span>
              {item.kind === "price" ? (
                <span>
                  zachyceno {item.source === "WATCHER" ? "(Deal Radar)" : item.source === "SEED" ? "(počáteční)" : "(ručně)"}
                </span>
              ) : (
                <span>
                  {LISTING_EVENT_TYPE_LABELS[item.eventType as ListingEventType] ?? item.eventType}
                  {item.detail ? ` — ${item.detail}` : ""}
                  {item.oldValue || item.newValue ? (
                    <span className="text-muted">
                      {" "}
                      ({item.oldValue ? `„${item.oldValue}“` : "prázdné"} → {item.newValue ? `„${item.newValue}“` : "prázdné"})
                    </span>
                  ) : null}
                </span>
              )}
            </div>
            {item.kind === "price" && <span className="font-medium number-tabular">{formatCZK(item.price)}</span>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
