package app.wakeify.alarm

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.time.ZoneId
import java.util.TimeZone

/**
 * Entry point for every alarm-related broadcast. Works without the JS runtime
 * and in direct-boot mode (directBootAware in the manifest; state lives in
 * device-protected storage).
 */
open class AlarmReceiver : BroadcastReceiver() {

  /**
   * FIRE / REPOST come only from our own PendingIntents. The exported
   * [AlarmSystemReceiver] (system broadcasts) refuses them, so other apps
   * cannot make an alarm ring by sending an explicit intent.
   */
  protected open val acceptsInternalActions: Boolean = true

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    Log.i(TAG, "onReceive $action")
    val internal = action == AlarmIntents.ACTION_FIRE || action == AlarmIntents.ACTION_REPOST_NOTIFICATION
    if (internal && !acceptsInternalActions) {
      Log.w(TAG, "Rejecting $action on exported receiver")
      return
    }
    try {
      when (action) {
        AlarmIntents.ACTION_FIRE -> handleFire(context, intent)
        AlarmIntents.ACTION_REPOST_NOTIFICATION -> AlarmRingService.repostNotificationIfRinging(context)
        Intent.ACTION_BOOT_COMPLETED,
        Intent.ACTION_LOCKED_BOOT_COMPLETED,
        ACTION_QUICKBOOT_POWERON,
        ACTION_HTC_QUICKBOOT_POWERON ->
          AlarmScheduler(context).rescheduleAll(zone = currentZone(null), recoverMissed = true)
        Intent.ACTION_MY_PACKAGE_REPLACED ->
          AlarmScheduler(context).rescheduleAll(zone = currentZone(null), recoverMissed = true)
        Intent.ACTION_TIME_CHANGED,
        Intent.ACTION_TIMEZONE_CHANGED,
        AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED ->
          // recoverMissed: network time often sets the clock right after boot; without it
          // this would replace the pending post-boot recovery ring with the next occurrence.
          // Only an occurrence the rule still produces and that never fired is re-rung.
          AlarmScheduler(context).rescheduleAll(zone = currentZone(intent), recoverMissed = true)
      }
    } catch (e: Exception) {
      // Never crash the receiver: a crash here would lose every later alarm.
      Log.e(TAG, "Failed to handle $action", e)
    }
  }

  private fun handleFire(context: Context, intent: Intent) {
    val alarmId = intent.getStringExtra(AlarmIntents.EXTRA_ALARM_ID) ?: return
    val scheduledFor = intent.getLongExtra(AlarmIntents.EXTRA_SCHEDULED_FOR, System.currentTimeMillis())
    val triggerAt = intent.getLongExtra(AlarmIntents.EXTRA_TRIGGER_AT, scheduledFor)
    val kind = FireKind.from(intent.getStringExtra(AlarmIntents.EXTRA_KIND))
    val scheduler = AlarmScheduler(context)
    val ring = scheduler.shouldRing(alarmId, kind)
    if (ring) {
      // Start ringing first — rescheduling must never delay or prevent the ring.
      try {
        AlarmRingService.start(context, alarmId, scheduledFor, kind == FireKind.SNOOZE, kind == FireKind.TEST)
      } catch (e: Exception) {
        Log.e(TAG, "Could not start ring service for $alarmId", e)
        AlarmRingService.postFallbackNotification(context, alarmId, scheduledFor, kind == FireKind.SNOOZE, kind == FireKind.TEST)
      }
    } else {
      Log.w(TAG, "Ignoring stale FIRE for $alarmId (deleted or disabled)")
    }
    scheduler.onFired(alarmId, scheduledFor, kind, triggerAt, zone = currentZone(null))
  }

  private fun currentZone(intent: Intent?): ZoneId {
    // TIMEZONE_CHANGED carries the new zone id; also drop the JVM's cached default.
    val fromIntent = intent?.getStringExtra(EXTRA_TIME_ZONE)
    if (fromIntent != null) {
      try {
        return ZoneId.of(fromIntent)
      } catch (_: Exception) {
      }
    }
    if (intent?.action == Intent.ACTION_TIMEZONE_CHANGED) TimeZone.setDefault(null)
    return ZoneId.systemDefault()
  }

  companion object {
    private const val TAG = "WakeifyAlarmReceiver"
    private const val EXTRA_TIME_ZONE = "time-zone" // Intent.EXTRA_TIMEZONE (API 30+ constant)
    private const val ACTION_QUICKBOOT_POWERON = "android.intent.action.QUICKBOOT_POWERON"
    private const val ACTION_HTC_QUICKBOOT_POWERON = "com.htc.intent.action.QUICKBOOT_POWERON"
  }
}

/** Exported twin of [AlarmReceiver] that only handles system broadcasts (boot, time, permission). */
class AlarmSystemReceiver : AlarmReceiver() {
  override val acceptsInternalActions: Boolean = false
}
