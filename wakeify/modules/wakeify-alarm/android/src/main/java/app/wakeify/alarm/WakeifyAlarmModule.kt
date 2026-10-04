package app.wakeify.alarm

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** JS `NativeAlarmSpec`. */
class NativeAlarmSpecRecord : Record {
  @Field val id: String = ""
  @Field val label: String = ""
  @Field val hour: Int = 0
  @Field val minute: Int = 0
  @Field val weekdays: List<Int> = emptyList()
  @Field val enabled: Boolean = true
  @Field val skipUntil: Double? = null
  @Field val soundUri: String? = null
  @Field val startOffsetMs: Double = 0.0
  @Field val volume: Double = 1.0
  @Field val fadeInSeconds: Double = 0.0
  @Field val vibrate: Boolean = true
  @Field val maxRingMinutes: Int = AlarmSpec.DEFAULT_MAX_RING_MINUTES
  @Field val backupRepeatMinutes: Int = 0
  @Field val backupCount: Int = 0

  fun toSpec(): AlarmSpec = AlarmSpec(
    id = id,
    label = label,
    hour = hour,
    minute = minute,
    weekdays = weekdays.distinct().sorted(),
    enabled = enabled,
    skipUntil = skipUntil?.toLong(),
    soundUri = soundUri?.takeIf { it.isNotBlank() },
    startOffsetMs = startOffsetMs.toLong(),
    volume = volume,
    fadeInSeconds = fadeInSeconds,
    vibrate = vibrate,
    maxRingMinutes = maxRingMinutes,
    backupRepeatMinutes = backupRepeatMinutes,
    backupCount = backupCount
  )
}

class InvalidAlarmSpecException(message: String) : CodedException("ERR_INVALID_ALARM_SPEC", message, null)

class WakeifyAlarmModule : Module() {

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is not available", null)

  private val ringListener = object : RingEvents.Listener {
    override fun onRingStarted(alarmId: String, scheduledFor: Long) {
      sendEvent("onRingStarted", mapOf("alarmId" to alarmId, "scheduledFor" to scheduledFor.toDouble()))
    }

    override fun onRingStopped(alarmId: String, scheduledFor: Long, reason: String) {
      sendEvent(
        "onRingStopped",
        mapOf("alarmId" to alarmId, "scheduledFor" to scheduledFor.toDouble(), "reason" to reason)
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("WakeifyAlarm")

    Events("onRingStarted", "onRingStopped")

    OnCreate {
      RingEvents.add(ringListener)
    }

    OnDestroy {
      RingEvents.remove(ringListener)
    }

    AsyncFunction("syncAlarms") { specs: List<NativeAlarmSpecRecord> ->
      val converted = specs.map { it.toSpec() }
      converted.forEach { s -> s.validationError()?.let { throw InvalidAlarmSpecException(it) } }
      val dupes = converted.groupBy { it.id }.filterValues { it.size > 1 }.keys
      if (dupes.isNotEmpty()) throw InvalidAlarmSpecException("Duplicate alarm ids: $dupes")
      AlarmScheduler(context).sync(converted).map {
        mapOf("id" to it.id, "triggerAt" to it.triggerAt?.toDouble(), "exact" to it.exact)
      }
    }

    AsyncFunction("scheduleSnooze") { alarmId: String, triggerAt: Double ->
      AlarmScheduler(context).scheduleSnooze(alarmId, triggerAt.toLong())
      Unit
    }

    AsyncFunction("cancelSnooze") { alarmId: String ->
      AlarmScheduler(context).cancelSnooze(alarmId)
    }

    AsyncFunction("stopRinging") {
      AlarmRingService.stop(context, RingEvents.REASON_DISMISSED)
    }

    AsyncFunction("getActiveRing") {
      activeRingMap()
    }

    AsyncFunction("markOccurrenceHandled") { alarmId: String ->
      val ctx = context
      AlarmRingService.stop(ctx, RingEvents.REASON_DISMISSED, onlyAlarmId = alarmId)
      AlarmScheduler(ctx).cancelSnooze(alarmId)
    }

    Function("setShowOverLockScreen") { show: Boolean ->
      val activity = appContext.currentActivity
      if (activity == null) {
        Log.w(TAG, "setShowOverLockScreen($show): no current activity")
      } else {
        LockScreenHelper.apply(activity, show)
      }
    }

    AsyncFunction("getPermissionStatus") {
      permissionStatus()
    }

    AsyncFunction("requestPermission") { kind: String, promise: Promise ->
      requestPermission(kind, promise)
    }

    AsyncFunction("prepareSystemSound") { uri: String, _: Double ->
      // Android plays the original file directly from the ring service.
      uri
    }

    AsyncFunction("scheduleTestRing") { alarmId: String, seconds: Double ->
      val delayMs = (seconds.coerceAtLeast(0.0) * 1000).toLong()
      AlarmScheduler(context).scheduleTestRing(alarmId, System.currentTimeMillis() + delayMs)
      Unit
    }
  }

  // ---- active ring ----------------------------------------------------------

  private fun activeRingMap(): Map<String, Any?>? {
    val store = AlarmStore.get(context)
    val ring = store.getActiveRing() ?: return null
    if (!AlarmRingService.isRunning()) {
      // Service is not alive (process was killed and not yet restarted). Keep
      // reporting the ring (so JS shows the challenge) unless it is long expired.
      val maxMs = (store.getSpec(ring.alarmId)?.safeMaxRingMinutes ?: AlarmSpec.DEFAULT_MAX_RING_MINUTES) * 60_000L
      if (System.currentTimeMillis() - ring.startedAt > maxMs + 60_000L) {
        store.setActiveRing(null)
        return null
      }
    }
    return mapOf(
      "alarmId" to ring.alarmId,
      "startedAt" to ring.startedAt.toDouble(),
      "scheduledFor" to ring.scheduledFor.toDouble(),
      "isSnooze" to ring.isSnooze,
      "usingFallbackSound" to ring.usingFallbackSound
    )
  }

  // ---- permissions ----------------------------------------------------------

  private fun exactAlarmState(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return GRANTED
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return if (am.canScheduleExactAlarms()) GRANTED else DENIED
  }

  private fun notificationState(): String {
    val ctx = context
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
      if (granted) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return if (nm.areNotificationsEnabled()) GRANTED else DENIED
      }
      return if (AlarmStore.get(ctx).wasNotificationPermissionRequested()) DENIED else NOT_DETERMINED
    }
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return if (nm.areNotificationsEnabled()) GRANTED else DENIED
  }

  private fun fullScreenIntentState(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return GRANTED
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return if (nm.canUseFullScreenIntent()) GRANTED else DENIED
  }

  private fun batteryState(): String {
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return if (pm.isIgnoringBatteryOptimizations(context.packageName)) GRANTED else DENIED
  }

  private fun permissionStatus(): Map<String, Any?> = mapOf(
    "platform" to "android",
    "exactAlarms" to exactAlarmState(),
    "notifications" to notificationState(),
    "fullScreenIntent" to fullScreenIntentState(),
    "batteryOptimizationIgnored" to batteryState(),
    "alarmKit" to UNSUPPORTED,
    "engine" to "android-alarmmanager"
  )

  private fun requestPermission(kind: String, promise: Promise) {
    val ctx = context
    val pkgUri = Uri.parse("package:${ctx.packageName}")
    when (kind) {
      "exactAlarms" -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && exactAlarmState() != GRANTED) {
          openSettings(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkgUri), appSettingsIntent())
        }
        promise.resolve(exactAlarmState())
      }
      "notifications" -> requestNotifications(promise)
      "fullScreenIntent" -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && fullScreenIntentState() != GRANTED) {
          openSettings(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkgUri), notificationSettingsIntent())
        }
        promise.resolve(fullScreenIntentState())
      }
      "batteryOptimization" -> {
        if (batteryState() != GRANTED) {
          @Suppress("BatteryLife")
          val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri)
          openSettings(direct, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
        promise.resolve(batteryState())
      }
      "alarmKit" -> promise.resolve(UNSUPPORTED)
      else -> promise.reject("ERR_UNKNOWN_PERMISSION", "Unknown permission kind: $kind", null)
    }
  }

  private fun requestNotifications(promise: Promise) {
    val current = notificationState()
    if (current == GRANTED) {
      promise.resolve(current)
      return
    }
    val permissions = appContext.permissions
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && permissions != null &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      AlarmStore.get(context).setNotificationPermissionRequested()
      try {
        permissions.askForPermissions(PermissionsResponseListener { result ->
          val r = result[Manifest.permission.POST_NOTIFICATIONS]
          if (r != null && r.status != PermissionsStatus.GRANTED && !r.canAskAgain) {
            // Permanently denied: the dialog will not show again — open settings.
            openSettings(notificationSettingsIntent(), appSettingsIntent())
          }
          promise.resolve(notificationState())
        }, Manifest.permission.POST_NOTIFICATIONS)
      } catch (e: Exception) {
        Log.w(TAG, "Runtime notification request failed, opening settings", e)
        openSettings(notificationSettingsIntent(), appSettingsIntent())
        promise.resolve(notificationState())
      }
      return
    }
    // Pre-13, or permission granted but notifications switched off by the user.
    openSettings(notificationSettingsIntent(), appSettingsIntent())
    promise.resolve(notificationState())
  }

  private fun notificationSettingsIntent(): Intent =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    } else {
      appSettingsIntent()
    }

  private fun appSettingsIntent(): Intent =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))

  /** Starts [primary], falling back to [fallback] when no activity handles it. */
  private fun openSettings(primary: Intent, fallback: Intent) {
    val activity: Activity? = appContext.currentActivity
    for (intent in listOf(primary, fallback)) {
      try {
        if (activity != null) {
          activity.startActivity(intent)
        } else {
          context.startActivity(Intent(intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        return
      } catch (e: Exception) {
        Log.w(TAG, "Could not open ${intent.action}", e)
      }
    }
  }

  companion object {
    private const val TAG = "WakeifyAlarmModule"
    private const val GRANTED = "granted"
    private const val DENIED = "denied"
    private const val NOT_DETERMINED = "notDetermined"
    private const val UNSUPPORTED = "unsupported"
  }
}
