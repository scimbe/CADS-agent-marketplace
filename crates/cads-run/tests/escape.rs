//! The real binary, the real engine, the real OS sandbox: a payload tries to break out, and tampered
//! inputs must be refused before anything runs. See [`sandbox_available`] for when it skips.
use ed25519_dalek::SigningKey;
use flate2::{write::GzEncoder, Compression};
use manifest_core::{BundleRef, EnvVarSpec, InstallerKind, ServiceManifest, VerifySpec};
use sha2::{Digest, Sha256};
use std::net::TcpListener;
use std::path::Path;
use std::process::{Command, Output};

const PAYLOAD: &[u8] = include_bytes!("escape/run.sh");
const VERIFY: &[u8] = b"#!/bin/bash\nexit 0\n";
const BIN: &str = env!("CARGO_BIN_EXE_cads-run");
const VARS: [&str; 6] = ["CANARY", "OUTSIDE", "PORT", "HOST_HOME", "HOST_HOME_FILE", "HOST_SIGNAL_PID"];

fn fresh_key() -> SigningKey {
    SigningKey::from_bytes(&rand::random())
}

fn bundle() -> Vec<u8> {
    let mut b = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::default()));
    for (name, body) in [("run.sh", PAYLOAD), ("verify.sh", VERIFY)] {
        let mut h = tar::Header::new_gnu();
        h.set_size(body.len() as u64);
        h.set_mode(0o755);
        h.set_cksum();
        b.append_data(&mut h, name, body).unwrap();
    }
    b.into_inner().unwrap().finish().unwrap()
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn write_template(dir: &Path, key: &SigningKey, bundle: &[u8]) {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    let m = ServiceManifest::sign_new(
        key,
        [7u8; 32],
        "escape-probe".into(),
        "1.0.0".into(),
        InstallerKind::Binary,
        BundleRef { url: "bundle.tar.gz".into(), sha256: Sha256::digest(bundle).into(), compose_file: "run.sh".into() },
        VARS.iter().map(|n| EnvVarSpec { name: (*n).into(), required: true, description: String::new() }).collect(),
        VerifySpec { script: "verify.sh".into(), timeout_secs: 30 },
        now,
        now + 3600,
        None,
        None,
    );
    std::fs::write(dir.join("manifest.json"), serde_json::to_vec(&m).unwrap()).unwrap();
    std::fs::write(dir.join("bundle.tar.gz"), bundle).unwrap();
}

struct World {
    _t: tempfile::TempDir,
    root: std::path::PathBuf,
    canary: std::path::PathBuf,
    outside: std::path::PathBuf,
    key: SigningKey,
    _listener: TcpListener,
}

fn world() -> World {
    let t = tempfile::tempdir_in(std::env::var("HOME").unwrap()).unwrap();
    let root = t.path().to_path_buf();
    let (template, outside, home) = (root.join("template"), root.join("outside"), root.join("home"));
    for d in [&template, &outside, &home] {
        std::fs::create_dir_all(d).unwrap();
    }
    let canary = root.join("canary.txt");
    std::fs::write(&canary, "geheim").unwrap();
    let key = fresh_key();
    let _listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = _listener.local_addr().unwrap().port();
    std::fs::write(root.join("trust"), format!("{}\n", hex(key.verifying_key().as_bytes()))).unwrap();
    let real_home = root.display();
    let env = format!(
        "CANARY={}\nOUTSIDE={}\nPORT={port}\nHOST_HOME={real_home}\nHOST_HOME_FILE={}\nHOST_SIGNAL_PID={}\n",
        canary.display(),
        outside.display(),
        canary.display(),
        std::process::id()
    );
    std::fs::write(root.join("env"), env).unwrap();
    World { _t: t, root, canary, outside, key, _listener }
}

fn cads_run(w: &World) -> Output {
    cads_run_with(w, &[])
}

fn cads_run_with(w: &World, extra: &[&std::ffi::OsStr]) -> Output {
    Command::new(BIN)
        .args(extra)
        .args(["--from".as_ref(), w.root.join("template").as_os_str()])
        .args(["--trust-file".as_ref(), w.root.join("trust").as_os_str()])
        .args(["--env-file".as_ref(), w.root.join("env").as_os_str()])
        .env("HOME", w.root.join("home"))
        .env("CADS_RUN_SECRET", "must-not-reach-the-payload")
        .output()
        .unwrap()
}

/// Skips only for a developer without a sandbox. With `CADS_RUN_REQUIRE_SANDBOX=1` (CI) a missing
/// sandbox is a failure: a green run must mean the escape attempts really ran.
fn sandbox_available() -> bool {
    let ok = Command::new(BIN).arg("doctor").status().unwrap().success();
    assert!(ok || std::env::var_os("CADS_RUN_REQUIRE_SANDBOX").is_none(), "no sandbox on this host");
    ok
}

#[test]
fn a_payload_cannot_leave_the_sandbox() {
    if !sandbox_available() {
        eprintln!("skipped: no sandbox on this host");
        return;
    }
    let w = world();
    write_template(&w.root.join("template"), &w.key, &bundle());
    let out = cads_run(&w);
    let stdout = String::from_utf8_lossy(&out.stdout);
    println!("{stdout}\n{}", String::from_utf8_lossy(&out.stderr));
    assert!(out.status.success(), "the probe itself must run");
    assert!(stdout.contains("CONTROL inside-write"), "control: the payload really ran and can write its own dir");
    assert!(stdout.contains("BLOCKED read-canary"), "the attempts really ran");
    let escaped: Vec<&str> = stdout.lines().filter(|l| l.starts_with("ESCAPED")).collect();
    assert!(escaped.is_empty(), "escapes: {escaped:?}");
    assert_eq!(std::fs::read_to_string(&w.canary).unwrap(), "geheim", "canary untouched");
    assert_eq!(std::fs::read_dir(&w.outside).unwrap().count(), 0, "nothing landed outside");
}

#[test]
fn a_read_grant_opens_exactly_that_tree() {
    if !sandbox_available() {
        return;
    }
    let w = world();
    write_template(&w.root.join("template"), &w.key, &bundle());
    let granted = tempfile::tempdir_in("/tmp").unwrap();
    let out = cads_run_with(&w, &["--allow-read".as_ref(), granted.path().as_os_str()]);
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(stdout.contains("BLOCKED read-canary"), "{stdout}");
    let escaped: Vec<&str> = stdout.lines().filter(|l| l.starts_with("ESCAPED")).collect();
    assert!(escaped.is_empty(), "a read grant must not open anything else: {escaped:?}");
}

#[test]
fn a_tampered_bundle_is_refused_before_anything_runs() {
    let w = world();
    let dir = w.root.join("template");
    write_template(&dir, &w.key, &bundle());
    let mut b = bundle();
    b.extend_from_slice(b"tampered");
    std::fs::write(dir.join("bundle.tar.gz"), b).unwrap();
    let out = cads_run(&w);
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("abgelehnt"), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(!String::from_utf8_lossy(&out.stdout).contains("CONTROL"));
}

#[test]
fn a_tampered_manifest_is_refused() {
    let w = world();
    let dir = w.root.join("template");
    write_template(&dir, &w.key, &bundle());
    let mut m: serde_json::Value = serde_json::from_slice(&std::fs::read(dir.join("manifest.json")).unwrap()).unwrap();
    m["bundle"]["compose_file"] = "verify.sh".into();
    std::fs::write(dir.join("manifest.json"), m.to_string()).unwrap();
    let out = cads_run(&w);
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("invalid_signature"), "{}", String::from_utf8_lossy(&out.stderr));
}

#[test]
fn a_valid_signature_from_an_untrusted_key_is_refused() {
    let w = world();
    let stranger = fresh_key();
    write_template(&w.root.join("template"), &stranger, &bundle());
    let out = cads_run(&w);
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("publisher_not_on_trust_allowlist"));
}
