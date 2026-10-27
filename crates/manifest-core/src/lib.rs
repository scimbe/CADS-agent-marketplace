//! `manifest-core`: the [`manifest::ServiceManifest`] schema, its signing/verification, and
//! nothing else -- no network I/O, no docker, no filesystem beyond what `serde_json` needs. Kept
//! deliberately small and dependency-light so it can be vendored into `ct-agent` (as a git
//! dependency, mirroring `ct_control_plane`/`ct_dns`'s own placement in `native/Cargo.toml`)
//! without pulling in `installer-engine`'s much larger dependency surface (tokio, reqwest, tar).

pub mod composition;
pub mod environment;
pub mod hex;
pub mod manifest;
mod preimage;
pub mod prompt_template;
pub mod task;
pub mod wasm;

pub use composition::{CompositionEdge, CompositionManifest, EdgeUpgradeHint, SubManifestRef};
pub use environment::{
    EgressRule, EnvironmentContract, FsScope, FsScopeKind, Hooks, HostLoopbackPort, NetworkMode, NetworkPolicy,
    ProcessPolicy, ResourceLimits, SandboxMinTier, ENVIRONMENT_SCHEMA,
};
pub use manifest::{BundleRef, DemoPrompt, EnvVarSpec, InstallerKind, PromptParam, PromptParamKind, ServiceManifest, VerifySpec};
pub use prompt_template::{ComponentRef, PromptTemplate, RenderError, RenderedPrompt, ValueViolation};
pub use task::SignedTask;
pub use wasm::{
    PreopenMode, Preopen, WasmCapabilities, WasmLimits, WasmSpec, MAX_WASM_FUEL, MAX_WASM_MEMORY_BYTES, MAX_WASM_TIMEOUT_MS,
    WASM_WORLD_CLI_COMMAND,
};
