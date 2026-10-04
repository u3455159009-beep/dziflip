// Wakeify alarm engine – JS <-> native data types.
//
// The JS contract lives in ../src/WakeifyAlarm.types.ts and is the source of
// truth. `NativeAlarmSpecRecord` mirrors `NativeAlarmSpec`; it is converted
// right away into the plain Codable `AlarmSpec`, which is what the engines and
// the persistent store work with (Records are not Sendable/Codable).

import ExpoModulesCore
import Foundation

struct NativeAlarmSpecRecord: Record {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var hour: Int = 0
  @Field var minute: Int = 0
  @Field var weekdays: [Int] = []
  @Field var enabled: Bool = true
  @Field var skipUntil: Double? = nil
  @Field var soundUri: String? = nil
  @Field var startOffsetMs: Double = 0
  @Field var volume: Double = 1
  @Field var fadeInSeconds: Double = 0
  @Field var vibrate: Bool = true
  @Field var maxRingMinutes: Double = 10
  @Field var backupRepeatMinutes: Double = 0
  @Field var backupCount: Int = 0

  func toSpec() -> AlarmSpec {
    return AlarmSpec(
      id: id,
      label: label,
      hour: min(max(hour, 0), 23),
      minute: min(max(minute, 0), 59),
      weekdays: Array(Set(weekdays.filter { (1...7).contains($0) })).sorted(),
      enabled: enabled,
      skipUntil: skipUntil,
      soundUri: soundUri,
      startOffsetMs: max(0, startOffsetMs),
      volume: volume,
      fadeInSeconds: fadeInSeconds,
      vibrate: vibrate,
      maxRingMinutes: maxRingMinutes > 0 ? maxRingMinutes : 10,
      backupRepeatMinutes: max(0, backupRepeatMinutes),
      backupCount: max(0, backupCount)
    )
  }
}

/// Plain, persisted copy of `NativeAlarmSpec`.
struct AlarmSpec: Codable, Equatable {
  var id: String
  var label: String
  var hour: Int
  var minute: Int
  /// ISO weekdays, 1 = Monday … 7 = Sunday. Empty = one-shot.
  var weekdays: [Int]
  var enabled: Bool
  /// Epoch ms; occurrences strictly before it are skipped.
  var skipUntil: Double?
  var soundUri: String?
  var startOffsetMs: Double
  var volume: Double
  var fadeInSeconds: Double
  var vibrate: Bool
  var maxRingMinutes: Double
  var backupRepeatMinutes: Double
  var backupCount: Int

  var isRepeating: Bool { !weekdays.isEmpty }

  var displayTitle: String {
    let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "Wakeify" : trimmed
  }

  /// Skip instant that is still relevant (nil once it is in the past).
  func activeSkipUntil(now: Date) -> Date? {
    guard let skipUntil else { return nil }
    let date = Date(timeIntervalSince1970: skipUntil / 1000)
    return date > now ? date : nil
  }

  /// True when two specs describe the same one-shot target (used to keep a
  /// fired one-shot alarm "done" across re-syncs of an unchanged spec).
  func sameOneShotRule(as other: AlarmSpec) -> Bool {
    return hour == other.hour && minute == other.minute && weekdays == other.weekdays && skipUntil == other.skipUntil
  }

  /// Total time after an occurrence during which it still counts as "ringing"
  /// (backup re-alarms + safety cap), used to expire persisted ring records.
  var ringWindowSeconds: TimeInterval {
    let backups = backupRepeatMinutes > 0 ? Double(backupCount) * backupRepeatMinutes : 0
    return (backups + maxRingMinutes) * 60
  }
}

/// Kind of a system-level alarm/notification we created.
enum SystemAlarmKind: String, Codable {
  case main      // the alarm's own (relative/repeating or one-shot) schedule
  case skipFixed // fixed occurrence used while a repeating alarm is being skipped
  case backup    // backup re-alarm after an occurrence
  case snooze
  case test
  case burst     // notifications engine: extra one-shot "keep ringing" notification
}

/// Bookkeeping for one AlarmKit alarm (keyed by its UUID string).
struct SystemAlarmRecord: Codable {
  var alarmId: String
  var kind: SystemAlarmKind
  /// Epoch ms of the occurrence this system alarm belongs to (nil for a
  /// relative/repeating main alarm – computed when it alerts).
  var occurrence: Double?
  /// Epoch ms the system alarm fires (nil for relative schedules).
  var fireAt: Double?
  var hour: Int
  var minute: Int
  var usingFallbackSound: Bool
  /// True for the snooze alarm and the backups armed after it (ring reports
  /// `isSnooze`). Optional so records persisted before this field decode.
  var fromSnooze: Bool? = nil
}

/// A snoozed occurrence: rings again at `triggerAt`, but is still reported
/// with `scheduledFor = occurrence` (the ORIGINAL occurrence) so JS can match
/// the ring session.
struct SnoozeRecord: Codable, Equatable {
  /// Epoch ms the snooze rings.
  var triggerAt: Double
  /// Epoch ms of the original occurrence that was snoozed.
  var occurrence: Double
}

struct ActiveRingRecord: Codable, Equatable {
  var alarmId: String
  var startedAt: Double
  var scheduledFor: Double
  var isSnooze: Bool
  /// True when the ring comes from scheduleTestRing.
  var isTest: Bool
  var usingFallbackSound: Bool
  /// Epoch ms after which the record is considered stale.
  var expiresAt: Double

  func toJS() -> [String: Any] {
    return [
      "alarmId": alarmId,
      "startedAt": startedAt,
      "scheduledFor": scheduledFor,
      "isSnooze": isSnooze,
      "isTest": isTest,
      "usingFallbackSound": usingFallbackSound,
    ]
  }
}

extension ActiveRingRecord {
  // Custom decoding (in an extension to keep the memberwise init) so rings
  // persisted before `isTest` existed still decode.
  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    alarmId = try c.decode(String.self, forKey: .alarmId)
    startedAt = try c.decode(Double.self, forKey: .startedAt)
    scheduledFor = try c.decode(Double.self, forKey: .scheduledFor)
    isSnooze = try c.decode(Bool.self, forKey: .isSnooze)
    isTest = try c.decodeIfPresent(Bool.self, forKey: .isTest) ?? false
    usingFallbackSound = try c.decode(Bool.self, forKey: .usingFallbackSound)
    expiresAt = try c.decode(Double.self, forKey: .expiresAt)
  }
}

struct OneShotTarget: Codable {
  var rule: AlarmSpec
  var targetAt: Double
}

struct ScheduledResult {
  var id: String
  var triggerAt: Date?

  func toJS() -> [String: Any] {
    return [
      "id": id,
      "triggerAt": triggerAt.map { $0.timeIntervalSince1970 * 1000 } ?? NSNull(),
    ]
  }
}

func epochMs(_ date: Date) -> Double {
  return (date.timeIntervalSince1970 * 1000).rounded()
}

func dateFromMs(_ ms: Double) -> Date {
  return Date(timeIntervalSince1970: ms / 1000)
}
