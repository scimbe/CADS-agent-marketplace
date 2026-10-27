//! Per-OS sandbox for `InstallerKind::Binary` activation (Linux `bwrap`, macOS Seatbelt
//! `sandbox_exec`, Windows `wsl_bwrap`), when the target host has no static-analysis equivalent
//! to `guardrails::scan_compose`. [`doctor`] / [`setup_plan`] / [`apply`] let the environment
//! establish the sandbox itself. See
//! `docs/design/sandbox-fallback.md` for the full design and threat-model mapping (F.1-F.3
//! equivalents), and `docs/security-model.md`'s threat table for the cross-linked row.
//!
//! `activate.rs` step 9's Binary arm is the only caller: it selects a backend (or none) via
//! [`select`], then uses [`SandboxBackend::wrap_command`] to rewrite the command line
//! `process::run_bounded` actually executes. Implementations never spawn or wait on anything
//! themselves -- `run_bounded` still owns spawning, timeout, and output capture, unchanged.

use std::path::{Path, PathBuf};

mod bwrap;
mod doctor;
// Compiled on every OS (pure profile/argv generation is unit-tested everywhere); only macOS selects it.
mod sandbox_exec;
mod wsl;

pub use doctor::{
    apply, apply_with, detect_host, doctor, install_bubblewrap_argv, plan_from_facts, setup_plan, ApplyOutcome, DoctorReport,
    HostFacts, PackageManager, Privilege, SetupPlan, SetupStep, StepRun, StepRunner, UsernsFacts,
};
#[cfg(target_os = "macos")]
pub use sandbox_exec::SandboxExec;

/// One platform's lightweight isolation primitive for a Binary activation. `wrap_command` only
/// rewrites the command line; `process::run_bounded` still owns spawning, timeout, and output
/// capture, unchanged. This is deliberate defense in depth, not redundant with `run_bounded`'s own
/// env-scrubbing: the outer `run_bounded` scrub protects against an inherited ambient secret
/// leaking into the sandbox launcher itself; the sandbox's own scrub (bwrap's `--clearenv`/
/// `--setenv`, or a Seatbelt profile) is the second, independent scrub applied to what the
/// *sandboxed* process actually sees.
pub trait SandboxBackend {
    /// Short, stable identifier -- goes into `InstallReport` and log lines. Never changes once
    /// shipped; it's part of the operator-facing/report-facing contract, not free-form prose.
    fn name(&self) -> &'static str;

    /// Rewrite `(exe, args)` into a new `(program, args)` pair that runs `exe args...` inside this
    /// backend's sandbox, confined to `work_dir`, with exactly `env` as its environment (no
    /// ambient inheritance beyond what the backend itself unavoidably needs).
    fn wrap_command(&self, exe: &str, args: &[&str], work_dir: &Path, env: &[(&str, &str)]) -> (String, Vec<String>);

    /// [`wrap_command`](Self::wrap_command) plus the extra capabilities in `policy` (extra
    /// read-only paths, a writable HOME/TMPDIR, outbound network). A backend that cannot
    /// honour a non-default policy returns `Err` -- the caller must then NOT run the payload:
    /// failing closed is the contract. The default policy is exactly `wrap_command`.
    fn wrap_command_with_policy(
        &self,
        exe: &str,
        args: &[&str],
        work_dir: &Path,
        env: &[(&str, &str)],
        policy: &SandboxPolicy,
    ) -> Result<(String, Vec<String>), String> {
        if *policy == SandboxPolicy::default() {
            Ok(self.wrap_command(exe, args, work_dir, env))
        } else {
            Err(format!("sandbox backend '{}' does not support extended sandbox policies", self.name()))
        }
    }

    /// One-line, operator-facing description of what this backend does and does NOT provide,
    /// relative to the F.1-F.3 bar -- surfaced in the pre-execution warning and in `InstallReport`.
    fn isolation_summary(&self) -> &'static str;
}

/// Network access a sandboxed payload gets. `None` is the installer default.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum NetworkPolicy {
    /// No network (bwrap: private namespace with only a private `lo`; Seatbelt: `deny network*`).
    #[default]
    None,
    /// The HOST's loopback only on Seatbelt (shared with every local service); on bwrap there is
    /// no host loopback, only the namespace's private one, so this equals `None`.
    Loopback,
    /// Outbound TLS to the internet (tcp/443) plus name resolution. NOT a per-host allowlist:
    /// anything reachable on 443 is reachable, which is the residual exfiltration channel
    /// (`docs/security-model.md`). **bwrap shares the HOST network namespace** (`--share-net`), so
    /// host loopback services and the local network are reachable too; Seatbelt limits egress to
    /// tcp/443 only. Neither is a substitute for a provider-host proxy allowlist.
    Outbound,
}

/// What a caller may ask for beyond the installer default (read-only OS view, writes confined to
/// `work_dir`, no network). Every path must be absolute; the backend refuses `/`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SandboxPolicy {
    /// Extra read-only (and, on Seatbelt, executable) trees, e.g. an agent CLI and its runtime.
    pub extra_ro_paths: Vec<PathBuf>,
    /// One writable per-run HOME directory (outside `work_dir`).
    pub home_dir: Option<PathBuf>,
    /// One writable per-run TMPDIR (outside `work_dir`).
    pub tmp_dir: Option<PathBuf>,
    pub network: NetworkPolicy,
}

impl SandboxPolicy {
    /// Structural validation shared by every backend.
    pub fn validate(&self) -> Result<(), String> {
        let check = |what: &str, p: &Path| -> Result<(), String> {
            if !p.is_absolute() {
                return Err(format!("sandbox policy: {what} {} is not absolute", p.display()));
            }
            if p.parent().is_none() {
                return Err(format!("sandbox policy: {what} may not be the filesystem root"));
            }
            if p.to_string_lossy().contains(['\n', '\0']) {
                return Err(format!("sandbox policy: {what} contains a control character"));
            }
            Ok(())
        };
        for p in &self.extra_ro_paths {
            check("read-only path", p)?;
        }
        if let Some(p) = &self.home_dir {
            check("home_dir", p)?;
        }
        if let Some(p) = &self.tmp_dir {
            check("tmp_dir", p)?;
        }
        Ok(())
    }
}

/// Runtime capability probe result for one backend candidate -- distinct from "no candidate for
/// this OS" (there's always a compiled-in candidate list per OS, possibly empty): this specifically
/// means "the candidate exists in source but isn't usable on THIS host" (binary not on PATH, probe
/// exec failed, kernel/OS feature disabled). Kept as its own variant, not folded into `None`, so a
/// caller/warning can tell "we didn't even try" from "we tried and it's broken here" -- the two
/// have different remediation stories for an operator (install a package vs. investigate a kernel
/// config).
pub enum Probe {
    Available(Box<dyn SandboxBackend>),
    Unavailable { candidate: &'static str, reason: String },
}

pub enum Selection {
    Sandboxed(Box<dyn SandboxBackend>),
    /// No candidate for this OS was usable (or none exists at all for this OS). `tried` is empty
    /// on an OS with zero candidates; non-empty on an OS with a real candidate that failed its
    /// probe, so the eventual warning can say WHY, not just THAT.
    Unsandboxed { tried: Vec<(&'static str, String)> },
}

/// Resource caps applied to a sandboxed run via `setrlimit` (Linux, macOS: in the launcher, before
/// exec, inherited by the payload) or `prlimit` (WSL: inside the distro). They bound a runaway or
/// hostile payload; they are not a fair-share scheduler.
///
/// * `cpu_secs`: CPU time (the wall-clock bound is `run_bounded`'s timeout, 300 s).
/// * `fsize_bytes`: the largest single file the payload can write (fills no disk with one write).
/// * `nproc`: `RLIMIT_NPROC` counts ALL processes and threads of the real UID, not just the
///   sandbox's. 8192 is a backstop against a fork bomb that still leaves a busy desktop user
///   headroom; if the user already runs more, `fork` fails and the install fails closed.
///
/// There is no memory cap: `RLIMIT_AS` breaks JIT/Go/Java runtimes, and there is no portable
/// alternative short of cgroups. That gap is documented in `docs/security-model.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub cpu_secs: u64,
    pub fsize_bytes: u64,
    pub nproc: u64,
}

pub const DEFAULT_LIMITS: Limits = Limits { cpu_secs: 600, fsize_bytes: 4 << 30, nproc: 8192 };

/// The shell that runs a bundle's `verify.sh` inside a backend. An absolute path where one is known
/// to resolve inside the sandbox (macOS's profile only allows the OS's own binary directories, so
/// a Homebrew `bash` earlier on `PATH` would be denied), else a `PATH` lookup, else the bare name.
pub fn verify_shell() -> String {
    if cfg!(target_os = "macos") {
        return "/bin/bash".to_string();
    }
    if cfg!(windows) {
        return "bash".to_string(); // resolved inside the WSL distro, not on the Windows PATH
    }
    doctor::find_in_path("bash", std::env::var("PATH").ok().as_deref())
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "bash".to_string())
}

/// Try every backend this OS has a candidate for, in preference order, return the first
/// `Available`.
pub fn select() -> Selection {
    let candidates = platform_candidates();
    let mut unavailable = Vec::new();
    for probe_fn in candidates {
        match probe_fn() {
            Probe::Available(backend) => return Selection::Sandboxed(backend),
            Probe::Unavailable { candidate, reason } => unavailable.push((candidate, reason)),
        }
    }
    Selection::Unsandboxed { tried: unavailable }
}

/// Compile-time candidate list per OS, not a runtime OS string match -- an unsupported target
/// never even links code that assumes a Unix-only API it doesn't have.
#[cfg(target_os = "linux")]
fn platform_candidates() -> &'static [fn() -> Probe] {
    &[bwrap::probe]
}

#[cfg(target_os = "macos")]
fn platform_candidates() -> &'static [fn() -> Probe] {
    &[sandbox_exec::probe]
}

/// Windows: bubblewrap inside a WSL2 distro (`wsl.exe --exec bwrap`). Selected only when the real
/// probe succeeds; otherwise the activation is refused with the setup steps in the probe reason.
#[cfg(windows)]
fn platform_candidates() -> &'static [fn() -> Probe] {
    &[wsl::probe]
}

/// Android (and any other target): no backend yet -- see `docs/adr/0002-android-sandbox-via-ct-agent-core.md`.
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn platform_candidates() -> &'static [fn() -> Probe] {
    &[]
}
