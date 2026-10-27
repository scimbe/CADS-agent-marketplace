//! Runtime for `InstallerKind::Wasm`: runs a WASI 0.2 command component inside this process under
//! wasmtime. **The runtime is the sandbox** -- there is no OS-level confinement here, only what the
//! signed [`manifest_core::WasmSpec`] grants:
//!
//! - **Filesystem**: only the listed preopens; the host side is always the install's work dir or a
//!   sub-directory of it (re-checked here after canonicalisation, so a symlink cannot lead out).
//!   `ro` preopens cannot be written to.
//! - **Network**: none. The `wasi:sockets` interfaces are linked but the context denies every
//!   TCP/UDP/DNS operation. `wasi:http` is linked only when `allowed_http_hosts` is non-empty
//!   (feature `wasm-http`), and its `send_request` hook refuses anything that is not `https` to an
//!   exactly-listed host on port 443.
//! - **Environment**: no ambient env. Only the variable names listed in `capabilities.env`, with
//!   values supplied by the caller.
//! - **stdio**: stdin is empty; stdout/stderr are captured into capped in-memory buffers (a guest
//!   that exceeds the cap is stopped: [`WasmOutcome::OutputLimitExceeded`]). Nothing is inherited.
//! - **Memory**: a total linear-memory cap; exceeding it traps the guest ([`WasmOutcome::MemoryLimitExceeded`]).
//! - **Time**: epoch-based interruption (guest compute yields every 10 ms and checks the deadline)
//!   plus a host-side `tokio::time::timeout` (bounds a guest blocked inside a host call), and an
//!   optional deterministic fuel budget. Clock and randomness are available (they are not a
//!   confidentiality risk and most programs need them).
//!
//! # Public API (kept small and stable; the mobile bindings build on it)
//!
//! [`run_wasm_component`] / [`run_wasm_component_with`], [`WasmRunReport`], [`WasmOutcome`],
//! [`WasmRunOptions`], [`WasmEngineKind`], and [`verify_component_bytes`]. All of them exist with the
//! `wasm` feature off too; they then return [`WasmOutcome::Refused`] ("wasm support not compiled").
//!
//! # Engines
//!
//! [`WasmEngineKind::Jit`] compiles to native code with Cranelift. [`WasmEngineKind::Interpreter`]
//! compiles to Pulley bytecode (`Config::target("pulley64")`/`"pulley32"` matching the host pointer
//! width) and interprets it: no executable memory is ever created, which is what iOS requires. The
//! Cranelift compiler itself is ordinary Rust code and runs fine without a JIT.
//!
//! # Verification
//!
//! A Wasm install has no separate verify script: the component's own exit status (`wasi:cli/run`
//! returning ok) is the verdict, exactly as `verify.sh`'s exit code is for the other kinds. A
//! publisher who wants a distinct check ships it as a subcommand and the component decides from its
//! arguments; [`WasmRunOptions::args`] carries them. (A second `verify` component path is a possible
//! later extension; it would be one more signed field in `WasmSpec`.)

use manifest_core::WasmSpec;
use serde::Serialize;
use std::path::Path;
use subtle::ConstantTimeEq;

/// Default cap on captured stdout and on captured stderr, each.
pub const DEFAULT_OUTPUT_CAP_BYTES: usize = 64 * 1024;
/// Default cap on the size of the component file (checked before hashing and compiling).
pub const DEFAULT_MAX_COMPONENT_BYTES: usize = 16 * 1024 * 1024;

#[cfg(feature = "wasm-http")]
mod http_connect;

/// Which wasmtime back end executes the component.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WasmEngineKind {
    /// Native code via Cranelift. Fastest; needs executable memory (not available on iOS).
    #[default]
    Jit,
    /// Pulley portable interpreter. Slower; works where JIT is forbidden (iOS).
    Interpreter,
}

/// Per-call knobs that are not part of the signed spec.
#[derive(Debug, Clone)]
pub struct WasmRunOptions {
    pub engine: WasmEngineKind,
    /// Arguments passed to the guest after `argv[0]` (which is the component's file name).
    pub args: Vec<String>,
    /// Candidate environment values. Only names listed in `spec.capabilities.env` reach the guest.
    pub env: Vec<(String, String)>,
    /// Cap for captured stdout, bytes.
    pub stdout_cap: usize,
    /// Cap for captured stderr, bytes.
    pub stderr_cap: usize,
    /// Components larger than this are refused before they are hashed or compiled.
    pub max_component_bytes: usize,
}

impl Default for WasmRunOptions {
    fn default() -> Self {
        WasmRunOptions {
            engine: WasmEngineKind::Jit,
            args: Vec::new(),
            env: Vec::new(),
            stdout_cap: DEFAULT_OUTPUT_CAP_BYTES,
            stderr_cap: DEFAULT_OUTPUT_CAP_BYTES,
            max_component_bytes: DEFAULT_MAX_COMPONENT_BYTES,
        }
    }
}

/// How a run ended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WasmOutcome {
    /// The guest ran to completion; `code` 0 is success (`wasi:cli/run` ok / `exit(0)`).
    Exited { code: i32 },
    /// The guest trapped (unreachable, out-of-bounds, host-call error, ...).
    Trapped { message: String },
    /// The wall-clock limit (`limits.timeout_ms`) was hit.
    TimedOut,
    /// The fuel budget (`limits.fuel`) was used up.
    OutOfFuel,
    /// The guest asked for more memory than `limits.max_memory_bytes`.
    MemoryLimitExceeded,
    /// The guest wrote more than the stdout/stderr cap.
    OutputLimitExceeded,
    /// Nothing was run: the spec/bytes/work dir did not pass a pre-flight check (bad spec, hash
    /// mismatch, preopen outside the work dir, ...). `reason` names the check.
    Refused { reason: String },
    /// The component could not be compiled/instantiated (not a component, missing import, ...).
    Error { message: String },
}

/// Result of [`run_wasm_component`]. Serialisable so bindings can hand it over as JSON.
#[derive(Debug, Clone, Serialize)]
pub struct WasmRunReport {
    pub outcome: WasmOutcome,
    pub stdout: String,
    pub stderr: String,
    /// `true` when stdout or stderr reached its cap (further output was dropped or the guest stopped).
    pub output_truncated: bool,
    pub duration_ms: u128,
    /// Fuel actually consumed; `None` when no fuel limit was configured.
    pub fuel_consumed: Option<u64>,
    pub engine: WasmEngineKind,
}

impl WasmRunReport {
    /// `true` only for a clean exit with status 0.
    pub fn success(&self) -> bool {
        matches!(self.outcome, WasmOutcome::Exited { code: 0 })
    }

    fn refused(engine: WasmEngineKind, reason: String) -> Self {
        WasmRunReport {
            outcome: WasmOutcome::Refused { reason },
            stdout: String::new(),
            stderr: String::new(),
            output_truncated: false,
            duration_ms: 0,
            fuel_consumed: None,
            engine,
        }
    }
}

/// Check `bytes` against the signed `component_sha256` (constant time). The same check
/// [`run_wasm_component`] performs first; exposed so callers can fail before touching the disk.
pub fn verify_component_bytes(bytes: &[u8], spec: &WasmSpec) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let digest: [u8; 32] = Sha256::digest(bytes).into();
    if bool::from(digest.ct_eq(&spec.component_sha256)) {
        Ok(())
    } else {
        Err("component_sha256_mismatch: the component bytes do not match the signed hash".to_string())
    }
}

/// Run `bytes` (a WASI 0.2 command component) under `spec` with the default engine (JIT) and
/// options. `work_dir` is the host directory the preopens are carved from; it must exist.
/// `args` are passed to the guest. Never panics and never returns `Err`: every failure is a
/// [`WasmOutcome`].
pub fn run_wasm_component(bytes: &[u8], spec: &WasmSpec, work_dir: &Path, args: &[String]) -> WasmRunReport {
    run_wasm_component_with(bytes, spec, work_dir, &WasmRunOptions { args: args.to_vec(), ..Default::default() })
}

/// [`run_wasm_component`] with explicit [`WasmRunOptions`] (engine choice, env values, output caps).
pub fn run_wasm_component_with(bytes: &[u8], spec: &WasmSpec, work_dir: &Path, opts: &WasmRunOptions) -> WasmRunReport {
    if let Err(reason) = spec.validate() {
        return WasmRunReport::refused(opts.engine, format!("wasm_spec_invalid: {reason}"));
    }
    if bytes.len() > opts.max_component_bytes {
        return WasmRunReport::refused(
            opts.engine,
            format!("component_too_large: {} bytes exceeds the {} byte cap", bytes.len(), opts.max_component_bytes),
        );
    }
    if let Err(reason) = verify_component_bytes(bytes, spec) {
        return WasmRunReport::refused(opts.engine, reason);
    }
    imp::run(bytes, spec, work_dir, opts)
}

#[cfg(not(feature = "wasm"))]
mod imp {
    use super::*;
    pub(super) fn run(_: &[u8], _: &WasmSpec, _: &Path, opts: &WasmRunOptions) -> WasmRunReport {
        WasmRunReport::refused(opts.engine, "wasm_unavailable: installer-engine was built without the `wasm` feature".to_string())
    }
}

#[cfg(feature = "wasm")]
mod imp;

// ---- activate() glue ---------------------------------------------------------------------------

use crate::report::{InstallReport, StepResult};
use manifest_core::ServiceManifest;

/// `activate()`'s arm for `InstallerKind::Wasm`: reads the unpacked component from `component_file`
/// (already confined to the work dir by the caller), runs it, and maps the outcome to an
/// [`InstallReport`]. `env_pairs` are the resolved `env_template` values; only the names the spec
/// grants are forwarded.
#[allow(clippy::too_many_arguments)]
pub(crate) fn activate_wasm(
    manifest: &ServiceManifest,
    manifest_id_hex: String,
    publisher_hex: String,
    project_name: String,
    component_file: &Path,
    work_dir: &Path,
    env_pairs: Vec<(String, String)>,
    engine: WasmEngineKind,
) -> InstallReport {
    let reject = |reason: String| InstallReport::Rejected { reason, manifest_id: Some(manifest_id_hex.clone()) };
    if let Err(e) = manifest.validate_wasm_spec() {
        return reject(format!("wasm_spec_invalid: {e}"));
    }
    let Some(spec) = manifest.wasm.as_ref() else {
        return reject("wasm_spec_invalid: missing wasm block".to_string());
    };
    let max = WasmRunOptions::default().max_component_bytes as u64;
    match std::fs::metadata(component_file) {
        Ok(m) if m.len() > max => return reject(format!("component_too_large: {} bytes exceeds the {max} byte cap", m.len())),
        Ok(_) => {}
        Err(e) => return reject(format!("read component {}: {e}", component_file.display())),
    }
    let bytes = match std::fs::read(component_file) {
        Ok(b) => b,
        Err(e) => return reject(format!("read component {}: {e}", component_file.display())),
    };
    let opts = WasmRunOptions { engine, args: Vec::new(), env: env_pairs, ..Default::default() };
    let report = run_wasm_component_with(&bytes, spec, work_dir, &opts);
    let failed = |step: &str, detail: String| InstallReport::Failed {
        manifest_id: manifest_id_hex.clone(),
        publisher_pubkey: publisher_hex.clone(),
        project_name: project_name.clone(),
        step: step.to_string(),
        detail,
        sandbox: Some("wasmtime".to_string()),
    };
    match &report.outcome {
        WasmOutcome::Refused { reason } => reject(reason.clone()),
        WasmOutcome::Exited { code: 0 } => {
            let step = StepResult { exit_code: Some(0), duration_ms: report.duration_ms };
            InstallReport::Ok {
                manifest_id: manifest_id_hex,
                publisher_pubkey: publisher_hex,
                project_name,
                compose_up: step.clone(),
                // The component's own exit status IS the verification (see the module doc).
                verify: step,
                captured_stdout: Some(report.stdout),
                sandbox: Some("wasmtime".to_string()),
            }
        }
        other => failed("wasm_run", format!("{other:?} stderr={}", report.stderr)),
    }
}
