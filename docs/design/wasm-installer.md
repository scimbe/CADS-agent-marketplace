# Design: `InstallerKind::Wasm`

Companion to `docs/adr/0003-wasm-installer-kind-for-mobile.md` (decision and risks); this file is
the mechanism.

## Manifest

`ServiceManifest.wasm: Option<WasmSpec>` (JSON key `wasm`), present exactly when
`installer_kind == "wasm"`. Preimage: after `environment`, `tag(3)` + `WasmSpec` fields, each
variable-length field length-prefixed; `None` appends nothing. `bundle.compose_file` should equal
`wasm.component_path` (it is still checked by the generic traversal guard).

```json
"wasm": {
  "component_path": "wasm-hello.wasm",
  "component_sha256": "<64 hex>",
  "world": "wasi:cli/command",
  "capabilities": {
    "preopens": [{"guest_path": "/work", "mode": "rw"}],
    "allowed_http_hosts": [],
    "env": []
  },
  "limits": {"max_memory_bytes": 67108864, "timeout_ms": 10000}
}
```

Validation (`WasmSpec::validate`, `ServiceManifest::validate_wasm_spec`): world fixed;
`component_path`/`host_subdir` relative without `..`; unique guest paths; hostnames lowercase exact
DNS names with >= 2 labels, no IP literal/port/wildcard; env names `[A-Za-z_][A-Za-z0-9_]*` and
declared in `env_template`; limits non-zero and capped (2 GiB, 1 h, fuel 1e15); list sizes capped.

## Activation (`activate`)

Step 4a' validates the block (also rejects a stray block on other kinds), then the normal fetch,
bundle sha256, safe unpack, env resolution. Step 8b dispatches `Wasm` to `wasm_runtime::activate_wasm`,
which reads the component, runs it and maps the outcome: exit 0 -> `InstallReport::Ok` (sandbox
`"wasmtime"`; `verify` mirrors the run), spec/hash problems -> `Rejected`, everything else -> `Failed`
with step `wasm_run`.

## Runtime

Per run: a dedicated thread (no nested tokio runtime issues), a current-thread tokio runtime, an
`Engine` configured for `Jit` or Pulley, the component compiled from the verified bytes, a `Linker`
with WASI p2 (and `wasi:http` only when granted), a `Store` with the memory limiter, optional fuel,
and an epoch ticker (10 ms) whose deadline callback yields to the executor until `timeout_ms`, at
which point the guest is trapped; a `tokio::time::timeout` additionally bounds a guest blocked in a
host call. Outcome classification: `Exited{code}`, `Trapped`, `TimedOut`, `OutOfFuel`,
`MemoryLimitExceeded`, `OutputLimitExceeded`, `Refused{reason}`, `Error{message}`.

## Pulley

`WasmEngineKind::Interpreter` sets `Config::target("pulley64")` (`pulley32` on 32-bit hosts), which
needs wasmtime's `pulley` feature; wasmtime accepts running Pulley output when pointer width and
endianness match the host. Verified against wasmtime-50.0.0 sources (`Config::target`,
`Engine` host-compatibility check) and by running the test guests on Pulley.

## Example and tests

`examples/wasm-hello` (Rust, `wasm32-wasip2`), built by `scripts/build-wasm-hello.sh` (CI adds the
target). Tests: `crates/installer-engine/tests/wasm_runtime.rs` (hand-written WAT components, both
engines), `wasm_activate.rs` (end-to-end `activate`), `wasm_hello.rs` (the Rust example; skips
locally without the built component, fails in CI if it is missing).
