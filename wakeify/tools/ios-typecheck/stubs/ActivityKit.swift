@_exported import Foundation
public struct AlertConfiguration: Sendable {
  public struct AlertSound: Equatable, Sendable {
    public static func named(_ name: String) -> AlertConfiguration.AlertSound { fatalError() }
    public static var `default`: AlertConfiguration.AlertSound { fatalError() }
  }
}
public protocol ActivityAttributes: Decodable, Encodable { associatedtype ContentState: Codable & Hashable }
