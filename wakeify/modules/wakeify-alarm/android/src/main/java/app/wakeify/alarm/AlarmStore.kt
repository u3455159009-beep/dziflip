package app.wakeify.alarm

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
import org.json.JSONObject

/**
 * Persistent native state. Lives in *device-protected* storage so the boot
 * receiver can read it in direct-boot mode (LOCKED_BOOT_COMPLETED, before the
 * user unlocks the phone after a reboot).
 *
 * All writes use commit() — this runs from receivers that may be killed right
 * after onReceive returns, so we want the data on disk before returning.
 */
class AlarmStore private constructor(private val prefs: SharedPreferences) {

  // ---- alarm specs -------------------------------------------------------

  @Synchronized
  fun getSpecs(): List<AlarmSpec> = try {
    AlarmSpec.listFromJson(prefs.getString(KEY_SPECS, null))
  } catch (e: Exception) {
    Log.e(TAG, "Corrupt specs in store, ignoring", e)
    emptyList()
  }

  @Synchronized
  fun getSpec(id: String): AlarmSpec? = getSpecs().firstOrNull { it.id == id }

  @Synchronized
  fun setSpecs(specs: List<AlarmSpec>) {
    prefs.edit().putString(KEY_SPECS, AlarmSpec.listToJson(specs)).commit()
  }

  @Synchronized
  fun updateSpec(spec: AlarmSpec) {
    val list = getSpecs().map { if (it.id == spec.id) spec else it }
    setSpecs(list)
  }

  // ---- id -> epoch-ms maps (snoozes, scheduled triggers, fired occurrences) -

  @Synchronized
  fun getSnoozes(): Map<String, Long> = readLongMap(KEY_SNOOZES)

  @Synchronized
  fun putSnooze(id: String, triggerAt: Long) = editLongMap(KEY_SNOOZES) { it[id] = triggerAt }

  @Synchronized
  fun removeSnooze(id: String) {
    editLongMap(KEY_SNOOZES) { it.remove(id) }
    editLongMap(KEY_SNOOZE_ORIGINS) { it.remove(id) }
  }

  /** Original occurrence (scheduledFor) each pending snooze belongs to. */
  @Synchronized
  fun getSnoozeOrigin(id: String): Long? = readLongMap(KEY_SNOOZE_ORIGINS)[id]

  @Synchronized
  fun putSnoozeOrigin(id: String, scheduledFor: Long) = editLongMap(KEY_SNOOZE_ORIGINS) { it[id] = scheduledFor }

  /** Last trigger instant handed to AlarmManager for each regular alarm. */
  @Synchronized
  fun getScheduledTriggers(): Map<String, Long> = readLongMap(KEY_TRIGGERS)

  @Synchronized
  fun setScheduledTrigger(id: String, triggerAt: Long?) = editLongMap(KEY_TRIGGERS) {
    if (triggerAt == null) it.remove(id) else it[id] = triggerAt
  }

  @Synchronized
  fun retainScheduledTriggers(ids: Set<String>) = editLongMap(KEY_TRIGGERS) { m -> m.keys.retainAll(ids) }

  /** scheduledFor of the last occurrence that actually fired, per key (id or "snooze:id"). */
  @Synchronized
  fun getFired(key: String): Long? = readLongMap(KEY_FIRED)[key]

  @Synchronized
  fun setFired(key: String, scheduledFor: Long) = editLongMap(KEY_FIRED) { it[key] = scheduledFor }

  // ---- active ring ------------------------------------------------------

  @Synchronized
  fun getActiveRing(): ActiveRing? {
    val raw = prefs.getString(KEY_ACTIVE_RING, null) ?: return null
    return try {
      ActiveRing.fromJson(JSONObject(raw))
    } catch (e: Exception) {
      Log.e(TAG, "Corrupt active ring, clearing", e)
      prefs.edit().remove(KEY_ACTIVE_RING).commit()
      null
    }
  }

  @Synchronized
  fun setActiveRing(ring: ActiveRing?) {
    val e = prefs.edit()
    if (ring == null) {
      e.remove(KEY_ACTIVE_RING)
    } else {
      val json = ring.toJson().toString()
      e.putString(KEY_ACTIVE_RING, json)
      e.putString(KEY_LAST_RING, json) // kept after the ring stops (see getLastRing)
    }
    e.commit()
  }

  /** Most recently started ring (not cleared when it stops), or null. */
  @Synchronized
  fun getLastRing(): ActiveRing? {
    val raw = prefs.getString(KEY_LAST_RING, null) ?: return null
    return try {
      ActiveRing.fromJson(JSONObject(raw))
    } catch (e: Exception) {
      null
    }
  }

  // ---- misc ---------------------------------------------------------------

  /** STREAM_ALARM volume before we raised it; -1 = nothing saved. */
  @Synchronized
  fun getSavedAlarmVolume(): Int = prefs.getInt(KEY_SAVED_VOLUME, -1)

  @Synchronized
  fun setSavedAlarmVolume(v: Int) {
    prefs.edit().putInt(KEY_SAVED_VOLUME, v).commit()
  }

  @Synchronized
  fun wasNotificationPermissionRequested(): Boolean = prefs.getBoolean(KEY_NOTIF_ASKED, false)

  @Synchronized
  fun setNotificationPermissionRequested() {
    prefs.edit().putBoolean(KEY_NOTIF_ASKED, true).commit()
  }

  /** True when the last scheduling pass had to use inexact alarms. */
  @Synchronized
  fun isUsingInexactFallback(): Boolean = prefs.getBoolean(KEY_INEXACT, false)

  @Synchronized
  fun setUsingInexactFallback(v: Boolean) {
    prefs.edit().putBoolean(KEY_INEXACT, v).commit()
  }

  private fun readLongMap(key: String): MutableMap<String, Long> {
    val out = HashMap<String, Long>()
    val raw = prefs.getString(key, null) ?: return out
    try {
      val o = JSONObject(raw)
      val it = o.keys()
      while (it.hasNext()) {
        val k = it.next()
        out[k] = o.getLong(k)
      }
    } catch (e: Exception) {
      Log.e(TAG, "Corrupt map $key, resetting", e)
    }
    return out
  }

  private fun editLongMap(key: String, block: (MutableMap<String, Long>) -> Unit) {
    val m = readLongMap(key)
    block(m)
    val o = JSONObject()
    for ((k, v) in m) o.put(k, v)
    prefs.edit().putString(key, o.toString()).commit()
  }

  companion object {
    private const val TAG = "WakeifyAlarmStore"
    private const val PREFS = "wakeify_alarm_store"
    private const val KEY_SPECS = "specs"
    private const val KEY_SNOOZES = "snoozes"
    private const val KEY_SNOOZE_ORIGINS = "snoozeOrigins"
    private const val KEY_TRIGGERS = "scheduledTriggers"
    private const val KEY_FIRED = "fired"
    private const val KEY_ACTIVE_RING = "activeRing"
    private const val KEY_LAST_RING = "lastRing"
    private const val KEY_SAVED_VOLUME = "savedAlarmVolume"
    private const val KEY_NOTIF_ASKED = "notificationPermissionRequested"
    private const val KEY_INEXACT = "usingInexactFallback"

    @Volatile private var instance: AlarmStore? = null

    fun get(context: Context): AlarmStore {
      instance?.let { return it }
      synchronized(this) {
        instance?.let { return it }
        val app = context.applicationContext ?: context
        val storageContext =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) app.createDeviceProtectedStorageContext() else app
        val store = AlarmStore(storageContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE))
        instance = store
        return store
      }
    }
  }
}
