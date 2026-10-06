package app.wakeify.alarm

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** Rescheduling rules used by AlarmScheduler (sync / boot / time change / after a fire). */
class RescheduleRulesTest {
  private val prague = ZoneId.of("Europe/Prague")
  private val window = AlarmScheduler.RECOVERY_WINDOW_MS

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

  private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int = 0): Long =
    ZonedDateTime.of(y, mo, d, h, mi, s, 0, prague).toInstant().toEpochMilli()

  private val daily = listOf(1, 2, 3, 4, 5, 6, 7)

  // ---- clock set back after the alarm rang --------------------------------

  @Test
  fun clockSetBackDoesNotRescheduleTheOccurrenceThatAlreadyRang() {
    val fired = at(2026, 10, 5, 7, 0)
    val now = at(2026, 10, 5, 6, 50) // clock moved back 10+ minutes after the ring
    // Plain nextTrigger would return today's 07:00 again -> double ring.
    assertEquals(fired, AlarmTimeCalculator.nextTrigger(spec(7, 0, daily), now, prague))
    assertEquals(at(2026, 10, 6, 7, 0), AlarmTimeCalculator.nextTriggerAfterFired(spec(7, 0, daily), now, prague, fired))
  }

  @Test
  fun editedTimeStillRingsTodayAfterClockSetBack() {
    val fired = at(2026, 10, 5, 7, 0)
    val now = at(2026, 10, 5, 6, 50)
    // User moved the alarm to 06:55: a different occurrence, it must ring today.
    assertEquals(at(2026, 10, 5, 6, 55), AlarmTimeCalculator.nextTriggerAfterFired(spec(6, 55, daily), now, prague, fired))
  }

  @Test
  fun nextTriggerAfterFiredIsPlainNextTriggerNormally() {
    val now = at(2026, 10, 5, 6, 0)
    val s = spec(7, 0, daily)
    assertEquals(AlarmTimeCalculator.nextTrigger(s, now, prague), AlarmTimeCalculator.nextTriggerAfterFired(s, now, prague, null))
    assertEquals(
      AlarmTimeCalculator.nextTrigger(s, now, prague),
      AlarmTimeCalculator.nextTriggerAfterFired(s, now, prague, at(2026, 10, 4, 7, 0))
    )
    assertNull(AlarmTimeCalculator.nextTriggerAfterFired(spec(7, 0, enabled = false), now, prague, null))
  }

  // ---- due / overdue occurrence that never fired --------------------------

  @Test
  fun overdueOccurrenceAfterRebootIsRecovered() {
    val last = at(2026, 10, 5, 7, 0)
    val now = at(2026, 10, 5, 7, 5)
    assertEquals(last, AlarmTimeCalculator.overdueOccurrence(spec(7, 0, daily), last, null, now, prague, window))
    assertEquals(last, AlarmTimeCalculator.overdueOccurrence(spec(7, 0), last, at(2026, 10, 4, 7, 0), now, prague, window))
  }

  @Test
  fun occurrenceThatAlreadyFiredIsNotRecoveredAgain() {
    val last = at(2026, 10, 5, 7, 0)
    assertNull(AlarmTimeCalculator.overdueOccurrence(spec(7, 0, daily), last, last, at(2026, 10, 5, 7, 5), prague, window))
  }

  @Test
  fun tooOldOrFutureOccurrenceIsNotRecovered() {
    val last = at(2026, 10, 5, 7, 0)
    assertNull(AlarmTimeCalculator.overdueOccurrence(spec(7, 0, daily), last, null, last + window + 1, prague, window))
    assertNull(AlarmTimeCalculator.overdueOccurrence(spec(7, 0, daily), last, null, last - 1, prague, window))
    assertNull(AlarmTimeCalculator.overdueOccurrence(spec(7, 0, daily), null, null, last, prague, window))
    assertEquals(last, AlarmTimeCalculator.overdueOccurrence(spec(7, 0, daily), last, null, last, prague, window))
  }

  @Test
  fun editedDisabledOrSkippedRuleIsNotRecovered() {
    val last = at(2026, 10, 5, 7, 0)
    val now = at(2026, 10, 5, 7, 5)
    // time changed by the user
    assertNull(AlarmTimeCalculator.overdueOccurrence(spec(7, 1, daily), last, null, now, prague, window))
    // disabled (incl. a one-shot the native side disabled after it rang)
    assertNull(AlarmTimeCalculator.overdueOccurrence(spec(7, 0, enabled = false), last, null, now, prague, window))
    // "skip next" covering that occurrence
    assertNull(AlarmTimeCalculator.overdueOccurrence(spec(7, 0, daily, skipUntil = last + 1), last, null, now, prague, window))
    // weekday removed (2026-10-05 is a Monday)
    assertNull(AlarmTimeCalculator.overdueOccurrence(spec(7, 0, listOf(2, 3)), last, null, now, prague, window))
  }

  @Test
  fun overdueOccurrenceOnDstFallBackUsesFirstInstant() {
    // 2026-10-25 02:30 Europe/Prague happens twice; the alarm uses the earlier one.
    val first = AlarmTimeCalculator.nextTrigger(spec(2, 30, daily), at(2026, 10, 25, 1, 0), prague)!!
    assertEquals(first, AlarmTimeCalculator.overdueOccurrence(spec(2, 30, daily), first, null, first + 60_000, prague, window))
  }
}
