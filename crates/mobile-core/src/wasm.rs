//! Seam for running Wasm installations on-device (WP8b step 4, "later").
//!
//! TODO(feat/wasm-installer): once `InstallerKind::Wasm` and `installer-engine::wasm_runtime`
//! (`run_wasm_component(bytes, &WasmSpec, work_dir, args) -> WasmRunReport`) are merged, add an
//! implementation of [`WasmExecutor`] that delegates to it and make [`default_executor`] return
//! it. Until then the stub below refuses, so the apps can already show the right "not yet
//! available" state without any API change later.

use crate::MobileError;

/// What a Wasm run produced. Mirrors the fields the apps need from `WasmRunReport`.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct WasmRunOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs a component whose digest was already verified against the signed manifest.
pub trait WasmExecutor: Send + Sync {
    fn available(&self) -> bool;
    fn run(&self, component: &[u8], spec_json: &str, args: &[String]) -> Result<WasmRunOutput, MobileError>;
}

/// Placeholder that always refuses. Replace with the `installer-engine::wasm_runtime` adapter.
#[derive(Debug, Default)]
pub struct StubWasmExecutor;

impl WasmExecutor for StubWasmExecutor {
    fn available(&self) -> bool {
        false
    }
    fn run(&self, _component: &[u8], _spec_json: &str, _args: &[String]) -> Result<WasmRunOutput, MobileError> {
        Err(MobileError::WasmUnavailable {
            detail: "on-device Wasm execution is not wired in yet".to_string(),
        })
    }
}

fn default_executor() -> Box<dyn WasmExecutor> {
    Box::new(StubWasmExecutor)
}

/// Whether this build can run Wasm installations on the device.
#[uniffi::export]
pub fn wasm_runtime_available() -> bool {
    default_executor().available()
}

/// Run a (digest-verified) Wasm component. Currently always `WasmUnavailable`.
#[uniffi::export]
pub fn run_wasm_installation(component: Vec<u8>, spec_json: String, args: Vec<String>) -> Result<WasmRunOutput, MobileError> {
    default_executor().run(&component, &spec_json, &args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_refuses() {
        assert!(!wasm_runtime_available());
        assert!(matches!(
            run_wasm_installation(vec![0, 97, 115, 109], "{}".into(), vec![]),
            Err(MobileError::WasmUnavailable { .. })
        ));
    }
}
