package app.wakeify.alarm

import org.json.JSONArray
import org.json.JSONObject

/**
 * Native mirror of `NativeAlarmSpec` (src/WakeifyAlarm.types.ts).
 *
 * Framework-only (org.json) so it can be used from the BroadcastReceiver /
 * Service without the JS runtime and compiled against a plain android.jar.
 */
data class AlarmSpec(
  val id: String,
  val label: String,
  val hour: Int,
  val minute: Int,
  /** ISO weekdays 1 = Monday … 7 = Sunday. Empty = one-shot. */
  val weekdays: List<Int>,
  val enabled: Boolean,
  /** Epoch ms; occurrences strictly before this instant are skipped. */
  val skipUntil: Long?,
  /** file:// (or content://) URI of the track, null = system alarm tone. */
  val soundUri: String?,
  val startOffsetMs: Long,
  /** 0..1 fraction of STREAM_ALARM max volume. */
  val volume: Double,
  val fadeInSeconds: Double,
  val vibrate: Boolean,
  val maxRingMinutes: Int,
  val backupRepeatMinutes: Int,
  val backupCount: Int
) {
  val isOneShot: Boolean get() = weekdays.isEmpty()

  /** Returns a human readable problem, or null when the spec is valid. */
  fun validationError(): String? {
    if (id.isBlank()) return "id must not be empty"
    if (hour !in 0..23) return "hour must be 0..23 (got $hour) for alarm $id"
    if (minute !in 0..59) return "minute must be 0..59 (got $minute) for alarm $id"
    val bad = weekdays.firstOrNull { it !in 1..7 }
    if (bad != null) return "weekday must be 1..7 (got $bad) for alarm $id"
    return null
  }

  /** Values clamped into safe ranges (used by the ring service). */
  val safeVolume: Double get() = if (volume.isNaN()) 1.0 else volume.coerceIn(0.0, 1.0)
  val safeFadeInSeconds: Double get() = if (fadeInSeconds.isNaN()) 0.0 else fadeInSeconds.coerceIn(0.0, 600.0)
  val safeMaxRingMinutes: Int get() = if (maxRingMinutes <= 0) DEFAULT_MAX_RING_MINUTES else maxRingMinutes.coerceAtMost(120)
  val safeStartOffsetMs: Long get() = if (startOffsetMs < 0) 0 else startOffsetMs

  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("label", label)
    put("hour", hour)
    put("minute", minute)
    put("weekdays", JSONArray().also { arr -> weekdays.forEach { arr.put(it) } })
    put("enabled", enabled)
    put("skipUntil", skipUntil ?: JSONObject.NULL)
    put("soundUri", soundUri ?: JSONObject.NULL)
    put("startOffsetMs", startOffsetMs)
    put("volume", volume)
    put("fadeInSeconds", fadeInSeconds)
    put("vibrate", vibrate)
    put("maxRingMinutes", maxRingMinutes)
    put("backupRepeatMinutes", backupRepeatMinutes)
    put("backupCount", backupCount)
  }

  companion object {
    const val DEFAULT_MAX_RING_MINUTES = 15

    fun fromJson(o: JSONObject): AlarmSpec {
      val days = o.optJSONArray("weekdays")
      val weekdays = ArrayList<Int>()
      if (days != null) for (i in 0 until days.length()) weekdays.add(days.getInt(i))
      return AlarmSpec(
        id = o.getString("id"),
        label = o.optString("label", ""),
        hour = o.getInt("hour"),
        minute = o.getInt("minute"),
        weekdays = weekdays,
        enabled = o.optBoolean("enabled", true),
        skipUntil = if (o.isNull("skipUntil")) null else o.getLong("skipUntil"),
        soundUri = if (o.isNull("soundUri")) null else o.getString("soundUri"),
        startOffsetMs = o.optLong("startOffsetMs", 0L),
        volume = o.optDouble("volume", 1.0),
        fadeInSeconds = o.optDouble("fadeInSeconds", 0.0),
        vibrate = o.optBoolean("vibrate", true),
        maxRingMinutes = o.optInt("maxRingMinutes", DEFAULT_MAX_RING_MINUTES),
        backupRepeatMinutes = o.optInt("backupRepeatMinutes", 0),
        backupCount = o.optInt("backupCount", 0)
      )
    }

    fun listToJson(specs: List<AlarmSpec>): String =
      JSONArray().also { arr -> specs.forEach { arr.put(it.toJson()) } }.toString()

    fun listFromJson(json: String?): List<AlarmSpec> {
      if (json.isNullOrEmpty()) return emptyList()
      val arr = JSONArray(json)
      val out = ArrayList<AlarmSpec>(arr.length())
      for (i in 0 until arr.length()) out.add(fromJson(arr.getJSONObject(i)))
      return out
    }

    /**
     * Spec used when a snooze / test ring fires for an alarm id that is no
     * longer stored: still ring (system tone, sane defaults) rather than drop it.
     */
    fun fallback(id: String): AlarmSpec = AlarmSpec(
      id = id, label = "Alarm", hour = 0, minute = 0, weekdays = emptyList(), enabled = false,
      skipUntil = null, soundUri = null, startOffsetMs = 0, volume = 1.0, fadeInSeconds = 0.0,
      vibrate = true, maxRingMinutes = DEFAULT_MAX_RING_MINUTES, backupRepeatMinutes = 0, backupCount = 0
    )
  }
}

/** Native mirror of `ActiveRing`. */
data class ActiveRing(
  val alarmId: String,
  val startedAt: Long,
  val scheduledFor: Long,
  val isSnooze: Boolean,
  val usingFallbackSound: Boolean,
  /** Ring started by scheduleTestRing (FireKind.TEST). */
  val isTest: Boolean = false
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("alarmId", alarmId)
    put("startedAt", startedAt)
    put("scheduledFor", scheduledFor)
    put("isSnooze", isSnooze)
    put("usingFallbackSound", usingFallbackSound)
    put("isTest", isTest)
  }

  companion object {
    fun fromJson(o: JSONObject): ActiveRing = ActiveRing(
      alarmId = o.getString("alarmId"),
      startedAt = o.getLong("startedAt"),
      scheduledFor = o.getLong("scheduledFor"),
      isSnooze = o.optBoolean("isSnooze", false),
      usingFallbackSound = o.optBoolean("usingFallbackSound", false),
      isTest = o.optBoolean("isTest", false) // missing in data written by older versions
    )
  }
}
