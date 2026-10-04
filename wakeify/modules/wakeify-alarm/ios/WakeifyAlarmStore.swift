// Persistent state + scheduling math shared by both iOS engines.
//
// Everything the engines need to recompute the schedule without JS (app
// becomes active, time-zone change, AlarmKit intent) lives in UserDefaults as
// a single JSON blob.

import CryptoKit
import Foundation

struct PersistedState: Codable {
  var specs: [AlarmSpec] = []
  /// AlarmKit alarms we created, keyed by UUID string.
  var systemAlarms: [String: SystemAlarmRecord] = [:]
  /// One-shot alarms: the absolute occurrence chosen for the current rule.
  var oneShotTargets: [String: OneShotTarget] = [:]
  /// Occurrences (epoch ms) that were armed with backups / bursts, per alarm.
  var armedOccurrences: [String: [Double]] = [:]
  /// Latest occurrence (epoch ms) the user completed the challenge for.
  var handledOccurrences: [String: Double] = [:]
  /// Snoozed occurrences, alarmId -> snooze. Kept after the snooze fired
  /// until its ring window ends (its backups/bursts still need it) or the
  /// occurrence is handled.
  var snoozes: [String: SnoozeRecord] = [:]
  /// Pending test rings, alarmId -> epoch ms.
  var testRings: [String: Double] = [:]
  /// Ring currently in progress (observed through AlarmKit / notifications).
  var activeRing: ActiveRingRecord?
  /// Ring recorded by the "Otevřít Wakeify" AlarmKit intent.
  var pendingRing: ActiveRingRecord?
  /// "<uri>|<offsetMs>" -> file name inside Library/Sounds.
  var soundClips: [String: String] = [:]

  init() {}

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    specs = (try? c.decodeIfPresent([AlarmSpec].self, forKey: .specs)) ?? []
    systemAlarms = (try? c.decodeIfPresent([String: SystemAlarmRecord].self, forKey: .systemAlarms)) ?? [:]
    oneShotTargets = (try? c.decodeIfPresent([String: OneShotTarget].self, forKey: .oneShotTargets)) ?? [:]
    armedOccurrences = (try? c.decodeIfPresent([String: [Double]].self, forKey: .armedOccurrences)) ?? [:]
    handledOccurrences = (try? c.decodeIfPresent([String: Double].self, forKey: .handledOccurrences)) ?? [:]
    // Pre-SnoozeRecord format ([String: Double]) fails to decode and is dropped.
    snoozes = (try? c.decodeIfPresent([String: SnoozeRecord].self, forKey: .snoozes)) ?? [:]
    testRings = (try? c.decodeIfPresent([String: Double].self, forKey: .testRings)) ?? [:]
    activeRing = try? c.decodeIfPresent(ActiveRingRecord.self, forKey: .activeRing)
    pendingRing = try? c.decodeIfPresent(ActiveRingRecord.self, forKey: .pendingRing)
    soundClips = (try? c.decodeIfPresent([String: String].self, forKey: .soundClips)) ?? [:]
  }

  func spec(for alarmId: String) -> AlarmSpec? {
    return specs.first { $0.id == alarmId }
  }
}

final class WakeifyAlarmStore {
  static let shared = WakeifyAlarmStore()

  private static let defaultsKey = "app.wakeify.alarm.state.v1"
  private let lock = NSLock()
  private let defaults = UserDefaults.standard

  func read<T>(_ body: (PersistedState) -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body(load())
  }

  @discardableResult
  func mutate<T>(_ body: (inout PersistedState) -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    var state = load()
    let result = body(&state)
    save(state)
    return result
  }

  private func load() -> PersistedState {
    guard let data = defaults.data(forKey: Self.defaultsKey),
          let state = try? JSONDecoder().decode(PersistedState.self, from: data) else {
      return PersistedState()
    }
    return state
  }

  private func save(_ state: PersistedState) {
    if let data = try? JSONEncoder().encode(state) {
      defaults.set(data, forKey: Self.defaultsKey)
    }
  }
}

// MARK: - Deterministic identifiers

enum WakeifyIds {
  /// Fixed namespace for name-based (v5) UUIDs. Never change it: existing
  /// AlarmKit alarms are found again through these ids.
  private static let namespace = UUID(uuidString: "6F1D1C52-6A43-4F53-9A7E-8A1F0B2C3D4E")!

  /// RFC 4122 version 5 (SHA-1, name-based) UUID.
  static func nameBased(_ name: String) -> UUID {
    var bytes = [UInt8]()
    withUnsafeBytes(of: namespace.uuid) { bytes.append(contentsOf: $0) }
    bytes.append(contentsOf: Array(name.utf8))
    var digest = Array(Insecure.SHA1.hash(data: Data(bytes)))
    digest[6] = (digest[6] & 0x0F) | 0x50
    digest[8] = (digest[8] & 0x3F) | 0x80
    let u = digest
    return UUID(uuid: (u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7],
                       u[8], u[9], u[10], u[11], u[12], u[13], u[14], u[15]))
  }

  static func main(_ alarmId: String) -> UUID {
    return UUID(uuidString: alarmId) ?? nameBased("main:" + alarmId)
  }

  static func snooze(_ alarmId: String) -> UUID { nameBased(alarmId + "snooze") }
  static func snoozeBackup(_ alarmId: String, index: Int) -> UUID { nameBased(alarmId + "snoozebackup:\(index)") }
  static func test(_ alarmId: String) -> UUID { nameBased(alarmId + "test") }
  static func backup(_ alarmId: String, index: Int) -> UUID { nameBased(alarmId + "backup:\(index)") }
  static func skipFixed(_ alarmId: String, index: Int) -> UUID { nameBased(alarmId + "skip:\(index)") }

  /// Short stable hash used for sound clip file names.
  static func shortHash(_ string: String) -> String {
    let digest = SHA256.hash(data: Data(string.utf8))
    return digest.prefix(8).map { String(format: "%02x", $0) }.joined()
  }
}

// MARK: - Calendar math

enum WakeifySchedule {
  static var calendar: Calendar { Calendar.current }

  /// ISO weekday (1 = Monday … 7 = Sunday) of `date` in the current calendar.
  static func isoWeekday(of date: Date) -> Int {
    let gregorian = calendar.component(.weekday, from: date) // 1 = Sunday
    return (gregorian + 5) % 7 + 1
  }

  /// Gregorian `DateComponents.weekday` (1 = Sunday … 7 = Saturday) for an ISO weekday.
  static func gregorianWeekday(fromIso iso: Int) -> Int {
    return iso % 7 + 1
  }

  /// First hour:minute occurrence strictly after `after` (restricted to
  /// `isoWeekdays` unless empty).
  static func nextOccurrence(hour: Int, minute: Int, isoWeekdays: [Int], after: Date) -> Date? {
    let cal = calendar
    let startDay = cal.startOfDay(for: after)
    for offset in 0..<16 {
      guard let day = cal.date(byAdding: .day, value: offset, to: startDay),
            let candidate = cal.date(bySettingHour: hour, minute: minute, second: 0, of: day) else { continue }
      if candidate <= after { continue }
      if !isoWeekdays.isEmpty && !isoWeekdays.contains(isoWeekday(of: candidate)) { continue }
      return candidate
    }
    return nil
  }

  /// Latest hour:minute occurrence at or before `notAfter`.
  static func previousOccurrence(hour: Int, minute: Int, isoWeekdays: [Int], notAfter: Date) -> Date? {
    let cal = calendar
    let startDay = cal.startOfDay(for: notAfter)
    for offset in 0..<9 {
      guard let day = cal.date(byAdding: .day, value: -offset, to: startDay),
            let candidate = cal.date(bySettingHour: hour, minute: minute, second: 0, of: day) else { continue }
      if candidate > notAfter { continue }
      if !isoWeekdays.isEmpty && !isoWeekdays.contains(isoWeekday(of: candidate)) { continue }
      return candidate
    }
    return nil
  }

  /// All occurrences in [from, until).
  static func occurrences(hour: Int, minute: Int, isoWeekdays: [Int], from: Date, until: Date) -> [Date] {
    var result: [Date] = []
    var cursor = from.addingTimeInterval(-0.001)
    while let next = nextOccurrence(hour: hour, minute: minute, isoWeekdays: isoWeekdays, after: cursor), next < until {
      result.append(next)
      cursor = next
      if result.count > 14 { break }
    }
    return result
  }

  static func matchesTimeOfDay(_ date: Date, hour: Int, minute: Int) -> Bool {
    let comps = calendar.dateComponents([.hour, .minute], from: date)
    return comps.hour == hour && comps.minute == minute
  }
}

// MARK: - Per-alarm plan (engine independent)

/// How the alarm's own schedule must be expressed for the OS.
enum MainScheduleMode {
  case none
  /// Weekly repeating rule (AlarmKit `.relative(.weekly)` / calendar triggers).
  case repeating
  /// Explicit one-off instants (one-shot alarm, or a skipped repeating alarm).
  case fixed([Date])
}

struct AlarmPlan {
  var spec: AlarmSpec
  var mode: MainScheduleMode
  /// Next time the alarm rings (nil = nothing scheduled).
  var next: Date?
  /// Occurrences that still need backup re-alarms / ring bursts.
  var ringOccurrences: [Date]
}

enum WakeifyPlanner {
  /// Number of days covered by fixed alarms while a repeating alarm is skipped.
  /// Past that horizon the repeating rule is restored only on the next re-sync
  /// (app becomes active / JS calls syncAlarms).
  static let skipHorizonDays = 7

  /// Builds the plan for every spec and updates one-shot targets + armed
  /// occurrences in `state`. `ringWindow` returns how long after an
  /// occurrence it still needs coverage (backups or bursts).
  static func plan(state: inout PersistedState, now: Date, ringWindow: (AlarmSpec) -> TimeInterval) -> [AlarmPlan] {
    var plans: [AlarmPlan] = []
    var newTargets: [String: OneShotTarget] = [:]
    var newArmed: [String: [Double]] = [:]

    for spec in state.specs {
      guard spec.enabled else {
        plans.append(AlarmPlan(spec: spec, mode: .none, next: nil, ringOccurrences: []))
        continue
      }
      let skip = spec.activeSkipUntil(now: now)
      var mode: MainScheduleMode = .none
      var next: Date?

      if spec.isRepeating {
        let raw = WakeifySchedule.nextOccurrence(hour: spec.hour, minute: spec.minute, isoWeekdays: spec.weekdays, after: now)
        if let skip, let raw, raw < skip {
          let from = skip
          let first = WakeifySchedule.nextOccurrence(hour: spec.hour, minute: spec.minute, isoWeekdays: spec.weekdays, after: from.addingTimeInterval(-0.001))
          if let first {
            let until = first.addingTimeInterval(TimeInterval(skipHorizonDays) * 86_400)
            let dates = WakeifySchedule.occurrences(hour: spec.hour, minute: spec.minute, isoWeekdays: spec.weekdays, from: first, until: until)
            mode = .fixed(dates)
            next = dates.first
          }
        } else {
          mode = .repeating
          next = raw
        }
      } else {
        let previous = state.oneShotTargets[spec.id]
        if let previous, previous.rule.sameOneShotRule(as: spec), dateFromMs(previous.targetAt) <= now {
          // Already fired for this rule: stays done until JS changes/disables it.
          newTargets[spec.id] = previous
        } else {
          let after = max(now, skip.map { $0.addingTimeInterval(-0.001) } ?? now)
          if let target = WakeifySchedule.nextOccurrence(hour: spec.hour, minute: spec.minute, isoWeekdays: [], after: after) {
            mode = .fixed([target])
            next = target
            newTargets[spec.id] = OneShotTarget(rule: spec, targetAt: epochMs(target))
          }
        }
      }

      // Occurrences that still need backups/bursts: earlier armed ones that
      // are unhandled, not snoozed and inside their window, plus the next
      // one. A snoozed occurrence gets its backups relative to the snooze
      // instead (scheduled by the engines from `state.snoozes`).
      let handled = state.handledOccurrences[spec.id] ?? 0
      let snoozedUpTo = state.snoozes[spec.id]?.occurrence ?? 0
      let window = ringWindow(spec)
      var ring: [Date] = []
      for ms in state.armedOccurrences[spec.id] ?? [] {
        let occ = dateFromMs(ms)
        guard occ <= now, ms > handled, ms > snoozedUpTo, occ.addingTimeInterval(window) > now,
              WakeifySchedule.matchesTimeOfDay(occ, hour: spec.hour, minute: spec.minute) else { continue }
        ring.append(occ)
      }
      if let next { ring.append(next) }
      newArmed[spec.id] = ring.map(epochMs)

      plans.append(AlarmPlan(spec: spec, mode: mode, next: next, ringOccurrences: ring))
    }

    state.oneShotTargets = newTargets
    state.armedOccurrences = newArmed
    return plans
  }
}

// MARK: - Ring records

extension PersistedState {
  /// Drops stale ring records and returns the ring that is still relevant.
  mutating func currentRing(now: Date) -> ActiveRingRecord? {
    let nowMs = epochMs(now)
    if let ring = activeRing, ring.expiresAt <= nowMs || !isRingValid(ring, nowMs: nowMs) {
      activeRing = nil
    }
    if let ring = pendingRing, ring.expiresAt <= nowMs || !isRingValid(ring, nowMs: nowMs) {
      pendingRing = nil
    }
    return activeRing ?? pendingRing
  }

  /// False when the ring's occurrence was handled, or when it is snoozed:
  /// a snoozed occurrence only rings again as the snooze ring (`isSnooze`)
  /// once the snooze time has come.
  func isRingValid(_ ring: ActiveRingRecord, nowMs: Double) -> Bool {
    if (handledOccurrences[ring.alarmId] ?? 0) >= ring.scheduledFor { return false }
    if let snooze = snoozes[ring.alarmId], ring.scheduledFor <= snooze.occurrence {
      if !ring.isSnooze { return false }
      if snooze.triggerAt > nowMs + 60_000 { return false }
    }
    return true
  }

  /// Expiry of a ring record. Snooze rings are measured from the snooze time,
  /// not from the original occurrence they report as `scheduledFor`.
  func expiry(for alarmId: String, scheduledFor: Double, isSnooze: Bool = false) -> Double {
    let window = spec(for: alarmId)?.ringWindowSeconds ?? 30 * 60
    var anchor = scheduledFor
    if isSnooze, let snooze = snoozes[alarmId] {
      anchor = max(anchor, snooze.triggerAt)
    }
    return anchor + window * 1000
  }

  /// Marks the current unhandled occurrence of `alarmId` as snoozed until
  /// `triggerAt`: clears its active/pending ring so getActiveRing() returns
  /// null until the snooze fires. `alerting` are rings derived from alarms or
  /// notifications that are ringing/delivered right now.
  mutating func beginSnooze(alarmId: String, triggerAt: Date, now: Date, alerting: [ActiveRingRecord]) {
    let handled = handledOccurrences[alarmId] ?? 0
    var occurrence = snoozes[alarmId]?.occurrence ?? 0 // re-snooze keeps the original occurrence
    for ring in [activeRing, pendingRing].compactMap({ $0 }) + alerting
      where ring.alarmId == alarmId && ring.scheduledFor > handled {
      occurrence = max(occurrence, ring.scheduledFor)
    }
    if occurrence == 0 {
      let nowMs = epochMs(now)
      occurrence = (armedOccurrences[alarmId] ?? []).filter { $0 <= nowMs && $0 > handled }.max() ?? nowMs
    }
    snoozes[alarmId] = SnoozeRecord(triggerAt: epochMs(triggerAt), occurrence: occurrence)
    if activeRing?.alarmId == alarmId { activeRing = nil }
    if pendingRing?.alarmId == alarmId { pendingRing = nil }
  }

  /// Occurrence that `markOccurrenceHandled` should mark as handled.
  func occurrenceToHandle(alarmId: String, now: Date, alerting: [ActiveRingRecord]) -> Double {
    var occurrence: Double = snoozes[alarmId]?.occurrence ?? 0
    for ring in [activeRing, pendingRing].compactMap({ $0 }) + alerting where ring.alarmId == alarmId {
      occurrence = max(occurrence, ring.scheduledFor)
    }
    if occurrence == 0 {
      let nowMs = epochMs(now)
      occurrence = (armedOccurrences[alarmId] ?? []).filter { $0 <= nowMs }.max() ?? nowMs
    }
    return occurrence
  }
}
