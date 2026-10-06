@_exported import Foundation
public struct Digest: Sequence { public func makeIterator() -> IndexingIterator<[UInt8]> { [UInt8](repeating: 0, count: 32).makeIterator() } }
public enum Insecure { public enum SHA1 { public static func hash<D: DataProtocol>(data: D) -> Digest { Digest() } } }
public enum SHA256 { public static func hash<D: DataProtocol>(data: D) -> Digest { Digest() } }
