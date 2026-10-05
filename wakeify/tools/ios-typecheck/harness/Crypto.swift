// Linux stand-in for CryptoKit's SHA256/SHA1 used by WakeifyAlarmStore for
// name-based UUIDs and clip file names. Not cryptographic — it only needs to
// be deterministic and collision-free for the harness inputs (FNV-1a, 32 bytes).
import Foundation

public struct Digest: Sequence {
  let bytes: [UInt8]
  public func makeIterator() -> IndexingIterator<[UInt8]> { bytes.makeIterator() }
}

func fnvDigest<D: DataProtocol>(_ data: D, length: Int) -> Digest {
  var out: [UInt8] = []
  var seed: UInt64 = 0
  while out.count < length {
    var h: UInt64 = 0xcbf29ce484222325 ^ seed
    for b in data { h = (h ^ UInt64(b)) &* 0x100000001b3 }
    for i in 0..<8 { out.append(UInt8((h >> (UInt64(i) * 8)) & 0xff)) }
    seed &+= 0x9e3779b97f4a7c15
  }
  return Digest(bytes: Array(out.prefix(length)))
}

public enum Insecure { public enum SHA1 { public static func hash<D: DataProtocol>(data: D) -> Digest { fnvDigest(data, length: 20) } } }
public enum SHA256 { public static func hash<D: DataProtocol>(data: D) -> Digest { fnvDigest(data, length: 32) } }
