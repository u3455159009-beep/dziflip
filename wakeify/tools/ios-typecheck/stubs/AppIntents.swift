@_exported import Foundation
@_exported import AppleBase
public protocol _IntentValue {}
extension String: _IntentValue {}
extension Double: _IntentValue {}
extension Int: _IntentValue {}
extension Bool: _IntentValue {}
public struct IntentDescription: Sendable { public init(_ s: LocalizedStringResource) {} }
public struct IntentModes: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }
  public static var foreground: IntentModes { IntentModes(rawValue: 1) } }
public protocol IntentResult: Sendable {}
public struct IntentResultContainer<A, B, C, D>: IntentResult {}
extension IntentResult {
  public static func result() -> Self where Self == IntentResultContainer<Never, Never, Never, Never> { fatalError() }
}
public protocol AppIntent: Sendable {
  associatedtype PerformResult: IntentResult
  init()
  static var title: LocalizedStringResource { get }
  static var description: IntentDescription? { get }
  static var supportedModes: IntentModes { get }
  static var openAppWhenRun: Bool { get }
  static var isDiscoverable: Bool { get }
  func perform() async throws -> PerformResult
}
extension AppIntent {
  public static var description: IntentDescription? { nil }
  public static var supportedModes: IntentModes { [] }
  public static var openAppWhenRun: Bool { false }
  public static var isDiscoverable: Bool { true }
}
public protocol SystemIntent: AppIntent {}
public protocol LiveActivityIntent: SystemIntent {}
public typealias Parameter = IntentParameter
@propertyWrapper public final class IntentParameter<Value: _IntentValue & Sendable>: @unchecked Sendable {
  var v: Value?
  public var wrappedValue: Value { get { v! } set { v = newValue } }
  public init(title: LocalizedStringResource) {}
}
public protocol AppIntentsPackage { static var includedPackages: [any AppIntentsPackage.Type] { get } }
extension AppIntentsPackage { public static var includedPackages: [any AppIntentsPackage.Type] { [] } }
