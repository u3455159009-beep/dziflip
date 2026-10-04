// iOS 26+ engine built on AlarmKit.
//
// Everything here is behind `#if canImport(AlarmKit)` (SDK check) and
// `@available(iOS 26.0, *)` (runtime check); AlarmKit is weak-linked in the
// podspec so the app still launches on older iOS versions.

#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import AppIntents
import Foundation
import SwiftUI

@available(iOS 26.0, *)
struct WakeifyAlarmMetadata: AlarmMetadata {
  var alarmId: String
  var kind: String
}

/// Lets the app target re-export this pod's App Intents if Xcode's metadata
/// extraction does not pick them up from the static library (see README):
///   struct WakeifyAppIntents: AppIntentsPackage {
///     static var includedPackages: [any AppIntentsPackage.Type] { [WakeifyAlarmIntentsPackage.self] }
///   }
@available(iOS 17.0, *)
public struct WakeifyAlarmIntentsPackage: AppIntentsPackage {}

/// Secondary "Otevřít Wakeify" button of the AlarmKit alert. Brings the app to
/// the foreground, records a pending ring (read by getActiveRing()) and tries
/// to open wakeify://ring?alarmId=<id>.
@available(iOS 26.0, *)
public struct WakeifyOpenAlarmIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource { "Otevřít Wakeify" }
  public static var description: IntentDescription? { IntentDescription("Otevře Wakeify u zvonícího budíku.") }
  public static var isDiscoverable: Bool { false }
  /// iOS 26 replacement for `openAppWhenRun`: run with the app in the foreground.
  public static var supportedModes: IntentModes { .foreground }
  /// Deprecated in iOS 26 but kept as Apple's AlarmKit WWDC25 sample uses it.
  public static var openAppWhenRun: Bool { true }

  @Parameter(title: "Alarm ID")
  public var alarmId: String

  @Parameter(title: "Kind")
  public var kind: String

  @Parameter(title: "Occurrence")
  public var occurrence: Double

  public init() {
    self.alarmId = ""
    self.kind = SystemAlarmKind.main.rawValue
    self.occurrence = 0
  }

  public init(alarmId: String, kind: String, occurrence: Double) {
    self.alarmId = alarmId
    self.kind = kind
    self.occurrence = occurrence
  }

  public func perform() async throws -> some IntentResult {
    if !alarmId.isEmpty {
      await WakeifyIntentBridge.recordOpen(alarmId: alarmId, kind: kind, occurrence: occurrence)
    }
    return .result()
  }
}

@available(iOS 26.0, *)
final class WakeifyAlarmKitEngine: WakeifyEngine {
  let engineName = "ios-alarmkit"
  var eventSink: WakeifyEventSink?

  private let manager = AlarmManager.shared
  private let store = WakeifyAlarmStore.shared
  private let lock = NSLock()
  /// UUIDs (strings) of our alarms that were alerting at the last update.
  private var alerting: [String: ActiveRingRecord] = [:]
  /// UUIDs we stopped ourselves (-> reason "dismissed").
  private var stopRequested = Set<String>()
  private var observer: Task<Void, Never>?

  // MARK: Authorization

  static func permissionState() -> String {
    switch AlarmManager.shared.authorizationState {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "notDetermined"
    }
  }

  static func requestPermission() async -> String {
    do {
      let state = try await AlarmManager.shared.requestAuthorization()
      switch state {
      case .authorized: return "granted"
      case .denied: return "denied"
      case .notDetermined: return "notDetermined"
      @unknown default: return "notDetermined"
      }
    } catch {
      NSLog("[WakeifyAlarm] AlarmKit authorization failed: \(error)")
      return permissionState()
    }
  }

  // MARK: Scheduling

  private struct Request {
    var uuid: UUID
    var schedule: Alarm.Schedule
    var record: SystemAlarmRecord
    var title: String
    var soundName: String?
  }

  func sync(specs: [AlarmSpec]?) async -> [ScheduledResult] {
    let now = Date()
    var plans: [AlarmPlan] = []
    var snoozes: [String: SnoozeRecord] = [:]
    var tests: [String: Double] = [:]
    store.mutate { state in
      WakeifyEngineSupport.applySpecs(specs, to: &state, now: now, ringWindow: Self.ringWindow)
      plans = WakeifyPlanner.plan(state: &state, now: now, ringWindow: Self.ringWindow)
      snoozes = state.snoozes
      tests = state.testRings
    }
    let allSpecs = plans.map(\.spec)
    let sounds = await WakeifyEngineSupport.resolveSounds(for: allSpecs)

    // Cancel every alarm of ours that is not ringing right now; ringing ones
    // are left alone so a re-sync never silences an alarm.
    let existing = (try? manager.alarms) ?? []
    var alertingIds = Set<String>()
    for alarm in existing {
      if alarm.state == .alerting {
        alertingIds.insert(alarm.id.uuidString)
      } else {
        try? manager.cancel(id: alarm.id)
      }
    }
    store.mutate { state in
      state.systemAlarms = state.systemAlarms.filter { alertingIds.contains($0.key) }
    }

    // Build requests in priority order (main schedules > snooze/test > backups).
    var requests: [Request] = []
    var backupRequests: [Request] = []
    for plan in plans where plan.spec.enabled {
      let spec = plan.spec
      let sound = sounds[spec.id] ?? (nil, false)
      func record(_ kind: SystemAlarmKind, occurrence: Date?, fireAt: Date?) -> SystemAlarmRecord {
        SystemAlarmRecord(alarmId: spec.id, kind: kind, occurrence: occurrence.map(epochMs), fireAt: fireAt.map(epochMs),
                          hour: spec.hour, minute: spec.minute, usingFallbackSound: sound.fallback)
      }
      switch plan.mode {
      case .none:
        break
      case .repeating:
        let weekdays = spec.weekdays.compactMap(Self.localeWeekday(fromIso:))
        let relative = Alarm.Schedule.Relative(
          time: Alarm.Schedule.Relative.Time(hour: spec.hour, minute: spec.minute),
          repeats: .weekly(weekdays))
        requests.append(Request(uuid: WakeifyIds.main(spec.id), schedule: .relative(relative),
                                record: record(.main, occurrence: nil, fireAt: nil), title: spec.displayTitle, soundName: sound.name))
      case .fixed(let dates):
        if spec.isRepeating {
          for (index, date) in dates.enumerated() {
            requests.append(Request(uuid: WakeifyIds.skipFixed(spec.id, index: index), schedule: .fixed(date),
                                    record: record(.skipFixed, occurrence: date, fireAt: date), title: spec.displayTitle, soundName: sound.name))
          }
        } else if let date = dates.first {
          requests.append(Request(uuid: WakeifyIds.main(spec.id), schedule: .fixed(date),
                                  record: record(.main, occurrence: date, fireAt: date), title: spec.displayTitle, soundName: sound.name))
        }
      }

      if spec.backupRepeatMinutes > 0 && spec.backupCount > 0 {
        var index = 0
        for occurrence in plan.ringOccurrences {
          for k in 1...spec.backupCount {
            let fire = occurrence.addingTimeInterval(Double(k) * spec.backupRepeatMinutes * 60)
            defer { index += 1 }
            guard fire > now else { continue }
            backupRequests.append(Request(uuid: WakeifyIds.backup(spec.id, index: index), schedule: .fixed(fire),
                                          record: record(.backup, occurrence: occurrence, fireAt: fire), title: spec.displayTitle, soundName: sound.name))
          }
        }
      }
    }
    for spec in allSpecs {
      let sound = sounds[spec.id] ?? (nil, false)
      if spec.enabled, let snooze = snoozes[spec.id] {
        // The snooze ring reports the ORIGINAL occurrence; its backups are
        // armed relative to the snooze time.
        let snoozeAt = dateFromMs(snooze.triggerAt)
        if snoozeAt > now {
          requests.append(Request(uuid: WakeifyIds.snooze(spec.id), schedule: .fixed(snoozeAt),
                                  record: SystemAlarmRecord(alarmId: spec.id, kind: .snooze, occurrence: snooze.occurrence, fireAt: snooze.triggerAt,
                                                            hour: spec.hour, minute: spec.minute, usingFallbackSound: sound.fallback, fromSnooze: true),
                                  title: spec.displayTitle, soundName: sound.name))
        }
        if spec.backupRepeatMinutes > 0 && spec.backupCount > 0 {
          for k in 1...spec.backupCount {
            let fire = snoozeAt.addingTimeInterval(Double(k) * spec.backupRepeatMinutes * 60)
            guard fire > now else { continue }
            backupRequests.append(Request(uuid: WakeifyIds.snoozeBackup(spec.id, index: k), schedule: .fixed(fire),
                                          record: SystemAlarmRecord(alarmId: spec.id, kind: .backup, occurrence: snooze.occurrence, fireAt: epochMs(fire),
                                                                    hour: spec.hour, minute: spec.minute, usingFallbackSound: sound.fallback, fromSnooze: true),
                                          title: spec.displayTitle, soundName: sound.name))
          }
        }
      }
      if let ms = tests[spec.id] {
        let date = dateFromMs(ms)
        requests.append(Request(uuid: WakeifyIds.test(spec.id), schedule: .fixed(date),
                                record: SystemAlarmRecord(alarmId: spec.id, kind: .test, occurrence: ms, fireAt: ms, hour: spec.hour, minute: spec.minute, usingFallbackSound: sound.fallback),
                                title: spec.displayTitle, soundName: sound.name))
      }
    }
    backupRequests.sort { ($0.record.fireAt ?? 0) < ($1.record.fireAt ?? 0) }

    var scheduledMain = Set<String>()
    var limitReached = false
    for request in requests + backupRequests {
      if limitReached { break }
      let key = request.uuid.uuidString
      if alertingIds.contains(key) {
        // Still ringing with this id; it keeps its current configuration.
        if request.record.kind == .main || request.record.kind == .skipFixed { scheduledMain.insert(request.record.alarmId) }
        continue
      }
      do {
        _ = try await manager.schedule(id: request.uuid, configuration: makeConfiguration(request))
        store.mutate { state in state.systemAlarms[key] = request.record }
        if request.record.kind == .main || request.record.kind == .skipFixed {
          scheduledMain.insert(request.record.alarmId)
        }
      } catch AlarmManager.AlarmError.maximumLimitReached {
        NSLog("[WakeifyAlarm] AlarmKit maximum number of alarms reached; remaining backups not scheduled")
        limitReached = true
      } catch {
        NSLog("[WakeifyAlarm] AlarmKit schedule failed for \(request.record.alarmId) (\(request.record.kind.rawValue)): \(error)")
      }
    }

    return plans.map { plan in
      ScheduledResult(id: plan.spec.id, triggerAt: scheduledMain.contains(plan.spec.id) ? plan.next : nil)
    }
  }

  private func makeConfiguration(_ request: Request) -> AlarmManager.AlarmConfiguration<WakeifyAlarmMetadata> {
    let openButton = AlarmButton(text: "Otevřít Wakeify", textColor: .white, systemImageName: "alarm.fill")
    let title = LocalizedStringResource(stringLiteral: request.title)
    let alert: AlarmPresentation.Alert
    if #available(iOS 26.1, *) {
      alert = AlarmPresentation.Alert(title: title, secondaryButton: openButton, secondaryButtonBehavior: .custom)
    } else {
      let stopButton = AlarmButton(text: "Zastavit", textColor: .white, systemImageName: "stop.circle")
      alert = AlarmPresentation.Alert(title: title, stopButton: stopButton, secondaryButton: openButton, secondaryButtonBehavior: .custom)
    }
    let attributes = AlarmAttributes<WakeifyAlarmMetadata>(
      presentation: AlarmPresentation(alert: alert),
      metadata: WakeifyAlarmMetadata(alarmId: request.record.alarmId, kind: request.record.kind.rawValue),
      tintColor: Color(red: 1.0, green: 0.45, blue: 0.2))
    let sound: AlertConfiguration.AlertSound = request.soundName.map { AlertConfiguration.AlertSound.named($0) } ?? .default
    // Backups armed after a snooze report as the snooze ring.
    let intentKind = request.record.fromSnooze == true ? SystemAlarmKind.snooze.rawValue : request.record.kind.rawValue
    let intent = WakeifyOpenAlarmIntent(alarmId: request.record.alarmId, kind: intentKind, occurrence: request.record.occurrence ?? 0)
    return AlarmManager.AlarmConfiguration<WakeifyAlarmMetadata>(
      countdownDuration: nil,
      schedule: request.schedule,
      attributes: attributes,
      stopIntent: nil,
      secondaryIntent: intent,
      sound: sound)
  }

  static func localeWeekday(fromIso iso: Int) -> Locale.Weekday? {
    switch iso {
    case 1: return .monday
    case 2: return .tuesday
    case 3: return .wednesday
    case 4: return .thursday
    case 5: return .friday
    case 6: return .saturday
    case 7: return .sunday
    default: return nil
    }
  }

  /// Backup window used for armed occurrences and for keeping snooze records.
  static func ringWindow(_ spec: AlarmSpec) -> TimeInterval {
    return spec.backupRepeatMinutes > 0 ? Double(spec.backupCount) * spec.backupRepeatMinutes * 60 + 60 : 0
  }

  /// Snoozes the current unhandled occurrence of `alarmId` until `date`:
  /// stops it if still alerting, clears its active/pending ring, drops its
  /// backups and arms new ones relative to the snooze (via sync).
  func scheduleSnooze(alarmId: String, at date: Date) async throws {
    let now = Date()
    let alarms = (try? manager.alarms) ?? []
    let ours: Set<String> = store.mutate { state in
      let alerting = alarms.filter { $0.state == .alerting }
        .compactMap { ringRecord(for: $0, state: state, now: now) }
      state.beginSnooze(alarmId: alarmId, triggerAt: date, now: now, alerting: alerting)
      return Set(state.systemAlarms.filter { $0.value.alarmId == alarmId }.keys)
    }
    for alarm in alarms where alarm.state == .alerting && ours.contains(alarm.id.uuidString) {
      lock.withLock { _ = stopRequested.insert(alarm.id.uuidString) }
      try? manager.stop(id: alarm.id)
    }
    _ = await sync(specs: nil)
  }

  /// Removes the snooze and its backups. The snoozed occurrence is not
  /// re-armed (its old backups stay cancelled).
  func cancelSnooze(alarmId: String) async {
    store.mutate { state in
      if let snooze = state.snoozes.removeValue(forKey: alarmId) {
        state.handledOccurrences[alarmId] = max(state.handledOccurrences[alarmId] ?? 0, snooze.occurrence)
      }
    }
    _ = await sync(specs: nil)
  }

  func scheduleTest(alarmId: String, at date: Date) async throws {
    store.mutate { state in state.testRings[alarmId] = epochMs(date) }
    _ = await sync(specs: nil)
  }

  // MARK: Ringing state

  /// Ring record for an alerting AlarmKit alarm of ours (nil if not ours).
  private func ringRecord(for alarm: Alarm, state: PersistedState, now: Date) -> ActiveRingRecord? {
    guard let record = state.systemAlarms[alarm.id.uuidString] else { return nil }
    var scheduledFor = record.occurrence
    if scheduledFor == nil, let spec = state.spec(for: record.alarmId),
       let previous = WakeifySchedule.previousOccurrence(hour: spec.hour, minute: spec.minute, isoWeekdays: spec.weekdays, notAfter: now.addingTimeInterval(60)) {
      scheduledFor = epochMs(previous)
    }
    let occurrence = scheduledFor ?? epochMs(now)
    let isSnooze = record.kind == .snooze || record.fromSnooze == true
    let previousRing = [state.activeRing, state.pendingRing].compactMap { $0 }
      .first { $0.alarmId == record.alarmId && $0.scheduledFor == occurrence && $0.isSnooze == isSnooze }
    return ActiveRingRecord(
      alarmId: record.alarmId,
      startedAt: previousRing?.startedAt ?? epochMs(now),
      scheduledFor: occurrence,
      isSnooze: isSnooze,
      isTest: record.kind == .test,
      usingFallbackSound: record.usingFallbackSound,
      expiresAt: state.expiry(for: record.alarmId, scheduledFor: occurrence, isSnooze: isSnooze))
  }

  func activeRing() async -> ActiveRingRecord? {
    let now = Date()
    let alarms = (try? manager.alarms) ?? []
    return store.mutate { state in
      for alarm in alarms where alarm.state == .alerting {
        if let ring = ringRecord(for: alarm, state: state, now: now),
           state.isRingValid(ring, nowMs: epochMs(now)) {
          state.activeRing = ring
          return ring
        }
      }
      return state.currentRing(now: now)
    }
  }

  func stopRinging() async {
    let alarms = (try? manager.alarms) ?? []
    let ours = store.read { Set($0.systemAlarms.keys) }
    for alarm in alarms where alarm.state == .alerting && ours.contains(alarm.id.uuidString) {
      lock.withLock { _ = stopRequested.insert(alarm.id.uuidString) }
      try? manager.stop(id: alarm.id)
    }
  }

  func markHandled(alarmId: String) async {
    let now = Date()
    let alarms = (try? manager.alarms) ?? []
    store.mutate { state in
      let alerting = alarms.filter { $0.state == .alerting }
        .compactMap { ringRecord(for: $0, state: state, now: now) }
      let occurrence = state.occurrenceToHandle(alarmId: alarmId, now: now, alerting: alerting)
      state.handledOccurrences[alarmId] = max(state.handledOccurrences[alarmId] ?? 0, occurrence)
      if state.activeRing?.alarmId == alarmId { state.activeRing = nil }
      if state.pendingRing?.alarmId == alarmId { state.pendingRing = nil }
      // Handling clears any snooze (pending or fired) and, via sync, its backups.
      state.snoozes.removeValue(forKey: alarmId)
    }
    let ours = store.read { state in Set(state.systemAlarms.filter { $0.value.alarmId == alarmId }.keys) }
    for alarm in alarms where alarm.state == .alerting && ours.contains(alarm.id.uuidString) {
      lock.withLock { _ = stopRequested.insert(alarm.id.uuidString) }
      try? manager.stop(id: alarm.id)
    }
    // Re-sync: drops the handled occurrence's backups and arms the next one.
    _ = await sync(specs: nil)
  }

  func removeEverything() async {
    for alarm in (try? manager.alarms) ?? [] where alarm.state != .alerting {
      try? manager.cancel(id: alarm.id)
    }
    store.mutate { state in state.systemAlarms = [:] }
  }

  // MARK: Observation

  func startObserving() {
    guard observer == nil else { return }
    observer = Task { [weak self] in
      guard let updates = self?.manager.alarmUpdates else { return }
      for await alarms in updates {
        if Task.isCancelled { break }
        self?.handleUpdate(alarms)
      }
    }
  }

  func stopObserving() {
    observer?.cancel()
    observer = nil
  }

  private func handleUpdate(_ alarms: [Alarm]) {
    let now = Date()
    var started: [ActiveRingRecord] = []
    var stopped: [(ActiveRingRecord, String)] = []
    let current: [String: ActiveRingRecord] = store.mutate { state in
      var result: [String: ActiveRingRecord] = [:]
      for alarm in alarms where alarm.state == .alerting {
        if let ring = ringRecord(for: alarm, state: state, now: now) {
          result[alarm.id.uuidString] = ring
          if state.isRingValid(ring, nowMs: epochMs(now)) {
            state.activeRing = ring
          }
        }
      }
      return result
    }
    lock.lock()
    for (key, ring) in current where alerting[key] == nil {
      started.append(ring)
    }
    for (key, ring) in alerting where current[key] == nil {
      stopped.append((ring, stopRequested.contains(key) ? "dismissed" : "system"))
      stopRequested.remove(key)
    }
    alerting = current
    lock.unlock()

    for ring in started {
      eventSink?(WakeifyEvent.ringStarted, WakeifyEngineSupport.ringEventBody(ring))
    }
    for (ring, reason) in stopped {
      var body = WakeifyEngineSupport.ringEventBody(ring)
      body["reason"] = reason
      eventSink?(WakeifyEvent.ringStopped, body)
    }
  }
}
#endif
