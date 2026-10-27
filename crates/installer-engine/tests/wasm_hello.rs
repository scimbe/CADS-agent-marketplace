//! Runs the REAL Rust example (`examples/wasm-hello`, built for `wasm32-wasip2`) under the runtime.
//!
//! The component is located via `WASM_HELLO_COMPONENT`, else
//! `examples/wasm-hello/dist/wasm-hello.wasm`. If it is not built these tests print a notice and
//! pass, UNLESS `WASM_HELLO_REQUIRED=1` (set by CI after `scripts/build-wasm-hello.sh`), in which
//! case a missing component is a failure -- so CI can never skip them silently.
#![cfg(feature = "wasm")]

use installer_engine::{run_wasm_component_with, WasmEngineKind, WasmOutcome, WasmRunOptions};
use manifest_core::{Preopen, PreopenMode, WasmCapabilities, WasmLimits, WasmSpec};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

fn component() -> Option<Vec<u8>> {
    let path = std::env::var_os("WASM_HELLO_COMPONENT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/wasm-hello/dist/wasm-hello.wasm"));
    match std::fs::read(&path) {
        Ok(b) => Some(b),
        Err(e) => {
            assert!(
                std::env::var("WASM_HELLO_REQUIRED").as_deref() != Ok("1"),
                "WASM_HELLO_REQUIRED=1 but {} is not readable: {e}",
                path.display()
            );
            eprintln!("skipping: {} not built ({e}); run scripts/build-wasm-hello.sh", path.display());
            None
        }
    }
}

fn spec(bytes: &[u8]) -> WasmSpec {
    WasmSpec {
        component_path: "wasm-hello.wasm".into(),
        component_sha256: Sha256::digest(bytes).into(),
        world: "wasi:cli/command".into(),
        capabilities: WasmCapabilities {
            preopens: vec![Preopen { guest_path: "/work".into(), host_subdir: String::new(), mode: PreopenMode::Rw }],
            allowed_http_hosts: vec![],
            env: vec![],
        },
        limits: WasmLimits { max_memory_bytes: 64 << 20, timeout_ms: 20_000, fuel: None },
    }
}

fn run(kind: WasmEngineKind, bytes: &[u8], dir: &std::path::Path, args: &[&str]) -> installer_engine::WasmRunReport {
    let opts = WasmRunOptions { engine: kind, args: args.iter().map(|s| s.to_string()).collect(), ..Default::default() };
    run_wasm_component_with(bytes, &spec(bytes), dir, &opts)
}

#[test]
fn hello_writes_its_file_inside_the_preopen_and_reports_on_stdout() {
    let Some(bytes) = component() else { return };
    for kind in [WasmEngineKind::Jit, WasmEngineKind::Interpreter] {
        let dir = tempfile::tempdir().unwrap();
        let r = run(kind, &bytes, dir.path(), &["world"]);
        assert_eq!(r.outcome, WasmOutcome::Exited { code: 0 }, "{kind:?}: {r:?}");
        assert_eq!(r.stdout.trim(), "hello, world");
        assert_eq!(std::fs::read_to_string(dir.path().join("hello.txt")).unwrap(), "hello, world");
    }
}

#[test]
fn hello_cannot_open_a_path_outside_the_preopen() {
    let Some(bytes) = component() else { return };
    let outer = tempfile::tempdir().unwrap();
    let work = outer.path().join("work");
    std::fs::create_dir(&work).unwrap();
    let target = outer.path().join("escaped.txt");
    for path in ["../escaped.txt", target.to_str().unwrap()] {
        for kind in [WasmEngineKind::Jit, WasmEngineKind::Interpreter] {
            let r = run(kind, &bytes, &work, &["--try-open", path]);
            assert_eq!(r.outcome, WasmOutcome::Exited { code: 3 }, "{path} {kind:?}: {r:?}");
            assert!(r.stderr.contains("refused"), "{}", r.stderr);
        }
    }
    assert!(!target.exists());
}
