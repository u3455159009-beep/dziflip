#!/bin/sh
# Type-checks the iOS module with a real Swift 6.2 compiler on Linux, against
# hand-written stubs of Apple frameworks + ExpoModulesCore (stubs/*.swift,
# signatures copied from Apple's documentation JSON and expo-modules-core 57).
# This is NOT an Xcode build: a wrong stub can hide a real error, and iOS
# availability is not checked. Then runs the store/planner scenario harness
# natively (pure Foundation code).
#
#   docker run --rm -v "$PWD/../..":/w -w /w/tools/ios-typecheck swift:6.2-noble sh run.sh
set -e
cd "$(dirname "$0")"
IOS=../../modules/wakeify-alarm/ios
OUT=$(mktemp -d)
# Dependency order of the stub modules.
for name in AppleBase SwiftUI UIKit CryptoKit AVFoundation UserNotifications ActivityKit AppIntents AlarmKit ExpoModulesCore; do
  swiftc -emit-module -parse-as-library -module-name "$name" -I "$OUT" -o "$OUT/$name.swiftmodule" "stubs/$name.swift"
done
swiftc -typecheck -swift-version 5 -parse-as-library -module-name WakeifyAlarm -I "$OUT" $IOS/*.swift
echo "typecheck OK"
# Scenario harness: the REAL WakeifyAlarmStore.swift + WakeifyAlarmRecords.swift,
# linked against runnable stand-ins for CryptoKit and ExpoModulesCore.
swiftc -emit-library -emit-module -parse-as-library -module-name CryptoKit -o "$OUT/libCryptoKit.so" -emit-module-path "$OUT/CryptoKit.swiftmodule" harness/Crypto.swift
swiftc -emit-library -emit-module -parse-as-library -module-name ExpoModulesCore -o "$OUT/libExpoModulesCore.so" -emit-module-path "$OUT/ExpoModulesCore.swiftmodule" stubs/ExpoModulesCore.swift
swiftc -swift-version 5 -I "$OUT" -L "$OUT" -lCryptoKit -lExpoModulesCore -Xlinker -rpath -Xlinker "$OUT" \
  -o "$OUT/harness" harness/main.swift $IOS/WakeifyAlarmStore.swift $IOS/WakeifyAlarmRecords.swift
"$OUT/harness"
