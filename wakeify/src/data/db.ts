/**
 * Minimal async SQL surface. `expo-sqlite`'s SQLiteDatabase satisfies it in the
 * app; tests use a better-sqlite3 adapter, so every query here runs against a
 * real SQLite engine in CI.
 */
export type SqlParam = string | number | null;

export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlParam[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlParam[]): Promise<T | null>;
}

type Migration = { version: number; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS alarms (
        id TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        weekdays TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        skip_until INTEGER,
        track_id TEXT,
        volume REAL NOT NULL,
        fade_in_seconds INTEGER NOT NULL,
        vibrate INTEGER NOT NULL,
        snooze_minutes INTEGER NOT NULL,
        max_snoozes INTEGER NOT NULL,
        plan_json TEXT NOT NULL,
        message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        artist TEXT,
        uri TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT,
        size_bytes INTEGER NOT NULL,
        duration_ms INTEGER,
        start_offset_ms INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS qr_targets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        payload TEXT NOT NULL,
        generated INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS photo_targets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        image_uris TEXT NOT NULL,
        features TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wake_events (
        id TEXT PRIMARY KEY NOT NULL,
        alarm_id TEXT,
        alarm_label TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL,
        ring_started_at INTEGER NOT NULL,
        dismissed_at INTEGER,
        snooze_count INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        challenge_kinds TEXT NOT NULL,
        challenge_duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_wake_events_scheduled ON wake_events (scheduled_for);
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
];

export async function migrate(db: SqlDb): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    await db.execAsync(`BEGIN; ${m.sql} PRAGMA user_version = ${m.version}; COMMIT;`);
    current = m.version;
  }
  return current;
}
