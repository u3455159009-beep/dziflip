import type { SqlDb } from '../data/db';
import * as repo from '../data/repositories';
import { canSnooze, continuesSession, type RingSession } from '../domain/ringSession';
import type { Alarm, ChallengeKind, WakeEvent } from '../domain/types';
import { markHandled, scheduleSnooze, stopRinging } from './alarmEngine';
import { newId } from './ids';

const KEY = 'ringSession';

export async function getSession(db: SqlDb): Promise<RingSession | null> {
  return repo.getKv<RingSession>(db, KEY);
}

async function saveSession(db: SqlDb, s: RingSession): Promise<void> {
  await repo.setKv(db, KEY, s);
}

/**
 * Called when the ring screen opens. Continues the current session for a
 * snooze/backup re-alarm, otherwise opens a new one and immediately writes a
 * provisional "missed" wake event (upgraded to success on completion), so an
 * abandoned ring is never lost from the history.
 */
export async function beginRing(
  db: SqlDb,
  alarm: Alarm,
  ring: { alarmId: string; scheduledFor: number; isSnooze: boolean; startedAt: number },
): Promise<RingSession> {
  const existing = await getSession(db);
  if (existing && continuesSession(existing, ring)) return existing;
  const session: RingSession = {
    eventId: newId(),
    alarmId: alarm.id,
    scheduledFor: ring.scheduledFor,
    firstRingAt: ring.startedAt,
    snoozeCount: 0,
    challengeStartedAt: null,
  };
  await saveSession(db, session);
  await repo.saveWakeEvent(db, provisionalEvent(alarm, session));
  return session;
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
  const next: RingSession = { ...s, snoozeCount: s.snoozeCount + 1, challengeStartedAt: null };
  await saveSession(db, next);
  await repo.saveWakeEvent(db, provisionalEvent(alarm, next));
  await stopRinging();
  await scheduleSnooze(alarm.id, until);
  return { until };
}

export async function complete(
  db: SqlDb,
  alarm: Alarm,
  s: RingSession,
  kinds: ChallengeKind[],
  outcome: 'success' | 'fallback' = 'success',
): Promise<WakeEvent> {
  await markHandled(alarm.id);
  await stopRinging();
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

/** Native engine reported a timeout (maxRingMinutes) — leave the provisional "missed" event. */
export async function abandon(db: SqlDb): Promise<void> {
  await repo.deleteKv(db, KEY);
}
