import type { SqlDb } from '../data/db';
import * as repo from '../data/repositories';
import { canSnooze, continuesSession, wakeEventId, type RingSession } from '../domain/ringSession';
import type { Alarm, ChallengeKind, WakeEvent } from '../domain/types';
import { markHandled, scheduleSnooze, stopRinging } from './alarmEngine';

const KEY = 'ringSession';

/** Process-wide guard: at most one ring screen is open at a time. */
export const ringUi = { open: false };

export async function getSession(db: SqlDb): Promise<RingSession | null> {
  return repo.getKv<RingSession>(db, KEY);
}

async function saveSession(db: SqlDb, s: RingSession): Promise<void> {
  await repo.setKv(db, KEY, s);
}

let beginLock: Promise<RingSession> | null = null;

/**
 * Called when the ring screen opens. Continues the current session for a
 * snooze/backup re-alarm, otherwise opens a new one and immediately writes a
 * provisional "missed" wake event (upgraded to success on completion), so an
 * abandoned ring is never lost from the history. Single-flight, and the event
 * id is derived from the occurrence, so concurrent callers or the missed-ring
 * reconciliation can never create a second record for the same wake-up.
 */
export function beginRing(
  db: SqlDb,
  alarm: Alarm,
  ring: { alarmId: string; scheduledFor: number; isSnooze: boolean; startedAt: number },
): Promise<RingSession> {
  const run = async (): Promise<RingSession> => {
    const existing = await getSession(db);
    if (existing && continuesSession(existing, ring)) {
      if (!existing.snoozedUntil) return existing;
      const resumed = { ...existing, snoozedUntil: null };
      await saveSession(db, resumed);
      return resumed;
    }
    const session: RingSession = {
      eventId: wakeEventId(alarm.id, ring.scheduledFor),
      alarmId: alarm.id,
      scheduledFor: ring.scheduledFor,
      firstRingAt: ring.startedAt,
      snoozeCount: 0,
      challengeStartedAt: null,
      snoozedUntil: null,
    };
    await saveSession(db, session);
    await repo.saveWakeEvent(db, provisionalEvent(alarm, session));
    return session;
  };
  const next = (beginLock ?? Promise.resolve()).then(run, run) as Promise<RingSession>;
  beginLock = next.catch(() => null as unknown as RingSession);
  return next;
}

function provisionalEvent(alarm: Alarm, s: RingSession): WakeEvent {
  return {
    id: s.eventId,
    alarmId: alarm.id,
    alarmLabel: alarm.label || 'Budík',
    scheduledFor: s.scheduledFor,
    ringStartedAt: s.firstRingAt,
    dismissedAt: null,
    snoozeCount: s.snoozeCount,
    outcome: 'missed',
    challengeKinds: [],
    challengeDurationMs: null,
  };
}

export async function markChallengeStarted(db: SqlDb, s: RingSession): Promise<RingSession> {
  if (s.challengeStartedAt) return s;
  const next = { ...s, challengeStartedAt: Date.now() };
  await saveSession(db, next);
  return next;
}

export async function snooze(db: SqlDb, alarm: Alarm, s: RingSession): Promise<{ until: number } | null> {
  if (!canSnooze(alarm, s)) return null;
  const until = Date.now() + alarm.snoozeMinutes * 60000;
  // Schedule first: if that fails the alarm keeps ringing and no snooze is used up.
  await scheduleSnooze(alarm.id, until);
  const next: RingSession = { ...s, snoozeCount: s.snoozeCount + 1, challengeStartedAt: null, snoozedUntil: until };
  await saveSession(db, next);
  await repo.saveWakeEvent(db, provisionalEvent(alarm, next));
  await stopRinging();
  return { until };
}

export async function complete(
  db: SqlDb,
  alarm: Alarm,
  s: RingSession,
  kinds: ChallengeKind[],
  outcome: 'success' | 'fallback' = 'success',
): Promise<WakeEvent> {
  // Only this alarm: another alarm that started ringing meanwhile keeps ringing.
  await markHandled(alarm.id);
  const now = Date.now();
  const event: WakeEvent = {
    ...provisionalEvent(alarm, s),
    dismissedAt: now,
    outcome,
    challengeKinds: kinds,
    challengeDurationMs: s.challengeStartedAt ? now - s.challengeStartedAt : null,
  };
  await repo.saveWakeEvent(db, event);
  await repo.deleteKv(db, KEY);
  return event;
}

/** Test rings: stop sound and backups, record nothing. */
export async function finishTestRing(alarmId: string): Promise<void> {
  await markHandled(alarmId);
  await stopRinging();
}

/** The ring ended without the challenge (native timeout) — keep the provisional "missed" event. */
export async function abandon(db: SqlDb): Promise<void> {
  await repo.deleteKv(db, KEY);
}
