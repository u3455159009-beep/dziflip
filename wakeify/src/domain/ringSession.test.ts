import { describe, expect, it } from 'vitest';

import { defaultPlan } from './rotation';
import { canSnooze, continuesSession, reconcile, ringWindowMs, shouldShowRing, snoozesLeft, wakeEventId, type RingSession } from './ringSession';
import type { Alarm, WakeEvent } from './types';

process.env.TZ = 'Europe/Prague';

const t = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

const alarm = (p: Partial<Alarm> = {}): Alarm => ({
  id: 'a1',
  label: 'Ráno',
  hour: 7,
  minute: 0,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  enabled: true,
  skipUntil: null,
  trackId: null,
  volume: 0.8,
  fadeInSeconds: 30,
  vibrate: true,
  snoozeMinutes: 5,
  maxSnoozes: 2,
  plan: defaultPlan(),
  message: null,
  createdAt: t(1, 12),
  updatedAt: t(1, 12),
  ...p,
});

const event = (scheduledFor: number): WakeEvent => ({
  id: `e${scheduledFor}`,
  alarmId: 'a1',
  alarmLabel: 'Ráno',
  scheduledFor,
  ringStartedAt: scheduledFor,
  dismissedAt: scheduledFor + 60000,
  snoozeCount: 0,
  outcome: 'success',
  challengeKinds: [],
  challengeDurationMs: null,
});

describe('snooze rules', () => {
  it('limits snoozes', () => {
    expect(canSnooze({ maxSnoozes: 2 }, { snoozeCount: 1 })).toBe(true);
    expect(canSnooze({ maxSnoozes: 2 }, { snoozeCount: 2 })).toBe(false);
    expect(canSnooze({ maxSnoozes: 0 }, { snoozeCount: 0 })).toBe(false);
    expect(snoozesLeft({ maxSnoozes: 3 }, { snoozeCount: 1 })).toBe(2);
  });
  it('continuesSession recognises snoozes and backup re-alarms', () => {
    const s: RingSession = { eventId: 'e', alarmId: 'a1', scheduledFor: t(5, 7), firstRingAt: t(5, 7), snoozeCount: 1, challengeStartedAt: null };
    expect(continuesSession(s, { alarmId: 'a1', scheduledFor: t(5, 7, 5), isSnooze: true })).toBe(true);
    expect(continuesSession(s, { alarmId: 'a1', scheduledFor: t(5, 7), isSnooze: false })).toBe(true);
    expect(continuesSession(s, { alarmId: 'a1', scheduledFor: t(6, 7), isSnooze: false })).toBe(false);
    expect(continuesSession(s, { alarmId: 'b', scheduledFor: t(5, 7), isSnooze: true })).toBe(false);
    expect(continuesSession(null, { alarmId: 'a1', scheduledFor: t(5, 7), isSnooze: true })).toBe(false);
  });
});

describe('snooze gating & ids', () => {
  const s: RingSession = { eventId: 'e', alarmId: 'a1', scheduledFor: t(5, 7), firstRingAt: t(5, 7), snoozeCount: 1, challengeStartedAt: null, snoozedUntil: t(5, 7, 10) };
  it('ignores stale rings of the snoozed occurrence until the snooze ends', () => {
    expect(shouldShowRing(s, { alarmId: 'a1', scheduledFor: t(5, 7), isSnooze: false }, t(5, 7, 5))).toBe(false);
    expect(shouldShowRing(s, { alarmId: 'a1', scheduledFor: t(5, 7), isSnooze: true }, t(5, 7, 5))).toBe(true);
    expect(shouldShowRing(s, { alarmId: 'a1', scheduledFor: t(5, 7), isSnooze: false }, t(5, 7, 11))).toBe(true);
    expect(shouldShowRing(s, { alarmId: 'b', scheduledFor: t(5, 7), isSnooze: false }, t(5, 7, 5))).toBe(true);
    expect(shouldShowRing(null, { alarmId: 'a1', scheduledFor: t(5, 7), isSnooze: false }, t(5, 7, 5))).toBe(true);
  });
  it('event ids are deterministic per occurrence', () => {
    expect(wakeEventId('a', t(5, 7))).toBe(wakeEventId('a', t(5, 7) + 20_000));
    expect(wakeEventId('a', t(5, 7))).not.toBe(wakeEventId('a', t(6, 7)));
    expect(ringWindowMs({ maxRingMinutes: 30, backupRepeatMinutes: 1, backupCount: 10 })).toBe(40 * 60000);
  });
});

describe('reconcile', () => {
  it('reports unhandled past occurrences as missed', () => {
    const r = reconcile([alarm()], [event(t(3, 7))], t(2, 12), t(5, 12), 30 * 60000, null);
    expect(r.missed.map((m) => new Date(m.scheduledFor).getDate())).toEqual([4, 5]);
    expect(r.expiredOneShots).toEqual([]);
  });
  it('does not report an occurrence that is still within the ring window', () => {
    const r = reconcile([alarm()], [], t(5, 6), t(5, 7, 10), 30 * 60000, null);
    expect(r.missed).toEqual([]);
  });
  it('does not report the occurrence of the active session', () => {
    const s: RingSession = { eventId: 'e', alarmId: 'a1', scheduledFor: t(5, 7), firstRingAt: t(5, 7), snoozeCount: 2, challengeStartedAt: null };
    expect(reconcile([alarm()], [], t(5, 6), t(5, 9), 30 * 60000, s).missed).toEqual([]);
  });
  it('ignores occurrences before the alarm was last edited and disabled alarms', () => {
    expect(reconcile([alarm({ updatedAt: t(5, 8) })], [], t(1, 0), t(5, 12), 30 * 60000, null).missed).toEqual([]);
    expect(reconcile([alarm({ enabled: false })], [], t(1, 0), t(5, 12), 30 * 60000, null).missed).toEqual([]);
  });
  it('expires one-shot alarms after their occurrence', () => {
    const one = alarm({ weekdays: [], updatedAt: t(4, 22) });
    const r = reconcile([one], [event(t(5, 7))], t(4, 22), t(5, 8), 30 * 60000, null);
    expect(r.expiredOneShots).toEqual(['a1']);
    expect(r.missed).toEqual([]);
    expect(reconcile([one], [], t(4, 22), t(5, 6), 30 * 60000, null).expiredOneShots).toEqual([]);
  });
});
