package app.wakeify.alarm

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

/**
 * When the main activity is launched/re-launched by the ring notification
 * (full-screen intent or tap), make it show over the lock screen and turn the
 * screen on before JS has even started, so the ring screen is visible on a
 * locked device. JS clears it later with setShowOverLockScreen(false).
 */
class WakeifyRingActivityListener : ReactActivityLifecycleListener {
  private var activityRef: WeakReference<Activity>? = null

  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    if (activity == null) return
    activityRef = WeakReference(activity)
    if (AlarmIntents.isRingIntent(activity.intent)) LockScreenHelper.apply(activity, true)
  }

  override fun onResume(activity: Activity?) {
    if (activity != null) activityRef = WeakReference(activity)
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    if (AlarmIntents.isRingIntent(intent)) {
      activityRef?.get()?.let { LockScreenHelper.apply(it, true) }
    }
    // Do not consume the intent: expo-linking / React Native still need it.
    return false
  }
}
