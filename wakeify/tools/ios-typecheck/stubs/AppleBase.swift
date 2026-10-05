import Foundation
public struct LocalizedStringResource: ExpressibleByStringInterpolation, Sendable, Equatable, Codable {
  public var key: String
  public init(stringLiteral value: String) { key = value }
  public init(_ keyAndValue: String) { key = keyAndValue }
}
