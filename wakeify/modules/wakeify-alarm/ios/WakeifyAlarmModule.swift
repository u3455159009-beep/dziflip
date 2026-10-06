// Wakeify native alarm engine – iOS.
//
// JS contract: ../src/WakeifyAlarm.types.ts (`WakeifyAlarmNativeModule`).
// Engines:
//   * iOS 26+  -> AlarmKit (WakeifyAlarmKitEngine), unless AlarmKit access was denied
//   * otherwise -> time-sensitive local notifications (WakeifyNotificationEngine)
// In-app ringing (full track via expo-audio) is done by JS; natively we only
// stop the system alert when asked.

import ExpoModulesCore
import Foundation
import UIKit
#if canImport(AlarmKit)
import AlarmKit
#endif

public class WakeifyAlarmModule: Module {
  /// Serialises every scheduling operation (JS calls, app-active re-syncs).
  private let ops = AsyncSerialQueue()
  private let engineLock = NSLock()
  private var activeEngine: WakeifyEngine?
  private let notificationEngine = WakeifyNotificationEngine()
  /// Holds a `WakeifyAlarmKitEngine` on iOS 26+ (typed `AnyObject` so the
  /// stored property itself needs no availability annotation).
  private var alarmKitEngineStorage: AnyObject?
  private var observers: [NSObjectProtocol] = []
  private var lastStartedKey: String?

  public func definition() -> ModuleDefinition {
    Name("WakeifyAlarm")

    Events("onRingStarted", "onRingStopped")

    OnCreate {
      self.setUp()
    }

    OnDestroy {
      self.tearDown()
    }

    OnAppBecomesActive {
      // Restores repeating rules after a skip, re-arms backups, picks up a
      // timezone change and reports rings delivered while we were away.
      self.resyncInBackground()
    }

    AsyncFunction("syncAlarms") { (specs: [NativeAlarmSpecRecord], promise: Promise) in
      let plain = specs.map { $0.toSpec() }
      self.run(promise) {
        let engine = await self.currentEngine()
        let results = await engine.sync(specs: plain)
        return results.map { $0.toJS() }
      }
    }

    AsyncFunction("scheduleSnooze") { (alarmId: String, triggerAt: Double, promise: Promise) in
      self.run(promise) {
        try Self.requireKnownAlarm(alarmId)
        let engine = await self.currentEngine()
        try await engine.scheduleSnooze(alarmId: alarmId, at: dateFromMs(triggerAt))
        // The snooze ring reports the same scheduledFor as the original ring,
        // so its onRingStarted must not be swallowed by the duplicate filter.
        self.resetStartedKey()
        return nil
      }
    }

    AsyncFunction("cancelSnooze") { (alarmId: String, promise: Promise) in
      self.run(promise) {
        let engine = await self.currentEngine()
        await engine.cancelSnooze(alarmId: alarmId)
        return nil
      }
    }

    // `alarmId` is optional (trailing optional args may be omitted from JS):
    // with it only that alarm's alert is silenced, without it every Wakeify alert.
    AsyncFunction("stopRinging") { (alarmId: String?, promise: Promise) in
      self.run(promise) {
        let engine = await self.currentEngine()
        await engine.stopRinging(alarmId: alarmId)
        return nil
      }
    }

    AsyncFunction("getActiveRing") { (promise: Promise) in
      self.run(promise) {
        let engine = await self.currentEngine()
        return await engine.activeRing()?.toJS()
      }
    }

    AsyncFunction("markOccurrenceHandled") { (alarmId: String, promise: Promise) in
      self.run(promise) {
        let engine = await self.currentEngine()
        await engine.markHandled(alarmId: alarmId)
        self.resetStartedKey()
        return nil
      }
    }

    // Android only (show activity over the lock screen). Nothing to do on iOS.
    Function("setShowOverLockScreen") { (_: Bool) in
    }

    AsyncFunction("getPermissionStatus") { (promise: Promise) in
      self.run(promise, serial: false) {
        return await Self.permissionStatus()
      }
    }

    AsyncFunction("requestPermission") { (kind: String, promise: Promise) in
      self.run(promise, serial: false) {
        let state = await Self.requestPermission(kind)
        if kind == "alarmKit" || kind == "notifications" {
          // The engine may have changed (e.g. AlarmKit just got authorised).
          self.resyncInBackground()
        }
        return state
      }
    }

    AsyncFunction("prepareSystemSound") { (uri: String, startOffsetMs: Double, promise: Promise) in
      self.run(promise, serial: false) {
        do {
          return try await WakeifySoundClipper.shared.prepare(uri: uri, startOffsetMs: max(0, startOffsetMs))
        } catch {
          NSLog("[WakeifyAlarm] prepareSystemSound failed: \(error)")
          return nil
        }
      }
    }

    AsyncFunction("scheduleTestRing") { (alarmId: String, seconds: Double, promise: Promise) in
      self.run(promise) {
        try Self.requireKnownAlarm(alarmId)
        let engine = await self.currentEngine()
        try await engine.scheduleTest(alarmId: alarmId, at: Date().addingTimeInterval(max(1, seconds)))
        return nil
      }
    }
  }

  // MARK: - Lifecycle

  private func setUp() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: WakeifyIntentBridge.pendingRingNotification, object: nil, queue: nil) { [weak self] note in
      guard let alarmId = note.userInfo?["alarmId"] as? String,
            let scheduledFor = note.userInfo?["scheduledFor"] as? Double else { return }
      self?.emit(WakeifyEvent.ringStarted, ["alarmId": alarmId, "scheduledFor": scheduledFor])
    })
    observers.append(center.addObserver(forName: UIApplication.significantTimeChangeNotification, object: nil, queue: nil) { [weak self] _ in
      self?.resyncInBackground()
    })
    observers.append(center.addObserver(forName: NSNotification.Name.NSSystemTimeZoneDidChange, object: nil, queue: nil) { [weak self] _ in
      self?.resyncInBackground()
    })
    // Start observing AlarmKit updates right away.
    Task { [weak self] in
      guard let self else { return }
      _ = try? await self.ops.enqueue { () async -> Bool in
        _ = await self.currentEngine()
        return true
      }
    }
  }

  private func tearDown() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers.removeAll()
    engineLock.lock()
    let engine = activeEngine
    engineLock.unlock()
    engine?.stopObserving()
  }

  private func resyncInBackground() {
    Task { [weak self] in
      guard let self else { return }
      _ = try? await self.ops.enqueue { () async -> Bool in
        let engine = await self.currentEngine()
        let hasSpecs = WakeifyAlarmStore.shared.read { !$0.specs.isEmpty }
        if hasSpecs {
          _ = await engine.sync(specs: nil)
        }
        _ = await engine.activeRing()
        return true
      }
    }
  }

  // MARK: - Engine selection

  private func selectEngine() -> WakeifyEngine {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      if AlarmManager.shared.authorizationState != .denied {
        engineLock.lock()
        defer { engineLock.unlock() }
        if let engine = alarmKitEngineStorage as? WakeifyAlarmKitEngine {
          return engine
        }
        let engine = WakeifyAlarmKitEngine()
        alarmKitEngineStorage = engine
        return engine
      }
    }
    #endif
    return notificationEngine
  }

  private func allEngines() -> [WakeifyEngine] {
    var engines: [WakeifyEngine] = [notificationEngine]
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      engineLock.lock()
      if alarmKitEngineStorage == nil {
        alarmKitEngineStorage = WakeifyAlarmKitEngine()
      }
      if let engine = alarmKitEngineStorage as? WakeifyAlarmKitEngine {
        engines.append(engine)
      }
      engineLock.unlock()
    }
    #endif
    return engines
  }

  /// Returns the engine to use now; when it changed, the other engine's
  /// schedule is removed so an alarm never rings twice.
  private func currentEngine() async -> WakeifyEngine {
    let selected = selectEngine()
    let (previous, changed): (WakeifyEngine?, Bool) = engineLock.withLock {
      let previous = activeEngine
      let changed = previous !== selected
      if changed { activeEngine = selected }
      return (previous, changed)
    }
    guard changed else { return selected }

    previous?.stopObserving()
    for engine in allEngines() where engine !== selected {
      await engine.removeEverything()
    }
    selected.eventSink = { [weak self] name, body in
      self?.emit(name, body)
    }
    selected.startObserving()
    return selected
  }

  private func emit(_ name: String, _ body: [String: Any]) {
    if name == WakeifyEvent.ringStarted {
      let key = "\(body["alarmId"] ?? "")|\(body["scheduledFor"] ?? "")"
      engineLock.lock()
      let duplicate = lastStartedKey == key
      lastStartedKey = key
      engineLock.unlock()
      if duplicate { return }
    } else if name == WakeifyEvent.ringStopped {
      engineLock.lock()
      lastStartedKey = nil
      engineLock.unlock()
    }
    sendEvent(name, body.mapValues { Optional($0) })
  }

  // MARK: - Helpers

  private func resetStartedKey() {
    engineLock.withLock { lastStartedKey = nil }
  }

  private func run(_ promise: Promise, serial: Bool = true, _ operation: @escaping () async throws -> Any?) {
    Task {
      do {
        let value: Any?
        if serial {
          value = try await self.ops.enqueue(operation)
        } else {
          value = try await operation()
        }
        promise.resolve(value)
      } catch {
        promise.reject("ERR_WAKEIFY_ALARM", String(describing: error))
      }
    }
  }

  private static func requireKnownAlarm(_ alarmId: String) throws {
    let known = WakeifyAlarmStore.shared.read { $0.spec(for: alarmId) != nil }
    if !known {
      throw WakeifyModuleError.unknownAlarm(alarmId)
    }
  }

  private static func permissionStatus() async -> [String: Any] {
    let notifications = await WakeifyNotificationEngine.permissionState()
    var alarmKit = "unsupported"
    var engine = "ios-notifications"
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      alarmKit = WakeifyAlarmKitEngine.permissionState()
      engine = alarmKit == "denied" ? "ios-notifications" : "ios-alarmkit"
    }
    #endif
    return [
      "platform": "ios",
      "exactAlarms": "unsupported",
      "notifications": notifications,
      "fullScreenIntent": "unsupported",
      "batteryOptimizationIgnored": "unsupported",
      "alarmKit": alarmKit,
      "engine": engine,
    ]
  }

  private static func requestPermission(_ kind: String) async -> String {
    switch kind {
    case "notifications":
      return await WakeifyNotificationEngine.requestPermission()
    case "alarmKit":
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return await WakeifyAlarmKitEngine.requestPermission()
      }
      #endif
      return "unsupported"
    default:
      return "unsupported"
    }
  }
}

enum WakeifyModuleError: Error, CustomStringConvertible {
  case unknownAlarm(String)

  var description: String {
    switch self {
    case .unknownAlarm(let id):
      return "Unknown alarm id \(id): call syncAlarms with this alarm first"
    }
  }
}
