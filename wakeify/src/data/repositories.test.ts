import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { defaultPlan } from '../domain/rotation';
import type { Alarm } from '../domain/types';
import { migrate, type SqlDb, type SqlParam } from './db';
import * as repo from './repositories';

function adapter(): SqlDb {
  const db = new Database(':memory:');
  return {
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql, ...p: SqlParam[]) => db.prepare(sql).run(...p),
    getAllAsync: async <T,>(sql: string, ...p: SqlParam[]) => db.prepare(sql).all(...p) as T[],
    getFirstAsync: async <T,>(sql: string, ...p: SqlParam[]) => (db.prepare(sql).get(...p) as T) ?? null,
  };
}

const alarm: Alarm = {
  id: 'a1',
  label: 'Práce',
  hour: 6,
  minute: 45,
  weekdays: [5, 1, 3],
  enabled: true,
  skipUntil: null,
  trackId: 't1',
  volume: 0.7,
  fadeInSeconds: 45,
  vibrate: true,
  snoozeMinutes: 7,
  maxSnoozes: 1,
  plan: { ...defaultPlan(), mode: 'weekday', weekdayPlan: { 1: { steps: [{ kind: 'qr', qrTargetId: 'q' }] } } },
  message: 'Hurá',
  createdAt: 1,
  updatedAt: 2,
};

describe('repositories on real SQLite', () => {
  let db: SqlDb;
  beforeEach(async () => {
    db = adapter();
    expect(await migrate(db)).toBe(1);
  });

  it('migrations are idempotent', async () => {
    expect(await migrate(db)).toBe(1);
  });

  it('alarm round-trip incl. plan JSON and sorted weekdays', async () => {
    await repo.saveAlarm(db, alarm);
    const back = await repo.getAlarm(db, 'a1');
    expect(back).toEqual({ ...alarm, weekdays: [1, 3, 5] });
    await repo.saveAlarm(db, { ...alarm, enabled: false, updatedAt: 3 });
    expect((await repo.listAlarms(db)).map((a) => a.enabled)).toEqual([false]);
    await repo.deleteAlarm(db, 'a1');
    expect(await repo.listAlarms(db)).toEqual([]);
  });

  it('deleting a track detaches it from alarms', async () => {
    await repo.saveAlarm(db, alarm);
    await repo.saveTrack(db, {
      id: 't1', title: 'Song', artist: null, uri: 'file:///x.mp3', fileName: 'x.mp3', mimeType: 'audio/mpeg',
      sizeBytes: 10, durationMs: 1000, startOffsetMs: 0, source: 'import', createdAt: 1,
    });
    expect(await repo.listTracks(db)).toHaveLength(1);
    expect(await repo.deleteTrack(db, 't1', 99)).toBe(1);
    expect((await repo.getAlarm(db, 'a1'))!.trackId).toBeNull();
    expect(await repo.getTrack(db, 't1')).toBeNull();
  });

  it('targets, history and settings', async () => {
    await repo.saveQrTarget(db, { id: 'q', name: 'Koupelna', payload: 'WAKEIFY:X', generated: true, createdAt: 1 });
    await repo.savePhotoTarget(db, { id: 'p', name: 'Okno', imageUris: ['file:///a.jpg'], features: ['{}'], createdAt: 1 });
    expect((await repo.listQrTargets(db))[0].generated).toBe(true);
    expect((await repo.listPhotoTargets(db))[0].imageUris).toEqual(['file:///a.jpg']);

    const ev = {
      id: 'e1', alarmId: 'a1', alarmLabel: 'Práce', scheduledFor: 100, ringStartedAt: 100, dismissedAt: null,
      snoozeCount: 0, outcome: 'missed' as const, challengeKinds: [], challengeDurationMs: null,
    };
    await repo.saveWakeEvent(db, ev);
    await repo.saveWakeEvent(db, { ...ev, dismissedAt: 200, outcome: 'success', challengeKinds: ['qr', 'math'], snoozeCount: 1 });
    const events = await repo.listWakeEvents(db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'success', challengeKinds: ['qr', 'math'], snoozeCount: 1 });

    const s = await repo.getSettings(db);
    expect(s.onboardingDone).toBe(false);
    await repo.saveSettings(db, { ...s, onboardingDone: true, affirmation: 'Ahoj' });
    expect(await repo.getSettings(db)).toMatchObject({ onboardingDone: true, affirmation: 'Ahoj', maxRingMinutes: 30 });
  });
});
