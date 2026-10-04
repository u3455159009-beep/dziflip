package app.wakeify.alarm

import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Pure java.time computation of the next trigger instant of an alarm rule.
 *
 * Semantics:
 *  - hour:minute is local wall-clock time in [zone].
 *  - weekdays are ISO (1 = Monday … 7 = Sunday); empty = one-shot, i.e. the
 *    next time hour:minute occurs.
 *  - the result is strictly after [nowMillis] (an occurrence exactly at now is
 *    considered already passed — it is the one currently firing).
 *  - occurrences strictly before skipUntil are skipped.
 *  - disabled => null.
 *
 * DST:
 *  - gap (e.g. 02:30 on spring-forward day in Europe/Prague does not exist):
 *    ZonedDateTime.of shifts forward by the gap length, so the alarm rings at
 *    03:30 local that day. Intentional: an alarm must never be silently dropped.
 *  - overlap (02:30 happens twice on fall-back day): the EARLIER offset is used,
 *    so the alarm rings once, at the first 02:30.
 */
object AlarmTimeCalculator {

  fun nextTrigger(spec: AlarmSpec, nowMillis: Long, zoneId: ZoneId): Long? {
    if (!spec.enabled) return null
    if (spec.hour !in 0..23 || spec.minute !in 0..59) return null
    val days = spec.weekdays.filter { it in 1..7 }.toSet()
    if (spec.weekdays.isNotEmpty() && days.isEmpty()) return null

    // Valid candidate t:  t > now  AND  t >= skipUntil   <=>   t > bound
    val skip = spec.skipUntil
    val bound = if (skip != null && skip - 1 > nowMillis) skip - 1 else nowMillis

    val time = LocalTime.of(spec.hour, spec.minute)
    // Start one day earlier than the bound's local date to be safe around DST
    // shifts / offsets, then walk forward. 9 days covers every weekly rule.
    var date = Instant.ofEpochMilli(bound).atZone(zoneId).toLocalDate().minusDays(1)
    repeat(10) {
      if (days.isEmpty() || days.contains(date.dayOfWeek.value)) {
        // ZonedDateTime.of: gap -> shifted forward, overlap -> earlier offset.
        val candidate = ZonedDateTime.of(date, time, zoneId).toInstant().toEpochMilli()
        if (candidate > bound) return candidate
      }
      date = date.plusDays(1)
    }
    return null
  }
}
