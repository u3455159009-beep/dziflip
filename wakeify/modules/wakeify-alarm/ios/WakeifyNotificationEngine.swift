// Fallback engine (iOS < 26, or AlarmKit authorization denied):
// time-sensitive local notifications.
//
// Limits (also in README): cannot ring through the silent switch or a Focus
// that does not allow Wakeify, each sound is ≤ 30 s, and iOS keeps at most 64
// pending local notifications per app. Continuous ringing is emulated with a
// burst of one-shot notifications every 30 s after the next occurrence.

import Foundation
import UserNotifications

final class WakeifyNotificationEngine: WakeifyEngine {
  let engineName = "ios-notifications"
  var eventSink: WakeifyEventSink?

  static let idPrefix = "app.wakeify.alarm."
  static let pendingLimit = 64
  static let burstInterval: TimeInterval = 30

  private let center = UNUserNotificationCenter.current()
  private let store = WakeifyAlarmStore.shared
  private let lock = NSLock()
  private var emittedRingKey: String?

  // MARK: Authorization

  static func permissionState() async -> String {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    return map(settings.authorizationStatus)
  }

  static func requestPermission() async -> String {
    do {
      _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    } catch {
      NSLog("[WakeifyAlarm] notification authorization failed: \(error)")
    }
    return await permissionState()
  }

  private static func map(_ status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized, .provisional, .ephemeral: return "granted"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "notDetermined"
    }
  }

  // MARK: Scheduling

  private struct Candidate {
    var identifier: String
    var alarmId: String
    var fireDate: Date
    /// 0 = alarm itself / snooze / test, 1 = keep-ringing burst.
    var tier: Int
    var isMain: Bool
    var trigger: UNNotificationTrigger
    var content: UNNotificationContent
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

    let pending = await center.pendingNotificationRequests()
    let ours = pending.map(\.identifier).filter { $0.hasPrefix(Self.idPrefix) }
    center.removePendingNotificationRequests(withIdentifiers: ours)
    let othersCount = pending.count - ours.count

    let settings = await center.notificationSettings()
    let grantedStatuses: [UNAuthorizationStatus] = [.authorized, .provisional, .ephemeral]
    let authorized = grantedStatuses.contains(settings.authorizationStatus)
    guard authorized else {
      NSLog("[WakeifyAlarm] notifications not authorized – nothing scheduled")
      return plans.map { ScheduledResult(id: $0.spec.id, triggerAt: nil) }
    }

    var candidates: [Candidate] = []
    let calendar = WakeifySchedule.calendar
    for plan in plans where plan.spec.enabled {
      let spec = plan.spec
      let sound = sounds[spec.id] ?? (nil, false)
      switch plan.mode {
      case .none:
        break
      case .repeating:
        for iso in spec.weekdays {
          var comps = DateComponents()
          comps.weekday = WakeifySchedule.gregorianWeekday(fromIso: iso)
          comps.hour = spec.hour
          comps.minute = spec.minute
          comps.second = 0
          let next = WakeifySchedule.nextOccurrence(hour: spec.hour, minute: spec.minute, isoWeekdays: [iso], after: now) ?? .distantFuture
          candidates.append(Candidate(
            identifier: "\(Self.idPrefix)\(spec.id).main.w\(iso)", alarmId: spec.id, fireDate: next, tier: 0, isMain: true,
            trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: true),
            content: makeContent(spec: spec, kind: .main, occurrence: nil, soundName: sound.name, fallback: sound.fallback)))
        }
      case .fixed(let dates):
        for (index, date) in dates.enumerated() {
          candidates.append(Candidate(
            identifier: "\(Self.idPrefix)\(spec.id).fixed.\(index)", alarmId: spec.id, fireDate: date, tier: 0, isMain: true,
            trigger: Self.oneShotTrigger(date, calendar: calendar),
            content: makeContent(spec: spec, kind: spec.isRepeating ? .skipFixed : .main, occurrence: date, soundName: sound.name, fallback: sound.fallback)))
        }
      }
      for occurrence in plan.ringOccurrences {
        candidates += burst(spec: spec, kind: .burst, anchor: occurrence, occurrence: occurrence, now: now, sound: sound, calendar: calendar)
      }
    }
    for spec in allSpecs {
      let sound = sounds[spec.id] ?? (nil, false)
      // Snooze: rings at triggerAt (bursts after it) but reports the ORIGINAL
      // occurrence. Kept after it fired so its remaining bursts survive re-syncs.
      // Test: rings at its own time and reports that time.
      var oneOffs: [(kind: SystemAlarmKind, at: Date, occurrence: Date)] = []
      if spec.enabled, let snooze = snoozes[spec.id] {
        oneOffs.append((SystemAlarmKind.snooze, dateFromMs(snooze.triggerAt), dateFromMs(snooze.occurrence)))
      }
      if let ms = tests[spec.id] {
        oneOffs.append((SystemAlarmKind.test, dateFromMs(ms), dateFromMs(ms)))
      }
      for oneOff in oneOffs {
        if oneOff.at > now {
          candidates.append(Candidate(
            identifier: "\(Self.idPrefix)\(spec.id).\(oneOff.kind.rawValue)", alarmId: spec.id, fireDate: oneOff.at, tier: 0, isMain: false,
            trigger: Self.oneShotTrigger(oneOff.at, calendar: calendar),
            content: makeContent(spec: spec, kind: oneOff.kind, occurrence: oneOff.occurrence, soundName: sound.name, fallback: sound.fallback)))
        }
        candidates += burst(spec: spec, kind: oneOff.kind, anchor: oneOff.at, occurrence: oneOff.occurrence, now: now, sound: sound, calendar: calendar)
      }
    }

    // 64-pending budget: alarms/snoozes/tests first (soonest first), then
    // bursts (soonest first, so the next ringing alarm gets the longest burst).
    let budget = max(0, Self.pendingLimit - othersCount)
    let selected = candidates
      .sorted { ($0.tier, $0.fireDate) < ($1.tier, $1.fireDate) }
      .prefix(budget)
    if selected.count < candidates.count {
      NSLog("[WakeifyAlarm] notification budget: \(candidates.count - selected.count) requests dropped (limit \(Self.pendingLimit))")
    }

    var scheduledMain = Set<String>()
    for candidate in selected {
      let request = UNNotificationRequest(identifier: candidate.identifier, content: candidate.content, trigger: candidate.trigger)
      do {
        try await center.add(request)
        if candidate.isMain { scheduledMain.insert(candidate.alarmId) }
      } catch {
        NSLog("[WakeifyAlarm] could not schedule \(candidate.identifier): \(error)")
      }
    }

    return plans.map { plan in
      ScheduledResult(id: plan.spec.id, triggerAt: scheduledMain.contains(plan.spec.id) ? plan.next : nil)
    }
  }

  static func ringWindow(_ spec: AlarmSpec) -> TimeInterval {
    return spec.maxRingMinutes * 60
  }

  /// Keep-ringing notifications every 30 s after `anchor` (the moment the
  /// ring starts), all reporting `occurrence` as the ring's scheduledFor.
  private func burst(spec: AlarmSpec, kind: SystemAlarmKind, anchor: Date, occurrence: Date, now: Date,
                     sound: (name: String?, fallback: Bool), calendar: Calendar) -> [Candidate] {
    let count = Int((spec.maxRingMinutes * 60 / Self.burstInterval).rounded(.down))
    guard count > 1 else { return [] }
    var result: [Candidate] = []
    let anchorMs = Int64(epochMs(anchor))
    for k in 1..<count {
      let fire = anchor.addingTimeInterval(Double(k) * Self.burstInterval)
      guard fire > now.addingTimeInterval(1) else { continue }
      result.append(Candidate(
        identifier: "\(Self.idPrefix)\(spec.id).\(kind.rawValue).\(anchorMs).\(k)", alarmId: spec.id, fireDate: fire, tier: 1, isMain: false,
        trigger: Self.oneShotTrigger(fire, calendar: calendar),
        content: makeContent(spec: spec, kind: kind, occurrence: occurrence, soundName: sound.name, fallback: sound.fallback)))
    }
    return result
  }

  private static func oneShotTrigger(_ date: Date, calendar: Calendar) -> UNCalendarNotificationTrigger {
    let comps = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
    return UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
  }

  private func makeContent(spec: AlarmSpec, kind: SystemAlarmKind, occurrence: Date?, soundName: String?, fallback: Bool) -> UNNotificationContent {
    let content = UNMutableNotificationContent()
    content.title = spec.displayTitle
    content.body = "Budík zvoní – otevři Wakeify a vypni ho."
    content.sound = soundName.map { UNNotificationSound(named: UNNotificationSoundName(rawValue: $0)) } ?? .default
    content.interruptionLevel = .timeSensitive
    content.relevanceScore = 1
    content.threadIdentifier = "\(Self.idPrefix)\(spec.id)"
    var info: [String: Any] = [
      "wakeifyAlarmId": spec.id,
      "wakeifyKind": kind.rawValue,
      "wakeifyFallbackSound": fallback,
    ]
    if let occurrence { info["wakeifyOccurrence"] = epochMs(occurrence) }
    if let url = WakeifyEngineSupport.deepLink(alarmId: spec.id) { info["url"] = url.absoluteString }
    content.userInfo = info
    return content
  }

  /// Snoozes the current unhandled occurrence of `alarmId` until `date`:
  /// clears its ring records and delivered notifications, drops its bursts
  /// and arms new ones after the snooze time (via sync).
  func scheduleSnooze(alarmId: String, at date: Date) async throws {
    let now = Date()
    let rings = await deliveredRings()
    store.mutate { state in
      let delivered = rings.map { ringRecord(from: $0, rings: rings, state: state) }
      state.beginSnooze(alarmId: alarmId, triggerAt: date, now: now, alerting: delivered)
    }
    await removeDelivered(alarmId: alarmId)
    lock.withLock { emittedRingKey = nil }
    _ = await sync(specs: nil)
  }

  /// Removes the snooze and its bursts; the snoozed occurrence is not re-armed.
  func cancelSnooze(alarmId: String) async {
    store.mutate { state in
      if let snooze = state.snoozes.removeValue(forKey: alarmId) {
        state.handledOccurrences[alarmId] = max(state.handledOccurrences[alarmId] ?? 0, snooze.occurrence)
      }
    }
    _ = await sync(specs: nil)
  }

  private func removeDelivered(alarmId: String) async {
    let delivered = await center.deliveredNotifications()
    center.removeDeliveredNotifications(withIdentifiers: delivered.map(\.request.identifier)
      .filter { $0.hasPrefix("\(Self.idPrefix)\(alarmId).") })
  }

  func scheduleTest(alarmId: String, at date: Date) async throws {
    store.mutate { state in state.testRings[alarmId] = epochMs(date) }
    _ = await sync(specs: nil)
  }

  // MARK: Ringing state

  private struct DeliveredRing {
    var alarmId: String
    var occurrence: Double
    var deliveredAt: Double
    var isSnooze: Bool
    var isTest: Bool
    var fallback: Bool
  }

  private func ringRecord(from ring: DeliveredRing, rings: [DeliveredRing], state: PersistedState) -> ActiveRingRecord {
    let startedAt = rings
      .filter { $0.alarmId == ring.alarmId && $0.occurrence == ring.occurrence && $0.isSnooze == ring.isSnooze }
      .map(\.deliveredAt).min() ?? ring.deliveredAt
    return ActiveRingRecord(alarmId: ring.alarmId, startedAt: startedAt, scheduledFor: ring.occurrence,
                            isSnooze: ring.isSnooze, isTest: ring.isTest, usingFallbackSound: ring.fallback,
                            expiresAt: state.expiry(for: ring.alarmId, scheduledFor: ring.occurrence, isSnooze: ring.isSnooze))
  }

  private func deliveredRings() async -> [DeliveredRing] {
    let delivered = await center.deliveredNotifications()
    return delivered.compactMap { notification in
      let info = notification.request.content.userInfo
      guard notification.request.identifier.hasPrefix(Self.idPrefix),
            let alarmId = info["wakeifyAlarmId"] as? String else { return nil }
      let deliveredAt = epochMs(notification.date)
      var occurrence = (info["wakeifyOccurrence"] as? NSNumber)?.doubleValue ?? 0
      if occurrence <= 0 {
        // Repeating calendar trigger: the occurrence is the delivery minute.
        let floored = floor(notification.date.timeIntervalSince1970 / 60) * 60
        occurrence = floored * 1000
      }
      let kind = info["wakeifyKind"] as? String
      return DeliveredRing(alarmId: alarmId, occurrence: occurrence, deliveredAt: deliveredAt,
                           isSnooze: kind == SystemAlarmKind.snooze.rawValue,
                           isTest: kind == SystemAlarmKind.test.rawValue,
                           fallback: (info["wakeifyFallbackSound"] as? Bool) ?? false)
    }
  }

  func activeRing() async -> ActiveRingRecord? {
    let now = Date()
    let rings = await deliveredRings()
    let ring: ActiveRingRecord? = store.mutate { state in
      let nowMs = epochMs(now)
      let live = rings
        .map { ringRecord(from: $0, rings: rings, state: state) }
        .filter { $0.expiresAt > nowMs && state.isRingValid($0, nowMs: nowMs) }
      // Latest occurrence wins; for the same occurrence the snooze ring wins.
      if let record = live.max(by: { ($0.scheduledFor, $0.isSnooze ? 1 : 0) < ($1.scheduledFor, $1.isSnooze ? 1 : 0) }) {
        if state.activeRing?.alarmId != record.alarmId || state.activeRing?.scheduledFor != record.scheduledFor
            || state.activeRing?.isSnooze != record.isSnooze {
          state.activeRing = record
        }
        return state.activeRing
      }
      return state.currentRing(now: now)
    }
    emitStartedIfNew(ring)
    return ring
  }

  private func emitStartedIfNew(_ ring: ActiveRingRecord?) {
    guard let ring else { return }
    let key = "\(ring.alarmId)|\(Int64(ring.scheduledFor))|\(ring.isSnooze)"
    lock.lock()
    let isNew = emittedRingKey != key
    emittedRingKey = key
    lock.unlock()
    if isNew {
      eventSink?(WakeifyEvent.ringStarted, WakeifyEngineSupport.ringEventBody(ring))
    }
  }

  func stopRinging() async {
    // A delivered notification's sound cannot be stopped directly; removing
    // our delivered notifications is the closest equivalent. Pending bursts
    // stay until markOccurrenceHandled, so leaving the app keeps ringing.
    let delivered = await center.deliveredNotifications()
    center.removeDeliveredNotifications(withIdentifiers: delivered.map(\.request.identifier).filter { $0.hasPrefix(Self.idPrefix) })
  }

  func markHandled(alarmId: String) async {
    let now = Date()
    let rings = await deliveredRings()
    let ended: ActiveRingRecord? = store.mutate { state in
      let delivered = rings
        .filter { $0.occurrence <= epochMs(now) }
        .map { ringRecord(from: $0, rings: rings, state: state) }
      let occurrence = state.occurrenceToHandle(alarmId: alarmId, now: now, alerting: delivered)
      state.handledOccurrences[alarmId] = max(state.handledOccurrences[alarmId] ?? 0, occurrence)
      let endedRing = state.activeRing?.alarmId == alarmId ? state.activeRing : nil
      if state.activeRing?.alarmId == alarmId { state.activeRing = nil }
      if state.pendingRing?.alarmId == alarmId { state.pendingRing = nil }
      // Handling clears any snooze (pending or fired) and, via sync, its bursts.
      state.snoozes.removeValue(forKey: alarmId)
      return endedRing
    }
    await removeDelivered(alarmId: alarmId)
    // Re-sync removes the handled occurrence's bursts and arms the next one.
    _ = await sync(specs: nil)
    if let ended {
      var body = WakeifyEngineSupport.ringEventBody(ended)
      body["reason"] = "dismissed"
      eventSink?(WakeifyEvent.ringStopped, body)
    }
  }

  func removeEverything() async {
    let pending = await center.pendingNotificationRequests()
    center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(Self.idPrefix) })
  }

  func startObserving() {}
  func stopObserving() {}
}
