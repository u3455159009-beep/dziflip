package app.wakeify.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import java.io.File
import kotlin.math.roundToInt

/**
 * Foreground service (type mediaPlayback) that makes the noise.
 *
 * Lifecycle: AlarmReceiver -> start() -> startForeground() + play. It keeps
 * ringing until stop() (user solved the challenge in-app), the maxRingMinutes
 * safety timeout, or a newer alarm replaces it. There is intentionally no
 * stop/dismiss action in the notification.
 *
 * Backup re-alarms (backupRepeatMinutes/backupCount) are NOT used on Android:
 * the ring cannot be silenced outside the app, it continues until stopRinging.
 * After a timeout nothing further is scheduled (the occurrence counts as missed).
 */
class AlarmRingService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var store: AlarmStore
  private lateinit var audioManager: AudioManager

  private var current: ActiveRing? = null
  private var currentSpec: AlarmSpec? = null
  private var player: MediaPlayer? = null
  private var toneGenerator: ToneGenerator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var vibrator: Vibrator? = null
  private var focusRequest: AudioFocusRequest? = null
  private var focusListener: AudioManager.OnAudioFocusChangeListener? = null

  private var fadeStartElapsed = 0L
  private var pausedForFocusLoss = false
  private var ducked = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    store = AlarmStore.get(this)
    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val alarmId = intent?.getStringExtra(AlarmIntents.EXTRA_ALARM_ID)
    if (intent?.action != ACTION_START || alarmId == null) {
      if (current == null) {
        // Must still satisfy the startForeground contract before stopping.
        startForegroundCompat(buildNotification(alarmId ?: "", "Alarm"))
        stopSelfCleanly()
      }
      return START_NOT_STICKY
    }
    val scheduledFor = intent.getLongExtra(AlarmIntents.EXTRA_SCHEDULED_FOR, System.currentTimeMillis())
    val isSnooze = intent.getBooleanExtra(AlarmIntents.EXTRA_IS_SNOOZE, false)
    val spec = store.getSpec(alarmId) ?: AlarmSpec.fallback(alarmId)

    // Call startForeground immediately (5 s deadline), before any slow work.
    startForegroundCompat(buildNotification(alarmId, spec.label))

    val persisted = store.getActiveRing()
    val isRedelivery = (flags and START_FLAG_REDELIVERY) != 0
    val sameRing = current?.let { it.alarmId == alarmId && it.scheduledFor == scheduledFor } ?: false
    if (sameRing) return START_REDELIVER_INTENT // duplicate start for the ring already playing

    current?.let { old ->
      // A second alarm fired while ringing: replace the current ring.
      teardownPlayback()
      RingEvents.emitStopped(old.alarmId, old.scheduledFor, RingEvents.REASON_SYSTEM)
    }

    // Process was killed and the system redelivered the start intent: resume the
    // persisted ring (keep startedAt so the timeout still counts from the start).
    val resume = persisted != null && isRedelivery && persisted.alarmId == alarmId && persisted.scheduledFor == scheduledFor
    if (isRedelivery && !resume) {
      // The ring was stopped/handled while our process was dead: do not ring again.
      // stopSelf(startId) only stops if no newer start command is pending.
      if (current == null) stopSelf(startId)
      return START_NOT_STICKY
    }
    val startedAt = if (resume) persisted!!.startedAt else System.currentTimeMillis()
    val elapsedMs = System.currentTimeMillis() - startedAt
    val maxMs = spec.safeMaxRingMinutes * 60_000L
    if (resume && elapsedMs >= maxMs) {
      store.setActiveRing(null)
      restoreAlarmVolume()
      stopSelfCleanly()
      return START_NOT_STICKY
    }

    currentSpec = spec
    acquireWakeLock(maxMs - elapsedMs + 10_000L)
    raiseAlarmVolume(spec.safeVolume)
    requestAudioFocus()
    val usingFallback = startPlayback(spec)
    if (spec.vibrate) startVibration()

    val ring = ActiveRing(alarmId, startedAt, scheduledFor, isSnooze, usingFallback)
    current = ring
    store.setActiveRing(ring)
    handler.removeCallbacks(timeoutRunnable)
    handler.postDelayed(timeoutRunnable, maxMs - elapsedMs)
    if (!resume) RingEvents.emitStarted(alarmId, scheduledFor)
    // Redeliver: if the process dies while ringing the system restarts us with the same intent.
    return START_REDELIVER_INTENT
  }

  override fun onDestroy() {
    val ring = current
    if (ring != null) {
      // Destroyed while still ringing (not via stopRing): report it.
      teardownPlayback()
      restoreAlarmVolume()
      store.setActiveRing(null)
      RingEvents.emitStopped(ring.alarmId, ring.scheduledFor, RingEvents.REASON_SYSTEM)
      current = null
    }
    handler.removeCallbacksAndMessages(null)
    if (instance === this) instance = null
    super.onDestroy()
  }

  // ---- stop ---------------------------------------------------------------

  private val timeoutRunnable = Runnable { stopRing(RingEvents.REASON_TIMEOUT) }

  /** Main thread only. */
  fun stopRing(reason: String) {
    val ring = current
    teardownPlayback()
    restoreAlarmVolume()
    current = null
    currentSpec = null
    store.setActiveRing(null)
    handler.removeCallbacks(timeoutRunnable)
    if (ring != null) RingEvents.emitStopped(ring.alarmId, ring.scheduledFor, reason)
    stopSelfCleanly()
  }

  private fun stopSelfCleanly() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(Service.STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun teardownPlayback() {
    handler.removeCallbacks(volumeRunnable)
    handler.removeCallbacks(toneRunnable)
    player?.let {
      try {
        it.stop()
      } catch (_: Exception) {
      }
      it.release()
    }
    player = null
    toneGenerator?.release()
    toneGenerator = null
    try {
      vibrator?.cancel()
    } catch (_: Exception) {
    }
    vibrator = null
    abandonAudioFocus()
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    pausedForFocusLoss = false
    ducked = false
  }

  // ---- audio --------------------------------------------------------------

  private val alarmAttributes: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
    .build()

  /** @return true when the fallback (system) sound is used. */
  private fun startPlayback(spec: AlarmSpec): Boolean {
    val uri = spec.soundUri
    if (uri != null) {
      try {
        player = createUserTrackPlayer(uri, spec.safeStartOffsetMs)
        startFade(spec.safeFadeInSeconds)
        return false
      } catch (e: Exception) {
        Log.w(TAG, "User track unavailable ($uri), using system alarm tone", e)
        player?.release()
        player = null
      }
    }
    startFallbackSound(spec.safeFadeInSeconds)
    // soundUri == null means the user chose the system tone: not a "fallback".
    return uri != null
  }

  private fun newPlayer(): MediaPlayer = MediaPlayer().apply {
    setAudioAttributes(alarmAttributes)
    setWakeMode(this@AlarmRingService, PowerManager.PARTIAL_WAKE_LOCK)
    isLooping = true
  }

  private fun createUserTrackPlayer(uriString: String, startOffsetMs: Long): MediaPlayer {
    val mp = newPlayer()
    try {
      val uri = Uri.parse(uriString)
      when (uri.scheme) {
        null, "", "file" -> {
          val path = uri.path ?: uriString
          val file = File(path)
          // Fails in direct-boot (credential storage locked), when deleted, or unreadable.
          if (!file.isFile || !file.canRead()) throw IllegalStateException("Track not readable: $path")
          mp.setDataSource(file.absolutePath)
        }
        else -> mp.setDataSource(this, uri)
      }
      mp.prepare()
      val duration = mp.duration
      val offset = if (duration <= 0 || startOffsetMs >= duration) 0 else startOffsetMs.toInt()
      if (offset > 0) mp.seekTo(offset)
      mp.setOnErrorListener { _, what, extra ->
        Log.e(TAG, "MediaPlayer error $what/$extra on user track, switching to fallback")
        handler.post { switchToFallbackAfterError() }
        true
      }
      mp.setVolume(0f, 0f)
      mp.start()
      return mp
    } catch (e: Exception) {
      mp.release()
      throw e
    }
  }

  private fun switchToFallbackAfterError() {
    val ring = current ?: return
    player?.release()
    player = null
    startFallbackSound(0.0)
    val updated = ring.copy(usingFallbackSound = true)
    current = updated
    store.setActiveRing(updated)
  }

  private fun startFallbackSound(fadeInSeconds: Double) {
    val candidates = listOfNotNull(
      RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM),
      Settings.System.DEFAULT_ALARM_ALERT_URI,
      RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE),
      Settings.System.DEFAULT_RINGTONE_URI,
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    )
    for (uri in candidates) {
      val mp = newPlayer()
      try {
        mp.setDataSource(this, uri)
        mp.prepare()
        mp.setVolume(0f, 0f)
        mp.start()
        player = mp
        startFade(fadeInSeconds)
        return
      } catch (e: Exception) {
        Log.w(TAG, "Fallback tone $uri failed", e)
        mp.release()
      }
    }
    // Last resort (e.g. no ringtones readable in direct boot): repeating beeps.
    Log.e(TAG, "No playable tone, using ToneGenerator")
    try {
      toneGenerator = ToneGenerator(AudioManager.STREAM_ALARM, ToneGenerator.MAX_VOLUME)
      handler.post(toneRunnable)
    } catch (e: Exception) {
      Log.e(TAG, "ToneGenerator failed; vibration + notification only", e)
    }
  }

  private val toneRunnable = object : Runnable {
    override fun run() {
      toneGenerator?.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 1000)
      handler.postDelayed(this, 1500)
    }
  }

  private fun startFade(fadeInSeconds: Double) {
    fadeStartElapsed = SystemClock.elapsedRealtime()
    fadeDurationMs = (fadeInSeconds * 1000).toLong()
    handler.removeCallbacks(volumeRunnable)
    handler.post(volumeRunnable)
  }

  private var fadeDurationMs = 0L

  /**
   * Runs every 250 ms while ringing: drives the fade-in ramp (0.05 -> 1.0) and
   * lowers the volume while a phone/VoIP call is active.
   */
  private val volumeRunnable = object : Runnable {
    override fun run() {
      val mp = player ?: return
      val fade = if (fadeDurationMs <= 0) 1f else {
        val t = (SystemClock.elapsedRealtime() - fadeStartElapsed).toFloat() / fadeDurationMs
        (0.05f + 0.95f * t).coerceIn(0.05f, 1f)
      }
      val inCall = isInCall()
      var v = fade
      if (inCall) v = minOf(v, IN_CALL_VOLUME)
      if (ducked) v *= DUCK_FACTOR
      try {
        mp.setVolume(v, v)
        if (pausedForFocusLoss && mp.isPlaying) mp.pause()
      } catch (_: IllegalStateException) {
      }
      handler.postDelayed(this, 250)
    }
  }

  private fun isInCall(): Boolean {
    val mode = audioManager.mode
    return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION
  }

  private fun requestAudioFocus() {
    val listener = AudioManager.OnAudioFocusChangeListener { change -> handler.post { onFocusChange(change) } }
    focusListener = listener
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(alarmAttributes)
          .setOnAudioFocusChangeListener(listener, handler)
          .setWillPauseWhenDucked(false)
          .build()
        focusRequest = req
        audioManager.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(listener, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      }
    } catch (e: Exception) {
      // Keep ringing even without focus.
      Log.w(TAG, "Audio focus request failed", e)
    }
  }

  private fun onFocusChange(change: Int) {
    val mp = player
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        // e.g. incoming phone call: pause, resume on gain. Vibration continues.
        pausedForFocusLoss = true
        try {
          mp?.pause()
        } catch (_: IllegalStateException) {
        }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> ducked = true
      AudioManager.AUDIOFOCUS_GAIN -> {
        ducked = false
        if (pausedForFocusLoss) {
          pausedForFocusLoss = false
          try {
            mp?.start()
          } catch (_: IllegalStateException) {
          }
        }
      }
      // AUDIOFOCUS_LOSS (permanent): an alarm must stay audible — keep playing.
    }
  }

  private fun abandonAudioFocus() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
      } else {
        @Suppress("DEPRECATION")
        focusListener?.let { audioManager.abandonAudioFocus(it) }
      }
    } catch (_: Exception) {
    }
    focusRequest = null
    focusListener = null
  }

  private fun raiseAlarmVolume(fraction: Double) {
    try {
      val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
      // Keep the ORIGINAL saved value if a previous ring crashed before restoring.
      if (store.getSavedAlarmVolume() < 0) {
        store.setSavedAlarmVolume(audioManager.getStreamVolume(AudioManager.STREAM_ALARM))
      }
      val target = (fraction * max).roundToInt().coerceIn(1, max)
      audioManager.setStreamVolume(AudioManager.STREAM_ALARM, target, 0)
    } catch (e: Exception) {
      Log.w(TAG, "Could not set STREAM_ALARM volume", e)
    }
  }

  private fun restoreAlarmVolume() {
    val saved = store.getSavedAlarmVolume()
    if (saved < 0) return
    try {
      audioManager.setStreamVolume(AudioManager.STREAM_ALARM, saved, 0)
    } catch (e: Exception) {
      Log.w(TAG, "Could not restore STREAM_ALARM volume", e)
    }
    store.setSavedAlarmVolume(-1)
  }

  // ---- vibration / wake lock ---------------------------------------------

  private fun startVibration() {
    try {
      val v: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      if (v == null || !v.hasVibrator()) return
      vibrator = v
      val pattern = longArrayOf(0, 800, 600)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        @Suppress("DEPRECATION")
        v.vibrate(VibrationEffect.createWaveform(pattern, 0), alarmAttributes)
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(pattern, 0, alarmAttributes)
      }
    } catch (e: Exception) {
      Log.w(TAG, "Vibration failed", e)
    }
  }

  private fun acquireWakeLock(timeoutMs: Long) {
    wakeLock?.let { if (it.isHeld) it.release() }
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wakeify:ring").apply {
      setReferenceCounted(false)
      acquire(timeoutMs.coerceAtLeast(60_000L))
    }
  }

  // ---- notification -------------------------------------------------------

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(alarmId: String, label: String): Notification =
    buildRingNotification(this, alarmId, label)

  companion object {
    private const val TAG = "WakeifyRingService"
    const val CHANNEL_ID = "wakeify_ring"
    const val FALLBACK_CHANNEL_ID = "wakeify_ring_fallback"
    const val NOTIFICATION_ID = 0x5A1A
    private const val ACTION_START = "app.wakeify.alarm.action.START_RING"
    private const val IN_CALL_VOLUME = 0.15f
    private const val DUCK_FACTOR = 0.3f

    @Volatile private var instance: AlarmRingService? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    fun isRunning(): Boolean = instance?.current != null

    fun start(context: Context, alarmId: String, scheduledFor: Long, isSnooze: Boolean) {
      val intent = Intent(context, AlarmRingService::class.java)
        .setAction(ACTION_START)
        .putExtra(AlarmIntents.EXTRA_ALARM_ID, alarmId)
        .putExtra(AlarmIntents.EXTRA_SCHEDULED_FOR, scheduledFor)
        .putExtra(AlarmIntents.EXTRA_IS_SNOOZE, isSnooze)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    /**
     * Stop ringing from anywhere (module). Never starts the service just to stop
     * it. If [onlyAlarmId] is set, only stops when that alarm is the one ringing.
     */
    fun stop(context: Context, reason: String, onlyAlarmId: String? = null) {
      val app = context.applicationContext ?: context
      val task = Runnable { stopOnMain(app, reason, onlyAlarmId) }
      if (Looper.myLooper() == Looper.getMainLooper()) {
        task.run()
        return
      }
      // Block the (background) caller briefly so a following getActiveRing() sees the result.
      val done = java.util.concurrent.CountDownLatch(1)
      mainHandler.post {
        try {
          task.run()
        } finally {
          done.countDown()
        }
      }
      done.await(2, java.util.concurrent.TimeUnit.SECONDS)
    }

    private fun stopOnMain(app: Context, reason: String, onlyAlarmId: String?) {
      run {
        val svc = instance
        val ring = svc?.current
        if (svc != null && ring != null) {
          if (onlyAlarmId == null || ring.alarmId == onlyAlarmId) svc.stopRing(reason)
        } else {
          // No live service: just clear persisted state / leftovers.
          val store = AlarmStore.get(app)
          val persisted = store.getActiveRing()
          if (persisted != null && (onlyAlarmId == null || persisted.alarmId == onlyAlarmId)) {
            store.setActiveRing(null)
            RingEvents.emitStopped(persisted.alarmId, persisted.scheduledFor, reason)
          }
          if (onlyAlarmId == null || persisted == null || persisted.alarmId == onlyAlarmId) {
            // Also removes a fallback notification posted without the service.
            (app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
          }
          val saved = store.getSavedAlarmVolume()
          if (saved >= 0) {
            try {
              (app.getSystemService(Context.AUDIO_SERVICE) as AudioManager)
                .setStreamVolume(AudioManager.STREAM_ALARM, saved, 0)
            } catch (_: Exception) {
            }
            store.setSavedAlarmVolume(-1)
          }
        }
      }
    }

    /** Re-post the ongoing ring notification (e.g. after the user swiped it on Android 14+). */
    fun repostNotificationIfRinging(context: Context) {
      mainHandler.post {
        val svc = instance ?: return@post
        val ring = svc.current ?: return@post
        val label = svc.currentSpec?.label ?: "Alarm"
        (svc.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
          .notify(NOTIFICATION_ID, buildRingNotification(svc, ring.alarmId, label))
      }
    }

    /** Used when the foreground service cannot be started at all. */
    fun postFallbackNotification(context: Context, alarmId: String, scheduledFor: Long, isSnooze: Boolean) {
      try {
        val store = AlarmStore.get(context)
        // Persist the ring so the app shows the challenge screen when opened.
        store.setActiveRing(ActiveRing(alarmId, System.currentTimeMillis(), scheduledFor, isSnooze, usingFallbackSound = true))
        val label = store.getSpec(alarmId)?.label ?: "Alarm"
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
          .notify(NOTIFICATION_ID, buildRingNotification(context, alarmId, label, withSound = true))
      } catch (e: Exception) {
        Log.e(TAG, "Fallback notification failed", e)
      }
    }

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      val ch = NotificationChannel(CHANNEL_ID, "Ringing alarms", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Shown while an alarm is ringing"
        setSound(null, null) // the service plays the track itself
        enableVibration(false) // the service vibrates itself
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setBypassDnd(true) // only honoured with notification policy access; harmless otherwise
      }
      nm.createNotificationChannel(ch)
    }

    /**
     * Channel WITH the system alarm sound, used only by [postFallbackNotification]
     * when the foreground service could not be started (so nothing else plays).
     */
    private fun ensureFallbackChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(FALLBACK_CHANNEL_ID) != null) return
      val ch = NotificationChannel(FALLBACK_CHANNEL_ID, "Alarms (backup)", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Used only if the alarm sound service cannot start"
        setSound(
          Settings.System.DEFAULT_ALARM_ALERT_URI,
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        )
        enableVibration(true)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setBypassDnd(true)
      }
      nm.createNotificationChannel(ch)
    }

    fun buildRingNotification(context: Context, alarmId: String, label: String, withSound: Boolean = false): Notification {
      if (withSound) ensureFallbackChannel(context) else ensureChannel(context)
      val channelId = if (withSound) FALLBACK_CHANNEL_ID else CHANNEL_ID
      val contentIntent = AlarmIntents.ringActivityPendingIntent(context, alarmId)
      val deleteIntent = PendingIntent.getBroadcast(
        context, "repost".hashCode(),
        Intent(context, AlarmReceiver::class.java).setAction(AlarmIntents.ACTION_REPOST_NOTIFICATION),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, channelId)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context).setPriority(Notification.PRIORITY_MAX)
      }
      builder
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle(label.ifBlank { "Alarm" })
        .setContentText("Open Wakeify to turn the alarm off")
        .setCategory(Notification.CATEGORY_ALARM)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setShowWhen(true)
        .setWhen(System.currentTimeMillis())
        .setContentIntent(contentIntent)
        .setFullScreenIntent(contentIntent, true)
        .setDeleteIntent(deleteIntent)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
      }
      if (withSound && Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        @Suppress("DEPRECATION")
        builder.setDefaults(Notification.DEFAULT_ALL)
      }
      val n = builder.build()
      n.flags = n.flags or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
      if (withSound) n.flags = n.flags or Notification.FLAG_INSISTENT
      return n
    }
  }
}
