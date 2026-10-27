//! End-to-end `activate()` for `InstallerKind::Wasm`: signed manifest -> bundle fetch + sha check ->
//! unpack -> signed component hash -> run under the spec's capabilities -> `InstallReport`.
#![cfg(feature = "wasm")]

mod common;
use common::{fs_probe_component, simple_component};

use ed25519_dalek::SigningKey;
use installer_engine::allowlist::TrustAllowlist;
use installer_engine::{activate, ActivateOptions, InstallReport};
use manifest_core::{
    BundleRef, InstallerKind, Preopen, PreopenMode, ServiceManifest, VerifySpec, WasmCapabilities, WasmLimits, WasmSpec,
};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

fn tar_gz(files: &[(&str, &[u8])]) -> Vec<u8> {
    use std::io::Write;
    let mut tar_bytes = Vec::new();
    {
        let mut b = tar::Builder::new(&mut tar_bytes);
        for (name, data) in files {
            let mut h = tar::Header::new_gnu();
            h.set_size(data.len() as u64);
            h.set_mode(0o644);
            h.set_cksum();
            b.append_data(&mut h, name, *data).unwrap();
        }
        b.finish().unwrap();
    }
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    enc.write_all(&tar_bytes).unwrap();
    enc.finish().unwrap()
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

struct Fixture {
    manifest_path: PathBuf,
    pubkey: [u8; 32],
}

/// `component` is packed as `app.wasm`; `spec_hash_of` is what the SIGNED spec claims (differs from the
/// real bytes to model a swapped component).
fn fixture(dir: &Path, component: &[u8], spec_hash_of: &[u8], kind: InstallerKind, wasm: bool) -> Fixture {
    let key = SigningKey::from_bytes(&[21u8; 32]);
    let tarball = tar_gz(&[("app.wasm", component)]);
    let bundle = dir.join("bundle.tar.gz");
    std::fs::write(&bundle, &tarball).unwrap();
    let spec = WasmSpec {
        component_path: "app.wasm".into(),
        component_sha256: Sha256::digest(spec_hash_of).into(),
        world: "wasi:cli/command".into(),
        capabilities: WasmCapabilities {
            preopens: vec![Preopen { guest_path: "/work".into(), host_subdir: String::new(), mode: PreopenMode::Rw }],
            allowed_http_hosts: vec![],
            env: vec![],
        },
        limits: WasmLimits { max_memory_bytes: 16 << 20, timeout_ms: 5_000, fuel: None },
    };
    let m = ServiceManifest::sign_new_with_wasm(
        &key,
        [0x77; 32],
        "wasm-hello".into(),
        "0.1.0".into(),
        kind,
        BundleRef { url: bundle.to_str().unwrap().into(), sha256: Sha256::digest(&tarball).into(), compose_file: "app.wasm".into() },
        vec![],
        VerifySpec { script: "unused".into(), timeout_secs: 1 },
        0,
        u64::MAX / 2,
        None,
        None,
        wasm.then_some(spec),
    );
    let manifest_path = dir.join("manifest.json");
    std::fs::write(&manifest_path, serde_json::to_vec(&m).unwrap()).unwrap();
    Fixture { manifest_path, pubkey: key.verifying_key().to_bytes() }
}

fn run(dir: &Path, f: &Fixture) -> InstallReport {
    activate(ActivateOptions {
        manifest_location: f.manifest_path.to_str().unwrap().into(),
        allowlist: TrustAllowlist::parse(&hex(&f.pubkey)).unwrap(),
        env_file: None,
        project_name: format!("wasm-activate-{}", std::process::id()),
        protected_name_substrings: vec![],
        work_dir: dir.join("work"),
        now: 1,
        // Irrelevant for Wasm (the runtime is the sandbox); the default would also be fine.
        require_binary_sandbox: true,
    })
}

#[test]
fn a_trusted_signed_wasm_manifest_installs_and_writes_only_into_its_work_dir() {
    let dir = tempfile::tempdir().unwrap();
    let c = fs_probe_component("out.txt");
    let f = fixture(dir.path(), &c, &c, InstallerKind::Wasm, true);
    match run(dir.path(), &f) {
        InstallReport::Ok { sandbox, verify, .. } => {
            assert_eq!(sandbox.as_deref(), Some("wasmtime"));
            assert_eq!(verify.exit_code, Some(0));
        }
        other => panic!("expected Ok, got {}", other.to_json()),
    }
    assert_eq!(std::fs::read_to_string(dir.path().join("work/out.txt")).unwrap(), "hello");
}

#[test]
fn a_component_whose_bytes_differ_from_the_signed_hash_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let real = simple_component("i32.const 0", 1);
    let promised = simple_component("i32.const 1", 1);
    let f = fixture(dir.path(), &real, &promised, InstallerKind::Wasm, true);
    match run(dir.path(), &f) {
        InstallReport::Rejected { reason, .. } => assert!(reason.contains("component_sha256_mismatch"), "{reason}"),
        other => panic!("expected Rejected, got {}", other.to_json()),
    }
}

#[test]
fn a_failing_guest_is_a_failed_install() {
    let dir = tempfile::tempdir().unwrap();
    let c = simple_component("i32.const 1", 1);
    let f = fixture(dir.path(), &c, &c, InstallerKind::Wasm, true);
    match run(dir.path(), &f) {
        InstallReport::Failed { step, .. } => assert_eq!(step, "wasm_run"),
        other => panic!("expected Failed, got {}", other.to_json()),
    }
}

#[test]
fn a_wasm_kind_without_a_wasm_block_and_a_stray_block_on_another_kind_are_both_rejected() {
    let c = simple_component("i32.const 0", 1);
    for (kind, wasm) in [(InstallerKind::Wasm, false), (InstallerKind::Compose, true)] {
        let dir = tempfile::tempdir().unwrap();
        let f = fixture(dir.path(), &c, &c, kind, wasm);
        match run(dir.path(), &f) {
            InstallReport::Rejected { reason, .. } => assert!(reason.starts_with("wasm_spec_invalid"), "{reason}"),
            other => panic!("expected Rejected, got {}", other.to_json()),
        }
    }
}

#[test]
fn secrets_are_never_written_into_a_work_dir_the_guest_can_see() {
    // env_template declares SECRET, the operator supplies it, the spec grants NO env and preopens the
    // whole work dir read-write. The guest must find nothing: no `.env`, no file containing the value.
    let dir = tempfile::tempdir().unwrap();
    let c = fs_probe_component("out.txt");
    let key = SigningKey::from_bytes(&[21u8; 32]);
    let tarball = tar_gz(&[("app.wasm", &c)]);
    let bundle = dir.path().join("bundle.tar.gz");
    std::fs::write(&bundle, &tarball).unwrap();
    let spec = WasmSpec {
        component_path: "app.wasm".into(),
        component_sha256: Sha256::digest(&c).into(),
        world: "wasi:cli/command".into(),
        capabilities: WasmCapabilities {
            preopens: vec![Preopen { guest_path: "/work".into(), host_subdir: String::new(), mode: PreopenMode::Rw }],
            allowed_http_hosts: vec![],
            env: vec![],
        },
        limits: WasmLimits { max_memory_bytes: 16 << 20, timeout_ms: 5_000, fuel: None },
    };
    let m = ServiceManifest::sign_new_with_wasm(
        &key,
        [0x78; 32],
        "wasm-secret".into(),
        "0.1.0".into(),
        InstallerKind::Wasm,
        BundleRef { url: bundle.to_str().unwrap().into(), sha256: Sha256::digest(&tarball).into(), compose_file: "app.wasm".into() },
        vec![manifest_core::EnvVarSpec { name: "SECRET".into(), required: true, description: "x".into() }],
        VerifySpec { script: "unused".into(), timeout_secs: 1 },
        0,
        u64::MAX / 2,
        None,
        None,
        Some(spec),
    );
    let manifest_path = dir.path().join("manifest.json");
    std::fs::write(&manifest_path, serde_json::to_vec(&m).unwrap()).unwrap();
    let env_file = dir.path().join("secrets.env");
    std::fs::write(&env_file, "SECRET=hunter2-top-secret\n").unwrap();
    let report = activate(ActivateOptions {
        manifest_location: manifest_path.to_str().unwrap().into(),
        allowlist: TrustAllowlist::parse(&hex(&key.verifying_key().to_bytes())).unwrap(),
        env_file: Some(env_file),
        project_name: format!("wasm-secret-{}", std::process::id()),
        protected_name_substrings: vec![],
        work_dir: dir.path().join("work"),
        now: 1,
        require_binary_sandbox: true,
    });
    assert!(matches!(report, InstallReport::Ok { .. }), "{}", report.to_json());
    let work = dir.path().join("work");
    assert!(!work.join(".env").exists(), "no .env may exist in a Wasm install's work dir");
    for entry in std::fs::read_dir(&work).unwrap() {
        let path = entry.unwrap().path();
        if path.is_file() {
            let data = std::fs::read(&path).unwrap();
            assert!(!String::from_utf8_lossy(&data).contains("hunter2"), "{} leaks the secret", path.display());
        }
    }
}
