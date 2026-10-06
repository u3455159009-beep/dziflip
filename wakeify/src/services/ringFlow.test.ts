import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrate, type SqlDb, type SqlParam } from '../data/db';
import * as repo from '../data/repositories';
import { wakeEventId } from '../domain/ringSession';
import { defaultPlan } from '../domain/rotation';
import type { Alarm } from '../domain/types';

// The native engine is replaced by a recorder: we assert on the exact calls
// and their ORDER, which is what decides whether the phone stays silent.
const calls: string[] = [];
let failSnooze = false;
vi.mock('./alarmEngine', () => ({
  markHandled: vi.fn(async (id: string) => void calls.push(`markHandled:${id}`)),
  stopRinging: vi.fn(async (id: string) => void calls.push(`stopRinging:${id}`)),
  scheduleSnooze: vi.fn(async (id: string, at: number) => {
    if (failSnooze) throw new Error('native refused');
    calls.push(`scheduleSnooze:${id}:${at}`);
    return true;
  }),
}));

const { armReRing, beginRing, complete, finishTestRing, getSession, snooze, RERING_AHEAD_SECONDS } = await import('./ringFlow');

function adapter(): SqlDb {
  const db = new Database(':memory:');
  return {
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql, ...p: SqlParam[]) => db.prepare(sql).run(...p),
    getAllAsync: async <T,>(sql: string, ...p: SqlParam[]) => db.prepare(sql).all(...p) as T[],
    getFirstAsync: async <T,>(sql: string, ...p: SqlParam[]) => (db.prepare(sql).get(...p) as T) ?? null,
  };
}

const T0 = new Date(2026, 9, 5, 7, 0).getTime();
const alarm: Alarm = {
  id: 'a1', label: 'Ráno', hour: 7, minute: 0, weekdays: [1, 2, 3, 4, 5], enabled: true, skipUntil: null,
  trackId: null, volume: 0.8, fadeInSeconds: 30, vibrate: true, snoozeMinutes: 5, maxSnoozes: 2,
  plan: defaultPlan(), message: null, createdAt: 0, updatedAt: 0,
};
const ring = { alarmId: 'a1', scheduledFor: T0, isSnooze: false, startedAt: T0 + 2000 };

describe('ring flow (native calls mocked, real SQLite)', () => {
  let db: SqlDb;
  beforeEach(async () => {
    db = adapter();
    await migrate(db);
    calls.length = 0;
    failSnooze = false;
  });

  it('a ring immediately writes a provisional "missed" event with a deterministic id', async () => {
    const s = await beginRing(db, alarm, ring);
    expect(s.eventId).toBe(wakeEventId('a1', T0));
    const [e] = await repo.listWakeEvents(db);
    expect(e).toMatchObject({ id: s.eventId, outcome: 'missed', dismissedAt: null });
  });

  it('concurrent beginRing calls create ONE session and ONE event', async () => {
    const [s1, s2] = await Promise.all([beginRing(db, alarm, ring), beginRing(db, alarm, ring)]);
    expect(s1.eventId).toBe(s2.eventId);
    expect(await repo.listWakeEvents(db)).toHaveLength(1);
  });

  it('snooze: schedules first, only then silences — and only this alarm', async () => {
    const s = await beginRing(db, alarm, ring);
    const r = await snooze(db, alarm, s);
    expect(r).not.toBeNull();
    expect(calls[0]).toMatch(/^scheduleSnooze:a1:/);
    expect(calls[1]).toBe('stopRinging:a1');
    const saved = await getSession(db);
    expect(saved).toMatchObject({ snoozeCount: 1, snoozedUntil: r!.until });
  });

  it('a failed snooze keeps the alarm ringing and does not use up a snooze', async () => {
    const s = await beginRing(db, alarm, ring);
    failSnooze = true;
    await expect(snooze(db, alarm, s)).rejects.toThrow('native refused');
    expect(calls).toEqual([]); // nothing was silenced
    expect((await getSession(db))!.snoozeCount).toBe(0);
  });

  it('snooze limit is enforced', async () => {
    let s = await beginRing(db, alarm, ring);
    for (let i = 0; i < 2; i++) {
      await snooze(db, alarm, s);
      s = (await getSession(db))!;
    }
    calls.length = 0;
    expect(await snooze(db, alarm, s)).toBeNull();
    expect(calls).toEqual([]);
  });

  it('the snoozed ring continues the same session and the same history entry', async () => {
    const s = await beginRing(db, alarm, ring);
    await snooze(db, alarm, s);
    const again = await beginRing(db, alarm, { ...ring, isSnooze: true, startedAt: T0 + 5 * 60000 });
    expect(again.eventId).toBe(s.eventId);
    expect(again.snoozeCount).toBe(1);
    expect(again.snoozedUntil).toBeNull();
    expect(await repo.listWakeEvents(db)).toHaveLength(1);
  });

  it('completion: handles the occurrence natively (cancels backups/snooze), records success once, clears session', async () => {
    const s = await beginRing(db, alarm, ring);
    await snooze(db, alarm, s);
    const resumed = await beginRing(db, alarm, { ...ring, isSnooze: true });
    calls.length = 0;
    const ev = await complete(db, alarm, { ...resumed, challengeStartedAt: Date.now() - 30000 }, ['math']);
    // Only markOccurrenceHandled for THIS alarm — never a global stop that would
    // silence another alarm ringing at the same moment.
    expect(calls).toEqual(['markHandled:a1']);
    const events = await repo.listWakeEvents(db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: ev.id, outcome: 'success', snoozeCount: 1, challengeKinds: ['math'] });
    expect(events[0].challengeDurationMs).toBeGreaterThanOrEqual(30000);
    expect(await getSession(db)).toBeNull();
  });

  it('test ring: stops only that alarm, writes no history', async () => {
    await finishTestRing('a1');
    expect(calls).toEqual(['markHandled:a1', 'stopRinging:a1']);
    expect(await repo.listWakeEvents(db)).toEqual([]);
  });

  it('iOS re-ring safety net is a snooze RERING_AHEAD_SECONDS ahead and swallows native errors', async () => {
    const before = Date.now();
    await armReRing('a1');
    const at = Number(calls[0].split(':')[2]);
    expect(at - before).toBeGreaterThanOrEqual(RERING_AHEAD_SECONDS * 1000);
    expect(at - before).toBeLessThan(RERING_AHEAD_SECONDS * 1000 + 2000);
    failSnooze = true;
    await expect(armReRing('a1')).resolves.toBeUndefined();
  });
});
