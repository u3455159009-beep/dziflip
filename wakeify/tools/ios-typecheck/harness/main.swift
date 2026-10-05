import Foundation
var failures = 0
func check(_ c: Bool, _ msg: String) { print((c ? "PASS " : "FAIL ") + msg); if !c { failures += 1 } }
let spec = AlarmSpec(id: "A", label: "", hour: 7, minute: 0, weekdays: [1, 2, 3, 4, 5], enabled: true, skipUntil: nil, soundUri: nil, startOffsetMs: 0, volume: 1, fadeInSeconds: 0, vibrate: true, maxRingMinutes: 10, backupRepeatMinutes: 1, backupCount: 10)
let win: (AlarmSpec) -> TimeInterval = { s in s.backupRepeatMinutes > 0 ? Double(s.backupCount) * s.backupRepeatMinutes * 60 + 60 : 0 }
let cal = Calendar.current
// Monday 2026-10-05 07:00 local
let occ = cal.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 7, minute: 0))!
let occMs = epochMs(occ)
var st = PersistedState()
st.specs = [spec]
var plans = WakeifyPlanner.plan(state: &st, now: occ.addingTimeInterval(-60), ringWindow: win)
check(plans[0].ringOccurrences == [occ], "next occurrence armed with backups")
st.activeRing = ActiveRingRecord(alarmId: "A", startedAt: occMs, scheduledFor: occMs, isSnooze: false, isTest: false, usingFallbackSound: false, expiresAt: st.expiry(for: "A", scheduledFor: occMs))
var now = occ.addingTimeInterval(120)
plans = WakeifyPlanner.plan(state: &st, now: now, ringWindow: win)
check(plans[0].ringOccurrences.first == occ, "unhandled occurrence keeps backups after stopRinging")
for i in 0..<3 {
  now = now.addingTimeInterval(30)
  st.beginSnooze(alarmId: "A", triggerAt: now.addingTimeInterval(60), now: now, alerting: [])
  check(st.snoozes["A"]?.occurrence == occMs && st.snoozes["A"]?.triggerAt == epochMs(now.addingTimeInterval(60)), "re-snooze \(i) replaces trigger, keeps original occurrence")
}
check(st.snoozes.count == 1, "no snooze pile-up")
check(st.currentRing(now: now) == nil, "getActiveRing null while snoozed")
plans = WakeifyPlanner.plan(state: &st, now: now, ringWindow: win)
check(!plans[0].ringOccurrences.contains(occ), "original backups dropped while snoozed")
// test ring in the middle
let testMs = epochMs(now.addingTimeInterval(5))
st.testRings["A"] = testMs
st.activeRing = ActiveRingRecord(alarmId: "A", startedAt: testMs, scheduledFor: testMs, isSnooze: false, isTest: true, usingFallbackSound: false, expiresAt: st.expiry(for: "A", scheduledFor: testMs))
check(st.handlesTestRing(alarmId: "A", alerting: []), "finishTestRing detected as test")
st.clearTestRing(alarmId: "A")
check(st.testRings["A"] == nil && st.activeRing == nil && st.snoozes["A"]?.occurrence == occMs && (st.handledOccurrences["A"] ?? 0) == 0, "test finish leaves real occurrence + snooze untouched")
// snooze fires
now = dateFromMs(st.snoozes["A"]!.triggerAt).addingTimeInterval(1)
let sring = ActiveRingRecord(alarmId: "A", startedAt: epochMs(now), scheduledFor: occMs, isSnooze: true, isTest: false, usingFallbackSound: false, expiresAt: st.expiry(for: "A", scheduledFor: occMs, isSnooze: true))
check(st.isRingValid(sring, nowMs: epochMs(now)), "snooze ring valid when it fires, reports original occurrence")
st.activeRing = sring
check(!st.handlesTestRing(alarmId: "A", alerting: []), "real completion not treated as test")
let h = st.occurrenceToHandle(alarmId: "A", now: now, alerting: [])
check(h == occMs, "handles original occurrence")
st.handledOccurrences["A"] = h; st.activeRing = nil; st.pendingRing = nil; st.snoozes.removeValue(forKey: "A")
plans = WakeifyPlanner.plan(state: &st, now: now, ringWindow: win)
let next = cal.date(from: DateComponents(year: 2026, month: 10, day: 6, hour: 7, minute: 0))!
check(plans[0].ringOccurrences == [next] && plans[0].next == next, "after handled: only next occurrence armed")
// stale test ring must not hide a newer real ring from the intent
st.activeRing = ActiveRingRecord(alarmId: "A", startedAt: epochMs(next) - 600_000, scheduledFor: epochMs(next) - 600_000, isSnooze: false, isTest: true, usingFallbackSound: false, expiresAt: epochMs(next) + 3_600_000)
st.pendingRing = ActiveRingRecord(alarmId: "A", startedAt: epochMs(next) + 5_000, scheduledFor: epochMs(next), isSnooze: false, isTest: false, usingFallbackSound: false, expiresAt: epochMs(next) + 3_600_000)
let cr = st.currentRing(now: next.addingTimeInterval(10))
check(cr?.isTest == false && st.activeRing?.isTest == false, "fresher real pending ring wins over stale test ring")
print(failures == 0 ? "ALL OK" : "\(failures) FAILURES")
exit(failures == 0 ? 0 : 1)
