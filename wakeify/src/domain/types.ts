import type { IsoWeekday } from '../../modules/wakeify-alarm/src/WakeifyAlarm.types';

export type { IsoWeekday };

export type Difficulty = 'easy' | 'medium' | 'hard';

/** A single wake-up task the user must complete to silence the alarm. */
export type ChallengeStep =
  | { kind: 'none' }
  | { kind: 'math'; count: number; difficulty: Difficulty }
  | { kind: 'steps'; steps: number }
  | { kind: 'qr'; qrTargetId: string }
  | { kind: 'photo'; photoTargetId: string; strictness: Difficulty };

export type ChallengeKind = ChallengeStep['kind'];

/** A "task" = one or more steps that must all be completed in order (combined mode). */
export type Challenge = {
  steps: ChallengeStep[];
};

/**
 * How the challenge for a particular ring is chosen.
 * - fixed:   always `challenge`
 * - weekday: plan per ISO weekday (Mon…Sun); missing day falls back to `challenge`
 * - weekly:  rotate through `pool`, one entry per ISO week
 * - random:  random entry from `pool` on every ring (deterministic per occurrence)
 * - daily:   rotate through `pool`, one entry per calendar day
 */
export type RotationMode = 'fixed' | 'weekday' | 'weekly' | 'random' | 'daily';

export type ChallengePlan = {
  mode: RotationMode;
  challenge: Challenge;
  weekdayPlan: Partial<Record<IsoWeekday, Challenge>>;
  pool: Challenge[];
};

export type Alarm = {
  id: string;
  label: string;
  hour: number;
  minute: number;
  weekdays: IsoWeekday[];
  enabled: boolean;
  skipUntil: number | null;
  trackId: string | null;
  volume: number; // 0..1
  fadeInSeconds: number;
  vibrate: boolean;
  snoozeMinutes: number;
  maxSnoozes: number; // 0 = snooze disabled
  plan: ChallengePlan;
  /** Optional per-alarm message shown on the morning screen (falls back to global affirmation). */
  message: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Track = {
  id: string;
  title: string;
  artist: string | null;
  /** Absolute file:// URI inside the app's document directory. */
  uri: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  durationMs: number | null;
  startOffsetMs: number;
  source: 'import' | 'download';
  createdAt: number;
};

export type QrTarget = {
  id: string;
  name: string;
  /** Exact payload that must be scanned. */
  payload: string;
  /** True when Wakeify generated the code (printable), false when an existing code was registered. */
  generated: boolean;
  createdAt: number;
};

export type PhotoTarget = {
  id: string;
  name: string;
  /** Reference photos (file:// URIs in the document directory). */
  imageUris: string[];
  /** Serialized feature vectors (one per reference photo). */
  features: string[];
  createdAt: number;
};

export type WakeOutcome = 'success' | 'missed' | 'fallback';

export type WakeEvent = {
  id: string;
  alarmId: string | null;
  alarmLabel: string;
  scheduledFor: number;
  ringStartedAt: number;
  dismissedAt: number | null;
  snoozeCount: number;
  outcome: WakeOutcome;
  /** Kinds of steps that were completed, e.g. ["photo","math"]. */
  challengeKinds: ChallengeKind[];
  challengeDurationMs: number | null;
};

export type ThemePreference = 'system' | 'light' | 'dark';

export type Settings = {
  theme: ThemePreference;
  affirmation: string;
  /** Minutes after the scheduled time that still count as "on time". */
  onTimeGraceMinutes: number;
  maxRingMinutes: number;
  backupRepeatMinutes: number;
  backupCount: number;
  defaultSnoozeMinutes: number;
  defaultMaxSnoozes: number;
  onboardingDone: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  affirmation: 'Dnešek je nová příležitost. Nadechni se a jdi do toho.',
  onTimeGraceMinutes: 10,
  maxRingMinutes: 30,
  // AlarmKit plays a custom sound once (≤30 s, no loop), so re-alarm every minute.
  backupRepeatMinutes: 1,
  backupCount: 10,
  defaultSnoozeMinutes: 5,
  defaultMaxSnoozes: 2,
  onboardingDone: false,
};
