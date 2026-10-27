# ADR-0003: WebAssembly installer kind for mobile (and one uniform sandbox everywhere)

## Status

Proposed. Supersedes the native-execution part of ADR-0002 (see "Relation to ADR-0002"). The desktop
implementation exists and is tested (`InstallerKind::Wasm`, `installer_engine::wasm_runtime`); it has
**not** been run on an Android or iOS device, and **store acceptance is unconfirmed** (see "Risks").

## Context

- Android: apps with `targetSdkVersion >= 29` cannot `exec` files from app-writable directories. A
  downloaded Linux binary cannot be started.
- iOS: no `exec`/`fork` for third-party apps, no writable-and-executable memory (no JIT without
  special entitlements), and App Store Review Guideline 2.5.2 forbids apps that download, install
  or execute code that changes the app's features, with a narrow exception for code run by an
  interpreter/VM (see Risks).
- Desktop has per-OS sandboxes (bwrap, Seatbelt, WSL2+bwrap) with different strength and different
  failure modes. A single, strong, identical confinement mechanism would simplify the security case.

## Decision

Add `InstallerKind::Wasm`: the install is a **WASI 0.2 command component** run inside the host
process under **wasmtime**. The Wasm runtime is the sandbox:

1. **Signed capability description** (`manifest_core::WasmSpec`, part of the signing preimage with a
   new presence tag `3`; absent block = unchanged preimage, so all existing signatures stay valid,
   pinned by a regression test with a manifest signed before the change): component path and
   SHA-256, world (`wasi:cli/command` only), preopened directories (`ro`/`rw`, host side always the
   per-install work dir or a sub-directory), exact HTTPS hostnames, environment variable *names*,
   memory cap, wall-clock timeout, optional fuel.
2. **Nothing ambient.** No inherited stdio (captured, capped), no ambient env, no sockets, no
   `wasi:http` unless hosts are granted; then a hook enforces `https` + exact host + port 443.
3. **Engines.** `Jit` (Cranelift native code) where executable memory exists, `Interpreter`
   (wasmtime's Pulley bytecode interpreter, `Config::target("pulley64")`, wasmtime 50.0.0) where it
   does not (iOS). Same components, same limits.
4. **Public API for bindings** (`installer_engine::wasm_runtime`):
   `run_wasm_component(bytes, &WasmSpec, work_dir, args) -> WasmRunReport` and
   `run_wasm_component_with(.., &WasmRunOptions)`; no `Result`, every failure is a `WasmOutcome`.
   The mobile layer (UniFFI) wraps exactly this.
5. Feature flags: `wasm` (default on) and `wasm-http` (default on; pulls hyper/rustls). Without
   `wasm`, `Wasm` manifests are refused with a clear reason.

Verification step: the component's own exit status is the verdict; there is no separate verify
script (a second signed `verify` component path can be added later as one more field).

## Relation to ADR-0002

ADR-0002 proposed running the ct-agent core in the app and letting the app's UID be the sandbox for
the *payload*. That cannot cover downloaded native code on Android >= 10 and is impossible on iOS.
This ADR replaces that part: downloaded payloads on mobile are Wasm components inside the app. The
rest of ADR-0002 (compiling the core for mobile, UniFFI bindings, the app as outer boundary) stands
and is how the runtime reaches the UI. `Binary` stays refused on Android.

## Consequences

- One sandbox for desktop, Android, iOS and (via a different host) the browser. Its strength is that
  of wasmtime's isolation plus our capability policy -- stronger and more uniform than three OS
  backends for payloads that can be compiled to `wasm32-wasip2`.
- Publishers must ship Wasm. Docker Compose services and native binaries do not become Wasm.
- Pulley is slower than JIT (order of magnitude depends on workload; not benchmarked here).
- Binary size grows (wasmtime + Cranelift; `wasm-http` adds the TLS stack). Mobile builds that do not
  need HTTP can disable `wasm-http`.
- MSRV: the crates stay at Rust 1.85; only builds with installer-engine's `wasm` feature need 1.97
  (wasmtime 50.0.0). Consumers on an older toolchain (ct-agent pins this repo by git tag) depend with
  `default-features = false`; `registry` and `harness-core` do. The registry image builds on rust:1.97.
- Residual: a sandbox-escape bug in wasmtime defeats the confinement and there is no OS-level second
  layer. The version is pinned exactly; updates must be deliberate and fast for security releases.

## Risks (stated honestly)

- **Apple App Store, Guideline 2.5.2.** Downloaded code is allowed only if it is interpreted or run
  by an interpreter/VM and does not change the app's primary purpose or provide a store-like
  surface, and does not get direct access to OS APIs beyond what the app itself exposes. Our design
  is shaped to that reading (interpreter only on iOS, capability-restricted, no OS API access except
  the explicitly granted directories/hosts), but **this is our reading of the policy, not a review
  outcome.** It needs confirmation by App Review (or Apple's developer relations) before relying on
  it, and the product framing matters (an installer marketplace may look like exactly what 2.5.2
  targets).
- **Google Play, "Device and Network Abuse" / Malicious behavior policy.** Apps must not download
  executable code (e.g. dex, native) from outside Google Play; interpreted code in a VM that does
  not have direct access to Android APIs is the stated exception. Wasm in a capability-restricted
  runtime fits that exception in intent; again unconfirmed by Google review.
- Both stores can change policy or interpret it differently per app. Treat store acceptance as an open
  gate for the mobile release, not as solved by this ADR.
- Pulley on iOS has been tested only on macOS/arm64 so far; iOS-specific constraints (no mmap with
  exec, signal handling) are untested. `signals_based_traps(false)` is set for the interpreter as the
  documented precaution; this needs a device test.

## Alternatives considered

- Run native payloads in an Android `:sandbox` process (ADR-0002): blocked by the W^X rule for
  downloaded files; works only for code shipped in the APK.
- Embedded scripting (Lua, JS): weaker, language-bound, and no capability model comparable to WASI.
- Browser-only (Wasm in a web view): no uniform story for desktop and no file system access model.
