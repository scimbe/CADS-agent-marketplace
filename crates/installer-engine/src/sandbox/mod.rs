//! Per-OS lightweight sandbox fallback for `InstallerKind::Binary` activation, when the target
//! host has no static-analysis equivalent to `guardrails::scan_compose`. See
//! `docs/design/sandbox-fallback.md` for the full design and threat-model mapping (F.1-F.3
//! equivalents), and `docs/security-model.md`'s threat table for the cross-linked row.
//!
//! `activate.rs` step 9's Binary arm is the only caller: it selects a backend (or none) via
//! [`select`], then uses [`SandboxBackend::wrap_command`] to rewrite the command line
//! `process::run_bounded` actually executes. Implementations never spawn or wait on anything
//! themselves -- `run_bounded` still owns spawning, timeout, and output capture, unchanged.

use std::path::Path;

#[cfg(target_os = "linux")]
mod bwrap;

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

    /// One-line, operator-facing description of what this backend does and does NOT provide,
    /// relative to the F.1-F.3 bar -- surfaced in the pre-execution warning and in `InstallReport`.
    fn isolation_summary(&self) -> &'static str;
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

/// macOS's `sandbox_exec` backend is Milestone 2 (independent of this module's Linux wiring, same
/// trait, new impl) -- not implemented yet, so there is no candidate to probe. `select()` on macOS
/// therefore always returns `Unsandboxed { tried: vec![] }` until M2 lands; the pre-execution
/// warning in `activate.rs` still fires, matching the documented warn-and-proceed default.
#[cfg(target_os = "macos")]
fn platform_candidates() -> &'static [fn() -> Probe] {
    &[]
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn platform_candidates() -> &'static [fn() -> Probe] {
    &[]
}
