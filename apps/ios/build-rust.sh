#!/usr/bin/env bash
# Builds crates/mobile-core into apps/ios/Frameworks/MobileCoreFFI.xcframework and generates the
# Swift bindings into apps/ios/Generated/. Needs rustup targets aarch64-apple-ios and
# aarch64-apple-ios-sim (`rustup target add ...`) and Xcode command line tools.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=apps/ios
PROFILE=release
TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim)

for t in "${TARGETS[@]}"; do
  cargo build -p mobile-core --"$PROFILE" --target "$t"
done
# Host build: bindgen reads the UniFFI metadata from the cdylib.
cargo build -p mobile-core --"$PROFILE"
cargo build -p mobile-core --features cli --bin uniffi-bindgen --"$PROFILE"

HOSTLIB=target/$PROFILE/libmobile_core.dylib
[ -f "$HOSTLIB" ] || HOSTLIB=target/$PROFILE/libmobile_core.so
# Generated build output only (all git-ignored).
rm -rf "$OUT/Generated" "$OUT/Frameworks" target/ios-headers
mkdir -p "$OUT/Generated" "$OUT/Frameworks" target/ios-headers
target/$PROFILE/uniffi-bindgen generate --library "$HOSTLIB" --language swift --out-dir target/ios-headers

mv target/ios-headers/mobile_core.swift "$OUT/Generated/"
mv target/ios-headers/mobile_coreFFI.modulemap target/ios-headers/module.modulemap

args=()
for t in "${TARGETS[@]}"; do
  args+=(-library "target/$t/$PROFILE/libmobile_core.a" -headers target/ios-headers)
done
xcodebuild -create-xcframework "${args[@]}" -output "$OUT/Frameworks/MobileCoreFFI.xcframework"
echo "ok: $OUT/Frameworks/MobileCoreFFI.xcframework, $OUT/Generated/mobile_core.swift"
