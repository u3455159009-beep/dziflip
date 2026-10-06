@_exported import Foundation
public protocol AnyArgument {}
extension Bool: AnyArgument {}
extension Int: AnyArgument {}
extension Double: AnyArgument {}
extension String: AnyArgument {}
extension Optional: AnyArgument where Wrapped: AnyArgument {}
extension Dictionary: AnyArgument where Key: Hashable {}
extension Array: AnyArgument {}
public protocol AnyDefinition {}
public final class ModuleDefinition { init(definitions: [AnyDefinition]) {} }
@resultBuilder public struct ModuleDefinitionBuilder {
  public static func buildBlock(_ definitions: AnyDefinition...) -> ModuleDefinition { ModuleDefinition(definitions: definitions) }
}
public struct D: AnyDefinition {}
public func Name(_ n: String) -> AnyDefinition { D() }
public func Events(_ names: String...) -> AnyDefinition { D() }
public func OnCreate(@_implicitSelfCapture _ closure: @escaping () -> Void) -> AnyDefinition { D() }
public func OnDestroy(@_implicitSelfCapture _ closure: @escaping () -> Void) -> AnyDefinition { D() }
public func OnAppBecomesActive(@_implicitSelfCapture _ closure: @escaping () -> Void) -> AnyDefinition { D() }
public struct AsyncFunctionDefinition<Args, FirstArgType, ReturnType>: AnyDefinition {}
public struct SyncFunctionDefinition<Args, FirstArgType, ReturnType>: AnyDefinition {}
public func AsyncFunction<R>(_ name: String, @_implicitSelfCapture _ closure: @escaping () throws -> R) -> AsyncFunctionDefinition<(), Void, R> { .init() }
public func AsyncFunction<R, A0: AnyArgument, each A: AnyArgument>(_ name: String, @_implicitSelfCapture _ closure: @escaping (A0, repeat each A) throws -> R) -> AsyncFunctionDefinition<(A0, repeat each A), A0, R> { .init() }
public func Function<R>(_ name: String, @_implicitSelfCapture _ closure: @escaping () throws -> R) -> SyncFunctionDefinition<(), Void, R> { .init() }
public func Function<R, A0: AnyArgument, each A: AnyArgument>(_ name: String, @_implicitSelfCapture _ closure: @escaping (A0, repeat each A) throws -> R) -> SyncFunctionDefinition<(A0, repeat each A), A0, R> { .init() }
public struct Promise: AnyArgument, Sendable {
  public func resolve(_ value: Any? = nil) {}
  public func resolve<T: AnyArgument>(_ value: sending T) {}
  public func reject(_ error: Error) {}
  public func reject(_ code: String, _ description: String) {}
}
public protocol Record: AnyArgument { nonisolated init() }
@propertyWrapper public final class Field<Type: AnyArgument>: @unchecked Sendable {
  public var wrappedValue: Type
  public init(wrappedValue: Type) { self.wrappedValue = wrappedValue }
}
public final class AppContext {}
open class BaseModule {
  public private(set) weak var appContext: AppContext?
  @available(*, unavailable) public init() {}
  required public init(appContext: AppContext) { self.appContext = appContext }
  public func sendEvent(_ eventName: String, _ body: [String: Any?] = [:]) {}
}
public protocol AnyModule: AnyObject, AnyArgument {
  init(appContext: AppContext)
  @ModuleDefinitionBuilder func definition() -> ModuleDefinition
}
public typealias Module = AnyModule & BaseModule
