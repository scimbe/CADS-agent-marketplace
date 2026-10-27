//! Behavioural tests for `installer_engine::wasm_runtime`. The guests are hand-written component-model
//! WAT (compiled with the `wat` crate), so the sandbox claims are exercised on every host without a
//! wasm toolchain: filesystem confinement, memory cap, wall-clock timeout, fuel, exit codes,
//! tampered component, no ambient network, and the Pulley interpreter running the same guests.
//! The Rust example component (`examples/wasm-hello`) is covered by `tests/wasm_hello.rs`.
#![cfg(feature = "wasm")]

use installer_engine::{run_wasm_component, run_wasm_component_with, WasmEngineKind, WasmOutcome, WasmRunOptions};
use manifest_core::{Preopen, PreopenMode, WasmCapabilities, WasmLimits, WasmSpec};
use sha2::{Digest, Sha256};

mod common;
use common::{fs_probe_component, simple_component};

fn spec_for(bytes: &[u8], preopens: Vec<Preopen>) -> WasmSpec {
    WasmSpec {
        component_path: "app.wasm".into(),
        component_sha256: Sha256::digest(bytes).into(),
        world: "wasi:cli/command".into(),
        capabilities: WasmCapabilities { preopens, allowed_http_hosts: vec![], env: vec![] },
        limits: WasmLimits { max_memory_bytes: 16 << 20, timeout_ms: 5_000, fuel: None },
    }
}

fn rw(guest: &str, sub: &str) -> Preopen {
    Preopen { guest_path: guest.into(), host_subdir: sub.into(), mode: PreopenMode::Rw }
}

fn engines() -> [WasmEngineKind; 2] {
    [WasmEngineKind::Jit, WasmEngineKind::Interpreter]
}

fn run_on(kind: WasmEngineKind, bytes: &[u8], spec: &WasmSpec, dir: &std::path::Path) -> installer_engine::WasmRunReport {
    run_wasm_component_with(bytes, spec, dir, &WasmRunOptions { engine: kind, ..Default::default() })
}

#[test]
fn a_trivial_component_exits_zero_on_both_engines() {
    let bytes = simple_component("i32.const 0", 1);
    let spec = spec_for(&bytes, vec![]);
    let dir = tempfile::tempdir().unwrap();
    for kind in engines() {
        let r = run_on(kind, &bytes, &spec, dir.path());
        assert_eq!(r.outcome, WasmOutcome::Exited { code: 0 }, "{kind:?}: {r:?}");
        assert!(r.success());
        assert_eq!(r.engine, kind);
    }
}

#[test]
fn a_failing_run_result_is_exit_code_one() {
    let bytes = simple_component("i32.const 1", 1);
    let spec = spec_for(&bytes, vec![]);
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert_eq!(r.outcome, WasmOutcome::Exited { code: 1 });
    assert!(!r.success());
}

#[test]
fn a_guest_writes_inside_its_rw_preopen() {
    let bytes = fs_probe_component("out.txt");
    let spec = spec_for(&bytes, vec![rw("/work", "")]);
    for kind in engines() {
        let dir = tempfile::tempdir().unwrap();
        let r = run_on(kind, &bytes, &spec, dir.path());
        assert_eq!(r.outcome, WasmOutcome::Exited { code: 0 }, "{kind:?}: {r:?}");
        assert_eq!(std::fs::read_to_string(dir.path().join("out.txt")).unwrap(), "hello");
    }
}

#[test]
fn a_preopen_can_be_a_subdirectory_of_the_work_dir() {
    let bytes = fs_probe_component("out.txt");
    let spec = spec_for(&bytes, vec![rw("/data", "sub/dir")]);
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert_eq!(r.outcome, WasmOutcome::Exited { code: 0 }, "{r:?}");
    assert_eq!(std::fs::read_to_string(dir.path().join("sub/dir/out.txt")).unwrap(), "hello");
    assert!(!dir.path().join("out.txt").exists());
}

#[test]
fn opening_a_path_outside_the_preopen_fails() {
    // The work dir has a sibling the guest must not be able to create into via "..".
    let outer = tempfile::tempdir().unwrap();
    let work = outer.path().join("work");
    std::fs::create_dir(&work).unwrap();
    let absolute = outer.path().join("abs-escape.txt");
    let absolute_str = absolute.to_str().unwrap().to_string();
    for escape in ["../escape.txt", absolute_str.as_str(), "sub/../../escape.txt"] {
        let bytes = fs_probe_component(escape);
        let spec = spec_for(&bytes, vec![rw("/work", "")]);
        for kind in engines() {
            let r = run_on(kind, &bytes, &spec, &work);
            assert_eq!(r.outcome, WasmOutcome::Exited { code: 1 }, "{escape} on {kind:?} must fail: {r:?}");
        }
    }
    assert!(!outer.path().join("escape.txt").exists(), "nothing may appear outside the work dir");
    assert!(!absolute.exists());
}

#[test]
fn a_read_only_preopen_refuses_writes() {
    let bytes = fs_probe_component("out.txt");
    let spec = spec_for(&bytes, vec![Preopen { guest_path: "/ro".into(), host_subdir: String::new(), mode: PreopenMode::Ro }]);
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert_eq!(r.outcome, WasmOutcome::Exited { code: 1 }, "{r:?}");
    assert!(!dir.path().join("out.txt").exists());
}

#[cfg(unix)]
#[test]
fn a_symlink_in_the_work_dir_cannot_lead_a_preopen_out_of_it() {
    let outer = tempfile::tempdir().unwrap();
    let work = outer.path().join("work");
    let secret = outer.path().join("secret");
    std::fs::create_dir(&work).unwrap();
    std::fs::create_dir(&secret).unwrap();
    std::os::unix::fs::symlink(&secret, work.join("link")).unwrap();
    let bytes = fs_probe_component("out.txt");
    let spec = spec_for(&bytes, vec![rw("/data", "link")]);
    let r = run_wasm_component(&bytes, &spec, &work, &[]);
    assert!(matches!(r.outcome, WasmOutcome::Refused { .. }), "{r:?}");
    assert!(!secret.join("out.txt").exists());
}

#[test]
fn growing_memory_past_the_cap_is_a_clean_error_not_a_crash() {
    // memory.grow by 1024 pages (64 MiB) against a 16 MiB cap.
    let bytes = simple_component("(drop (memory.grow (i32.const 1024))) i32.const 0", 1);
    let spec = spec_for(&bytes, vec![]);
    let dir = tempfile::tempdir().unwrap();
    for kind in engines() {
        let r = run_on(kind, &bytes, &spec, dir.path());
        assert_eq!(r.outcome, WasmOutcome::MemoryLimitExceeded, "{kind:?}: {r:?}");
    }
}

#[test]
fn a_component_that_declares_more_memory_than_the_cap_never_starts() {
    let bytes = simple_component("i32.const 0", 1024); // 64 MiB initial
    let spec = spec_for(&bytes, vec![]);
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert_eq!(r.outcome, WasmOutcome::MemoryLimitExceeded, "{r:?}");
}

#[test]
fn growth_within_the_cap_is_allowed() {
    let bytes = simple_component("(drop (memory.grow (i32.const 16))) i32.const 0", 1); // +1 MiB
    let spec = spec_for(&bytes, vec![]);
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert_eq!(r.outcome, WasmOutcome::Exited { code: 0 }, "{r:?}");
}

#[test]
fn an_infinite_loop_times_out() {
    let bytes = simple_component("(loop $l (br $l)) i32.const 0", 1);
    let mut spec = spec_for(&bytes, vec![]);
    spec.limits.timeout_ms = 300;
    let dir = tempfile::tempdir().unwrap();
    for kind in engines() {
        let started = std::time::Instant::now();
        let r = run_on(kind, &bytes, &spec, dir.path());
        assert_eq!(r.outcome, WasmOutcome::TimedOut, "{kind:?}: {r:?}");
        assert!(started.elapsed() < std::time::Duration::from_secs(5), "must stop promptly, took {:?}", started.elapsed());
    }
}

#[test]
fn a_fuel_budget_stops_a_loop_deterministically() {
    let bytes = simple_component("(loop $l (br $l)) i32.const 0", 1);
    let mut spec = spec_for(&bytes, vec![]);
    spec.limits.fuel = Some(1_000_000);
    spec.limits.timeout_ms = 60_000;
    let dir = tempfile::tempdir().unwrap();
    for kind in engines() {
        let r = run_on(kind, &bytes, &spec, dir.path());
        assert_eq!(r.outcome, WasmOutcome::OutOfFuel, "{kind:?}: {r:?}");
        assert!(r.fuel_consumed.unwrap() >= 1_000_000 - 1_000, "{r:?}");
    }
}

#[test]
fn a_trap_is_reported_as_trapped() {
    let bytes = simple_component("unreachable", 1);
    let spec = spec_for(&bytes, vec![]);
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert!(matches!(r.outcome, WasmOutcome::Trapped { .. }), "{r:?}");
}

#[test]
fn a_tampered_component_is_refused_before_it_runs() {
    let bytes = simple_component("i32.const 0", 1);
    let spec = spec_for(&bytes, vec![]);
    let mut tampered = bytes.clone();
    let last = tampered.len() - 1;
    tampered[last] ^= 0x01;
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&tampered, &spec, dir.path(), &[]);
    match r.outcome {
        WasmOutcome::Refused { reason } => assert!(reason.contains("component_sha256_mismatch"), "{reason}"),
        other => panic!("expected Refused, got {other:?}"),
    }
}

#[test]
fn an_invalid_spec_is_refused() {
    let bytes = simple_component("i32.const 0", 1);
    let mut spec = spec_for(&bytes, vec![]);
    spec.limits.timeout_ms = 0;
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert!(matches!(r.outcome, WasmOutcome::Refused { .. }), "{r:?}");
}

#[test]
fn bytes_that_are_not_a_component_are_an_error() {
    let junk = b"not wasm at all".to_vec();
    let spec = spec_for(&junk, vec![]);
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&junk, &spec, dir.path(), &[]);
    assert!(matches!(r.outcome, WasmOutcome::Error { .. }), "{r:?}");
}

#[test]
fn a_missing_work_dir_is_refused() {
    let bytes = simple_component("i32.const 0", 1);
    let spec = spec_for(&bytes, vec![]);
    let r = run_wasm_component(&bytes, &spec, std::path::Path::new("/nonexistent/wasm-work-dir"), &[]);
    assert!(matches!(r.outcome, WasmOutcome::Refused { .. }), "{r:?}");
}

#[test]
fn a_component_importing_wasi_http_cannot_instantiate_without_a_host_grant() {
    let wat = r#"(component
      (import "wasi:http/types@0.2.0" (instance (export "fields" (type (sub resource)))))
      (core module $m (func (export "run") (result i32) i32.const 0))
      (core instance $i (instantiate $m))
      (func $run (result (result)) (canon lift (core func $i "run")))
      (instance $inst (export "run" (func $run)))
      (export "wasi:cli/run@0.2.0" (instance $inst)))"#;
    let bytes = wat::parse_str(wat).unwrap();
    let spec = spec_for(&bytes, vec![]); // allowed_http_hosts empty
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert!(matches!(r.outcome, WasmOutcome::Error { .. }), "wasi:http must not be linked: {r:?}");
}

#[cfg(feature = "wasm-http")]
#[test]
fn wasi_http_is_linked_only_when_hosts_are_granted() {
    let wat = r#"(component
      (import "wasi:http/types@0.2.0" (instance (export "fields" (type (sub resource)))))
      (core module $m (func (export "run") (result i32) i32.const 0))
      (core instance $i (instantiate $m))
      (func $run (result (result)) (canon lift (core func $i "run")))
      (instance $inst (export "run" (func $run)))
      (export "wasi:cli/run@0.2.0" (instance $inst)))"#;
    let bytes = wat::parse_str(wat).unwrap();
    let mut spec = spec_for(&bytes, vec![]);
    spec.capabilities.allowed_http_hosts = vec!["api.example.com".into()];
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert_eq!(r.outcome, WasmOutcome::Exited { code: 0 }, "{r:?}");
}

#[test]
fn only_env_names_granted_by_the_spec_reach_the_guest() {
    let dir = tempfile::tempdir().unwrap();
    let values = vec![("GRANTED".to_string(), "v1".to_string()), ("SECRET".to_string(), "s3cret".to_string())];
    for (granted, expected) in [(vec![], 0u32), (vec!["GRANTED".to_string()], 1)] {
        let bytes = common::env_count_component(expected);
        let mut spec = spec_for(&bytes, vec![]);
        spec.capabilities.env = granted;
        let opts = WasmRunOptions { env: values.clone(), ..Default::default() };
        let r = run_wasm_component_with(&bytes, &spec, dir.path(), &opts);
        assert_eq!(r.outcome, WasmOutcome::Exited { code: 0 }, "expected exactly {expected} variable(s): {r:?}");
    }
    // Control: the probe really fails when the count is wrong (no ambient env, SECRET not leaked).
    let bytes = common::env_count_component(2);
    let mut spec = spec_for(&bytes, vec![]);
    spec.capabilities.env = vec!["GRANTED".into()];
    let opts = WasmRunOptions { env: values, ..Default::default() };
    let r = run_wasm_component_with(&bytes, &spec, dir.path(), &opts);
    assert_eq!(r.outcome, WasmOutcome::Exited { code: 1 }, "{r:?}");
}

#[test]
fn an_oversized_component_is_refused_before_hashing_or_compiling() {
    let bytes = simple_component("i32.const 0", 1);
    let spec = spec_for(&bytes, vec![]);
    let dir = tempfile::tempdir().unwrap();
    let opts = WasmRunOptions { max_component_bytes: bytes.len() - 1, ..Default::default() };
    let r = run_wasm_component_with(&bytes, &spec, dir.path(), &opts);
    match r.outcome {
        WasmOutcome::Refused { reason } => assert!(reason.contains("component_too_large"), "{reason}"),
        other => panic!("expected Refused, got {other:?}"),
    }
    let ok = WasmRunOptions { max_component_bytes: bytes.len(), ..Default::default() };
    assert!(run_wasm_component_with(&bytes, &spec, dir.path(), &ok).success());
}

#[test]
fn compilation_counts_against_the_time_budget() {
    // ~600k-op function: Cranelift needs far longer than 30 ms for it; the run must come back as
    // TimedOut promptly instead of blocking until the compile is done.
    let bytes = common::slow_to_compile_component(600_000);
    let mut spec = spec_for(&bytes, vec![]);
    spec.limits.timeout_ms = 30;
    let dir = tempfile::tempdir().unwrap();
    let started = std::time::Instant::now();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert_eq!(r.outcome, WasmOutcome::TimedOut, "{r:?}");
    assert!(started.elapsed() < std::time::Duration::from_secs(3), "returned after {:?}", started.elapsed());
}

#[test]
fn a_guest_cannot_flood_the_host_resource_table() {
    // Each call allocates new descriptor handles; 20_000 calls would need far more than the cap.
    let bytes = common::table_flood_component(20_000);
    let spec = spec_for(&bytes, vec![rw("/work", "")]);
    let dir = tempfile::tempdir().unwrap();
    let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
    assert!(matches!(r.outcome, WasmOutcome::Trapped { .. } | WasmOutcome::Error { .. }), "the table cap must stop it: {r:?}");
    // And a modest number of calls is fine.
    let ok = common::table_flood_component(100);
    let spec = spec_for(&ok, vec![rw("/work", "")]);
    assert!(run_wasm_component(&ok, &spec, dir.path(), &[]).success());
}

#[test]
fn ro_and_rw_preopens_of_overlapping_host_directories_are_refused() {
    let bytes = simple_component("i32.const 0", 1);
    let dir = tempfile::tempdir().unwrap();
    let ro = |g: &str, sub: &str| Preopen { guest_path: g.into(), host_subdir: sub.into(), mode: PreopenMode::Ro };
    for pair in [vec![rw("/a", ""), ro("/b", "")], vec![rw("/a", "x"), ro("/b", "x/y")], vec![ro("/a", ""), rw("/b", "x")]] {
        let spec = spec_for(&bytes, pair);
        let r = run_wasm_component(&bytes, &spec, dir.path(), &[]);
        match r.outcome {
            WasmOutcome::Refused { reason } => assert!(reason.contains("overlap"), "{reason}"),
            other => panic!("expected Refused, got {other:?}"),
        }
    }
    // Disjoint trees with different modes, and same-mode overlap, are fine.
    for pair in [vec![rw("/a", "x"), ro("/b", "y")], vec![rw("/a", ""), rw("/b", "x")]] {
        let spec = spec_for(&bytes, pair);
        assert!(run_wasm_component(&bytes, &spec, dir.path(), &[]).success());
    }
}
