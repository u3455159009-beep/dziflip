// Engine abstraction: AlarmKit (iOS 26+) or UNUserNotificationCenter fallback.

import Foundation
import UIKit

enum WakeifyEvent {
  static let ringStarted = "onRingStarted"
  static let ringStopped = "onRingStopped"
}

typealias WakeifyEventSink = (_ name: String, _ body: [String: Any]) -> Void

protocol WakeifyEngine: AnyObject {
  /// Value reported as `AlarmPermissionStatus.engine`.
  var engineName: String { get }
  var eventSink: WakeifyEventSink? { get set }

  /// Replaces the stored specs (when `specs` is non-nil) and reschedules everything.
  func sync(specs: [AlarmSpec]?) async -> [ScheduledResult]
  func scheduleSnooze(alarmId: String, at date: Date) async throws
  func cancelSnooze(alarmId: String) async
  func scheduleTest(alarmId: String, at date: Date) async throws
  func stopRinging() async
  func activeRing() async -> ActiveRingRecord?
  func markHandled(alarmId: String) async
  /// Removes everything this engine scheduled (used when switching engines).
  func removeEverything() async
  func startObserving()
  func stopObserving()
}

enum WakeifyEngineSupport {
  /// Stores new specs (if given), drops expired snoozes/test rings and state of
  /// alarms that no longer exist. A snooze is kept after it fired until its
  /// ring window (`ringWindow`, engine specific) is over, because its
  /// backups/bursts and the "snoozed" status of the original occurrence
  /// depend on it.
  static func applySpecs(_ specs: [AlarmSpec]?, to state: inout PersistedState, now: Date,
                         ringWindow: (AlarmSpec) -> TimeInterval) {
    if let specs {
      state.specs = specs
    }
    let ids = Set(state.specs.map(\.id))
    let nowMs = epochMs(now)
    let handled = state.handledOccurrences
    let specsById = Dictionary(state.specs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    state.snoozes = state.snoozes.filter { alarmId, snooze in
      guard let spec = specsById[alarmId], spec.enabled else { return false }
      if (handled[alarmId] ?? 0) >= snooze.occurrence { return false }
      return snooze.triggerAt + max(ringWindow(spec), spec.ringWindowSeconds, 60) * 1000 > nowMs
    }
    state.testRings = state.testRings.filter { ids.contains($0.key) && $0.value > nowMs }
    state.handledOccurrences = state.handledOccurrences.filter { ids.contains($0.key) }
  }

  /// Resolves the Library/Sounds file name for a spec. Returns
  /// `(nil, false)` when the system tone was requested, `(nil, true)` when the
  /// user's track could not be prepared (system tone used as fallback).
  static func resolveSound(for spec: AlarmSpec) async -> (name: String?, fallback: Bool) {
    guard let uri = spec.soundUri, !uri.isEmpty else { return (nil, false) }
    do {
      let name = try await WakeifySoundClipper.shared.prepare(uri: uri, startOffsetMs: spec.startOffsetMs)
      return (name, false)
    } catch {
      NSLog("[WakeifyAlarm] sound clip for \(spec.id) failed: \(error)")
      return (nil, true)
    }
  }

  static func resolveSounds(for specs: [AlarmSpec]) async -> [String: (name: String?, fallback: Bool)] {
    var result: [String: (name: String?, fallback: Bool)] = [:]
    var referenced = Set<String>()
    for spec in specs {
      if spec.enabled {
        let resolved = await resolveSound(for: spec)
        result[spec.id] = resolved
        if let name = resolved.name { referenced.insert(name) }
      } else if let uri = spec.soundUri, !uri.isEmpty {
        // Keep clips of disabled alarms so re-enabling them is instant.
        referenced.insert(WakeifySoundClipper.existingSoundName(uri)
          ?? WakeifySoundClipper.fileName(uri: uri, startOffsetMs: spec.startOffsetMs))
      }
    }
    WakeifySoundClipper.pruneClips(keeping: referenced)
    return result
  }

  static func ringEventBody(_ ring: ActiveRingRecord) -> [String: Any] {
    return ["alarmId": ring.alarmId, "scheduledFor": ring.scheduledFor]
  }

  static func deepLink(alarmId: String) -> URL? {
    var components = URLComponents()
    components.scheme = "wakeify"
    components.host = "ring"
    components.queryItems = [URLQueryItem(name: "alarmId", value: alarmId)]
    return components.url
  }
}

/// Called by the AlarmKit "Otevřít Wakeify" intent (runs in the app process).
enum WakeifyIntentBridge {
  static let pendingRingNotification = Notification.Name("app.wakeify.alarm.pendingRing")

  static func recordOpen(alarmId: String, kind: String, occurrence: Double) async {
    let now = Date()
    let ring: ActiveRingRecord = WakeifyAlarmStore.shared.mutate { state in
      var scheduledFor = occurrence
      if scheduledFor <= 0, let spec = state.spec(for: alarmId),
         let previous = WakeifySchedule.previousOccurrence(hour: spec.hour, minute: spec.minute, isoWeekdays: spec.weekdays, notAfter: now.addingTimeInterval(60)) {
        scheduledFor = epochMs(previous)
      }
      if scheduledFor <= 0 { scheduledFor = epochMs(now) }
      let existing = state.activeRing.flatMap { $0.alarmId == alarmId ? $0 : nil }
      let usingFallback = state.systemAlarms.values.first { $0.alarmId == alarmId }?.usingFallbackSound ?? false
      let isSnooze = kind == SystemAlarmKind.snooze.rawValue
      let reported = existing.map { $0.isSnooze == isSnooze ? $0.scheduledFor : scheduledFor } ?? scheduledFor
      let record = ActiveRingRecord(
        alarmId: alarmId,
        startedAt: (existing?.isSnooze == isSnooze ? existing?.startedAt : nil) ?? epochMs(now),
        scheduledFor: reported,
        isSnooze: isSnooze,
        isTest: kind == SystemAlarmKind.test.rawValue,
        usingFallbackSound: usingFallback,
        expiresAt: state.expiry(for: alarmId, scheduledFor: reported, isSnooze: isSnooze)
      )
      state.pendingRing = record
      return record
    }
    await MainActor.run {
      NotificationCenter.default.post(name: pendingRingNotification, object: nil, userInfo: ["alarmId": ring.alarmId, "scheduledFor": ring.scheduledFor])
      // Best effort: route JS to the ring screen. If JS is not listening yet,
      // it finds the ring through getActiveRing() on launch.
      if let url = WakeifyEngineSupport.deepLink(alarmId: alarmId) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
    }
  }
}
