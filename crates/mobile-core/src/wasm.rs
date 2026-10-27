//! On-device execution of Wasm installations (WP8b step 4).
//!
//! With the `wasm` feature, [`default_executor`] is [`InstallerWasmExecutor`], which delegates to
//! `installer_engine::run_wasm_component_with` (wasmtime component model, WASI 0.2, signed
//! capabilities and limits from the [`WasmSpec`](manifest_core::WasmSpec)). The engine is chosen per
//! target: the Pulley interpreter on iOS (no JIT allowed there), Cranelift JIT elsewhere.
//! Without the feature the stub refuses, so the apps can show a "not available" state.
//!
//! The caller passes only a component whose digest it already trusts; the runtime re-checks the
//! bytes against `component_sha256` in the spec anyway.

use std::path::Path;

use crate::MobileError;

/// What a Wasm run produced.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct WasmRunOutput {
    /// Guest exit status; `-1` when the guest did not exit (see `outcome`).
    pub exit_code: i32,
    /// `exited`, `trapped`, `timed_out`, `out_of_fuel`, `memory_limit_exceeded`,
    /// `output_limit_exceeded`, `refused` or `error`.
    pub outcome: String,
    /// Detail for the non-`exited` outcomes (never contains guest input).
    pub detail: String,
    pub stdout: String,
    pub stderr: String,
    pub output_truncated: bool,
    pub duration_ms: u64,
}

/// Runs a component. `work_dir` is an app-private directory the spec's preopens are resolved under.
pub trait WasmExecutor: Send + Sync {
    fn available(&self) -> bool;
    fn run(&self, component: &[u8], spec_json: &str, args: &[String], work_dir: &Path) -> Result<WasmRunOutput, MobileError>;
}

/// Placeholder used when the crate is built without the `wasm` feature.
#[derive(Debug, Default)]
pub struct StubWasmExecutor;

impl WasmExecutor for StubWasmExecutor {
    fn available(&self) -> bool {
        false
    }
    fn run(&self, _component: &[u8], _spec_json: &str, _args: &[String], _work_dir: &Path) -> Result<WasmRunOutput, MobileError> {
        Err(MobileError::WasmUnavailable { detail: "this build has no Wasm runtime (feature `wasm`)".to_string() })
    }
}

#[cfg(feature = "wasm")]
pub use real::InstallerWasmExecutor;

#[cfg(feature = "wasm")]
mod real {
    use super::*;
    use installer_engine::{run_wasm_component_with, WasmEngineKind, WasmOutcome, WasmRunOptions};
    use manifest_core::WasmSpec;

    /// The engine the current target can use: no executable memory on iOS, so the interpreter there.
    pub const fn target_engine() -> WasmEngineKind {
        if cfg!(target_os = "ios") {
            WasmEngineKind::Interpreter
        } else {
            WasmEngineKind::Jit
        }
    }

    #[derive(Debug, Clone, Copy)]
    pub struct InstallerWasmExecutor {
        engine: WasmEngineKind,
    }

    impl Default for InstallerWasmExecutor {
        fn default() -> Self {
            Self { engine: target_engine() }
        }
    }

    impl InstallerWasmExecutor {
        /// Force an engine (tests run the interpreter that iOS uses on every host).
        pub fn with_engine(engine: WasmEngineKind) -> Self {
            Self { engine }
        }
    }

    impl WasmExecutor for InstallerWasmExecutor {
        fn available(&self) -> bool {
            true
        }

        fn run(&self, component: &[u8], spec_json: &str, args: &[String], work_dir: &Path) -> Result<WasmRunOutput, MobileError> {
            let spec: WasmSpec = serde_json::from_str(spec_json).map_err(|e| MobileError::InvalidInput { detail: format!("spec_json: {e}") })?;
            let opts = WasmRunOptions { engine: self.engine, args: args.to_vec(), ..Default::default() };
            let r = run_wasm_component_with(component, &spec, work_dir, &opts);
            let (exit_code, outcome, detail) = match &r.outcome {
                WasmOutcome::Exited { code } => (*code, "exited", String::new()),
                WasmOutcome::Trapped { message } => (-1, "trapped", message.clone()),
                WasmOutcome::TimedOut => (-1, "timed_out", String::new()),
                WasmOutcome::OutOfFuel => (-1, "out_of_fuel", String::new()),
                WasmOutcome::MemoryLimitExceeded => (-1, "memory_limit_exceeded", String::new()),
                WasmOutcome::OutputLimitExceeded => (-1, "output_limit_exceeded", String::new()),
                WasmOutcome::Refused { reason } => (-1, "refused", reason.clone()),
                WasmOutcome::Error { message } => (-1, "error", message.clone()),
            };
            Ok(WasmRunOutput {
                exit_code,
                outcome: outcome.to_string(),
                detail,
                stdout: r.stdout,
                stderr: r.stderr,
                output_truncated: r.output_truncated,
                duration_ms: u64::try_from(r.duration_ms).unwrap_or(u64::MAX),
            })
        }
    }
}

fn default_executor() -> Box<dyn WasmExecutor> {
    #[cfg(feature = "wasm")]
    {
        Box::new(real::InstallerWasmExecutor::default())
    }
    #[cfg(not(feature = "wasm"))]
    {
        Box::new(StubWasmExecutor)
    }
}

/// Whether this build can run Wasm installations on the device.
#[uniffi::export]
pub fn wasm_runtime_available() -> bool {
    default_executor().available()
}

/// Run a Wasm component under the limits and capabilities of the signed `spec_json`
/// (`manifest_core::WasmSpec` as JSON). `work_dir` must be an app-private, writable directory
/// (Android `cacheDir`, iOS temporary directory); preopens are confined to it.
#[uniffi::export]
pub fn run_wasm_installation(component: Vec<u8>, spec_json: String, args: Vec<String>, work_dir: String) -> Result<WasmRunOutput, MobileError> {
    default_executor().run(&component, &spec_json, &args, Path::new(&work_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(feature = "wasm"))]
    #[test]
    fn stub_refuses() {
        assert!(!wasm_runtime_available());
        assert!(matches!(
            run_wasm_installation(vec![0, 97, 115, 109], "{}".into(), vec![], ".".into()),
            Err(MobileError::WasmUnavailable { .. })
        ));
    }

    #[cfg(feature = "wasm")]
    #[test]
    fn real_runtime_is_available_and_rejects_a_bad_spec() {
        assert!(wasm_runtime_available());
        assert!(matches!(
            run_wasm_installation(vec![], "{}".into(), vec![], ".".into()),
            Err(MobileError::InvalidInput { .. })
        ));
    }
}
