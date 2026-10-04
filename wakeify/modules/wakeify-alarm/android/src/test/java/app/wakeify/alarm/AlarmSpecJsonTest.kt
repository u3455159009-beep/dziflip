package app.wakeify.alarm

import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AlarmSpecJsonTest {
  private val full = AlarmSpec(
    id = "3f2a6c1e-1111-4a5b-9c9d-abcdefabcdef",
    label = "Práce – \"ranní\" budík",
    hour = 6,
    minute = 45,
    weekdays = listOf(1, 3, 5),
    enabled = true,
    skipUntil = 1_790_000_000_123L,
    soundUri = "file:///data/user/0/app.wakeify/files/tracks/song%20one.mp3",
    startOffsetMs = 42_500L,
    volume = 0.8,
    fadeInSeconds = 30.0,
    vibrate = false,
    maxRingMinutes = 20,
    backupRepeatMinutes = 5,
    backupCount = 3
  )

  @Test
  fun roundTripFull() {
    val back = AlarmSpec.fromJson(JSONObject(full.toJson().toString()))
    assertEquals(full, back)
  }

  @Test
  fun roundTripNullsAndOneShot() {
    val s = full.copy(weekdays = emptyList(), skipUntil = null, soundUri = null, enabled = false)
    val back = AlarmSpec.fromJson(JSONObject(s.toJson().toString()))
    assertEquals(s, back)
    assertNull(back.skipUntil)
    assertNull(back.soundUri)
    assertTrue(back.isOneShot)
  }

  @Test
  fun listRoundTrip() {
    val list = listOf(full, full.copy(id = "b", weekdays = emptyList(), soundUri = null))
    assertEquals(list, AlarmSpec.listFromJson(AlarmSpec.listToJson(list)))
    assertEquals(emptyList<AlarmSpec>(), AlarmSpec.listFromJson(null))
    assertEquals(emptyList<AlarmSpec>(), AlarmSpec.listFromJson(AlarmSpec.listToJson(emptyList())))
  }

  @Test
  fun missingOptionalFieldsGetDefaults() {
    val s = AlarmSpec.fromJson(JSONObject("""{"id":"x","hour":7,"minute":5}"""))
    assertEquals("x", s.id)
    assertTrue(s.enabled)
    assertTrue(s.isOneShot)
    assertEquals(1.0, s.volume)
    assertEquals(AlarmSpec.DEFAULT_MAX_RING_MINUTES, s.maxRingMinutes)
    assertNull(s.skipUntil)
  }

  @Test
  fun activeRingRoundTrip() {
    val r = ActiveRing("a", 1_790_000_000_000L, 1_789_999_990_000L, isSnooze = true, usingFallbackSound = true)
    assertEquals(r, ActiveRing.fromJson(JSONObject(r.toJson().toString())))
  }

  @Test
  fun validation() {
    assertNull(full.validationError())
    assertNotNull(full.copy(hour = 24).validationError())
    assertNotNull(full.copy(minute = -1).validationError())
    assertNotNull(full.copy(weekdays = listOf(0)).validationError())
    assertNotNull(full.copy(id = " ").validationError())
    assertFalse(full.isOneShot)
  }

  @Test
  fun safeValuesClamp() {
    val s = full.copy(volume = 3.0, fadeInSeconds = -5.0, maxRingMinutes = 0, startOffsetMs = -10)
    assertEquals(1.0, s.safeVolume)
    assertEquals(0.0, s.safeFadeInSeconds)
    assertEquals(AlarmSpec.DEFAULT_MAX_RING_MINUTES, s.safeMaxRingMinutes)
    assertEquals(0L, s.safeStartOffsetMs)
  }
}
