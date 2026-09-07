//! `EnvironmentContract`: what a manifest declares about the environment the installer and the
//! harness may act in (scimbe/ct-agent#183, phase 1). Pure data -- no I/O, no clock -- so it
//! builds for `wasm32` exactly like the rest of this crate.
//!
//! **Semantics in phase 1 are `None`-semantics only.** `ServiceManifest.environment` is optional;
//! an absent contract means "the strictest profile" ([`EnvironmentContract::default`]: private
//! loopback, no egress, modest resource limits), never "unrestricted". A present contract is
//! signed (see [`crate::ServiceManifest::signing_bytes`]) and validated, but `installer-engine`
//! does not yet enforce its fields -- except that a contract claiming MORE than the sandbox gives
//! (`network.mode == host_loopback`, or any `egress` entry) is refused outright at activation, so
//! nobody ships a manifest whose promises the runtime cannot keep.

use crate::preimage::Preimage;
use serde::{Deserialize, Serialize};

/// Current contract schema version. A manifest carrying a different value fails
/// [`EnvironmentContract::validate`] rather than being silently reinterpreted.
pub const ENVIRONMENT_SCHEMA: u32 = 1;

/// Where the sandboxed process may read and write.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum FsScopeKind {
    /// Writes confined to the activation's own bundle directory -- the only value phase 1 knows.
    #[default]
    BundleDir,
}

impl FsScopeKind {
    fn as_u8(self) -> u8 {
        match self {
            FsScopeKind::BundleDir => 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct FsScope {
    pub scope: FsScopeKind,
    /// Whether the base OS (libraries, `/usr/bin/sh`, ...) stays readable -- bwrap's `--ro-bind / /`.
    pub read_base_os: bool,
    /// Extra host paths to expose read-only. Declared, not enforced, in phase 1.
    pub extra_ro: Vec<String>,
    /// Size of the private scratch tmpfs, in MiB. Declared, not enforced, in phase 1.
    pub tmp_mb: u32,
}

impl Default for FsScope {
    fn default() -> Self {
        FsScope { scope: FsScopeKind::BundleDir, read_base_os: true, extra_ro: Vec::new(), tmp_mb: 256 }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProcessPolicy {
    /// Executables the harness may launch (relative to the bundle dir, or bare names resolved on
    /// the sandbox's PATH). Empty means "only the manifest's own entrypoint and verify hook".
    pub allow: Vec<String>,
    /// Upper bound on concurrent processes inside the sandbox (`pids_limit` for Compose).
    pub max_pids: u32,
}

impl Default for ProcessPolicy {
    fn default() -> Self {
        ProcessPolicy { allow: Vec::new(), max_pids: 64 }
    }
}

/// Which network the sandboxed process sees. Only [`NetworkMode::PrivateLoopback`] and
/// [`NetworkMode::None`] are supported in phase 1 -- `HostLoopback` is refused at activation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum NetworkMode {
    /// A private network namespace with its own `lo` (bwrap's `--unshare-net`): the process can
    /// talk to itself, never to host `127.0.0.1` services.
    #[default]
    PrivateLoopback,
    /// Reach declared host-loopback ports only. Not supported in phase 1.
    HostLoopback,
    /// No network at all, not even a private loopback.
    None,
}

impl NetworkMode {
    fn as_u8(self) -> u8 {
        match self {
            NetworkMode::PrivateLoopback => 0,
            NetworkMode::HostLoopback => 1,
            NetworkMode::None => 2,
        }
    }
}

/// One host-loopback port the contract asks to reach, with the publisher's stated reason.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostLoopbackPort {
    pub port: u16,
    pub justification: String,
}

/// One egress destination the contract asks for, with the publisher's stated reason. Every entry
/// is refused in phase 1 regardless of justification -- the field exists so the schema does not
/// change when a later phase can honour it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EgressRule {
    pub host: String,
    pub port: u16,
    pub justification: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct NetworkPolicy {
    pub mode: NetworkMode,
    pub host_loopback_ports: Vec<HostLoopbackPort>,
    pub egress: Vec<EgressRule>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ResourceLimits {
    pub cpu_cores: f32,
    pub memory_mb: u32,
    /// Wall-clock bound for the activation's own run and for the harness's tool calls.
    pub wall_secs: u32,
    pub disk_mb: u32,
}

/// `cpu_cores` is an `f32`, which is why `Eq` cannot be derived. [`EnvironmentContract::validate`]
/// rejects a non-finite value, so for every contract that passes validation `PartialEq` is
/// reflexive and this marker impl is sound; it exists so [`crate::ServiceManifest`] can keep its
/// derived `Eq`.
impl Eq for ResourceLimits {}

impl Default for ResourceLimits {
    fn default() -> Self {
        ResourceLimits { cpu_cores: 1.0, memory_mb: 1024, wall_secs: 300, disk_mb: 512 }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Hooks {
    /// Verification entrypoint inside the bundle. Mirrors [`crate::VerifySpec::script`] so a
    /// contract can be read on its own; `installer-engine` still runs `verify.script`.
    pub verify: String,
    pub verify_timeout_secs: u32,
    /// Run (sandboxed) when verification fails after a harness change. Declared, not enforced,
    /// in phase 1.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollback: Option<String>,
    /// Run (sandboxed) on deactivation. Declared, not enforced, in phase 1.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub teardown: Option<String>,
}

impl Default for Hooks {
    fn default() -> Self {
        Hooks { verify: "verify.sh".to_string(), verify_timeout_secs: 60, rollback: None, teardown: None }
    }
}

/// The weakest sandbox tier per OS the publisher accepts. Free-form identifiers on purpose (the
/// per-OS candidate sets differ and will grow); phase 1 only checks they are non-empty.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct SandboxMinTier {
    pub linux: String,
    pub macos: String,
    pub windows: String,
}

impl Default for SandboxMinTier {
    fn default() -> Self {
        SandboxMinTier { linux: "bwrap".to_string(), macos: "seatbelt".to_string(), windows: "wsl2_bwrap".to_string() }
    }
}

/// See the module doc. Every inner field is optional in JSON (`#[serde(default)]` on every
/// level), and `Default` is the strictest profile: private loopback, no host-loopback ports, no
/// egress, 1 CPU core, 1 GiB, 300 s wall clock, 512 MiB disk, 64 pids.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct EnvironmentContract {
    pub schema: u32,
    pub filesystem: FsScope,
    pub processes: ProcessPolicy,
    pub network: NetworkPolicy,
    pub resources: ResourceLimits,
    pub hooks: Hooks,
    pub sandbox_min_tier: SandboxMinTier,
}

impl Default for EnvironmentContract {
    fn default() -> Self {
        EnvironmentContract {
            schema: ENVIRONMENT_SCHEMA,
            filesystem: FsScope::default(),
            processes: ProcessPolicy::default(),
            network: NetworkPolicy::default(),
            resources: ResourceLimits::default(),
            hooks: Hooks::default(),
            sandbox_min_tier: SandboxMinTier::default(),
        }
    }
}

fn port_in_range(port: u16, what: &str) -> Result<(), String> {
    if port == 0 {
        return Err(format!("{what}: port must be in 1..=65535, got 0"));
    }
    Ok(())
}

impl EnvironmentContract {
    /// Structural validity, independent of any host: schema version, port ranges, non-empty
    /// justifications on every network exception, positive bounds. Says nothing about whether a
    /// host can honour the contract -- that is `installer-engine`'s question.
    pub fn validate(&self) -> Result<(), String> {
        if self.schema != ENVIRONMENT_SCHEMA {
            return Err(format!("environment.schema {} is not the supported schema {ENVIRONMENT_SCHEMA}", self.schema));
        }
        if self.filesystem.tmp_mb == 0 {
            return Err("environment.filesystem.tmp_mb must be > 0".to_string());
        }
        if self.processes.max_pids == 0 {
            return Err("environment.processes.max_pids must be > 0".to_string());
        }
        for (i, p) in self.network.host_loopback_ports.iter().enumerate() {
            port_in_range(p.port, &format!("environment.network.host_loopback_ports[{i}]"))?;
            if p.justification.trim().is_empty() {
                return Err(format!("environment.network.host_loopback_ports[{i}] (port {}) needs a non-empty justification", p.port));
            }
        }
        for (i, e) in self.network.egress.iter().enumerate() {
            if e.host.trim().is_empty() {
                return Err(format!("environment.network.egress[{i}] needs a non-empty host"));
            }
            port_in_range(e.port, &format!("environment.network.egress[{i}]"))?;
            if e.justification.trim().is_empty() {
                return Err(format!("environment.network.egress[{i}] ({}:{}) needs a non-empty justification", e.host, e.port));
            }
        }
        if !self.resources.cpu_cores.is_finite() || self.resources.cpu_cores <= 0.0 {
            return Err(format!("environment.resources.cpu_cores must be a finite value > 0, got {}", self.resources.cpu_cores));
        }
        if self.resources.memory_mb == 0 {
            return Err("environment.resources.memory_mb must be > 0".to_string());
        }
        if self.resources.wall_secs == 0 {
            return Err("environment.resources.wall_secs must be > 0".to_string());
        }
        if self.resources.disk_mb == 0 {
            return Err("environment.resources.disk_mb must be > 0".to_string());
        }
        if self.hooks.verify.trim().is_empty() {
            return Err("environment.hooks.verify must name the verify script".to_string());
        }
        if self.hooks.verify_timeout_secs == 0 {
            return Err("environment.hooks.verify_timeout_secs must be > 0".to_string());
        }
        for (os, tier) in [
            ("linux", &self.sandbox_min_tier.linux),
            ("macos", &self.sandbox_min_tier.macos),
            ("windows", &self.sandbox_min_tier.windows),
        ] {
            if tier.trim().is_empty() {
                return Err(format!("environment.sandbox_min_tier.{os} must be non-empty"));
            }
        }
        Ok(())
    }

    /// Append this contract's fields to a signing preimage. The caller has already written the
    /// `tag(1)` presence marker (see [`crate::ServiceManifest::signing_bytes`]); this only encodes
    /// the fields, every variable-length one length-prefixed, every optional one tagged, so the
    /// encoding stays injective. Field order here is the field order any implementation MUST use.
    pub(crate) fn append_to_preimage(&self, p: Preimage) -> Preimage {
        let mut p = p
            .u32(self.schema)
            .tag(self.filesystem.scope.as_u8())
            .tag(self.filesystem.read_base_os as u8)
            .u32(self.filesystem.extra_ro.len() as u32);
        for path in &self.filesystem.extra_ro {
            p = p.var_bytes(path.as_bytes());
        }
        p = p.u32(self.filesystem.tmp_mb).u32(self.processes.allow.len() as u32);
        for exe in &self.processes.allow {
            p = p.var_bytes(exe.as_bytes());
        }
        p = p
            .u32(self.processes.max_pids)
            .tag(self.network.mode.as_u8())
            .u32(self.network.host_loopback_ports.len() as u32);
        for hp in &self.network.host_loopback_ports {
            p = p.fixed(&hp.port.to_le_bytes()).var_bytes(hp.justification.as_bytes());
        }
        p = p.u32(self.network.egress.len() as u32);
        for e in &self.network.egress {
            p = p.var_bytes(e.host.as_bytes()).fixed(&e.port.to_le_bytes()).var_bytes(e.justification.as_bytes());
        }
        p = p
            .fixed(&self.resources.cpu_cores.to_le_bytes())
            .u32(self.resources.memory_mb)
            .u32(self.resources.wall_secs)
            .u32(self.resources.disk_mb)
            .var_bytes(self.hooks.verify.as_bytes())
            .u32(self.hooks.verify_timeout_secs);
        p = match &self.hooks.rollback {
            Some(s) => p.tag(1).var_bytes(s.as_bytes()),
            None => p.tag(0),
        };
        p = match &self.hooks.teardown {
            Some(s) => p.tag(1).var_bytes(s.as_bytes()),
            None => p.tag(0),
        };
        p.var_bytes(self.sandbox_min_tier.linux.as_bytes())
            .var_bytes(self.sandbox_min_tier.macos.as_bytes())
            .var_bytes(self.sandbox_min_tier.windows.as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_the_strictest_profile() {
        let c = EnvironmentContract::default();
        assert_eq!(c.schema, ENVIRONMENT_SCHEMA);
        assert_eq!(c.network.mode, NetworkMode::PrivateLoopback);
        assert!(c.network.host_loopback_ports.is_empty());
        assert!(c.network.egress.is_empty());
        assert_eq!(c.filesystem.scope, FsScopeKind::BundleDir);
        assert!(c.validate().is_ok());
    }

    #[test]
    fn an_empty_json_object_parses_to_the_default_contract() {
        let c: EnvironmentContract = serde_json::from_str("{}").unwrap();
        assert_eq!(c, EnvironmentContract::default());
    }

    #[test]
    fn partially_specified_json_fills_every_other_field_with_the_default() {
        let c: EnvironmentContract =
            serde_json::from_str(r#"{"network":{"mode":"none"},"resources":{"memory_mb":128}}"#).unwrap();
        assert_eq!(c.network.mode, NetworkMode::None);
        assert_eq!(c.resources.memory_mb, 128);
        assert_eq!(c.resources.wall_secs, ResourceLimits::default().wall_secs);
        assert_eq!(c.hooks, Hooks::default());
        assert!(c.validate().is_ok());
    }

    #[test]
    fn json_round_trip_preserves_every_field() {
        let c = EnvironmentContract {
            network: NetworkPolicy {
                mode: NetworkMode::HostLoopback,
                host_loopback_ports: vec![HostLoopbackPort { port: 4103, justification: "LiteLLM proxy".into() }],
                egress: vec![EgressRule { host: "example.invalid".into(), port: 443, justification: "updates".into() }],
            },
            hooks: Hooks { rollback: Some("rollback.sh".into()), ..Hooks::default() },
            ..EnvironmentContract::default()
        };
        let json = serde_json::to_string(&c).unwrap();
        let back: EnvironmentContract = serde_json::from_str(&json).unwrap();
        assert_eq!(back, c);
    }

    #[test]
    fn egress_without_a_justification_fails_validation() {
        let mut c = EnvironmentContract::default();
        c.network.egress.push(EgressRule { host: "example.invalid".into(), port: 443, justification: "  ".into() });
        let err = c.validate().unwrap_err();
        assert!(err.contains("egress[0]") && err.contains("justification"), "{err}");
    }

    #[test]
    fn port_zero_fails_validation() {
        let mut c = EnvironmentContract::default();
        c.network.host_loopback_ports.push(HostLoopbackPort { port: 0, justification: "x".into() });
        let err = c.validate().unwrap_err();
        assert!(err.contains("host_loopback_ports[0]") && err.contains("1..=65535"), "{err}");
    }

    #[test]
    fn zero_wall_secs_fails_validation() {
        let mut c = EnvironmentContract::default();
        c.resources.wall_secs = 0;
        assert!(c.validate().unwrap_err().contains("wall_secs"));
    }

    #[test]
    fn non_finite_or_non_positive_cpu_cores_fails_validation() {
        let mut c = EnvironmentContract::default();
        c.resources.cpu_cores = f32::NAN;
        assert!(c.validate().unwrap_err().contains("cpu_cores"));
        c.resources.cpu_cores = 0.0;
        assert!(c.validate().unwrap_err().contains("cpu_cores"));
    }

    #[test]
    fn an_unknown_schema_version_fails_validation() {
        let c = EnvironmentContract { schema: 2, ..EnvironmentContract::default() };
        assert!(c.validate().unwrap_err().contains("schema"));
    }

    #[test]
    fn preimage_encoding_is_injective_across_optional_hooks() {
        // `rollback: Some("")` and `rollback: None` must encode differently -- the tag byte is
        // what keeps a present-but-empty hook from colliding with an absent one.
        let with_empty = EnvironmentContract { hooks: Hooks { rollback: Some(String::new()), ..Hooks::default() }, ..Default::default() };
        let without = EnvironmentContract::default();
        let a = with_empty.append_to_preimage(Preimage::new(b"t")).finish();
        let b = without.append_to_preimage(Preimage::new(b"t")).finish();
        assert_ne!(a, b);
    }

    #[test]
    fn preimage_encoding_changes_with_the_network_mode() {
        let a = EnvironmentContract::default().append_to_preimage(Preimage::new(b"t")).finish();
        let mut strict = EnvironmentContract::default();
        strict.network.mode = NetworkMode::None;
        let b = strict.append_to_preimage(Preimage::new(b"t")).finish();
        assert_ne!(a, b);
    }
}
