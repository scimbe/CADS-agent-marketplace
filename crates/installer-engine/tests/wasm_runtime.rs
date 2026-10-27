//! Behavioural tests for `installer_engine::wasm_runtime`. The guests are hand-written component-model
//! WAT (compiled with the `wat` crate), so the sandbox claims are exercised on every host without a
//! wasm toolchain: filesystem confinement, memory cap, wall-clock timeout, fuel, exit codes,
//! tampered component, no ambient network, and the Pulley interpreter running the same guests.
//! The Rust example component (`examples/wasm-hello`) is covered by `tests/wasm_hello.rs`.
#![cfg(feature = "wasm")]

use installer_engine::{run_wasm_component, run_wasm_component_with, WasmEngineKind, WasmOutcome, WasmRunOptions};
use manifest_core::{Preopen, PreopenMode, WasmCapabilities, WasmLimits, WasmSpec};
use sha2::{Digest, Sha256};

const ERROR_CODES: &str = r#""access" "would-block" "already" "bad-descriptor" "busy" "deadlock" "quota" "exist" "file-too-large" "illegal-byte-sequence" "in-progress" "interrupted" "invalid" "io" "is-directory" "loop" "too-many-links" "message-size" "name-too-long" "no-device" "no-entry" "no-lock" "insufficient-memory" "insufficient-space" "not-directory" "not-empty" "not-recoverable" "unsupported" "no-tty" "no-such-device" "overflow" "not-permitted" "pipe" "read-only" "invalid-seek" "text-file-busy" "cross-device""#;

/// A `wasi:cli/run` component whose `run` is the given core function body (returns i32: 0 = ok).
fn simple_component(core_body: &str, memory_pages: u32) -> Vec<u8> {
    let wat = format!(
        r#"(component
  (core module $m
    (memory {memory_pages})
    (func (export "run") (result i32) {core_body}))
  (core instance $i (instantiate $m))
  (func $run (result (result)) (canon lift (core func $i "run")))
  (instance $inst (export "run" (func $run)))
  (export "wasi:cli/run@0.2.0" (instance $inst)))"#
    );
    wat::parse_str(wat).expect("valid component wat")
}

/// Opens `path` (create + write) in the FIRST preopen and writes "hello". Exit 1 if any step fails.
fn fs_probe_component(path: &str) -> Vec<u8> {
    let len = path.len();
    let wat = format!(
        r#"(component
  (import "wasi:filesystem/types@0.2.0" (instance $types
    (export "descriptor" (type $descriptor (sub resource)))
    (type $ec (enum {ERROR_CODES}))
    (export "error-code" (type $error-code (eq $ec)))
    (type $pf (flags "symlink-follow"))
    (export "path-flags" (type $path-flags (eq $pf)))
    (type $of (flags "create" "directory" "exclusive" "truncate"))
    (export "open-flags" (type $open-flags (eq $of)))
    (type $df (flags "read" "write" "file-integrity-sync" "data-integrity-sync" "requested-write-sync" "mutate-directory"))
    (export "descriptor-flags" (type $descriptor-flags (eq $df)))
    (export "[method]descriptor.open-at" (func (param "self" (borrow $descriptor)) (param "path-flags" $path-flags) (param "path" string) (param "open-flags" $open-flags) (param "flags" $descriptor-flags) (result (result (own $descriptor) (error $error-code)))))
    (export "[method]descriptor.write" (func (param "self" (borrow $descriptor)) (param "buffer" (list u8)) (param "offset" u64) (result (result u64 (error $error-code)))))
  ))
  (alias export $types "descriptor" (type $descriptor))
  (import "wasi:filesystem/preopens@0.2.0" (instance $preopens
    (alias outer 1 $descriptor (type $d))
    (export "get-directories" (func (result (list (tuple (own $d) string)))))
  ))
  (core module $libc
    (memory (export "memory") 1)
    (global $bump (mut i32) (i32.const 4096))
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) (local $p i32)
      (local.set $p (i32.and (i32.add (global.get $bump) (i32.const 7)) (i32.const -8)))
      (global.set $bump (i32.add (local.get $p) (local.get 3)))
      (local.get $p)))
  (core instance $libc (instantiate $libc))
  (alias export $preopens "get-directories" (func $get_dirs))
  (alias export $types "[method]descriptor.open-at" (func $open_at))
  (alias export $types "[method]descriptor.write" (func $write))
  (core func $get_dirs_l (canon lower (func $get_dirs) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
  (core func $open_at_l (canon lower (func $open_at) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
  (core func $write_l (canon lower (func $write) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
  (core module $main
    (import "libc" "memory" (memory 1))
    (import "host" "get-dirs" (func $get_dirs (param i32)))
    (import "host" "open-at" (func $open_at (param i32 i32 i32 i32 i32 i32 i32)))
    (import "host" "write" (func $write (param i32 i32 i32 i64 i32)))
    (data (i32.const 64) "{path}")
    (data (i32.const 512) "hello")
    (func (export "run") (result i32) (local $fd i32)
      (call $get_dirs (i32.const 16))
      (if (i32.eqz (i32.load (i32.const 20))) (then (return (i32.const 1))))
      (local.set $fd (i32.load (i32.load (i32.const 16))))
      (call $open_at (local.get $fd) (i32.const 0) (i32.const 64) (i32.const {len}) (i32.const 1) (i32.const 2) (i32.const 32))
      (if (i32.load8_u (i32.const 32)) (then (return (i32.const 1))))
      (local.set $fd (i32.load (i32.const 36)))
      (call $write (local.get $fd) (i32.const 512) (i32.const 5) (i64.const 0) (i32.const 48))
      (if (i32.load8_u (i32.const 48)) (then (return (i32.const 1))))
      (i32.const 0)))
  (core instance $main (instantiate $main
    (with "libc" (instance $libc))
    (with "host" (instance
      (export "get-dirs" (func $get_dirs_l))
      (export "open-at" (func $open_at_l))
      (export "write" (func $write_l))))))
  (func $run (result (result)) (canon lift (core func $main "run")))
  (instance $inst (export "run" (func $run)))
  (export "wasi:cli/run@0.2.0" (instance $inst)))"#
    );
    wat::parse_str(wat).expect("valid component wat")
}

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
