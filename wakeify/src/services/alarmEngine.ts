import { Platform } from 'react-native';

import {
  WakeifyAlarm,
  type ActiveRing,
  type AlarmPermissionStatus,
  type PermissionKind,
  type PermissionState,
  type ScheduledInfo,
} from '../../modules/wakeify-alarm';
import { buildNativeSpecs } from '../domain/nativeSpecs';
import type { Alarm, Settings, Track } from '../domain/types';

export type SyncResult =
  | { ok: true; scheduled: ScheduledInfo[] }
  | { ok: false; reason: 'unavailable' | 'error'; message: string };

export const engineAvailable = WakeifyAlarm != null;

const UNAVAILABLE =
  'Nativní budíkový engine není v tomto sestavení k dispozici (např. Expo Go). Budíky se uloží, ale systém je nespustí. Nainstaluj vývojové nebo produkční sestavení Wakeify.';

let chain: Promise<unknown> = Promise.resolve();

/** Serialised full re-sync: the native engine always mirrors the DB exactly. */
export function syncAlarms(alarms: Alarm[], tracks: Track[], settings: Settings): Promise<SyncResult> {
  const run = async (): Promise<SyncResult> => {
    if (!WakeifyAlarm) return { ok: false, reason: 'unavailable', message: UNAVAILABLE };
    try {
      const scheduled = await WakeifyAlarm.syncAlarms(buildNativeSpecs(alarms, tracks, settings));
      return { ok: true, scheduled };
    } catch (e) {
      return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  };
  const next = chain.then(run, run);
  chain = next;
  return next;
}

export async function getActiveRing(): Promise<ActiveRing | null> {
  if (!WakeifyAlarm) return null;
  try {
    return await WakeifyAlarm.getActiveRing();
  } catch {
    return null;
  }
}

/** Silences the current ring of `alarmId` only (other alarms keep ringing; backups stay armed). */
export async function stopRinging(alarmId: string): Promise<void> {
  await WakeifyAlarm?.stopRinging(alarmId).catch(() => {});
}

export async function markHandled(alarmId: string): Promise<void> {
  await WakeifyAlarm?.markOccurrenceHandled(alarmId).catch(() => {});
}

export async function scheduleSnooze(alarmId: string, at: number): Promise<boolean> {
  if (!WakeifyAlarm) return false;
  await WakeifyAlarm.scheduleSnooze(alarmId, at);
  return true;
}

export async function scheduleTestRing(alarmId: string, seconds: number): Promise<boolean> {
  if (!WakeifyAlarm) return false;
  await WakeifyAlarm.scheduleTestRing(alarmId, seconds);
  return true;
}

export function setShowOverLockScreen(show: boolean): void {
  try {
    WakeifyAlarm?.setShowOverLockScreen(show);
  } catch {
    // not supported
  }
}

export async function getPermissionStatus(): Promise<AlarmPermissionStatus | null> {
  if (!WakeifyAlarm) return null;
  try {
    return await WakeifyAlarm.getPermissionStatus();
  } catch {
    return null;
  }
}

export async function requestPermission(kind: PermissionKind): Promise<PermissionState | null> {
  if (!WakeifyAlarm) return null;
  return WakeifyAlarm.requestPermission(kind);
}

type Unsub = () => void;

export function onRingStarted(cb: (e: { alarmId: string; scheduledFor: number }) => void): Unsub {
  if (!WakeifyAlarm) return () => {};
  const sub = WakeifyAlarm.addListener('onRingStarted', cb);
  return () => sub.remove();
}

export function onRingStopped(
  cb: (e: { alarmId: string; scheduledFor: number; reason: 'dismissed' | 'timeout' | 'system' }) => void,
): Unsub {
  if (!WakeifyAlarm) return () => {};
  const sub = WakeifyAlarm.addListener('onRingStopped', cb);
  return () => sub.remove();
}

/** On iOS the app plays the full track itself while the ring screen is open. */
export const playsInAppWhileRinging = Platform.OS === 'ios' || !engineAvailable;
