package app.wakeify.alarm

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime

class AlarmTimeCalculatorTest {
  private val prague = ZoneId.of("Europe/Prague")

  private fun spec(
    hour: Int,
    minute: Int,
    weekdays: List<Int> = emptyList(),
    enabled: Boolean = true,
    skipUntil: Long? = null
  ) = AlarmSpec(
    id = "a", label = "", hour = hour, minute = minute, weekdays = weekdays, enabled = enabled,
    skipUntil = skipUntil, soundUri = null, startOffsetMs = 0, volume = 1.0, fadeInSeconds = 0.0,
    vibrate = true, maxRingMinutes = 10, backupRepeatMinutes = 0, backupCount = 0
  )

  private fun at(zone: ZoneId, y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int = 0): Long =
    ZonedDateTime.of(y, mo, d, h, mi, s, 0, zone).toInstant().toEpochMilli()

  private fun local(ms: Long, zone: ZoneId): LocalDateTime =
    java.time.Instant.ofEpochMilli(ms).atZone(zone).toLocalDateTime()

  @Test
  fun disabledReturnsNull() {
    assertNull(AlarmTimeCalculator.nextTrigger(spec(7, 0, enabled = false), at(prague, 2026, 10, 5, 6, 0), prague))
  }

  @Test
  fun oneShotLaterToday() {
    // Mon 2026-10-05 06:00 -> 07:00 same day
    val next = AlarmTimeCalculator.nextTrigger(spec(7, 0), at(prague, 2026, 10, 5, 6, 0), prague)
    assertEquals(at(prague, 2026, 10, 5, 7, 0), next)
  }

  @Test
  fun oneShotAlreadyPassedGoesToTomorrow() {
    val next = AlarmTimeCalculator.nextTrigger(spec(7, 0), at(prague, 2026, 10, 5, 7, 30), prague)
    assertEquals(at(prague, 2026, 10, 6, 7, 0), next)
  }

  @Test
  fun exactlyNowIsNotNextStrictlyAfter() {
    val now = at(prague, 2026, 10, 5, 7, 0)
    assertEquals(at(prague, 2026, 10, 6, 7, 0), AlarmTimeCalculator.nextTrigger(spec(7, 0), now, prague))
    // one millisecond before -> still today
    assertEquals(now, AlarmTimeCalculator.nextTrigger(spec(7, 0), now - 1, prague))
  }

  @Test
  fun weekdaysOnlyPicksMatchingDays() {
    // Mon..Fri. Friday 2026-10-09 08:00 (after 07:00) -> Monday 2026-10-12 07:00
    val weekdays = listOf(1, 2, 3, 4, 5)
    val next = AlarmTimeCalculator.nextTrigger(spec(7, 0, weekdays), at(prague, 2026, 10, 9, 8, 0), prague)
    assertEquals(at(prague, 2026, 10, 12, 7, 0), next)
  }

  @Test
  fun singleWeekdayAWeekAhead() {
    // Sunday only (7). Now Sunday 2026-10-11 09:00, alarm 08:00 -> next Sunday 2026-10-18
    val next = AlarmTimeCalculator.nextTrigger(spec(8, 0, listOf(7)), at(prague, 2026, 10, 11, 9, 0), prague)
    assertEquals(at(prague, 2026, 10, 18, 8, 0), next)
  }

  @Test
  fun weekdaySameDayLater() {
    // Wednesday (3) 2026-10-07 05:00 -> 06:15 same day
    val next = AlarmTimeCalculator.nextTrigger(spec(6, 15, listOf(3, 6)), at(prague, 2026, 10, 7, 5, 0), prague)
    assertEquals(at(prague, 2026, 10, 7, 6, 15), next)
  }

  @Test
  fun skipUntilSkipsEarlierOccurrences() {
    // Daily 07:00; skip next ring: skipUntil = just after tomorrow's occurrence
    val now = at(prague, 2026, 10, 5, 22, 0)
    val tomorrow = at(prague, 2026, 10, 6, 7, 0)
    val all = listOf(1, 2, 3, 4, 5, 6, 7)
    assertEquals(tomorrow, AlarmTimeCalculator.nextTrigger(spec(7, 0, all), now, prague))
    val skipped = AlarmTimeCalculator.nextTrigger(spec(7, 0, all, skipUntil = tomorrow + 1), now, prague)
    assertEquals(at(prague, 2026, 10, 7, 7, 0), skipped)
  }

  @Test
  fun skipUntilEqualToOccurrenceKeepsIt() {
    // "strictly before skipUntil are skipped" -> occurrence == skipUntil rings
    val now = at(prague, 2026, 10, 5, 22, 0)
    val tomorrow = at(prague, 2026, 10, 6, 7, 0)
    assertEquals(tomorrow, AlarmTimeCalculator.nextTrigger(spec(7, 0, skipUntil = tomorrow), now, prague))
  }

  @Test
  fun skipUntilInPastIsIgnored() {
    val now = at(prague, 2026, 10, 5, 6, 0)
    assertEquals(
      at(prague, 2026, 10, 5, 7, 0),
      AlarmTimeCalculator.nextTrigger(spec(7, 0, skipUntil = now - 86_400_000L), now, prague)
    )
  }

  @Test
  fun skipUntilFarFuture() {
    // skip until 2026-12-24 12:00 -> first Monday 07:00 after that = 2026-12-28
    val now = at(prague, 2026, 10, 5, 6, 0)
    val next = AlarmTimeCalculator.nextTrigger(spec(7, 0, listOf(1), skipUntil = at(prague, 2026, 12, 24, 12, 0)), now, prague)
    assertEquals(at(prague, 2026, 12, 28, 7, 0), next)
  }

  @Test
  fun dstSpringForwardGapShiftsForward() {
    // Europe/Prague 2026-03-29: 02:00 CET -> 03:00 CEST. 02:30 does not exist -> 03:30 CEST.
    val now = at(prague, 2026, 3, 28, 23, 0)
    val next = AlarmTimeCalculator.nextTrigger(spec(2, 30), now, prague)!!
    assertEquals(ZonedDateTime.of(2026, 3, 29, 3, 30, 0, 0, prague).toInstant().toEpochMilli(), next)
    assertEquals(LocalDateTime.of(2026, 3, 29, 3, 30), local(next, prague))
    // 01:00 UTC == 03:00 CEST? 03:30 CEST == 01:30 UTC
    assertEquals(ZonedDateTime.of(2026, 3, 29, 1, 30, 0, 0, ZoneOffset.UTC).toInstant().toEpochMilli(), next)
  }

  @Test
  fun dstSpringForwardNormalTimeUnaffected() {
    // 07:00 on spring-forward day is 07:00 CEST (05:00 UTC), and the day after too.
    val now = at(prague, 2026, 3, 28, 23, 0)
    val next = AlarmTimeCalculator.nextTrigger(spec(7, 0, listOf(1, 2, 3, 4, 5, 6, 7)), now, prague)!!
    assertEquals(ZonedDateTime.of(2026, 3, 29, 5, 0, 0, 0, ZoneOffset.UTC).toInstant().toEpochMilli(), next)
    val after = AlarmTimeCalculator.nextTrigger(spec(7, 0, listOf(1, 2, 3, 4, 5, 6, 7)), next, prague)!!
    assertEquals(23 * 3_600_000L + 3_600_000L, after - next) // exactly 24h wall-clock, 24h real (DST already applied)
  }

  @Test
  fun dstFallBackOverlapUsesEarlierOffsetAndRingsOnce() {
    // Europe/Prague 2026-10-25: 03:00 CEST -> 02:00 CET; 02:30 happens twice.
    val now = at(prague, 2026, 10, 24, 23, 0)
    val all = listOf(1, 2, 3, 4, 5, 6, 7)
    val first = AlarmTimeCalculator.nextTrigger(spec(2, 30, all), now, prague)!!
    // earlier offset = CEST (+02:00) -> 00:30 UTC
    assertEquals(ZonedDateTime.of(2026, 10, 25, 0, 30, 0, 0, ZoneOffset.UTC).toInstant().toEpochMilli(), first)
    // After it fires, the next occurrence must be the NEXT day, not the second 02:30.
    val second = AlarmTimeCalculator.nextTrigger(spec(2, 30, all), first, prague)!!
    assertEquals(LocalDateTime.of(2026, 10, 26, 2, 30), local(second, prague))
    assertEquals(25 * 3_600_000L, second - first)
  }

  @Test
  fun timeZoneChangeRecomputesWallClock() {
    // Same instant, alarm 07:00 local. Travelling Prague -> New York: next trigger is 07:00 New York time.
    val ny = ZoneId.of("America/New_York")
    val now = at(prague, 2026, 10, 5, 10, 0) // = 04:00 in New York
    val inPrague = AlarmTimeCalculator.nextTrigger(spec(7, 0), now, prague)!!
    val inNy = AlarmTimeCalculator.nextTrigger(spec(7, 0), now, ny)!!
    assertEquals(LocalDateTime.of(2026, 10, 6, 7, 0), local(inPrague, prague))
    assertEquals(LocalDateTime.of(2026, 10, 5, 7, 0), local(inNy, ny))
    assertEquals(at(ny, 2026, 10, 5, 7, 0), inNy)
  }

  @Test
  fun weekdayIsEvaluatedInLocalZone() {
    // Monday-only alarm at 00:30. In Tokyo it is already Monday while in UTC it is Sunday.
    val tokyo = ZoneId.of("Asia/Tokyo")
    val now = ZonedDateTime.of(2026, 10, 4, 14, 0, 0, 0, ZoneOffset.UTC).toInstant().toEpochMilli() // Sun 23:00 Tokyo
    val next = AlarmTimeCalculator.nextTrigger(spec(0, 30, listOf(1)), now, tokyo)!!
    assertEquals(LocalDateTime.of(2026, 10, 5, 0, 30), local(next, tokyo))
  }

  @Test
  fun midnightAndEndOfDay() {
    val now = at(prague, 2026, 12, 31, 23, 59, 30)
    assertEquals(at(prague, 2027, 1, 1, 0, 0), AlarmTimeCalculator.nextTrigger(spec(0, 0), now, prague))
    assertEquals(at(prague, 2027, 1, 1, 23, 59), AlarmTimeCalculator.nextTrigger(spec(23, 59), now, prague))
  }

  @Test
  fun invalidInputReturnsNull() {
    val now = at(prague, 2026, 10, 5, 6, 0)
    assertNull(AlarmTimeCalculator.nextTrigger(spec(24, 0), now, prague))
    assertNull(AlarmTimeCalculator.nextTrigger(spec(7, 60), now, prague))
    assertNull(AlarmTimeCalculator.nextTrigger(spec(7, 0, listOf(0, 8)), now, prague))
  }
}
