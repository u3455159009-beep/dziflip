// Produces the ≤ 30 s system sound used by AlarmKit / notifications.
//
// Apple only documents Linear PCM / IMA4 / µLaw / aLaw in .aiff/.wav/.caf,
// shorter than 30 s, for sounds the system plays on the app's behalf
// (UNNotificationSound docs; AlarmKit reuses ActivityKit's
// AlertConfiguration.AlertSound, whose `named(_:)` looks in the main bundle
// and <container>/Library/Sounds). AAC/.m4a is NOT in that list, so instead of
// an AVAssetExportSession(AppleM4A) clip we transcode to 16-bit LPCM in a
// .caf container with AVAssetReader + AVAssetWriter.

import AVFoundation
import Foundation

enum SoundClipError: Error, CustomStringConvertible {
  case unsupportedUri(String)
  case fileMissing(String)
  case noAudioTrack
  case readerFailed(String)
  case writerFailed(String)

  var description: String {
    switch self {
    case .unsupportedUri(let uri): return "Only local file URIs are supported (got \(uri))"
    case .fileMissing(let path): return "Sound file does not exist: \(path)"
    case .noAudioTrack: return "The file has no audio track"
    case .readerFailed(let msg): return "Could not read the track: \(msg)"
    case .writerFailed(let msg): return "Could not write the clip: \(msg)"
    }
  }
}

final class WakeifySoundClipper {
  static let shared = WakeifySoundClipper()

  /// Keep a margin under the documented 30 s hard limit.
  static let clipSeconds: Double = 29
  static let filePrefix = "wakeify_"
  static let fileExtension = "caf"

  private let queue = AsyncSerialQueue()

  static func soundsDirectory() throws -> URL {
    let library = try FileManager.default.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let sounds = library.appendingPathComponent("Sounds", isDirectory: true)
    try FileManager.default.createDirectory(at: sounds, withIntermediateDirectories: true)
    return sounds
  }

  static func clipKey(uri: String, startOffsetMs: Double) -> String {
    return "\(uri)|\(Int64(startOffsetMs.rounded()))"
  }

  static func fileName(uri: String, startOffsetMs: Double) -> String {
    return "\(filePrefix)\(WakeifyIds.shortHash(clipKey(uri: uri, startOffsetMs: startOffsetMs))).\(fileExtension)"
  }

  /// True when `name` already is a clip inside Library/Sounds.
  static func existingSoundName(_ name: String) -> String? {
    guard !name.contains("/"), let dir = try? soundsDirectory() else { return nil }
    return FileManager.default.fileExists(atPath: dir.appendingPathComponent(name).path) ? name : nil
  }

  static func localFileURL(from uri: String) -> URL? {
    if uri.hasPrefix("file://") {
      return URL(string: uri)
    }
    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }
    return nil
  }

  /// Returns the Library/Sounds file name for (uri, offset), exporting it if needed.
  func prepare(uri: String, startOffsetMs: Double) async throws -> String {
    if let existing = Self.existingSoundName(uri) {
      return existing
    }
    return try await queue.enqueue {
      let name = Self.fileName(uri: uri, startOffsetMs: startOffsetMs)
      let destination = try Self.soundsDirectory().appendingPathComponent(name)
      if FileManager.default.fileExists(atPath: destination.path) {
        return name
      }
      guard let source = Self.localFileURL(from: uri) else {
        throw SoundClipError.unsupportedUri(uri)
      }
      guard FileManager.default.fileExists(atPath: source.path) else {
        throw SoundClipError.fileMissing(source.path)
      }
      try await Self.exportClip(from: source, startOffsetMs: startOffsetMs, to: destination)
      WakeifyAlarmStore.shared.mutate { state in
        state.soundClips[Self.clipKey(uri: uri, startOffsetMs: startOffsetMs)] = name
      }
      return name
    }
  }

  /// Deletes clips that no current spec references and that are older than a day.
  static func pruneClips(keeping referenced: Set<String>) {
    guard let dir = try? soundsDirectory(),
          let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
    let cutoff = Date().addingTimeInterval(-86_400)
    for file in files where file.lastPathComponent.hasPrefix(filePrefix) && !referenced.contains(file.lastPathComponent) {
      let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
      if modified < cutoff {
        try? FileManager.default.removeItem(at: file)
      }
    }
  }

  private static func exportClip(from source: URL, startOffsetMs: Double, to destination: URL) async throws {
    let asset = AVURLAsset(url: source)
    let tracks = try await asset.loadTracks(withMediaType: .audio)
    guard let track = tracks.first else { throw SoundClipError.noAudioTrack }
    let duration = try await asset.load(.duration)

    let timescale: CMTimeScale = 1000
    let clipLength = CMTime(seconds: clipSeconds, preferredTimescale: timescale)
    var start = CMTime(value: CMTimeValue(startOffsetMs.rounded()), timescale: timescale)
    if duration.isNumeric && start >= duration {
      // Offset past the end: use the last 29 s (or the whole short track).
      start = CMTimeMaximum(.zero, CMTimeSubtract(duration, clipLength))
    }
    var length = clipLength
    if duration.isNumeric {
      length = CMTimeMinimum(clipLength, CMTimeSubtract(duration, start))
    }

    let pcmSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: 44_100,
      AVNumberOfChannelsKey: 2,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw SoundClipError.readerFailed(error.localizedDescription)
    }
    reader.timeRange = CMTimeRange(start: start, duration: length)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: pcmSettings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw SoundClipError.readerFailed("cannot add output") }
    reader.add(output)

    let temp = destination.deletingLastPathComponent().appendingPathComponent(".tmp-\(UUID().uuidString).caf")
    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: temp, fileType: .caf)
    } catch {
      throw SoundClipError.writerFailed(error.localizedDescription)
    }
    let input = AVAssetWriterInput(mediaType: .audio, outputSettings: pcmSettings)
    input.expectsMediaDataInRealTime = false
    guard writer.canAdd(input) else { throw SoundClipError.writerFailed("cannot add input") }
    writer.add(input)

    guard reader.startReading() else {
      throw SoundClipError.readerFailed(reader.error?.localizedDescription ?? "startReading failed")
    }
    guard writer.startWriting() else {
      reader.cancelReading()
      throw SoundClipError.writerFailed(writer.error?.localizedDescription ?? "startWriting failed")
    }

    var sessionStarted = false
    while let buffer = output.copyNextSampleBuffer() {
      if !sessionStarted {
        writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(buffer))
        sessionStarted = true
      }
      while !input.isReadyForMoreMediaData {
        try await Task.sleep(nanoseconds: 5_000_000)
      }
      if !input.append(buffer) {
        reader.cancelReading()
        writer.cancelWriting()
        try? FileManager.default.removeItem(at: temp)
        throw SoundClipError.writerFailed(writer.error?.localizedDescription ?? "append failed")
      }
    }
    if reader.status == .failed {
      writer.cancelWriting()
      try? FileManager.default.removeItem(at: temp)
      throw SoundClipError.readerFailed(reader.error?.localizedDescription ?? "unknown")
    }
    guard sessionStarted else {
      writer.cancelWriting()
      try? FileManager.default.removeItem(at: temp)
      throw SoundClipError.readerFailed("no audio samples in the selected range")
    }
    input.markAsFinished()
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      writer.finishWriting { continuation.resume() }
    }
    guard writer.status == .completed else {
      try? FileManager.default.removeItem(at: temp)
      throw SoundClipError.writerFailed(writer.error?.localizedDescription ?? "status \(writer.status.rawValue)")
    }
    try? FileManager.default.removeItem(at: destination)
    try FileManager.default.moveItem(at: temp, to: destination)
  }
}

/// Runs async operations one after another (FIFO), even across awaits.
/// Implemented with continuations instead of chained `Task<T, _>`s so `T`
/// does not have to be `Sendable`.
final class AsyncSerialQueue {
  private let lock = NSLock()
  private var busy = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func enqueue<T>(_ operation: () async throws -> T) async throws -> T {
    await acquire()
    defer { release() }
    return try await operation()
  }

  private func acquire() async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      lock.lock()
      if busy {
        waiters.append(continuation)
        lock.unlock()
      } else {
        busy = true
        lock.unlock()
        continuation.resume()
      }
    }
  }

  private func release() {
    lock.lock()
    if waiters.isEmpty {
      busy = false
      lock.unlock()
    } else {
      let next = waiters.removeFirst()
      lock.unlock()
      next.resume()
    }
  }
}
