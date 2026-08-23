//! `manifest-core`: the [`manifest::ServiceManifest`] schema, its signing/verification, and
//! nothing else -- no network I/O, no docker, no filesystem beyond what `serde_json` needs. Kept
//! deliberately small and dependency-light so it can be vendored into `ct-agent` (as a git
//! dependency, mirroring `ct_control_plane`/`ct_dns`'s own placement in `native/Cargo.toml`)
//! without pulling in `installer-engine`'s much larger dependency surface (tokio, reqwest, tar).

pub mod hex;
pub mod manifest;
mod preimage;
pub mod task;

pub use manifest::{BundleRef, EnvVarSpec, InstallerKind, ServiceManifest, VerifySpec};
pub use task::SignedTask;
