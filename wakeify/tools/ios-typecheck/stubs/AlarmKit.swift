@_exported import Foundation
import SwiftUI
import ActivityKit
import AppIntents
public protocol AlarmMetadata: Codable, Hashable, Sendable {}
public struct Alarm: Codable, Identifiable, Sendable {
  public var id: UUID
  public enum State: Codable, Hashable, Sendable { case scheduled, countdown, paused, alerting }
  public var state: Alarm.State
  public struct CountdownDuration: Codable, Hashable, Sendable {}
  public enum Schedule: Codable, Hashable, Sendable {
    case fixed(Date)
    case relative(Relative)
    public struct Relative: Codable, Hashable, Sendable {
      public struct Time: Codable, Hashable, Sendable { public init(hour: Int, minute: Int) {} }
      public enum Recurrence: Codable, Hashable, Sendable { case never; case weekly([Locale.Weekday]) }
      public init(time: Time, repeats: Recurrence = .never) {}
    }
  }
}
public struct AlarmButton: Codable, Sendable {
  public init(text: LocalizedStringResource, textColor: Color, systemImageName: String) {}
}
public struct AlarmPresentation: Codable, Sendable {
  public struct Countdown: Codable, Sendable {}
  public struct Paused: Codable, Sendable {}
  public struct Alert: Codable, Sendable {
    public enum SecondaryButtonBehavior: Codable, Hashable, Sendable { case countdown, custom }
    public init(title: LocalizedStringResource, secondaryButton: AlarmButton? = nil, secondaryButtonBehavior: SecondaryButtonBehavior? = nil) {}
    public init(title: LocalizedStringResource, stopButton: AlarmButton, secondaryButton: AlarmButton? = nil, secondaryButtonBehavior: SecondaryButtonBehavior? = nil) {}
  }
  public init(alert: Alert, countdown: Countdown? = nil, paused: Paused? = nil) {}
}
public struct AlarmAttributes<Metadata: AlarmMetadata>: ActivityAttributes, Sendable {
  public typealias ContentState = Int
  public init(presentation: AlarmPresentation, metadata: Metadata? = nil, tintColor: Color) {}
  public init(from decoder: any Decoder) throws {}
  public func encode(to encoder: any Encoder) throws {}
}
public final class AlarmManager: @unchecked Sendable {
  public static let shared = AlarmManager()
  public enum AuthorizationState: Codable, Hashable, Sendable { case notDetermined, denied, authorized }
  public enum AlarmError: Error, Hashable, Sendable { case maximumLimitReached }
  public struct AlarmConfiguration<Metadata: AlarmMetadata> {
    public init(countdownDuration: Alarm.CountdownDuration? = nil, schedule: Alarm.Schedule? = nil, attributes: AlarmAttributes<Metadata>, stopIntent: (any LiveActivityIntent)? = nil, secondaryIntent: (any LiveActivityIntent)? = nil, sound: AlertConfiguration.AlertSound = .default) {}
  }
  public var authorizationState: AuthorizationState { .notDetermined }
  public func requestAuthorization() async throws -> AuthorizationState { .authorized }
  public var alarms: [Alarm] { get throws { [] } }
  public var alarmUpdates: some AsyncSequence<[Alarm], Never> { AsyncStream<[Alarm]> { _ in } }
  public func schedule<Metadata>(id: Alarm.ID, configuration: AlarmConfiguration<Metadata>) async throws -> Alarm where Metadata: AlarmMetadata { fatalError() }
  public func cancel(id: Alarm.ID) throws {}
  public func stop(id: Alarm.ID) throws {}
}
