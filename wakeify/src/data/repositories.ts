import { defaultPlan } from '../domain/rotation';
import {
  DEFAULT_SETTINGS,
  type Alarm,
  type ChallengeKind,
  type ChallengePlan,
  type IsoWeekday,
  type PhotoTarget,
  type QrTarget,
  type Settings,
  type Track,
  type WakeEvent,
  type WakeOutcome,
} from '../domain/types';
import type { SqlDb } from './db';

// ---------------------------------------------------------------- alarms ----

type AlarmRow = {
  id: string;
  label: string;
  hour: number;
  minute: number;
  weekdays: string;
  enabled: number;
  skip_until: number | null;
  track_id: string | null;
  volume: number;
  fade_in_seconds: number;
  vibrate: number;
  snooze_minutes: number;
  max_snoozes: number;
  plan_json: string;
  message: string | null;
  created_at: number;
  updated_at: number;
};

function parsePlan(json: string): ChallengePlan {
  try {
    const p = JSON.parse(json) as ChallengePlan;
    return { ...defaultPlan(), ...p };
  } catch {
    return defaultPlan();
  }
}

function toAlarm(r: AlarmRow): Alarm {
  return {
    id: r.id,
    label: r.label,
    hour: r.hour,
    minute: r.minute,
    weekdays: r.weekdays
      ? (r.weekdays.split(',').map(Number).filter((d) => d >= 1 && d <= 7) as IsoWeekday[])
      : [],
    enabled: r.enabled === 1,
    skipUntil: r.skip_until,
    trackId: r.track_id,
    volume: r.volume,
    fadeInSeconds: r.fade_in_seconds,
    vibrate: r.vibrate === 1,
    snoozeMinutes: r.snooze_minutes,
    maxSnoozes: r.max_snoozes,
    plan: parsePlan(r.plan_json),
    message: r.message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listAlarms(db: SqlDb): Promise<Alarm[]> {
  const rows = await db.getAllAsync<AlarmRow>('SELECT * FROM alarms ORDER BY hour, minute, created_at');
  return rows.map(toAlarm);
}

export async function getAlarm(db: SqlDb, id: string): Promise<Alarm | null> {
  const r = await db.getFirstAsync<AlarmRow>('SELECT * FROM alarms WHERE id = ?', id);
  return r ? toAlarm(r) : null;
}

export async function saveAlarm(db: SqlDb, a: Alarm): Promise<void> {
  await db.runAsync(
    `INSERT INTO alarms (id, label, hour, minute, weekdays, enabled, skip_until, track_id, volume,
       fade_in_seconds, vibrate, snooze_minutes, max_snoozes, plan_json, message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label, hour = excluded.hour, minute = excluded.minute,
       weekdays = excluded.weekdays, enabled = excluded.enabled, skip_until = excluded.skip_until,
       track_id = excluded.track_id, volume = excluded.volume, fade_in_seconds = excluded.fade_in_seconds,
       vibrate = excluded.vibrate, snooze_minutes = excluded.snooze_minutes, max_snoozes = excluded.max_snoozes,
       plan_json = excluded.plan_json, message = excluded.message, updated_at = excluded.updated_at`,
    a.id,
    a.label,
    a.hour,
    a.minute,
    [...new Set(a.weekdays)].sort((x, y) => x - y).join(','),
    a.enabled ? 1 : 0,
    a.skipUntil,
    a.trackId,
    a.volume,
    a.fadeInSeconds,
    a.vibrate ? 1 : 0,
    a.snoozeMinutes,
    a.maxSnoozes,
    JSON.stringify(a.plan),
    a.message,
    a.createdAt,
    a.updatedAt,
  );
}

export async function deleteAlarm(db: SqlDb, id: string): Promise<void> {
  await db.runAsync('DELETE FROM alarms WHERE id = ?', id);
}

// ---------------------------------------------------------------- tracks ----

type TrackRow = {
  id: string;
  title: string;
  artist: string | null;
  uri: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  duration_ms: number | null;
  start_offset_ms: number;
  source: string;
  created_at: number;
};

const toTrack = (r: TrackRow): Track => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  uri: r.uri,
  fileName: r.file_name,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  durationMs: r.duration_ms,
  startOffsetMs: r.start_offset_ms,
  source: r.source === 'download' ? 'download' : 'import',
  createdAt: r.created_at,
});

export async function listTracks(db: SqlDb): Promise<Track[]> {
  const rows = await db.getAllAsync<TrackRow>('SELECT * FROM tracks ORDER BY title COLLATE NOCASE');
  return rows.map(toTrack);
}

export async function getTrack(db: SqlDb, id: string): Promise<Track | null> {
  const r = await db.getFirstAsync<TrackRow>('SELECT * FROM tracks WHERE id = ?', id);
  return r ? toTrack(r) : null;
}

export async function saveTrack(db: SqlDb, t: Track): Promise<void> {
  await db.runAsync(
    `INSERT INTO tracks (id, title, artist, uri, file_name, mime_type, size_bytes, duration_ms, start_offset_ms, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, artist = excluded.artist, uri = excluded.uri,
       file_name = excluded.file_name, mime_type = excluded.mime_type, size_bytes = excluded.size_bytes,
       duration_ms = excluded.duration_ms, start_offset_ms = excluded.start_offset_ms`,
    t.id,
    t.title,
    t.artist,
    t.uri,
    t.fileName,
    t.mimeType,
    t.sizeBytes,
    t.durationMs,
    t.startOffsetMs,
    t.source,
    t.createdAt,
  );
}

/** Deletes the track row and detaches it from alarms (they fall back to the system tone). */
export async function deleteTrack(db: SqlDb, id: string, now: number): Promise<number> {
  const affected = await db.getAllAsync<{ id: string }>('SELECT id FROM alarms WHERE track_id = ?', id);
  await db.runAsync('UPDATE alarms SET track_id = NULL, updated_at = ? WHERE track_id = ?', now, id);
  await db.runAsync('DELETE FROM tracks WHERE id = ?', id);
  return affected.length;
}

// ---------------------------------------------------------------- targets ---

type QrRow = { id: string; name: string; payload: string; generated: number; created_at: number };

export async function listQrTargets(db: SqlDb): Promise<QrTarget[]> {
  const rows = await db.getAllAsync<QrRow>('SELECT * FROM qr_targets ORDER BY created_at');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    payload: r.payload,
    generated: r.generated === 1,
    createdAt: r.created_at,
  }));
}

export async function saveQrTarget(db: SqlDb, t: QrTarget): Promise<void> {
  await db.runAsync(
    `INSERT INTO qr_targets (id, name, payload, generated, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, payload = excluded.payload, generated = excluded.generated`,
    t.id,
    t.name,
    t.payload,
    t.generated ? 1 : 0,
    t.createdAt,
  );
}

export async function deleteQrTarget(db: SqlDb, id: string): Promise<void> {
  await db.runAsync('DELETE FROM qr_targets WHERE id = ?', id);
}

type PhotoRow = { id: string; name: string; image_uris: string; features: string; created_at: number };

export async function listPhotoTargets(db: SqlDb): Promise<PhotoTarget[]> {
  const rows = await db.getAllAsync<PhotoRow>('SELECT * FROM photo_targets ORDER BY created_at');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    imageUris: JSON.parse(r.image_uris) as string[],
    features: JSON.parse(r.features) as string[],
    createdAt: r.created_at,
  }));
}

export async function savePhotoTarget(db: SqlDb, t: PhotoTarget): Promise<void> {
  await db.runAsync(
    `INSERT INTO photo_targets (id, name, image_uris, features, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, image_uris = excluded.image_uris, features = excluded.features`,
    t.id,
    t.name,
    JSON.stringify(t.imageUris),
    JSON.stringify(t.features),
    t.createdAt,
  );
}

export async function deletePhotoTarget(db: SqlDb, id: string): Promise<void> {
  await db.runAsync('DELETE FROM photo_targets WHERE id = ?', id);
}

// ---------------------------------------------------------------- history ---

type EventRow = {
  id: string;
  alarm_id: string | null;
  alarm_label: string;
  scheduled_for: number;
  ring_started_at: number;
  dismissed_at: number | null;
  snooze_count: number;
  outcome: string;
  challenge_kinds: string;
  challenge_duration_ms: number | null;
};

const toEvent = (r: EventRow): WakeEvent => ({
  id: r.id,
  alarmId: r.alarm_id,
  alarmLabel: r.alarm_label,
  scheduledFor: r.scheduled_for,
  ringStartedAt: r.ring_started_at,
  dismissedAt: r.dismissed_at,
  snoozeCount: r.snooze_count,
  outcome: r.outcome as WakeOutcome,
  challengeKinds: r.challenge_kinds ? (r.challenge_kinds.split(',') as ChallengeKind[]) : [],
  challengeDurationMs: r.challenge_duration_ms,
});

export async function saveWakeEvent(db: SqlDb, e: WakeEvent): Promise<void> {
  await db.runAsync(
    `INSERT INTO wake_events (id, alarm_id, alarm_label, scheduled_for, ring_started_at, dismissed_at,
       snooze_count, outcome, challenge_kinds, challenge_duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET dismissed_at = excluded.dismissed_at, snooze_count = excluded.snooze_count,
       outcome = excluded.outcome, challenge_kinds = excluded.challenge_kinds,
       challenge_duration_ms = excluded.challenge_duration_ms`,
    e.id,
    e.alarmId,
    e.alarmLabel,
    e.scheduledFor,
    e.ringStartedAt,
    e.dismissedAt,
    e.snoozeCount,
    e.outcome,
    e.challengeKinds.join(','),
    e.challengeDurationMs,
  );
}

export async function listWakeEvents(db: SqlDb, sinceMs = 0): Promise<WakeEvent[]> {
  const rows = await db.getAllAsync<EventRow>(
    'SELECT * FROM wake_events WHERE scheduled_for >= ? ORDER BY scheduled_for DESC',
    sinceMs,
  );
  return rows.map(toEvent);
}

export async function clearWakeEvents(db: SqlDb): Promise<void> {
  await db.runAsync('DELETE FROM wake_events');
}

// ---------------------------------------------------------------- kv / settings

export async function getKv<T>(db: SqlDb, key: string): Promise<T | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  if (!r) return null;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return null;
  }
}

export async function setKv(db: SqlDb, key: string, value: unknown): Promise<void> {
  await db.runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

export async function deleteKv(db: SqlDb, key: string): Promise<void> {
  await db.runAsync('DELETE FROM kv WHERE key = ?', key);
}

export async function getSettings(db: SqlDb): Promise<Settings> {
  const s = await getKv<Partial<Settings>>(db, 'settings');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(db: SqlDb, s: Settings): Promise<void> {
  await setKv(db, 'settings', s);
}
