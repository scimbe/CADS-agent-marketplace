#!/usr/bin/env bash
# Builds crates/mobile-core for Android (cargo-ndk) into app/src/main/jniLibs and generates the
# Kotlin bindings into app/src/main/java/uniffi. Needs: rustup targets aarch64-linux-android and
# x86_64-linux-android, `cargo install cargo-ndk`, ANDROID_NDK_HOME (or ANDROID_NDK_ROOT).
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=apps/android/app/src/main

cargo ndk -t arm64-v8a -t x86_64 -o "$OUT/jniLibs" build -p mobile-core --features wasm,peer --release

# Bindings come from the host build of the same library (metadata is identical).
cargo build -p mobile-core --features peer --release
cargo build -p mobile-core --features cli,peer --bin uniffi-bindgen --release
HOSTLIB=target/release/libmobile_core.so
[ -f "$HOSTLIB" ] || HOSTLIB=target/release/libmobile_core.dylib
target/release/uniffi-bindgen generate --library "$HOSTLIB" --language kotlin --no-format --out-dir "$OUT/java"
echo "ok: $OUT/jniLibs, $OUT/java/uniffi"
