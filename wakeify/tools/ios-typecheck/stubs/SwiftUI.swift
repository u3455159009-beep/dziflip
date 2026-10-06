@_exported import Foundation
public struct Color: Sendable, Hashable, Codable {
  public init(red: Double, green: Double, blue: Double, opacity: Double = 1) {}
  public static let white = Color(red: 1, green: 1, blue: 1)
}
