package app.wakeify.alarm

import android.content.Context
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Auto-discovered by expo-modules-autolinking (file name ends in `Package.kt`
 * and imports expo.modules.core.interfaces.Package) — no config entry needed.
 */
class WakeifyAlarmPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(WakeifyRingActivityListener())
}
