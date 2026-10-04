import { localDayIndex } from './rotation';
import { formatTime } from './schedule';
import type { WakeEvent } from './types';

export type DayStatus = 'onTime' | 'late' | 'missed' | 'none';

export type WakeStats = {
  totalRings: number;
  successes: number;
  missed: number;
  successRate: number; // 0..1, 0 when no rings
  onTimeDays: number;
  currentStreak: number;
  bestStreak: number;
  averageSnoozes: number;
  averageChallengeSeconds: number | null;
  averageWakeMinutes: number | null; // minutes after midnight
  topWakeTimes: { label: string; count: number }[];
  last7Days: { dayIndex: number; date: Date; status: DayStatus }[];
};

export function isOnTime(e: WakeEvent, graceMinutes: number): boolean {
  return (
    e.outcome !== 'missed' &&
    e.dismissedAt != null &&
    e.dismissedAt - e.scheduledFor <= graceMinutes * 60000
  );
}

/** Day verdict: any missed ring → missed; else on time if any on-time success; else late. */
function dayStatus(events: WakeEvent[], grace: number): DayStatus {
  if (events.length === 0) return 'none';
  if (events.some((e) => e.outcome === 'missed')) return 'missed';
  return events.some((e) => isOnTime(e, grace)) ? 'onTime' : 'late';
}

export function computeStats(events: WakeEvent[], graceMinutes: number, now: Date): WakeStats {
  const byDay = new Map<number, WakeEvent[]>();
  for (const e of events) {
    const k = localDayIndex(new Date(e.scheduledFor));
    const list = byDay.get(k);
    if (list) list.push(e);
    else byDay.set(k, [e]);
  }

  const successes = events.filter((e) => e.outcome !== 'missed');
  const missed = events.length - successes.length;

  // Streaks: consecutive *alarm days* that were on time. Days without any
  // alarm (e.g. a free weekend) neither extend nor break a streak.
  const days = [...byDay.keys()].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (dayStatus(byDay.get(d)!, graceMinutes) === 'onTime') {
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }
  const current = run;

  const onTimeDays = days.filter((d) => dayStatus(byDay.get(d)!, graceMinutes) === 'onTime').length;

  const challengeDurations = successes
    .map((e) => e.challengeDurationMs)
    .filter((v): v is number => v != null && v >= 0);

  const wakeMinutes = successes
    .filter((e) => e.dismissedAt != null)
    .map((e) => {
      const d = new Date(e.dismissedAt!);
      return d.getHours() * 60 + d.getMinutes();
    });

  // Histogram in 15-minute buckets.
  const buckets = new Map<number, number>();
  for (const m of wakeMinutes) {
    const b = Math.floor(m / 15) * 15;
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  const topWakeTimes = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 3)
    .map(([m, count]) => ({ label: formatTime(Math.floor(m / 60), m % 60), count }));

  const today = localDayIndex(now);
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const dayIndex = today - 6 + i;
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { dayIndex, date, status: dayStatus(byDay.get(dayIndex) ?? [], graceMinutes) };
  });

  return {
    totalRings: events.length,
    successes: successes.length,
    missed,
    successRate: events.length ? successes.length / events.length : 0,
    onTimeDays,
    currentStreak: current,
    bestStreak: best,
    averageSnoozes: events.length ? events.reduce((s, e) => s + e.snoozeCount, 0) / events.length : 0,
    averageChallengeSeconds: challengeDurations.length
      ? challengeDurations.reduce((a, b) => a + b, 0) / challengeDurations.length / 1000
      : null,
    averageWakeMinutes: wakeMinutes.length
      ? Math.round(wakeMinutes.reduce((a, b) => a + b, 0) / wakeMinutes.length)
      : null,
    topWakeTimes,
    last7Days,
  };
}
