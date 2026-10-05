@_exported import Foundation
public enum UNAuthorizationStatus: Int { case notDetermined, denied, authorized, provisional, ephemeral }
public struct UNAuthorizationOptions: OptionSet { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }
  public static let alert = UNAuthorizationOptions(rawValue: 1), sound = UNAuthorizationOptions(rawValue: 2), badge = UNAuthorizationOptions(rawValue: 4) }
open class UNNotificationSettings: NSObject { open var authorizationStatus: UNAuthorizationStatus { .denied } }
open class UNNotificationContent: NSObject {
  open var userInfo: [AnyHashable: Any] { [:] }
}
public enum UNNotificationInterruptionLevel: UInt { case passive, active, timeSensitive, critical }
public struct UNNotificationSoundName: RawRepresentable, Hashable { public var rawValue: String; public init(rawValue: String) { self.rawValue = rawValue } }
open class UNNotificationSound: NSObject, @unchecked Sendable {
  public init(named: UNNotificationSoundName) {}
  open class var `default`: UNNotificationSound { fatalError() }
}
open class UNMutableNotificationContent: UNNotificationContent {
  open var title = "", body = "", threadIdentifier = ""
  open var sound: UNNotificationSound?
  open var interruptionLevel: UNNotificationInterruptionLevel = .active
  open var relevanceScore: Double = 0
  private var _info: [AnyHashable: Any] = [:]
  open override var userInfo: [AnyHashable: Any] { get { _info } set { _info = newValue } }
}
open class UNNotificationTrigger: NSObject {}
open class UNCalendarNotificationTrigger: UNNotificationTrigger { public init(dateMatching: DateComponents, repeats: Bool) {} }
open class UNNotificationRequest: NSObject {
  public init(identifier: String, content: UNNotificationContent, trigger: UNNotificationTrigger?) { self.identifier = identifier; self.content = content }
  open var identifier: String
  open var content: UNNotificationContent
}
open class UNNotification: NSObject { open var request: UNNotificationRequest { fatalError() }; open var date: Date { Date() } }
open class UNUserNotificationCenter: NSObject {
  open class func current() -> UNUserNotificationCenter { fatalError() }
  open func notificationSettings() async -> UNNotificationSettings { fatalError() }
  open func requestAuthorization(options: UNAuthorizationOptions = []) async throws -> Bool { true }
  open func pendingNotificationRequests() async -> [UNNotificationRequest] { [] }
  open func deliveredNotifications() async -> [UNNotification] { [] }
  open func removePendingNotificationRequests(withIdentifiers: [String]) {}
  open func removeDeliveredNotifications(withIdentifiers: [String]) {}
  open func add(_ request: UNNotificationRequest) async throws {}
}
