//! Runs the repo's hand-written WAT test guests (installer-engine/tests/common) through
//! mobile-core, on the JIT and on the Pulley interpreter that iOS uses.
#![cfg(feature = "wasm")]

use installer_engine::WasmEngineKind;
use manifest_core::{WasmCapabilities, WasmLimits, WasmSpec};
use mobile_core::wasm::{
    run_wasm_installation, wasm_runtime_available, InstallerWasmExecutor, WasmExecutor,
};
use sha2::{Digest, Sha256};

#[path = "../../installer-engine/tests/common/mod.rs"]
mod common;

fn spec_json(bytes: &[u8]) -> String {
    let spec = WasmSpec {
        component_path: "app.wasm".into(),
        component_sha256: Sha256::digest(bytes).into(),
        world: "wasi:cli/command".into(),
        capabilities: WasmCapabilities {
            preopens: vec![],
            allowed_http_hosts: vec![],
            env: vec![],
        },
        limits: WasmLimits {
            max_memory_bytes: 16 << 20,
            timeout_ms: 5_000,
            fuel: None,
        },
    };
    serde_json::to_string(&spec).unwrap()
}

#[test]
fn exported_function_runs_the_guest_to_exit_zero() {
    assert!(wasm_runtime_available());
    let bytes = common::simple_component("i32.const 0", 1);
    let dir = tempfile::tempdir().unwrap();
    let out = run_wasm_installation(
        bytes.clone(),
        spec_json(&bytes),
        vec![],
        dir.path().to_string_lossy().into_owned(),
    )
    .unwrap();
    assert_eq!(
        (out.outcome.as_str(), out.exit_code),
        ("exited", 0),
        "{out:?}"
    );
}

#[test]
fn both_engines_agree_including_the_ios_interpreter() {
    let ok = common::simple_component("i32.const 0", 1);
    let fail = common::simple_component("i32.const 1", 1);
    let dir = tempfile::tempdir().unwrap();
    for kind in [WasmEngineKind::Jit, WasmEngineKind::Interpreter] {
        let ex = InstallerWasmExecutor::with_engine(kind);
        let o = ex.run(&ok, &spec_json(&ok), &[], dir.path()).unwrap();
        assert_eq!(
            (o.outcome.as_str(), o.exit_code),
            ("exited", 0),
            "{kind:?} {o:?}"
        );
        let f = ex.run(&fail, &spec_json(&fail), &[], dir.path()).unwrap();
        assert_eq!(
            (f.outcome.as_str(), f.exit_code),
            ("exited", 1),
            "{kind:?} {f:?}"
        );
    }
}

#[test]
fn a_tampered_component_is_refused_before_it_runs() {
    let bytes = common::simple_component("i32.const 0", 1);
    let other = common::simple_component("i32.const 1", 1);
    let dir = tempfile::tempdir().unwrap();
    // The spec signs `bytes`; the caller hands in different bytes.
    let out = run_wasm_installation(
        other,
        spec_json(&bytes),
        vec![],
        dir.path().to_string_lossy().into_owned(),
    )
    .unwrap();
    assert_eq!(out.outcome, "refused", "{out:?}");
    assert_eq!(out.exit_code, -1);
}
