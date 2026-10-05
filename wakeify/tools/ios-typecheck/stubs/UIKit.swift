@_exported import Foundation
@_exported import AppleBase
@MainActor open class UIApplication: @unchecked Sendable {
  public static var shared: UIApplication { fatalError() }
  public struct OpenExternalURLOptionsKey: Hashable { public init() {} }
  public func open(_ url: URL, options: [UIApplication.OpenExternalURLOptionsKey: Any] = [:], completionHandler completion: (@MainActor @Sendable (Bool) -> Void)? = nil) {}
  nonisolated public static let significantTimeChangeNotification = NSNotification.Name("x")
}
