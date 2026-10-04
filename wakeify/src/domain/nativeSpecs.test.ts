import { expect, it } from 'vitest';

import { buildNativeSpecs } from './nativeSpecs';
import { defaultPlan, NO_CHALLENGE } from './rotation';
import { DEFAULT_SETTINGS, type Alarm, type Track } from './types';

const base: Alarm = {
  id: 'a', label: '  ', hour: 6, minute: 30, weekdays: [3, 1, 1], enabled: true, skipUntil: null, trackId: 't',
  volume: 2, fadeInSeconds: 12.4, vibrate: false, snoozeMinutes: 5, maxSnoozes: 1, plan: defaultPlan(),
  message: null, createdAt: 0, updatedAt: 0,
};
const track: Track = {
  id: 't', title: 'S', artist: null, uri: 'file:///doc/music/t.mp3', fileName: 't.mp3', mimeType: null,
  sizeBytes: 1, durationMs: 1, startOffsetMs: 42000, source: 'import', createdAt: 0,
};

it('maps alarms to native specs', () => {
  const [s] = buildNativeSpecs([base], [track], DEFAULT_SETTINGS);
  expect(s).toEqual({
    id: 'a', label: 'Budík', hour: 6, minute: 30, weekdays: [1, 3], enabled: true, skipUntil: null,
    soundUri: 'file:///doc/music/t.mp3', startOffsetMs: 42000, volume: 1, fadeInSeconds: 12, vibrate: false,
    maxRingMinutes: DEFAULT_SETTINGS.maxRingMinutes, backupRepeatMinutes: DEFAULT_SETTINGS.backupRepeatMinutes,
    backupCount: DEFAULT_SETTINGS.backupCount,
  });
});

it('missing track → system tone; no challenge → no backup re-alarms', () => {
  const [s] = buildNativeSpecs([{ ...base, trackId: 'gone', plan: { ...defaultPlan(), challenge: NO_CHALLENGE } }], [track], DEFAULT_SETTINGS);
  expect(s.soundUri).toBeNull();
  expect(s.startOffsetMs).toBe(0);
  expect(s.backupCount).toBe(0);
});
