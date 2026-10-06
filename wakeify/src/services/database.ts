import { openDatabaseAsync } from 'expo-sqlite';

import { migrate, type SqlDb } from '../data/db';

let dbPromise: Promise<SqlDb> | null = null;

/** Single shared connection (WAL mode) — opened lazily, migrated once. */
export function getDb(): Promise<SqlDb> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDatabaseAsync('wakeify.db');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await migrate(db);
      return db;
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}
