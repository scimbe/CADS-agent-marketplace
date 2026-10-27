#!/usr/bin/env bash
# Build examples/wasm-hello as a WASI 0.2 component and print its sha256.
# Needs the wasm32-wasip2 target:  rustup target add wasm32-wasip2   (CI does this).
# Output: examples/wasm-hello/dist/wasm-hello.wasm
set -euo pipefail
cd "$(dirname "$0")/../examples/wasm-hello"
cargo build --release --locked --target wasm32-wasip2
mkdir -p dist
cp target/wasm32-wasip2/release/wasm-hello.wasm dist/wasm-hello.wasm
if command -v sha256sum >/dev/null; then sha256sum dist/wasm-hello.wasm; else shasum -a 256 dist/wasm-hello.wasm; fi
ls -l dist/wasm-hello.wasm | awk '{print $5 " bytes"}'
