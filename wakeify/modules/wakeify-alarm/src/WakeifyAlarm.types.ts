/**
 * Contract between the JS app and the native alarm engine.
 *
 * The native side is intentionally self-sufficient: it receives *rules*
 * (hour/minute/weekdays), not precomputed timestamps, so it can recompute the
 * next occurrence after a reboot, a time change or a time-zone change without
 * the JS runtime ever being started.
 */

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type NativeAlarmSpec = {
  /** Stable alarm id (UUID). */
  id: string;
  /** Text shown in the system alarm UI / notification. */
  label: string;
  hour: number; // 0–23, local wall-clock time
  minute: number; // 0–59
  /** Repeat days. Empty array = one-shot alarm (next time hour:minute occurs). */
  weekdays: IsoWeekday[];
  enabled: boolean;
  /**
   * Epoch ms. Occurrences strictly before this instant are skipped
   * ("skip next ring"). null = no skipping.
   */
  skipUntil: number | null;
  /** Local file URI (file://…) of the alarm track, null = system alarm tone. */
  soundUri: string | null;
  /** Where playback starts inside the track, in ms. */
  startOffsetMs: number;
  /** Target volume 0–1 (Android: fraction of STREAM_ALARM max). */
  volume: number;
  /** Linear fade-in length in seconds; 0 = start at full volume. */
  fadeInSeconds: number;
  vibrate: boolean;
  /** Safety cap: stop ringing after this many minutes (counted as missed). */
  maxRingMinutes: number;
  /**
   * Re-alarm interval (minutes) used where the OS lets the user silence the
   * alarm outside the app (iOS AlarmKit stop button). 0 = disabled.
   */
  backupRepeatMinutes: number;
  /** Number of backup re-alarms scheduled after each occurrence. */
  backupCount: number;
};

export type ScheduledInfo = {
  id: string;
  /** Epoch ms of the next trigger, null when disabled / nothing scheduled. */
  triggerAt: number | null;
};

export type ActiveRing = {
  alarmId: string;
  /** Epoch ms when ringing actually started. */
  startedAt: number;
  /** Epoch ms of the scheduled occurrence that fired. */
  scheduledFor: number;
  isSnooze: boolean;
  /** True when the user's track could not be played and the system tone is used. */
  usingFallbackSound: boolean;
};

export type PermissionState = 'granted' | 'denied' | 'notDetermined' | 'unsupported';

export type AlarmPermissionStatus = {
  platform: 'android' | 'ios';
  /** Android 12+: SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM. */
  exactAlarms: PermissionState;
  /** Android 13+: POST_NOTIFICATIONS. iOS: notification authorization (fallback engine). */
  notifications: PermissionState;
  /** Android 14+: USE_FULL_SCREEN_INTENT. */
  fullScreenIntent: PermissionState;
  /** Android: app is exempt from battery optimisation (Doze/App Standby). */
  batteryOptimizationIgnored: PermissionState;
  /** iOS 26+: AlarmKit authorization. 'unsupported' below iOS 26 and on Android. */
  alarmKit: PermissionState;
  /** Which engine actually schedules alarms on this device. */
  engine: 'android-alarmmanager' | 'ios-alarmkit' | 'ios-notifications';
};

export type PermissionKind =
  | 'exactAlarms'
  | 'notifications'
  | 'fullScreenIntent'
  | 'batteryOptimization'
  | 'alarmKit';

export type RingEvent = { alarmId: string; scheduledFor: number };

export type WakeifyAlarmEvents = {
  onRingStarted: (event: RingEvent) => void;
  onRingStopped: (event: RingEvent & { reason: 'dismissed' | 'timeout' | 'system' }) => void;
};

export type WakeifyAlarmNativeModule = {
  /** Replace the full set of alarms known to the native engine and (re)schedule them. */
  syncAlarms(specs: NativeAlarmSpec[]): Promise<ScheduledInfo[]>;
  /** One-off ring for a snooze. Uses the stored spec of `alarmId` for sound/volume. */
  scheduleSnooze(alarmId: string, triggerAt: number): Promise<void>;
  cancelSnooze(alarmId: string): Promise<void>;
  /** Stops sound + vibration + foreground service / system alert. */
  stopRinging(): Promise<void>;
  /** Currently ringing alarm (persisted natively, survives JS reloads), or null. */
  getActiveRing(): Promise<ActiveRing | null>;
  /**
   * The user completed the wake challenge for this occurrence: cancel pending
   * backup re-alarms and clear the active ring.
   */
  markOccurrenceHandled(alarmId: string): Promise<void>;
  /** Android: let the current activity appear over the lock screen and turn the screen on. */
  setShowOverLockScreen(show: boolean): void;
  getPermissionStatus(): Promise<AlarmPermissionStatus>;
  /** Shows the runtime prompt or opens the matching system settings screen. */
  requestPermission(kind: PermissionKind): Promise<PermissionState>;
  /**
   * iOS: produce a ≤30 s clip of the track (starting at startOffsetMs) inside
   * Library/Sounds so AlarmKit / notifications can play it while the app is
   * not running. Returns the sound file name. Android: returns `uri` unchanged.
   */
  prepareSystemSound(uri: string, startOffsetMs: number): Promise<string | null>;
  /** Test helper: ring `alarmId` in `seconds` seconds through the real native path. */
  scheduleTestRing(alarmId: string, seconds: number): Promise<void>;
};
