import { nextOccurrence } from './schedule';
import type { Alarm, WakeEvent } from './types';

/**
 * State of one wake-up across snoozes. Persisted (kv 'ringSession') so a JS
 * reload, a crash or the OS killing the app mid-challenge never loses the
 * snooze count or lets the user escape the challenge.
 */
export type RingSession = {
  eventId: string;
  alarmId: string;
  /** The original scheduled occurrence (snoozes keep pointing at it). */
  scheduledFor: number;
  firstRingAt: number;
  snoozeCount: number;
  /** When the user started the challenge in this session (for stats). */
  challengeStartedAt: number | null;
};

export function canSnooze(alarm: Pick<Alarm, 'maxSnoozes'>, session: Pick<RingSession, 'snoozeCount'>): boolean {
  return alarm.maxSnoozes > 0 && session.snoozeCount < alarm.maxSnoozes;
}

export function snoozesLeft(alarm: Pick<Alarm, 'maxSnoozes'>, session: Pick<RingSession, 'snoozeCount'>): number {
  return Math.max(0, alarm.maxSnoozes - session.snoozeCount);
}

/**
 * The ring that just fired belongs to an existing session when it is a
 * snooze of it, or a backup re-alarm of the same occurrence.
 */
export function continuesSession(
  session: RingSession | null,
  ring: { alarmId: string; scheduledFor: number; isSnooze: boolean },
): boolean {
  if (!session || session.alarmId !== ring.alarmId) return false;
  if (ring.isSnooze) return true;
  // Backup re-alarms and repeated deliveries report the same occurrence.
  return Math.abs(ring.scheduledFor - session.scheduledFor) < 60_000;
}

export type Reconciliation = {
  /** Occurrences that rang (or should have) but have no wake event. */
  missed: { alarm: Alarm; scheduledFor: number }[];
  /** One-shot alarms whose single occurrence is in the past → disable in JS too. */
  expiredOneShots: string[];
};

const MAX_LOOKBACK_MS = 14 * 86400000;

/**
 * Runs whenever the app starts or returns to the foreground. Detects rings the
 * user never handled (the app was not opened, the ring timed out) so history
 * and streaks stay truthful, and mirrors the native engine's auto-disable of
 * one-shot alarms.
 */
export function reconcile(
  alarms: Alarm[],
  events: WakeEvent[],
  sinceMs: number,
  nowMs: number,
  maxRingMinutes: number,
  activeSession: RingSession | null,
): Reconciliation {
  const missed: Reconciliation['missed'] = [];
  const expiredOneShots: string[] = [];
  const settled = nowMs - maxRingMinutes * 60000; // occurrences still ringing are not "missed" yet
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const from = Math.max(sinceMs, alarm.updatedAt, nowMs - MAX_LOOKBACK_MS);
    let cursor = new Date(from);
    for (let guard = 0; guard < 64; guard++) {
      const occ = nextOccurrence(alarm, cursor);
      if (!occ || occ.getTime() > nowMs) break;
      const t = occ.getTime();
      if (alarm.weekdays.length === 0) expiredOneShots.push(alarm.id);
      const handled =
        events.some((e) => e.alarmId === alarm.id && Math.abs(e.scheduledFor - t) < 60_000) ||
        (activeSession?.alarmId === alarm.id && Math.abs(activeSession.scheduledFor - t) < 60_000);
      if (!handled && t <= settled) missed.push({ alarm, scheduledFor: t });
      if (alarm.weekdays.length === 0) break;
      cursor = occ;
    }
  }
  return { missed, expiredOneShots };
}
