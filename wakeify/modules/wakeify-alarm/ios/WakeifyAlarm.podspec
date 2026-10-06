require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'WakeifyAlarm'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  # Same minimum as ExpoModulesCore in Expo SDK 57.
  s.platforms      = {
    :ios => '16.4'
  }
  # Swift 5 language mode on purpose: the module uses AlarmKit / AppIntents
  # types from Task closures and we do not want Swift 6 strict-concurrency
  # diagnostics to become build errors in a local module.
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'UserNotifications', 'ActivityKit', 'AppIntents', 'SwiftUI', 'CryptoKit'
  # AlarmKit only exists on iOS 26+. Weak-link it so the binary still launches
  # on iOS 16.4–18.x, where the UNUserNotificationCenter fallback is used.
  s.weak_frameworks = 'AlarmKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
