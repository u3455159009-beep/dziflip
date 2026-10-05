package app.wakeify.alarm

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

/** Kinds of FIRE pending intents; each kind has its own PendingIntent per alarm id. */
enum class FireKind(val key: String) {
  REGULAR("regular"),
  SNOOZE("snooze"),
  TEST("test");

  companion object {
    fun from(key: String?): FireKind = values().firstOrNull { it.key == key } ?: REGULAR
  }
}

object AlarmIntents {
  const val ACTION_FIRE = "app.wakeify.alarm.action.FIRE"
  const val ACTION_REPOST_NOTIFICATION = "app.wakeify.alarm.action.REPOST_NOTIFICATION"

  const val EXTRA_ALARM_ID = "alarmId"
  const val EXTRA_SCHEDULED_FOR = "scheduledFor"
  const val EXTRA_IS_SNOOZE = "isSnooze"
  const val EXTRA_IS_TEST = "isTest"
  /** Instant the PendingIntent was set for (differs from scheduledFor for snoozes / recovery). */
  const val EXTRA_TRIGGER_AT = "triggerAt"
  const val EXTRA_KIND = "kind"

  /** Extra put on the activity intent that opens the ring screen. */
  const val EXTRA_WAKEIFY_RING = "wakeify_ring"
  const val RING_URI_SCHEME = "wakeify"
  const val RING_URI_HOST = "ring"

  private const val PI_FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

  /** Stable across process restarts (String.hashCode is specified by the JLS). */
  fun requestCode(kind: FireKind, alarmId: String): Int = "${kind.key}:$alarmId".hashCode()

  /**
   * The data Uri makes Intent.filterEquals() distinct per (kind, id), so two
   * alarms never share/overwrite a PendingIntent even if request codes collide.
   */
  private fun fireIntent(context: Context, kind: FireKind, alarmId: String): Intent =
    Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      .setData(Uri.Builder().scheme("wakeify-alarm").authority(kind.key).appendPath(alarmId).build())

  /**
   * [scheduledFor] = the occurrence this ring belongs to (for a snooze: the ORIGINAL
   * occurrence, which JS uses to match the session); [triggerAt] = when it fires.
   */
  fun firePendingIntent(context: Context, kind: FireKind, alarmId: String, scheduledFor: Long, triggerAt: Long): PendingIntent {
    val intent = fireIntent(context, kind, alarmId)
      .putExtra(EXTRA_ALARM_ID, alarmId)
      .putExtra(EXTRA_SCHEDULED_FOR, scheduledFor)
      .putExtra(EXTRA_TRIGGER_AT, triggerAt)
      .putExtra(EXTRA_IS_SNOOZE, kind == FireKind.SNOOZE)
      .putExtra(EXTRA_IS_TEST, kind == FireKind.TEST)
      .putExtra(EXTRA_KIND, kind.key)
    return PendingIntent.getBroadcast(context, requestCode(kind, alarmId), intent, PI_FLAGS)
  }

  /** Existing FIRE PendingIntent, or null when none is registered. */
  fun existingFirePendingIntent(context: Context, kind: FireKind, alarmId: String): PendingIntent? =
    PendingIntent.getBroadcast(
      context, requestCode(kind, alarmId), fireIntent(context, kind, alarmId),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE
    )

  /** Plain launch intent of the host app (used for AlarmClockInfo.showIntent). */
  fun launchIntent(context: Context): Intent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: directBootSafeLaunchIntent(context)
    return launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  /**
   * getLaunchIntentForPackage() returns null in direct boot (before the first
   * unlock after a reboot) because the launcher activity is not directBootAware.
   * The old fallback was an implicit MAIN/LAUNCHER intent; once ringActivityIntent()
   * adds the wakeify://ring data it no longer matches the launcher filter, so the
   * ring notification's tap / full-screen intent resolved to nothing. Resolve the
   * launcher activity explicitly instead (works whether or not the user is unlocked).
   */
  private fun directBootSafeLaunchIntent(context: Context): Intent {
    val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.packageName)
    try {
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        PackageManager.MATCH_DIRECT_BOOT_AWARE or PackageManager.MATCH_DIRECT_BOOT_UNAWARE
      } else 0
      val info = context.packageManager.queryIntentActivities(main, flags).firstOrNull()?.activityInfo
      if (info != null) return Intent(main).setClassName(info.packageName, info.name).setPackage(null)
    } catch (_: Exception) {
    }
    return main
  }

  fun showAppPendingIntent(context: Context): PendingIntent =
    PendingIntent.getActivity(context, "show".hashCode(), launchIntent(context), PI_FLAGS)

  /** Intent that opens the app's ring screen: wakeify://ring?alarmId=<id>. */
  fun ringActivityIntent(context: Context, alarmId: String): Intent =
    launchIntent(context)
      .setData(Uri.Builder().scheme(RING_URI_SCHEME).authority(RING_URI_HOST).appendQueryParameter("alarmId", alarmId).build())
      .putExtra(EXTRA_WAKEIFY_RING, true)
      .putExtra(EXTRA_ALARM_ID, alarmId)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

  fun ringActivityPendingIntent(context: Context, alarmId: String): PendingIntent =
    PendingIntent.getActivity(context, "ring:$alarmId".hashCode(), ringActivityIntent(context, alarmId), PI_FLAGS)

  fun isRingIntent(intent: Intent?): Boolean {
    if (intent == null) return false
    if (intent.getBooleanExtra(EXTRA_WAKEIFY_RING, false)) return true
    val data = intent.data ?: return false
    return data.host == RING_URI_HOST && data.scheme != "http" && data.scheme != "https"
  }
}
