package app.wakeify.alarm

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** markOccurrenceHandled: when may the pending snooze be cancelled? */
class RingHandlingTest {
  private fun ring(id: String, isTest: Boolean = false, isSnooze: Boolean = false) =
    ActiveRing(id, startedAt = 1_000, scheduledFor = 900, isSnooze = isSnooze, usingFallbackSound = false, isTest = isTest)

  @Test
  fun realRingCompletionCancelsSnooze() {
    assertTrue(ActiveRing.handledCancelsSnooze("a", ring("a"), ring("a")))
    assertTrue(ActiveRing.handledCancelsSnooze("a", ring("a", isSnooze = true), null))
  }

  @Test
  fun finishingTestRingKeepsRealSnooze() {
    // Real ring of "a" snoozed, then a test ring of "a" is finished.
    assertFalse(ActiveRing.handledCancelsSnooze("a", ring("a", isTest = true), ring("a", isTest = true)))
    // Test ring already timed out (no active ring) — last ring of "a" was the test.
    assertFalse(ActiveRing.handledCancelsSnooze("a", null, ring("a", isTest = true)))
  }

  @Test
  fun otherAlarmsRingDoesNotDecide() {
    // Another alarm is ringing; "a" was last a real ring -> cancel a's snooze.
    assertTrue(ActiveRing.handledCancelsSnooze("a", ring("b", isTest = true), ring("a")))
    // Nothing known about "a" (e.g. data from an older version): old behaviour, cancel.
    assertTrue(ActiveRing.handledCancelsSnooze("a", null, null))
    assertTrue(ActiveRing.handledCancelsSnooze("a", ring("b"), ring("b", isTest = true)))
  }
}
