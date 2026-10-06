package app.wakeify.alarm

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.CopyOnWriteArraySet

/**
 * In-process listener registry the expo module subscribes to while it is
 * alive, so ring start/stop can be forwarded to JS as events. When no JS
 * runtime exists (app killed) nothing listens — JS then reads the persisted
 * ActiveRing via getActiveRing() on launch.
 */
object RingEvents {
  interface Listener {
    fun onRingStarted(alarmId: String, scheduledFor: Long)

    /** reason: "dismissed" | "timeout" | "system" (mirrors the TS contract). */
    fun onRingStopped(alarmId: String, scheduledFor: Long, reason: String)
  }

  const val REASON_DISMISSED = "dismissed"
  const val REASON_TIMEOUT = "timeout"
  const val REASON_SYSTEM = "system"

  private val listeners = CopyOnWriteArraySet<Listener>()
  private val main = Handler(Looper.getMainLooper())

  fun add(listener: Listener) {
    listeners.add(listener)
  }

  fun remove(listener: Listener) {
    listeners.remove(listener)
  }

  fun emitStarted(alarmId: String, scheduledFor: Long) = dispatch { it.onRingStarted(alarmId, scheduledFor) }

  fun emitStopped(alarmId: String, scheduledFor: Long, reason: String) =
    dispatch { it.onRingStopped(alarmId, scheduledFor, reason) }

  private fun dispatch(block: (Listener) -> Unit) {
    main.post {
      for (l in listeners) {
        try {
          block(l)
        } catch (e: Exception) {
          Log.e("WakeifyRingEvents", "Listener failed", e)
        }
      }
    }
  }
}
