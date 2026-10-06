package app.wakeify.alarm

import android.app.AlarmManager
import android.content.Context
import android.os.Build
import android.util.Log
import java.time.ZoneId

/**
 * Talks to AlarmManager. Every alarm id owns exactly one REGULAR PendingIntent
 * (next occurrence), at most one SNOOZE PendingIntent and at most one TEST one.
 *
 * Primary path: AlarmManager.setAlarmClock() — exact, exempt from Doze / App
 * Standby, shows the alarm icon in the status bar and the next alarm on the
 * lock screen. If the app may not schedule exact alarms (API 31/32 with the
 * SCHEDULE_EXACT_ALARM permission revoked; on 33+ USE_EXACT_ALARM is granted at
 * install) we still schedule an inexact alarm with a bounded window and report
 * `exact = false` — never silently drop an alarm.
 */
class AlarmScheduler(context: Context) {
  private val ctx: Context = context.applicationContext ?: context
  private val store = AlarmStore.get(ctx)
  private val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  data class Result(val id: String, val triggerAt: Long?, val exact: Boolean)

  fun canScheduleExact(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true

  /** Replace the whole alarm set (from JS) and reschedule everything. */
  fun sync(specs: List<AlarmSpec>, nowMillis: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): List<Result> {
    synchronized(LOCK) {
      val newIds = specs.map { it.id }.toSet()
      val oldIds = store.getSpecs().map { it.id }.toSet() + store.getScheduledTriggers().keys + store.getSnoozes().keys
      for (removed in oldIds - newIds) {
        cancel(FireKind.REGULAR, removed)
        cancel(FireKind.SNOOZE, removed)
        cancel(FireKind.TEST, removed)
        store.removeSnooze(removed)
      }
      store.setSpecs(specs)
      store.retainScheduledTriggers(newIds)
      // recoverMissed: an occurrence that is due but not delivered yet (inexact
      // window, pending post-boot recovery) must not be replaced by the next one.
      val results = specs.map { scheduleRegular(it, nowMillis, zone, recoverMissed = true) }
      store.setUsingInexactFallback(results.any { it.triggerAt != null && !it.exact })
      return results
    }
  }

  /**
   * Recompute and re-register every stored alarm + pending snooze. Called after
   * boot, app update, time / time-zone change and exact-alarm permission change.
   *
   * [recoverMissed]: after a reboot, an occurrence that should have fired while
   * the phone was off/booting (within [RECOVERY_WINDOW_MS]) and never fired is
   * rung a few seconds from now instead of being lost.
   */
  fun rescheduleAll(
    nowMillis: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault(),
    recoverMissed: Boolean = false
  ): List<Result> {
    synchronized(LOCK) {
      val results = store.getSpecs().map { scheduleRegular(it, nowMillis, zone, recoverMissed) }
      for ((id, t) in store.getSnoozes()) {
        when {
          t > nowMillis -> setAlarm(FireKind.SNOOZE, id, t, store.getSnoozeOrigin(id) ?: t, snoozeTriggerAt = t)
          recoverMissed && nowMillis - t <= RECOVERY_WINDOW_MS && store.getFired(snoozeFiredKey(id)) != t ->
            setAlarm(FireKind.SNOOZE, id, nowMillis + RECOVERY_DELAY_MS, store.getSnoozeOrigin(id) ?: t, snoozeTriggerAt = t)
          else -> store.removeSnooze(id)
        }
      }
      store.setUsingInexactFallback(results.any { it.triggerAt != null && !it.exact })
      return results
    }
  }

  fun scheduleRegular(spec: AlarmSpec, nowMillis: Long, zone: ZoneId, recoverMissed: Boolean): Result {
    synchronized(LOCK) {
      val lastFired = store.getFired(spec.id)
      if (recoverMissed) {
        val last = AlarmTimeCalculator.overdueOccurrence(
          spec, store.getScheduledTriggers()[spec.id], lastFired, nowMillis, zone, RECOVERY_WINDOW_MS
        )
        if (last != null) {
          Log.w(TAG, "Recovering missed occurrence of ${spec.id} scheduled for $last")
          val exact = setAlarm(FireKind.REGULAR, spec.id, nowMillis + RECOVERY_DELAY_MS, last)
          return Result(spec.id, nowMillis + RECOVERY_DELAY_MS, exact)
        }
      }
      // Never re-schedule the occurrence that already rang (clock set back).
      val next = AlarmTimeCalculator.nextTriggerAfterFired(spec, nowMillis, zone, lastFired)
      if (next == null) {
        cancel(FireKind.REGULAR, spec.id)
        store.setScheduledTrigger(spec.id, null)
        return Result(spec.id, null, true)
      }
      val exact = setAlarm(FireKind.REGULAR, spec.id, next, next)
      store.setScheduledTrigger(spec.id, next)
      return Result(spec.id, next, exact)
    }
  }

  fun scheduleSnooze(alarmId: String, triggerAt: Long): Boolean {
    synchronized(LOCK) {
      val origin = snoozeOrigin(alarmId, triggerAt)
      store.putSnooze(alarmId, triggerAt)
      store.putSnoozeOrigin(alarmId, origin)
      return setAlarm(FireKind.SNOOZE, alarmId, triggerAt, origin, snoozeTriggerAt = triggerAt)
    }
  }

  /**
   * Original occurrence a new snooze belongs to: the ring currently active for
   * this alarm (already the original one if it was itself a snooze), else the
   * last fired regular occurrence, else the snooze time itself.
   */
  private fun snoozeOrigin(alarmId: String, triggerAt: Long): Long {
    store.getActiveRing()?.let { if (it.alarmId == alarmId && !it.isTest) return it.scheduledFor }
    store.getSnoozeOrigin(alarmId)?.let { return it }
    store.getFired(alarmId)?.let { return it }
    return triggerAt
  }

  fun cancelSnooze(alarmId: String) {
    synchronized(LOCK) {
      cancel(FireKind.SNOOZE, alarmId)
      store.removeSnooze(alarmId)
    }
  }

  fun scheduleTestRing(alarmId: String, triggerAt: Long): Boolean = synchronized(LOCK) {
    setAlarm(FireKind.TEST, alarmId, triggerAt, triggerAt)
  }

  /**
   * Should a FIRE of this kind actually ring? Regular occurrences of alarms that
   * were deleted/disabled meanwhile are stale (their PendingIntent should have
   * been cancelled; this is defence in depth). Snoozes and test rings always ring.
   */
  fun shouldRing(alarmId: String, kind: FireKind): Boolean {
    if (kind != FireKind.REGULAR) return true
    val spec = store.getSpec(alarmId) ?: return false
    return spec.enabled
  }

  /**
   * Bookkeeping after an occurrence fired: schedule the next one.
   * [triggerAt]: the instant the snooze was set for (snooze bookkeeping is keyed by it).
   */
  fun onFired(
    alarmId: String,
    scheduledFor: Long,
    kind: FireKind,
    triggerAt: Long = scheduledFor,
    nowMillis: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault()
  ) {
    synchronized(LOCK) {
      when (kind) {
        FireKind.REGULAR -> {
          store.setFired(alarmId, scheduledFor)
          val spec = store.getSpec(alarmId) ?: return
          if (spec.isOneShot) {
            // One-shot: it has rung, disable it natively (JS must mirror this on next launch).
            store.updateSpec(spec.copy(enabled = false))
            cancel(FireKind.REGULAR, alarmId)
            store.setScheduledTrigger(alarmId, null)
          } else {
            scheduleRegular(spec, maxOf(nowMillis, scheduledFor), zone, recoverMissed = false)
          }
        }
        FireKind.SNOOZE -> {
          store.setFired(snoozeFiredKey(alarmId), triggerAt)
          // Only clear when it is still the same snooze (a newer one may have been set).
          if (store.getSnoozes()[alarmId] == triggerAt) store.removeSnooze(alarmId)
        }
        FireKind.TEST -> Unit
      }
    }
  }

  /** Returns true when the alarm was registered as an exact alarm clock. */
  private fun setAlarm(
    kind: FireKind,
    alarmId: String,
    triggerAt: Long,
    scheduledFor: Long,
    snoozeTriggerAt: Long = triggerAt
  ): Boolean {
    val op = AlarmIntents.firePendingIntent(ctx, kind, alarmId, scheduledFor, snoozeTriggerAt)
    if (canScheduleExact()) {
      try {
        am.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, AlarmIntents.showAppPendingIntent(ctx)), op)
        return true
      } catch (e: SecurityException) {
        Log.e(TAG, "setAlarmClock refused for $alarmId, falling back to inexact", e)
      }
    }
    Log.w(TAG, "Exact alarms not permitted; scheduling $alarmId (${kind.key}) inexactly")
    try {
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, op)
      return true
    } catch (e: SecurityException) {
      // Expected on API 31+ without exact-alarm permission.
    }
    try {
      // Bounded lateness (the system enforces >= 10 min windows on 31+).
      am.setWindow(AlarmManager.RTC_WAKEUP, triggerAt, INEXACT_WINDOW_MS, op)
    } catch (e: Exception) {
      Log.e(TAG, "setWindow failed for $alarmId, using set()", e)
      am.set(AlarmManager.RTC_WAKEUP, triggerAt, op)
    }
    return false
  }

  private fun cancel(kind: FireKind, alarmId: String) {
    val pi = AlarmIntents.existingFirePendingIntent(ctx, kind, alarmId) ?: return
    am.cancel(pi)
    pi.cancel()
  }

  companion object {
    private const val TAG = "WakeifyAlarmScheduler"
    const val RECOVERY_WINDOW_MS = 15 * 60_000L
    const val RECOVERY_DELAY_MS = 3_000L
    const val INEXACT_WINDOW_MS = 10 * 60_000L

    fun snoozeFiredKey(alarmId: String) = "snooze:$alarmId"

    /**
     * Process-wide lock: every caller (module thread, receivers on the main
     * thread) creates its own AlarmScheduler, so the former per-instance
     * @Synchronized did not serialise e.g. sync() against onFired().
     */
    private val LOCK = Any()
  }
}
