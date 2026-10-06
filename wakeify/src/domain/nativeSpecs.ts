import type { NativeAlarmSpec } from '../../modules/wakeify-alarm/src/WakeifyAlarm.types';
import type { Alarm, Settings, Track } from './types';

/** Does any reachable challenge of this alarm require real effort? */
export function hasRealChallenge(alarm: Alarm): boolean {
  const all = [alarm.plan.challenge, ...Object.values(alarm.plan.weekdayPlan), ...alarm.plan.pool];
  return all.some((c) => c?.steps.some((s) => s.kind !== 'none'));
}

/** Maps app alarms to the native engine contract. Pure — unit tested. */
export function buildNativeSpecs(alarms: Alarm[], tracks: Track[], settings: Settings): NativeAlarmSpec[] {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return alarms.map((a) => {
    const track = a.trackId ? byId.get(a.trackId) : undefined;
    const challenge = hasRealChallenge(a);
    return {
      id: a.id,
      label: a.label.trim() || 'Budík',
      hour: a.hour,
      minute: a.minute,
      weekdays: [...new Set(a.weekdays)].sort((x, y) => x - y),
      enabled: a.enabled,
      skipUntil: a.skipUntil,
      soundUri: track?.uri ?? null,
      startOffsetMs: track?.startOffsetMs ?? 0,
      volume: Math.min(1, Math.max(0.05, a.volume)),
      fadeInSeconds: Math.max(0, Math.round(a.fadeInSeconds)),
      vibrate: a.vibrate,
      maxRingMinutes: settings.maxRingMinutes,
      // Backup re-alarms only make sense when there is a challenge to enforce.
      backupRepeatMinutes: challenge ? settings.backupRepeatMinutes : 0,
      backupCount: challenge ? settings.backupCount : 0,
    };
  });
}
