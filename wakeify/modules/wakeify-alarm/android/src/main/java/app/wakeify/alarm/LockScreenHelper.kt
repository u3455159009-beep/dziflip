package app.wakeify.alarm

import android.app.Activity
import android.os.Build
import android.util.Log
import android.view.WindowManager

/** Show the (ring screen) activity over the keyguard and turn the screen on. */
object LockScreenHelper {
  fun apply(activity: Activity, show: Boolean) {
    activity.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(show)
          activity.setTurnScreenOn(show)
        } else {
          @Suppress("DEPRECATION")
          val legacy = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          if (show) activity.window.addFlags(legacy) else activity.window.clearFlags(legacy)
        }
        if (show) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      } catch (e: Exception) {
        Log.e("WakeifyLockScreen", "Failed to update lock-screen flags", e)
      }
    }
  }
}
