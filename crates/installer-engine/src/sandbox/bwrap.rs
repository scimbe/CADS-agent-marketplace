//! Linux backend: `bubblewrap` (`bwrap`). See `docs/design/sandbox-fallback.md`'s "Linux backend"
//! section for the full rationale behind each flag below and the rejected `firejail` alternative.

use super::{Probe, SandboxBackend};
use std::path::Path;
use std::process::Command;

const CANDIDATE: &str = "bwrap";

pub struct Bwrap;

impl SandboxBackend for Bwrap {
    fn name(&self) -> &'static str {
        "bwrap"
    }

    fn wrap_command(&self, exe: &str, args: &[&str], work_dir: &Path, env: &[(&str, &str)]) -> (String, Vec<String>) {
        let work_dir_str = work_dir.display().to_string();
        let mut a: Vec<String> = vec![
            "--die-with-parent".to_string(),
            // No network namespace at all -- F.1-equivalent by construction, stronger than
            // "loopback only". No manifest-declared network-need escape hatch in this MVP.
            "--unshare-net".to_string(),
            "--unshare-pid".to_string(),
            "--unshare-uts".to_string(),
            "--unshare-ipc".to_string(),
            // Read the base OS (libraries, /usr/bin/sh if it shells out, etc.) but WRITE only
            // inside work_dir below -- F.3-equivalent. No `--unshare-user` flag passed explicitly:
            // bwrap uses an unprivileged user namespace internally by default when not
            // setuid-root-installed, matching `InstallerKind`'s doc-comment posture that the
            // allowlist check already assumes ("no privilege escalation for the installer
            // itself") -- this backend doesn't weaken it.
            "--ro-bind".to_string(),
            "/".to_string(),
            "/".to_string(),
            "--bind".to_string(),
            work_dir_str.clone(),
            work_dir_str.clone(),
            "--chdir".to_string(),
            work_dir_str,
            "--clearenv".to_string(),
        ];
        for (k, v) in env {
            a.push("--setenv".to_string());
            a.push((*k).to_string());
            a.push((*v).to_string());
        }
        a.push("--".to_string());
        a.push(exe.to_string());
        a.extend(args.iter().map(|s| (*s).to_string()));
        ("bwrap".to_string(), a)
    }

    fn isolation_summary(&self) -> &'static str {
        "bwrap: no network namespace (F.1-equivalent), no PID/UTS/IPC namespace sharing with the \
         host and no privilege escalation (F.2-equivalent), filesystem writes confined to work_dir \
         while the base OS remains readable (F.3-equivalent). No resource limits (memory/CPU) -- \
         same gap Compose has today, not a regression."
    }
}

/// Cheap, side-effect-free `--version` check first (matches this crate's existing
/// `docker_names`-style "shell out and check exit status" idiom), THEN a real sandboxed-exec probe
/// -- DECIDED (operator, 2026-08-28): some hardened kernels/LSM configs (Ubuntu's
/// `kernel.apparmor_restrict_unprivileged_userns`, or the older `kernel.unprivileged_userns_clone=0`)
/// let `--version` succeed (it needs no user namespace) while a real sandboxed exec later fails --
/// this probe catches that at probe time, one extra subprocess per activation, worth it over "probe
/// passed but first real use fails."
pub fn probe() -> Probe {
    probe_with_path(std::env::var("PATH").ok().as_deref())
}

/// Same probe, with the `PATH` `bwrap` is resolved against passed explicitly rather than read from
/// the current process's ambient environment -- lets the "not on PATH" test below exercise the real
/// `Command::new("bwrap")` resolution failure hermetically, by overriding just this one `Command`'s
/// env, instead of mutating the whole test process's `PATH` via `std::env::set_var` (the
/// `collision_guard_skips_docker_entirely_when_told_to` idiom elsewhere in this crate). That idiom
/// is correct where it's used (`process::run_bounded` itself re-reads `PATH` from process env, so
/// there's no other way to redirect it), but doing it a SECOND time here, concurrently with the
/// first, was measured to flake other tests that shell out (e.g. `process::tests`) roughly 1 run in
/// 5 under `cargo test`'s default parallelism -- a global, process-wide env mutation racing against
/// unrelated tests reading that same global state. `Command::env` scopes the override to this one
/// child process only, with no such race.
fn probe_with_path(path: Option<&str>) -> Probe {
    let mut version_cmd = Command::new("bwrap");
    version_cmd.arg("--version");
    if let Some(p) = path {
        version_cmd.env("PATH", p);
    } else {
        version_cmd.env_remove("PATH");
    }
    match version_cmd.output() {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            return Probe::Unavailable {
                candidate: CANDIDATE,
                reason: format!(
                    "bwrap --version exited non-zero: exit={:?} stderr={}",
                    o.status.code(),
                    String::from_utf8_lossy(&o.stderr).trim()
                ),
            }
        }
        Err(e) => return Probe::Unavailable { candidate: CANDIDATE, reason: format!("bwrap not runnable on PATH: {e}") },
    }

    // `--ro-bind / /` is added beyond the design doc's bare `bwrap --unshare-user --unshare-pid
    // true` sketch: bwrap's default root (with NO binds at all) is an empty, invisible tmpfs
    // (confirmed against this host's `bwrap` manpage), so a bare `true` could never resolve even on
    // a fully permissive host -- that would make the probe a false negative everywhere, not just on
    // a hardened one. Binding `/` read-only (identical to the real `wrap_command`'s own posture,
    // above) keeps the probe meaningful -- it still exercises real user/pid namespace creation,
    // exactly what's gated on a hardened host -- while actually being able to find the target
    // binary. `--unshare-user` is explicit here (unlike `wrap_command`'s implicit reliance on
    // bwrap's non-setuid default) because explicit `--unshare-user` fails hard when namespace
    // creation is denied, where the implicit form can silently degrade instead -- the probe wants
    // the strict, fail-loud form.
    let mut exec_cmd = Command::new("bwrap");
    exec_cmd.args(["--unshare-user", "--unshare-pid", "--ro-bind", "/", "/", "--", "/bin/true"]);
    if let Some(p) = path {
        exec_cmd.env("PATH", p);
    } else {
        exec_cmd.env_remove("PATH");
    }
    match exec_cmd.output() {
        Ok(o) if o.status.success() => Probe::Available(Box::new(Bwrap)),
        Ok(o) => Probe::Unavailable {
            candidate: CANDIDATE,
            reason: format!(
                "real sandboxed-exec probe (bwrap --unshare-user --unshare-pid ... /bin/true) failed: exit={:?} stderr={}",
                o.status.code(),
                String::from_utf8_lossy(&o.stderr).trim()
            ),
        },
        Err(e) => Probe::Unavailable { candidate: CANDIDATE, reason: format!("failed to spawn bwrap for the real-exec probe: {e}") },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `wrap_command`'s output (the exact argv it builds) is a pure function of its inputs -- this
    /// test hermetically asserts the flag list directly, needing no real sandboxing, the same way
    /// `guardrails.rs`'s tests assert `Violation` values without a real Docker daemon.
    #[test]
    fn wrap_command_builds_the_exact_documented_argv() {
        let backend = Bwrap;
        let work_dir = Path::new("/tmp/work-dir-example");
        let (program, args) = backend.wrap_command(
            "/tmp/work-dir-example/run.sh",
            &["--flag", "value"],
            work_dir,
            &[("FOO", "bar"), ("BAZ", "qux")],
        );

        assert_eq!(program, "bwrap");
        assert_eq!(
            args,
            vec![
                "--die-with-parent",
                "--unshare-net",
                "--unshare-pid",
                "--unshare-uts",
                "--unshare-ipc",
                "--ro-bind",
                "/",
                "/",
                "--bind",
                "/tmp/work-dir-example",
                "/tmp/work-dir-example",
                "--chdir",
                "/tmp/work-dir-example",
                "--clearenv",
                "--setenv",
                "FOO",
                "bar",
                "--setenv",
                "BAZ",
                "qux",
                "--",
                "/tmp/work-dir-example/run.sh",
                "--flag",
                "value",
            ]
        );
    }

    #[test]
    fn wrap_command_with_no_env_pairs_still_clears_the_environment() {
        let backend = Bwrap;
        let work_dir = Path::new("/tmp/wd");
        let (_program, args) = backend.wrap_command("/tmp/wd/run.sh", &[], work_dir, &[]);
        assert!(args.iter().any(|a| a == "--clearenv"));
        assert!(!args.iter().any(|a| a == "--setenv"));
        // No args after `--` beyond the exe itself.
        let dashdash = args.iter().position(|a| a == "--").unwrap();
        assert_eq!(&args[dashdash + 1..], &["/tmp/wd/run.sh"]);
    }

    /// Hermetically simulates "bwrap not on PATH" -- an empty-dir `PATH`, same scenario
    /// `collision_guard_skips_docker_entirely_when_told_to` (activate.rs) simulates for "docker not
    /// on PATH" -- but scoped to a single child process via `probe_with_path` rather than mutating
    /// the whole test process's real `PATH` with `std::env::set_var`. See `probe_with_path`'s doc
    /// comment for why: doing the global-mutation version a second time in this crate was measured
    /// to intermittently fail unrelated tests that shell out. Confirms the probe fails closed with
    /// a populated reason, not a panic or a silent `Available` claim.
    #[test]
    fn probe_reports_unavailable_when_bwrap_is_not_on_path() {
        let empty_dir = tempfile::tempdir().unwrap();

        match probe_with_path(Some(empty_dir.path().to_str().unwrap())) {
            Probe::Unavailable { candidate, reason } => {
                assert_eq!(candidate, "bwrap");
                assert!(!reason.is_empty());
            }
            Probe::Available(_) => panic!("bwrap must not be reported Available with an empty PATH"),
        }
    }
}
