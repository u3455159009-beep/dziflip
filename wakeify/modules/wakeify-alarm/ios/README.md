# WakeifyAlarm – iOS native engine

The JS contract is `../src/WakeifyAlarm.types.ts` (`WakeifyAlarmNativeModule`). This folder implements it for iOS with the Expo Modules Swift DSL (`WakeifyAlarmModule`, JS name `WakeifyAlarm`).

| File | Purpose |
|---|---|
| `WakeifyAlarm.podspec` | Pod definition. iOS 16.4 minimum (same as `ExpoModulesCore` in SDK 57), Swift 5 language mode, `AlarmKit` weak-linked. |
| `WakeifyAlarmModule.swift` | Module definition (functions and events), engine selection, lifecycle hooks. |
| `WakeifyAlarmRecords.swift` | `NativeAlarmSpecRecord` (`Record`), plus the Codable models that get persisted. |
| `WakeifyAlarmStore.swift` | UserDefaults persistence (`app.wakeify.alarm.state.v1`, one JSON blob), deterministic UUIDs, calendar math, the per-alarm planner. |
| `WakeifyEngine.swift` | The engine protocol, shared helpers, and the bridge called by the AlarmKit intent. |
| `WakeifyAlarmKitEngine.swift` | iOS 26+ engine (AlarmKit) and the `WakeifyOpenAlarmIntent` App Intent. Everything is behind `#if canImport(AlarmKit)` and `@available(iOS 26.0, *)`. |
| `WakeifyNotificationEngine.swift` | Fallback engine that uses time-sensitive local notifications. |
| `WakeifySoundClipper.swift` | Writes the ≤ 29 s system-sound clip to `Library/Sounds`. Also contains the async serial queue. |

## App configuration the parent must add (app.json / config plugin)

1. **`NSAlarmKitUsageDescription`** in `ios.infoPlist`. Without it, or with an empty string, AlarmKit refuses to schedule alarms (Apple: *"If the NSAlarmKitUsageDescription key is missing or its value is an empty string, apps can't schedule alarms with AlarmKit."*).
2. **URL scheme `wakeify`** (`"scheme": "wakeify"`). The intent opens `wakeify://ring?alarmId=<id>`.
3. **Time Sensitive Notifications capability** for the fallback engine: entitlement `com.apple.developer.usernotifications.time-sensitive` = `true`. Without it, `interruptionLevel = .timeSensitive` drops to `.active`.
4. **Xcode 26.1 SDK or newer.** The code uses `AlarmPresentation.Alert(title:secondaryButton:secondaryButtonBehavior:)`, which is iOS 26.1+, behind `#available`. On 26.0 it falls back to the `stopButton:` initializer, which is deprecated in 26.1.
5. *(Only if the "Otevřít Wakeify" button does nothing on device)*: see "App Intent discovery" below.

## Engine selection

* iOS 26+ with AlarmKit authorization not `.denied` → **AlarmKit** (`engine: 'ios-alarmkit'`). If authorization is `notDetermined`, AlarmKit shows its prompt on the first `schedule` call.
* iOS < 26, or the user denied AlarmKit → **notifications** (`engine: 'ios-notifications'`; `alarmKit: 'unsupported'` below iOS 26).
* When the engine changes, everything the other engine scheduled is removed, so an alarm never rings twice. `requestPermission('alarmKit' | 'notifications')` triggers a background re-sync.
* Re-sync from the stored specs (no JS needed) runs on `OnAppBecomesActive`, `UIApplication.significantTimeChangeNotification` and `NSSystemTimeZoneDidChange`.

## AlarmKit engine (iOS 26+)

* **IDs:** the main alarm's UUID is the Wakeify id if that id is a UUID, otherwise a v5 name-based UUID (a fixed namespace with `"main:"+id`). The snooze, test, backup *k* and skip-fixed *k* alarms use v5 UUIDs of `id+"snooze"`, `id+"test"`, `id+"backup:k"` and `id+"skip:k"`. The mapping from UUID to record (alarm id, kind, occurrence, sound fallback) is persisted.
* **Repeating alarms** use `.relative(Relative(time:repeats: .weekly([Locale.Weekday])))`. ISO weekdays map to `.monday` … `.sunday`. Relative schedules follow the device time zone.
* **One-shot alarms** use `.fixed(Date)` at the computed occurrence. The task allowed `.relative(.never)`; I used `.fixed` so the occurrence is known exactly, which the backups and the "already fired" check need. The target is persisted per rule. If JS re-syncs an unchanged one-shot spec after it fired, it is *not* rescheduled for the next day and `triggerAt` is `null`. A target still in the future is recomputed on every sync, which picks up time-zone changes.
* **`skipUntil` on a repeating alarm:** if the next occurrence is before `skipUntil`, the relative alarm is not scheduled. Instead, `.fixed` alarms are scheduled for every occurrence in the 7 days starting at the first occurrence at or after `skipUntil`. Once `skipUntil` has passed, the next re-sync restores the relative rule. **Limitation:** if the app is not opened, so no re-sync happens, within those 7 days, the alarm stays silent after that until the next launch.
* **Every sync** cancels all of the app's AlarmKit alarms that are *not* currently `.alerting`, then schedules again in priority order: main/skip alarms, then snooze/test, then backups (soonest first). A sync never silences a ringing alarm. On `AlarmManager.AlarmError.maximumLimitReached`, scheduling stops and the remaining lower-priority alarms (mostly backups) are skipped. `triggerAt` is `null` for any alarm whose main schedule could not be created.
* **Backup re-alarms:** the user can always silence AlarmKit's system Stop button. So for each armed occurrence *T*, the engine schedules `backupCount` `.fixed` alarms at *T* + k·`backupRepeatMinutes`. "Armed" means the next occurrence, plus an earlier one that is still unhandled and inside its window. `markOccurrenceHandled(alarmId)` records the handled occurrence, stops ringing alarms of that id, and re-syncs, which drops that occurrence's backups and arms the next one.
* **"Otevřít Wakeify"** is the secondary button with `.custom` behavior and `WakeifyOpenAlarmIntent: LiveActivityIntent` (`supportedModes = .foreground`, plus `openAppWhenRun = true` as in Apple's WWDC25 sample). Its `perform()` writes a **pending ring** into the store, posts an in-process notification (the module turns it into `onRingStarted`), and calls `UIApplication.shared.open(wakeify://ring?alarmId=…)` as a best effort. Whether that URL reaches JS during a cold launch is not guaranteed, so **JS must call `getActiveRing()` on launch/foreground**, which also returns the pending ring.
* **`getActiveRing()`** reports, in order: one of our alarms in state `.alerting`, the persisted active ring, then the pending ring from the intent. A ring record stays valid until `markOccurrenceHandled` or until `scheduledFor + (backupCount·backupRepeatMinutes + maxRingMinutes)` minutes. So after the user taps the system Stop, the app still sees the unhandled ring and can show the challenge.
* **Events:** while the module is alive, a `Task` iterates `AlarmManager.shared.alarmUpdates`. `onRingStarted` fires when one of our alarms enters `.alerting`. `onRingStopped` fires when it leaves that state, with reason `'dismissed'` if we stopped it (`stopRinging` / `markOccurrenceHandled`) and `'system'` otherwise. `'timeout'` is never reported on iOS. Duplicate `onRingStarted` events (the observer plus the intent) are collapsed per `alarmId|scheduledFor`.
* **`stopRinging()`** calls `AlarmManager.shared.stop(id:)` on our alerting alarms. A one-shot alarm is deleted; a repeating one moves to its next occurrence. The module plays no audio of its own; the in-app full track is JS/expo-audio.

## Sounds: `prepareSystemSound(uri, startOffsetMs)`

* Accepts a `file://` URI or an absolute path. If `uri` is already the name of a file in `Library/Sounds`, that name is returned unchanged. Remote URLs are rejected, and the call resolves `null` on any failure.
* Output: `<Library>/Sounds/wakeify_<sha256(uri|offset)[0..8]>.caf`, **16-bit little-endian Linear PCM, 44.1 kHz stereo, at most 29 s**, starting at `startOffsetMs`. If the offset is past the end, the last 29 s are used. The file is transcoded with `AVAssetReader` + `AVAssetWriter`. That is about 5 MB per clip. Unreferenced clips older than a day are pruned on sync.
* **Why not `AVAssetExportPresetAppleM4A`, as originally planned:** Apple's `UNNotificationSound` docs list only *Linear PCM, MA4 (IMA/ADPCM), µLaw, aLaw* in *aiff, wav or caf*, under 30 s; a longer file plays the default sound instead. AAC/.m4a is not on that list. AlarmKit reuses ActivityKit's `AlertConfiguration.AlertSound.named(_:)`, whose docs say the file must be in the main bundle or in `Library/Sounds` of the app's data container. Developer reports, including Loop's AlarmKit PR, use IMA4 `.caf` under 30 s ("the same constraints a notification sound has"). The safe choice is therefore LPCM in CAF.
* `syncAlarms` calls the same export internally whenever a spec's `soundUri` has no clip yet. If the export fails, the system tone is used and `usingFallbackSound` becomes `true` for rings of that alarm.

## Notifications fallback (iOS < 26 or AlarmKit denied)

* Repeating alarms get one `UNCalendarNotificationTrigger` per weekday (`weekday/hour/minute`, `repeats: true`). One-shot, skip, snooze and test alarms get one-off calendar triggers with the full date.
* To emulate continuous ringing, a **burst** of one-shot notifications fires every 30 s after each armed occurrence, up to `maxRingMinutes`.
* **Budget:** iOS keeps at most 64 pending requests per app. The engine counts other pending requests, schedules all alarm/snooze/test requests first (soonest first), then fills the remainder with bursts (soonest occurrence first). Requests that do not fit are dropped and logged.
* Content: `interruptionLevel = .timeSensitive`, the sound is `UNNotificationSound(named:)` with the clip (or `.default`), and `userInfo` carries the alarm id, kind, occurrence and deep link.
* `getActiveRing()` derives the ring from our delivered notifications that are unhandled and inside their window, and emits `onRingStarted` once per occurrence. `stopRinging()` removes our delivered notifications. Pending bursts stay, so leaving the app keeps ringing. `markOccurrenceHandled` removes the occurrence's bursts and delivered notifications.
* **Hard limits of this fallback:** it **cannot ring through the silent switch or through a Focus** that doesn't allow Wakeify. Each sound is **≤ 30 s** and plays once per notification. The module installs no `UNUserNotificationCenterDelegate`, so taps just open the app, foreground deliveries are not presented, and JS has to call `getActiveRing()`. If no notification permission is granted, nothing is scheduled and every `triggerAt` is `null`.

## Other functions

* `scheduleSnooze(alarmId, triggerAt)` / `scheduleTestRing(alarmId, seconds)` make one-off rings through the active engine, using the stored spec's sound and label. Both reject with `ERR_WAKEIFY_ALARM` if the id was never synced. `cancelSnooze` removes the snooze.
* `setShowOverLockScreen` is a no-op on iOS.
* `getPermissionStatus()`: `platform: 'ios'`; `exactAlarms`, `fullScreenIntent` and `batteryOptimizationIgnored` are `'unsupported'`; `notifications` comes from `getNotificationSettings`; `alarmKit` comes from `AlarmManager.shared.authorizationState`.
* `requestPermission('alarmKit' | 'notifications')` shows the real prompt; any other kind returns `'unsupported'`.

## AlarmKit research findings (developer.apple.com, Oct 2026)

* `AlarmManager.AlarmConfiguration.init(countdownDuration:schedule:attributes:stopIntent:secondaryIntent:sound:)` is iOS 26.0, and every parameter except `attributes` has a default. An `appEntityIdentifier:` variant is iOS 27.0 and is not used here.
* `AlarmManager`: `schedule(id:configuration:) async throws -> Alarm`, `cancel(id:) throws`, `stop(id:) throws`, `alarms: [Alarm] { get throws }`, `alarmUpdates: some AsyncSequence<[Alarm], Never>`, `authorizationState`, `requestAuthorization() async throws`. The only documented error is `AlarmError.maximumLimitReached`; the actual limit is not documented.
* `Alarm.State`: `.scheduled`, `.countdown`, `.paused`, `.alerting`. One-shot alarms are deleted from the daemon once they fire and stop.
* **Stop button:** *"The system provides a stop button automatically."* The `stopButton:` initializer (26.0) is deprecated in 26.1 in favor of `init(title:secondaryButton:secondaryButtonBehavior:)`. The Stop button cannot be removed, hence the backup re-alarms.
* **Custom sound:** `AlertConfiguration.AlertSound.named(_:)`, with the file in the main bundle or `Library/Sounds`. Per developer forums 797172 and 788836, the custom sound **plays once and does not loop** (an Apple engineer called looping a feature request), must be a supported format under 30 s, and Library/Sounds files did not play in early iOS 26 betas but are reported to work from 26.0.1. The Library/Sounds behavior is user-reported, not documented by Apple.
* Countdown presentations need a widget extension; alert-only alarms, which is all this module uses, do not.
* Alarms break through silent mode and Focus.

Sources: developer.apple.com/documentation/alarmkit (plus `AlarmManager`, `Alarm`, `AlarmPresentation.Alert`, `AlarmConfiguration`), `scheduling-an-alarm-with-alarmkit`, ActivityKit `AlertConfiguration.AlertSound.named(_:)`, UserNotifications `UNNotificationSound`, WWDC25 session 230 code, developer.apple.com/forums/thread/797172 and /788836, github.com/LoopKit/Loop/pull/2520.

## App Intent discovery

`WakeifyOpenAlarmIntent` lives in this pod, which is built as a static library or static framework. Xcode's App Intents metadata extraction may not register intents from static libraries. If tapping "Otevřít Wakeify" does nothing on device, add this Swift file to the app target through a config plugin:

```swift
import AppIntents
import WakeifyAlarm
struct WakeifyAppIntents: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] { [WakeifyAlarmIntentsPackage.self] }
}
```

## Verification status

* No Swift toolchain exists in this Linux container, and download.swift.org is blocked by the egress proxy, so **nothing was compiled**.
* All `.swift` files parse without syntax errors under the tree-sitter Swift grammar. That checks syntax only, not types.
* Every AlarmKit, AppIntents, ActivityKit and UNNotificationSound signature was checked against Apple's DocC JSON (`developer.apple.com/tutorials/data/documentation/...`), including availability, defaults and deprecations.
* The Expo DSL usage (`Record`/`@Field`, `AsyncFunction` with a trailing `Promise`, `Function`, `Events`, `OnCreate`, `OnDestroy`, `OnAppBecomesActive`, `sendEvent`) was checked against `node_modules/expo-modules-core/ios` and the expo-audio / expo-file-system sources.

### Unverified on device

* The whole module has never been compiled. Type-checking under Xcode 26.x is the first thing to do (`npx expo run:ios`). The most likely trouble spots are Swift concurrency or Sendable diagnostics and the `Locale.Weekday` / `LocalizedStringResource(stringLiteral:)` conversions.
* Whether `AlertSound.named("wakeify_….caf")` from `Library/Sounds` plays on a release iOS 26.x device. Only forum reports cover this. Also unverified: whether the file name must include the extension (it is passed with `.caf`, as in the forum example `"Glass Drum.caf"`).
* Whether `WakeifyOpenAlarmIntent` is discovered from the pod (see above), and whether `supportedModes = .foreground` together with `openAppWhenRun` actually foregrounds the app from the alarm UI.
* Whether `UIApplication.shared.open(wakeify://…)` called from inside the intent reaches expo-router during a cold launch. The pending-ring fallback covers the case where it does not.
* Calling `schedule(id:)` with an id that was just `cancel`ed in the same run loop. The engine always cancels before it schedules.
* The exact `maximumLimitReached` limit, and how many backups fit.
* `AlarmManager.stop(id:)` on a `.fixed` alarm that is alerting, which is expected to delete it.
* Notifications engine: whether `removeDeliveredNotifications` silences a sound that is already playing.
* The CAF/LPCM clip export (`AVAssetReader` time range plus resampling to 44.1 kHz stereo) with mono, 48 kHz, or VBR MP3 sources.
