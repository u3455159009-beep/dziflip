import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { SqlDb } from '../data/db';
import * as repo from '../data/repositories';
import { reconcile, type RingSession } from '../domain/ringSession';
import {
  DEFAULT_SETTINGS,
  type Alarm,
  type PhotoTarget,
  type QrTarget,
  type Settings,
  type Track,
} from '../domain/types';
import { syncAlarms, type SyncResult } from '../services/alarmEngine';
import { getDb } from '../services/database';
import { newId } from '../services/ids';

export type AppData = {
  ready: boolean;
  error: string | null;
  alarms: Alarm[];
  tracks: Track[];
  qrTargets: QrTarget[];
  photoTargets: PhotoTarget[];
  settings: Settings;
  lastSync: SyncResult | null;
  /** Bumped whenever history changes so stats screens refetch. */
  historyVersion: number;
};

type Actions = {
  db: () => Promise<SqlDb>;
  refresh: () => Promise<void>;
  saveAlarm: (a: Alarm) => Promise<void>;
  deleteAlarm: (id: string) => Promise<void>;
  setAlarmEnabled: (id: string, enabled: boolean) => Promise<void>;
  skipNext: (id: string, until: number | null) => Promise<void>;
  saveTrack: (t: Track) => Promise<void>;
  removeTrack: (id: string) => Promise<number>;
  saveQrTarget: (t: QrTarget) => Promise<void>;
  deleteQrTarget: (id: string) => Promise<void>;
  savePhotoTarget: (t: PhotoTarget) => Promise<void>;
  deletePhotoTarget: (id: string) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  resync: () => Promise<SyncResult>;
  historyChanged: () => void;
};

const Ctx = createContext<(AppData & Actions) | null>(null);

const LAST_RECONCILE_KEY = 'lastReconcileAt';

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppData>({
    ready: false,
    error: null,
    alarms: [],
    tracks: [],
    qrTargets: [],
    photoTargets: [],
    settings: DEFAULT_SETTINGS,
    lastSync: null,
    historyVersion: 0,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async () => {
    const db = await getDb();
    const [alarms, tracks, qrTargets, photoTargets, settings] = await Promise.all([
      repo.listAlarms(db),
      repo.listTracks(db),
      repo.listQrTargets(db),
      repo.listPhotoTargets(db),
      repo.getSettings(db),
    ]);
    setState((s) => ({ ...s, ready: true, error: null, alarms, tracks, qrTargets, photoTargets, settings }));
    return { alarms, tracks, settings };
  }, []);

  const resyncWith = useCallback(async (alarms: Alarm[], tracks: Track[], settings: Settings) => {
    const result = await syncAlarms(alarms, tracks, settings);
    setState((s) => ({ ...s, lastSync: result }));
    return result;
  }, []);

  const refreshAndSync = useCallback(async () => {
    const { alarms, tracks, settings } = await load();
    await resyncWith(alarms, tracks, settings);
  }, [load, resyncWith]);

  /** Missed-ring detection + one-shot expiry, then a full native re-sync. */
  const reconcileNow = useCallback(async () => {
    const db = await getDb();
    const now = Date.now();
    const since = (await repo.getKv<number>(db, LAST_RECONCILE_KEY)) ?? now;
    const [alarms, settings, session] = await Promise.all([
      repo.listAlarms(db),
      repo.getSettings(db),
      repo.getKv<RingSession>(db, 'ringSession'),
    ]);
    const events = await repo.listWakeEvents(db, since - 15 * 86400000);
    const r = reconcile(alarms, events, since, now, settings.maxRingMinutes, session);
    for (const m of r.missed) {
      await repo.saveWakeEvent(db, {
        id: newId(),
        alarmId: m.alarm.id,
        alarmLabel: m.alarm.label || 'Budík',
        scheduledFor: m.scheduledFor,
        ringStartedAt: m.scheduledFor,
        dismissedAt: null,
        snoozeCount: 0,
        outcome: 'missed',
        challengeKinds: [],
        challengeDurationMs: null,
      });
    }
    for (const id of r.expiredOneShots) {
      const a = alarms.find((x) => x.id === id);
      if (a) await repo.saveAlarm(db, { ...a, enabled: false, skipUntil: null, updatedAt: now });
    }
    await repo.setKv(db, LAST_RECONCILE_KEY, now);
    if (r.missed.length) setState((s) => ({ ...s, historyVersion: s.historyVersion + 1 }));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await reconcileNow();
        await refreshAndSync();
      } catch (e) {
        if (alive) setState((s) => ({ ...s, ready: true, error: e instanceof Error ? e.message : String(e) }));
      }
    })();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        // Time zone / clock may have changed while in background → recompute.
        void reconcileNow()
          .then(refreshAndSync)
          .catch(() => {});
      }
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [reconcileNow, refreshAndSync]);

  const actions = useMemo<Actions>(() => {
    const mutateAlarms = async (fn: (db: SqlDb) => Promise<void>) => {
      const db = await getDb();
      await fn(db);
      await refreshAndSync();
    };
    return {
      db: getDb,
      refresh: async () => void (await load()),
      resync: async () => {
        const s = stateRef.current;
        return resyncWith(s.alarms, s.tracks, s.settings);
      },
      saveAlarm: (a) => mutateAlarms((db) => repo.saveAlarm(db, { ...a, updatedAt: Date.now() })),
      deleteAlarm: (id) => mutateAlarms((db) => repo.deleteAlarm(db, id)),
      setAlarmEnabled: (id, enabled) =>
        mutateAlarms(async (db) => {
          const a = await repo.getAlarm(db, id);
          if (a) await repo.saveAlarm(db, { ...a, enabled, skipUntil: enabled ? a.skipUntil : null, updatedAt: Date.now() });
        }),
      skipNext: (id, until) =>
        mutateAlarms(async (db) => {
          const a = await repo.getAlarm(db, id);
          if (a) await repo.saveAlarm(db, { ...a, skipUntil: until, updatedAt: Date.now() });
        }),
      saveTrack: (t) => mutateAlarms((db) => repo.saveTrack(db, t)),
      removeTrack: async (id) => {
        const db = await getDb();
        const n = await repo.deleteTrack(db, id, Date.now());
        await refreshAndSync();
        return n;
      },
      saveQrTarget: async (t) => {
        await repo.saveQrTarget(await getDb(), t);
        await load();
      },
      deleteQrTarget: async (id) => {
        await repo.deleteQrTarget(await getDb(), id);
        await load();
      },
      savePhotoTarget: async (t) => {
        await repo.savePhotoTarget(await getDb(), t);
        await load();
      },
      deletePhotoTarget: async (id) => {
        await repo.deletePhotoTarget(await getDb(), id);
        await load();
      },
      saveSettings: (s) => mutateAlarms((db) => repo.saveSettings(db, s)),
      historyChanged: () => setState((s) => ({ ...s, historyVersion: s.historyVersion + 1 })),
    };
  }, [load, refreshAndSync, resyncWith]);

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
