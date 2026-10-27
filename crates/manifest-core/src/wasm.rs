//! `WasmSpec`: the signed description of a WebAssembly-component installation
//! ([`crate::InstallerKind::Wasm`]). Pure data -- no I/O, no wasm runtime -- so it builds for
//! `wasm32` like the rest of this crate; the runtime that enforces it is
//! `installer-engine::wasm_runtime`.
//!
//! Why this kind exists: Android (targetSdk >= 29 forbids `exec` from app-writable directories) and
//! iOS (no `exec` at all) cannot run downloaded native binaries, so installations on mobile run as
//! WebAssembly inside the app. The Wasm runtime *is* the sandbox: capability-based (only the
//! directories, hosts and environment variable names listed here exist for the guest), with a
//! memory cap and a CPU/time cap. See `docs/adr/0003-wasm-installer-kind-for-mobile.md`.
//!
//! Everything here is part of the signed preimage ([`WasmSpec::append_to_preimage`]), so a
//! capability cannot be widened after signing. [`WasmSpec::validate`] is the static well-formedness
//! check every consumer MUST run before trusting the values; it is also what keeps a signed but
//! malicious spec from naming a path outside the install's work directory.

use crate::hex;
use crate::preimage::Preimage;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// The only world a Wasm installation may target: a WASI 0.2 command (`wasi:cli/run`).
pub const WASM_WORLD_CLI_COMMAND: &str = "wasi:cli/command";

/// Hard upper bound for [`WasmLimits::max_memory_bytes`] (2 GiB). A phone does not have more to give.
pub const MAX_WASM_MEMORY_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Hard upper bound for [`WasmLimits::timeout_ms`] (1 hour).
pub const MAX_WASM_TIMEOUT_MS: u64 = 3_600_000;
/// Hard upper bound for [`WasmLimits::fuel`].
pub const MAX_WASM_FUEL: u64 = 1_000_000_000_000_000;
/// Bounds on the list sizes, so a signed spec cannot be used to make validation or setup expensive.
pub const MAX_WASM_PREOPENS: usize = 16;
pub const MAX_WASM_HTTP_HOSTS: usize = 64;
pub const MAX_WASM_ENV_NAMES: usize = 64;
const MAX_PATH_LEN: usize = 255;

/// Access mode of a preopened directory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PreopenMode {
    /// Read-only: the guest can list and read, never create, write or delete.
    Ro,
    /// Read-write, still confined to the host directory (always inside the install's work dir).
    Rw,
}

impl PreopenMode {
    fn as_u8(self) -> u8 {
        match self {
            PreopenMode::Ro => 0,
            PreopenMode::Rw => 1,
        }
    }
}

/// One directory the guest may see. The host side is **never** chosen by the manifest: it is the
/// install's per-activation work dir, or a sub-directory of it (`host_subdir`, relative, no `..`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Preopen {
    /// Path the guest sees (e.g. `/work`).
    pub guest_path: String,
    /// Relative sub-directory of the work dir that is mounted; empty = the work dir itself.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub host_subdir: String,
    pub mode: PreopenMode,
}

/// What the guest may touch. Everything not listed does not exist for it.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct WasmCapabilities {
    #[serde(default)]
    pub preopens: Vec<Preopen>,
    /// Exact hostnames (lowercase, no port, no wildcard, no IP literal) the guest may reach, and
    /// only over `https`. Empty = no network at all (the `wasi:http` interfaces are not even linked).
    #[serde(default)]
    pub allowed_http_hosts: Vec<String>,
    /// Names (never values) of environment variables handed to the guest. Values come from the
    /// local, out-of-band env source at install time, exactly as for the other kinds; each name
    /// must also be declared in the manifest's `env_template`.
    #[serde(default)]
    pub env: Vec<String>,
}

/// Resource caps. Both `max_memory_bytes` and `timeout_ms` are mandatory: a Wasm installation with
/// no memory or time bound is not expressible.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WasmLimits {
    /// Cap on the total linear memory of the guest.
    pub max_memory_bytes: u64,
    /// Wall-clock cap for the whole run (epoch-based interruption plus a host-side timeout, so a
    /// guest blocked in a host call is bounded too).
    pub timeout_ms: u64,
    /// Optional deterministic instruction budget (wasmtime fuel) on top of the wall-clock cap.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fuel: Option<u64>,
}

/// The signed Wasm installation description.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WasmSpec {
    /// Path of the component inside the unpacked bundle (relative, no `..`).
    pub component_path: String,
    /// SHA-256 of the component file itself. The bundle hash already covers the bytes the engine
    /// unpacks; this second, signed hash makes the spec self-verifying for callers that hold only
    /// the component bytes (mobile bindings run `run_wasm_component(bytes, &spec, ..)` directly).
    #[serde(with = "hex::b32")]
    pub component_sha256: [u8; 32],
    /// Must be [`WASM_WORLD_CLI_COMMAND`].
    pub world: String,
    #[serde(default)]
    pub capabilities: WasmCapabilities,
    pub limits: WasmLimits,
}

impl WasmSpec {
    /// Append this spec to a signing preimage. Called by [`crate::ServiceManifest::signing_bytes_with_wasm`]
    /// after the `tag(3)` presence byte. Every variable-length field is length-prefixed and every
    /// list count explicit, so the encoding is injective.
    pub(crate) fn append_to_preimage(&self, p: Preimage) -> Preimage {
        let mut p = p
            .var_bytes(self.component_path.as_bytes())
            .fixed(&self.component_sha256)
            .var_bytes(self.world.as_bytes())
            .u32(self.capabilities.preopens.len() as u32);
        for po in &self.capabilities.preopens {
            p = p.var_bytes(po.guest_path.as_bytes()).var_bytes(po.host_subdir.as_bytes()).tag(po.mode.as_u8());
        }
        p = p.u32(self.capabilities.allowed_http_hosts.len() as u32);
        for h in &self.capabilities.allowed_http_hosts {
            p = p.var_bytes(h.as_bytes());
        }
        p = p.u32(self.capabilities.env.len() as u32);
        for e in &self.capabilities.env {
            p = p.var_bytes(e.as_bytes());
        }
        p = p.u64(self.limits.max_memory_bytes).u64(self.limits.timeout_ms);
        match self.limits.fuel {
            None => p.tag(0),
            Some(f) => p.tag(1).u64(f),
        }
    }

    /// Static well-formedness check. Returns the first violation.
    ///
    /// - `world` is `wasi:cli/command`;
    /// - `component_path` and every `host_subdir` are relative and free of `..` (so a read-write
    ///   preopen can only ever resolve inside the work dir; the runtime additionally canonicalises
    ///   and re-checks, to catch symlinks);
    /// - `guest_path`s are non-empty, free of `..`/NUL and unique;
    /// - every allowed host is a syntactically valid, lowercase, exact DNS name (>= 2 labels, not an
    ///   IP literal, no port, no wildcard);
    /// - env names are `[A-Za-z_][A-Za-z0-9_]*` and unique;
    /// - limits are non-zero and at most the `MAX_WASM_*` caps.
    pub fn validate(&self) -> Result<(), String> {
        if self.world != WASM_WORLD_CLI_COMMAND {
            return Err(format!("wasm.world must be \"{WASM_WORLD_CLI_COMMAND}\", got {:?}", self.world));
        }
        check_relative_path("wasm.component_path", &self.component_path, false)?;

        let caps = &self.capabilities;
        if caps.preopens.len() > MAX_WASM_PREOPENS {
            return Err(format!("wasm.capabilities.preopens has {} entries, max {MAX_WASM_PREOPENS}", caps.preopens.len()));
        }
        let mut seen = HashSet::new();
        for (i, po) in caps.preopens.iter().enumerate() {
            let what = format!("wasm.capabilities.preopens[{i}]");
            if po.guest_path.is_empty() || po.guest_path.len() > MAX_PATH_LEN || po.guest_path.contains('\0') {
                return Err(format!("{what}.guest_path must be 1..={MAX_PATH_LEN} bytes without NUL"));
            }
            if po.guest_path.split('/').any(|c| c == "..") {
                return Err(format!("{what}.guest_path must not contain '..'"));
            }
            if !seen.insert(po.guest_path.as_str()) {
                return Err(format!("{what}.guest_path {:?} is declared twice", po.guest_path));
            }
            if !po.host_subdir.is_empty() {
                check_relative_path(&format!("{what}.host_subdir"), &po.host_subdir, true)?;
            }
        }

        if caps.allowed_http_hosts.len() > MAX_WASM_HTTP_HOSTS {
            return Err(format!(
                "wasm.capabilities.allowed_http_hosts has {} entries, max {MAX_WASM_HTTP_HOSTS}",
                caps.allowed_http_hosts.len()
            ));
        }
        let mut seen_hosts = HashSet::new();
        for h in &caps.allowed_http_hosts {
            validate_hostname(h).map_err(|e| format!("wasm.capabilities.allowed_http_hosts: {h:?}: {e}"))?;
            if !seen_hosts.insert(h.as_str()) {
                return Err(format!("wasm.capabilities.allowed_http_hosts: {h:?} is declared twice"));
            }
        }

        if caps.env.len() > MAX_WASM_ENV_NAMES {
            return Err(format!("wasm.capabilities.env has {} entries, max {MAX_WASM_ENV_NAMES}", caps.env.len()));
        }
        let mut seen_env = HashSet::new();
        for n in &caps.env {
            if !is_env_name(n) {
                return Err(format!("wasm.capabilities.env: {n:?} is not a valid variable name"));
            }
            if !seen_env.insert(n.as_str()) {
                return Err(format!("wasm.capabilities.env: {n:?} is declared twice"));
            }
        }

        let l = &self.limits;
        if l.max_memory_bytes == 0 || l.max_memory_bytes > MAX_WASM_MEMORY_BYTES {
            return Err(format!("wasm.limits.max_memory_bytes must be in 1..={MAX_WASM_MEMORY_BYTES}, got {}", l.max_memory_bytes));
        }
        if l.timeout_ms == 0 || l.timeout_ms > MAX_WASM_TIMEOUT_MS {
            return Err(format!("wasm.limits.timeout_ms must be in 1..={MAX_WASM_TIMEOUT_MS}, got {}", l.timeout_ms));
        }
        if let Some(f) = l.fuel {
            if f == 0 || f > MAX_WASM_FUEL {
                return Err(format!("wasm.limits.fuel must be in 1..={MAX_WASM_FUEL} when set, got {f}"));
            }
        }
        Ok(())
    }
}

/// `true` for `[A-Za-z_][A-Za-z0-9_]{0,127}`.
pub fn is_env_name(n: &str) -> bool {
    let mut chars = n.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    n.len() <= 128 && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// A relative path made of normal components only: no leading `/` or `\`, no drive prefix, no
/// `..`, no NUL, no backslash. `allow_empty_segments_dot` lets `host_subdir` contain `.` segments.
fn check_relative_path(what: &str, p: &str, allow_dot: bool) -> Result<(), String> {
    if p.is_empty() || p.len() > MAX_PATH_LEN {
        return Err(format!("{what} must be 1..={MAX_PATH_LEN} bytes"));
    }
    if p.contains('\0') || p.contains('\\') {
        return Err(format!("{what} must not contain NUL or backslash"));
    }
    if p.starts_with('/') || p.as_bytes().get(1) == Some(&b':') {
        return Err(format!("{what} must be relative to the bundle/work dir, got {p:?}"));
    }
    for c in p.split('/') {
        if c == ".." {
            return Err(format!("{what} must not contain '..'"));
        }
        if c.is_empty() || (c == "." && !allow_dot) {
            return Err(format!("{what} must not contain empty or '.' segments"));
        }
    }
    Ok(())
}

/// Syntactic check for an exact, lowercase DNS hostname.
pub fn validate_hostname(h: &str) -> Result<(), String> {
    if h.is_empty() || h.len() > 253 {
        return Err("length must be 1..=253".into());
    }
    if h.bytes().any(|b| !(b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')) {
        return Err("only lowercase a-z, 0-9, '-' and '.' are allowed (no port, wildcard, IP-v6 or uppercase)".into());
    }
    let labels: Vec<&str> = h.split('.').collect();
    if labels.len() < 2 {
        return Err("must have at least two labels (e.g. api.example.com)".into());
    }
    for l in &labels {
        if l.is_empty() || l.len() > 63 {
            return Err("labels must be 1..=63 bytes".into());
        }
        if l.starts_with('-') || l.ends_with('-') {
            return Err("labels must not start or end with '-'".into());
        }
    }
    // An all-numeric last label means a dotted-quad (or similar) IP literal, not a DNS name.
    if labels.last().is_some_and(|l| l.bytes().all(|b| b.is_ascii_digit())) {
        return Err("IP literals are not allowed; name the DNS host".into());
    }
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn sample() -> WasmSpec {
        WasmSpec {
            component_path: "app.wasm".into(),
            component_sha256: [5u8; 32],
            world: WASM_WORLD_CLI_COMMAND.into(),
            capabilities: WasmCapabilities {
                preopens: vec![Preopen { guest_path: "/work".into(), host_subdir: String::new(), mode: PreopenMode::Rw }],
                allowed_http_hosts: vec![],
                env: vec![],
            },
            limits: WasmLimits { max_memory_bytes: 64 << 20, timeout_ms: 10_000, fuel: None },
        }
    }

    #[test]
    fn the_sample_is_valid() {
        sample().validate().unwrap();
    }

    #[test]
    fn json_round_trips_and_omits_empty_optionals() {
        let s = sample();
        let json = serde_json::to_string(&s).unwrap();
        assert!(!json.contains("host_subdir") && !json.contains("fuel"), "{json}");
        assert_eq!(serde_json::from_str::<WasmSpec>(&json).unwrap(), s);
    }

    #[test]
    fn rejects_a_foreign_world() {
        let mut s = sample();
        s.world = "wasi:http/proxy".into();
        assert!(s.validate().unwrap_err().contains("world"));
    }

    #[test]
    fn rejects_component_paths_that_escape() {
        for bad in ["", "/etc/passwd", "../x.wasm", "a/../../x.wasm", "a\\b.wasm", "C:/x.wasm", "a//b.wasm", "./a.wasm"] {
            let mut s = sample();
            s.component_path = bad.into();
            assert!(s.validate().is_err(), "{bad:?} must be rejected");
        }
    }

    #[test]
    fn rejects_host_subdirs_that_leave_the_work_dir() {
        for bad in ["/", "/etc", "..", "../out", "a/../../out", "C:\\x", "a\\b"] {
            let mut s = sample();
            s.capabilities.preopens[0].host_subdir = bad.into();
            assert!(s.validate().is_err(), "host_subdir {bad:?} must be rejected");
        }
        let mut ok = sample();
        ok.capabilities.preopens[0].host_subdir = "out/data".into();
        ok.validate().unwrap();
    }

    #[test]
    fn rejects_bad_or_duplicate_guest_paths() {
        let mut s = sample();
        s.capabilities.preopens[0].guest_path = "/a/../b".into();
        assert!(s.validate().is_err());
        let mut s = sample();
        s.capabilities.preopens[0].guest_path = String::new();
        assert!(s.validate().is_err());
        let mut s = sample();
        s.capabilities.preopens.push(s.capabilities.preopens[0].clone());
        assert!(s.validate().unwrap_err().contains("twice"));
    }

    #[test]
    fn hostnames_must_be_exact_lowercase_dns_names() {
        for good in ["api.example.com", "a-b.example.org", "x1.y2.z3.io"] {
            validate_hostname(good).unwrap_or_else(|e| panic!("{good}: {e}"));
        }
        for bad in [
            "", "localhost", "Example.com", "*.example.com", "example.com:443", "example.com/path", "127.0.0.1",
            "10.0.0.1", "-a.example.com", "a-.example.com", "a..example.com", ".example.com", "example.com.", "[::1]",
            "exa mple.com", "bücher.example",
        ] {
            assert!(validate_hostname(bad).is_err(), "{bad:?} must be rejected");
        }
        assert!(validate_hostname(&format!("{}.com", "a".repeat(64))).is_err(), "63-byte label limit");
    }

    #[test]
    fn env_names_are_validated() {
        assert!(is_env_name("API_KEY") && is_env_name("_x1"));
        for bad in ["", "1A", "A-B", "A=B", "A B"] {
            assert!(!is_env_name(bad), "{bad:?}");
        }
        let mut s = sample();
        s.capabilities.env = vec!["A=B".into()];
        assert!(s.validate().is_err());
        let mut s = sample();
        s.capabilities.env = vec!["A".into(), "A".into()];
        assert!(s.validate().is_err());
    }

    #[test]
    fn limits_must_be_non_zero_and_capped() {
        let cases: [(&dyn Fn(&mut WasmSpec), &str); 6] = [
            (&|s| s.limits.max_memory_bytes = 0, "max_memory_bytes"),
            (&|s| s.limits.max_memory_bytes = MAX_WASM_MEMORY_BYTES + 1, "max_memory_bytes"),
            (&|s| s.limits.timeout_ms = 0, "timeout_ms"),
            (&|s| s.limits.timeout_ms = MAX_WASM_TIMEOUT_MS + 1, "timeout_ms"),
            (&|s| s.limits.fuel = Some(0), "fuel"),
            (&|s| s.limits.fuel = Some(MAX_WASM_FUEL + 1), "fuel"),
        ];
        for (mutate, field) in cases {
            let mut s = sample();
            mutate(&mut s);
            assert!(s.validate().unwrap_err().contains(field), "{field}");
        }
        let mut max = sample();
        max.limits = WasmLimits { max_memory_bytes: MAX_WASM_MEMORY_BYTES, timeout_ms: MAX_WASM_TIMEOUT_MS, fuel: Some(MAX_WASM_FUEL) };
        max.validate().unwrap();
    }

    #[test]
    fn list_sizes_are_capped() {
        let mut s = sample();
        s.capabilities.allowed_http_hosts = (0..=MAX_WASM_HTTP_HOSTS).map(|i| format!("h{i}.example.com")).collect();
        assert!(s.validate().is_err());
    }

    #[test]
    fn preimage_distinguishes_every_field() {
        let enc = |s: &WasmSpec| s.append_to_preimage(Preimage::new(b"t")).finish();
        let base = enc(&sample());
        let variants: Vec<Box<dyn Fn(&mut WasmSpec)>> = vec![
            Box::new(|s| s.component_path = "b.wasm".into()),
            Box::new(|s| s.component_sha256 = [6; 32]),
            Box::new(|s| s.capabilities.preopens[0].mode = PreopenMode::Ro),
            Box::new(|s| s.capabilities.preopens[0].guest_path = "/w".into()),
            Box::new(|s| s.capabilities.preopens[0].host_subdir = "o".into()),
            Box::new(|s| s.capabilities.allowed_http_hosts.push("a.example.com".into())),
            Box::new(|s| s.capabilities.env.push("A".into())),
            Box::new(|s| s.limits.max_memory_bytes += 1),
            Box::new(|s| s.limits.timeout_ms += 1),
            Box::new(|s| s.limits.fuel = Some(1)),
        ];
        for (i, v) in variants.iter().enumerate() {
            let mut s = sample();
            v(&mut s);
            assert_ne!(enc(&s), base, "variant {i} must change the preimage");
        }
        // fuel None vs Some(0) must also differ (tag byte), even though Some(0) is invalid.
        let mut zero = sample();
        zero.limits.fuel = Some(0);
        assert_ne!(enc(&zero), base);
    }

    #[test]
    fn host_lists_are_not_ambiguous_across_fields() {
        // ["a.example.com"] hosts + [] env must not collide with [] hosts + ["a.example.com"] env.
        let enc = |s: &WasmSpec| s.append_to_preimage(Preimage::new(b"t")).finish();
        let mut a = sample();
        a.capabilities.allowed_http_hosts = vec!["a.example.com".into()];
        let mut b = sample();
        b.capabilities.env = vec!["a.example.com".into()];
        assert_ne!(enc(&a), enc(&b));
    }
}
