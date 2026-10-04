# wakeify-alarm — Android engine

Contract: `../src/WakeifyAlarm.types.ts` (source of truth).

## Layout (`src/main/java/app/wakeify/alarm`)

Framework-only core (android.* / java.* / org.json, no androidx/expo, so it
compiles against a plain android.jar):

| File | Role |
| --- | --- |
| `AlarmSpec.kt` | `AlarmSpec` + `ActiveRing` data classes, org.json (de)serialisation, validation |
| `AlarmTimeCalculator.kt` | Pure java.time `nextTrigger(spec, now, zone)` |
| `AlarmStore.kt` | SharedPreferences in **device-protected** storage (readable in direct boot) |
| `AlarmIntents.kt` | Actions/extras, stable PendingIntent request codes, ring activity intent |
| `AlarmScheduler.kt` | AlarmManager `setAlarmClock` (+ inexact fallback), snooze/test, post-fire rescheduling, missed-alarm recovery |
| `AlarmReceiver.kt` | `AlarmReceiver` (not exported: FIRE/REPOST) + `AlarmSystemReceiver` (exported: boot, time, tz, exact-alarm permission) |
| `AlarmRingService.kt` | Foreground service (mediaPlayback): MediaPlayer, fade, focus, volume, vibration, wake lock, timeout, notification |
| `RingEvents.kt` | In-process listener registry -> JS events |
| `LockScreenHelper.kt` | show-when-locked / turn-screen-on / keep-screen-on |

Expo glue: `WakeifyAlarmModule.kt` (JS module `WakeifyAlarm`),
`WakeifyAlarmPackage.kt` (auto-discovered by expo-modules-autolinking because
the file name ends in `Package.kt` and it imports
`expo.modules.core.interfaces.Package`), `WakeifyRingActivityListener.kt`.

## Behaviour notes

- **Time semantics**: local wall clock; ISO weekdays; empty weekdays = one-shot;
  strictly after now; occurrences `< skipUntil` skipped. DST gap -> shifted
  forward (02:30 on spring-forward day rings at 03:30); DST overlap -> earlier
  offset (rings once).
- **One-shot alarms** are marked `enabled=false` natively right after they fire.
  JS must mirror that (otherwise the next `syncAlarms` re-enables it for the
  following day).
- **Exact alarms**: `setAlarmClock` (Doze-exempt, status-bar icon). Without
  exact-alarm permission (API 31/32 revoked) a 10-minute `setWindow` alarm is used
  and `syncAlarms` returns `exact: false` for it (extra field, not in TS type).
- **Reboot**: `BOOT_COMPLETED` / `LOCKED_BOOT_COMPLETED` / `MY_PACKAGE_REPLACED`
  reschedule everything. An occurrence or snooze missed while the phone was
  rebooting (<= 15 min ago, never fired) rings ~3 s after boot.
- **Direct boot** (before first unlock): alarms still fire; the user's track
  is in credential-encrypted storage and unreadable, so the system alarm tone is
  used (`usingFallbackSound = true`). The app activity itself is not
  direct-boot aware, so the ring screen only opens after unlock.
- **Sound fallback chain**: user track -> default alarm tone -> default
  ringtone -> notification tone -> `ToneGenerator` beeps. Vibration and the
  notification continue regardless.
- **Looping** uses `MediaPlayer.isLooping`, so after the first pass the track
  restarts at 0, not at `startOffsetMs`.
- **Backup re-alarms** (`backupRepeatMinutes`, `backupCount`) are ignored on
  Android: the ring cannot be silenced outside the app and continues until
  `stopRinging` / `markOccurrenceHandled`. After the `maxRingMinutes` timeout
  (`onRingStopped` reason `timeout`) nothing else is scheduled.
- **Process death while ringing**: the service returns
  `START_REDELIVER_INTENT` and resumes the persisted ring (same `startedAt`).
- The ring notification has no dismiss/stop action. If it is swiped away
  (Android 14+ allows that), it is re-posted via its delete intent.
- **Snooze `scheduledFor`**: a snooze ring reports the ORIGINAL occurrence time
  as `ActiveRing.scheduledFor` / event `scheduledFor` (JS matches the session by
  it). `scheduleSnooze` derives it from the active ring of that alarm (else the
  last fired occurrence, else the snooze time) and persists it with the snooze
  (`snoozeOrigins`), so it survives reboots. Snooze bookkeeping itself is keyed
  by the snooze trigger time.
- **`ActiveRing.isTest`**: true for rings started by `scheduleTestRing`
  (FireKind.TEST); stored in the ActiveRing JSON, missing -> false.
- Ring activity intent: the app's launch activity with data
  `wakeify://ring?alarmId=<id>` and extra `wakeify_ring=true`.

## Tests

`src/test/java/app/wakeify/alarm` — JUnit 5 tests for `AlarmTimeCalculator`
and the JSON round-trip. They run in the app build via
`./gradlew :wakeify-alarm:testDebugUnitTest` (JUnit 5 + org.json are
`testImplementation` deps in `build.gradle`), or standalone with a plain
Kotlin/JVM Gradle project compiling the framework-only files against
`org.robolectric:android-all` (how they were verified during development).
