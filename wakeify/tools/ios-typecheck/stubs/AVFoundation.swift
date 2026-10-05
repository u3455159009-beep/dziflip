@_exported import Foundation
public struct CMTimeScale: ExpressibleByIntegerLiteral { public init(integerLiteral: Int32) {} }
public typealias CMTimeValue = Int64
public struct CMTime: Comparable, Sendable {
  public init(seconds: Double, preferredTimescale: CMTimeScale) {}
  public init(value: CMTimeValue, timescale: CMTimeScale) {}
  public static let zero = CMTime(value: 0, timescale: 1)
  public var isNumeric: Bool { true }
  public static func < (a: CMTime, b: CMTime) -> Bool { false }
}
public func CMTimeMaximum(_ a: CMTime, _ b: CMTime) -> CMTime { a }
public func CMTimeMinimum(_ a: CMTime, _ b: CMTime) -> CMTime { a }
public func CMTimeSubtract(_ a: CMTime, _ b: CMTime) -> CMTime { a }
public struct CMTimeRange { public init(start: CMTime, duration: CMTime) {} }
public final class CMSampleBuffer {}
public func CMSampleBufferGetPresentationTimeStamp(_ b: CMSampleBuffer) -> CMTime { .zero }
public let kAudioFormatLinearPCM: UInt32 = 0
public let AVFormatIDKey = "a", AVSampleRateKey = "b", AVNumberOfChannelsKey = "c", AVLinearPCMBitDepthKey = "d", AVLinearPCMIsFloatKey = "e", AVLinearPCMIsBigEndianKey = "f", AVLinearPCMIsNonInterleaved = "g"
public struct AVMediaType: Hashable { public static let audio = AVMediaType() }
public struct AVFileType: Hashable { public static let caf = AVFileType() }
open class AVAssetTrack {}
public struct AVAsyncProperty<Root, Value> {}
extension AVAsyncProperty where Root == AVAsset, Value == CMTime { public static var duration: AVAsyncProperty<AVAsset, CMTime> { .init() } }
open class AVAsset {
  public func load<T>(_ p: AVAsyncProperty<AVAsset, T>) async throws -> T { fatalError() }
  public func loadTracks(withMediaType: AVMediaType) async throws -> [AVAssetTrack] { [] }
}
open class AVURLAsset: AVAsset { public init(url: URL) {} }
open class AVAssetReaderOutput { open func copyNextSampleBuffer() -> CMSampleBuffer? { nil }; open var alwaysCopiesSampleData = true }
open class AVAssetReaderTrackOutput: AVAssetReaderOutput { public init(track: AVAssetTrack, outputSettings: [String: Any]?) {} }
public enum AVAssetReaderStatus: Int { case unknown, reading, completed, failed, cancelled }
open class AVAssetReader {
  public init(asset: AVAsset) throws {}
  open var timeRange = CMTimeRange(start: .zero, duration: .zero)
  open func canAdd(_ o: AVAssetReaderOutput) -> Bool { true }
  open func add(_ o: AVAssetReaderOutput) {}
  open func startReading() -> Bool { true }
  open func cancelReading() {}
  open var status: AVAssetReaderStatus { .unknown }
  open var error: Error? { nil }
}
open class AVAssetWriterInput {
  public init(mediaType: AVMediaType, outputSettings: [String: Any]?) {}
  open var expectsMediaDataInRealTime = false
  open var isReadyForMoreMediaData: Bool { true }
  open func append(_ b: CMSampleBuffer) -> Bool { true }
  open func markAsFinished() {}
}
public enum AVAssetWriterStatus: Int { case unknown, writing, completed, failed, cancelled }
open class AVAssetWriter {
  public init(outputURL: URL, fileType: AVFileType) throws {}
  open func canAdd(_ i: AVAssetWriterInput) -> Bool { true }
  open func add(_ i: AVAssetWriterInput) {}
  open func startWriting() -> Bool { true }
  open func startSession(atSourceTime: CMTime) {}
  open func cancelWriting() {}
  open func finishWriting(completionHandler: @escaping @Sendable () -> Void) {}
  open var status: AVAssetWriterStatus { .unknown }
  open var error: Error? { nil }
}
