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
    // above) keeps the probe meaningful -- it still exercises real user/pid/net namespace creation,
    // exactly what's gated on a hardened host -- while actually being able to find the target
    // binary. `--unshare-user` is explicit here (unlike `wrap_command`'s implicit reliance on
    // bwrap's non-setuid default) because explicit `--unshare-user` fails hard when namespace
    // creation is denied, where the implicit form can silently degrade instead -- the probe wants
    // the strict, fail-loud form. See `probe_argv` for why `--unshare-net` is in the list too.
    let mut exec_cmd = Command::new("bwrap");
    exec_cmd.args(probe_argv());
    if let Some(p) = path {
        exec_cmd.env("PATH", p);
    } else {
        exec_cmd.env_remove("PATH");
    }
    match exec_cmd.output() {
        Ok(o) if o.status.success() => Probe::Available(Box::new(Bwrap)),
        Ok(o) => Probe::Unavailable {
            candidate: CANDIDATE,
            reason: describe_probe_failure(o.status.code(), &String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => Probe::Unavailable { candidate: CANDIDATE, reason: format!("failed to spawn bwrap for the real-exec probe: {e}") },
    }
}

/// The exact argv of the real sandboxed-exec probe, minus the leading `bwrap`. A pure function so
/// a test can pin it without executing anything.
///
/// `--unshare-net` is here since scimbe/ct-agent#183 (phase 1): it is the flag `wrap_command`
/// actually runs with, and it is the one that makes bwrap run `loopback_setup()` -- configure
/// `127.0.0.1` and bring `lo` up inside the new network namespace via `RTM_NEWLINK`/`RTM_NEWADDR`.
/// On Ubuntu 24.04+ with `kernel.apparmor_restrict_unprivileged_userns=1` that netlink step is
/// exactly what fails (`bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`), and the
/// previous probe (user+pid namespaces only) passed on such a host while every real activation
/// then failed. `--unshare-net` is also the F.1-equivalent claim this backend makes, so a probe
/// that skips it verifies the wrong thing.
pub(crate) fn probe_argv() -> [&'static str; 8] {
    ["--unshare-user", "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--", "/bin/true"]
}

/// The operator-facing reason for a failed real-exec probe: bwrap's exit code and its own stderr
/// verbatim, plus -- when that stderr shows the known unprivileged-user-namespace restriction --
/// the concrete remediation, so the refusal an operator sees names the fix, not just the symptom.
pub(crate) fn describe_probe_failure(exit_code: Option<i32>, stderr: &str) -> String {
    let stderr = stderr.trim();
    let mut reason = format!(
        "real sandboxed-exec probe (bwrap {}) failed: exit={exit_code:?} stderr={stderr}",
        probe_argv().join(" ")
    );
    if let Some(hint) = userns_restriction_hint(stderr) {
        reason.push_str(" -- ");
        reason.push_str(hint);
    }
    reason
}

/// Maps bwrap's stderr onto the one remediation this crate knows about. Matches the netlink
/// failure (`RTM_NEWADDR`, from `loopback_setup()`), any explicit `userns`/`user namespace`/
/// `apparmor` mention, and the bare `Permission denied` the uid-map setup step emits under the
/// same restriction (observed on this operator's own Ubuntu 24.04 host, see `.github/workflows/
/// ci.yml`). Anything else (bwrap missing, a different kernel config) gets no hint rather than a
/// wrong one.
pub(crate) fn userns_restriction_hint(stderr: &str) -> Option<&'static str> {
    let lower = stderr.to_ascii_lowercase();
    let matches = ["rtm_newaddr", "rtm_newlink", "userns", "user namespace", "apparmor", "permission denied"]
        .iter()
        .any(|needle| lower.contains(needle));
    if !matches {
        return None;
    }
    Some(
        "hint: this is the symptom of Ubuntu 24.04+'s `kernel.apparmor_restrict_unprivileged_userns=1` \
         (unprivileged user namespaces are denied unless the caller runs under an AppArmor profile that \
         grants `userns`). Install the distro's `bwrap-userns-restrict` AppArmor profile for bwrap \
         (shipped in `apparmor-profiles`, or copy /usr/share/apparmor/extra-profiles/bwrap-userns-restrict \
         into /etc/apparmor.d/ and reload), or -- on a throwaway host ONLY, never a shared one -- \
         `sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`",
    )
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

    /// scimbe/ct-agent#183 phase 1: the probe must run with the real namespace flags, `--unshare-net`
    /// included, so bwrap's `loopback_setup()` is exercised at probe time. Pinned as a pure argv
    /// assertion, no bwrap execution.
    #[test]
    fn probe_argv_exercises_user_pid_and_net_namespaces_with_the_runtime_ro_bind() {
        let argv = probe_argv();
        let idx = |flag: &str| argv.iter().position(|a| *a == flag).unwrap_or_else(|| panic!("{flag} missing from {argv:?}"));
        idx("--unshare-user");
        idx("--unshare-pid");
        idx("--unshare-net");
        let ro = idx("--ro-bind");
        assert_eq!(&argv[ro..ro + 3], &["--ro-bind", "/", "/"], "the probe binds / read-only exactly like wrap_command");
        let dashdash = idx("--");
        assert_eq!(&argv[dashdash + 1..], &["/bin/true"]);
        assert!(idx("--unshare-net") < dashdash);
    }

    #[test]
    fn probe_failure_reason_carries_bwraps_stderr_and_the_userns_hint_for_the_ubuntu_symptom() {
        let reason = describe_probe_failure(Some(1), "bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted\n");
        assert!(reason.contains("Failed RTM_NEWADDR"), "{reason}");
        assert!(reason.contains("--unshare-net"), "{reason}");
        assert!(reason.contains("kernel.apparmor_restrict_unprivileged_userns"), "{reason}");
        assert!(reason.contains("bwrap-userns-restrict"), "{reason}");
    }

    #[test]
    fn userns_hint_fires_on_each_known_symptom_and_not_otherwise() {
        for symptom in [
            "bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted",
            "bwrap: setting up uid map: Permission denied",
            "bwrap: Creating new namespace failed: userns creation denied by AppArmor",
            "bwrap: No permissions to create a new user namespace",
        ] {
            assert!(userns_restriction_hint(symptom).is_some(), "expected a hint for {symptom:?}");
        }
        assert!(userns_restriction_hint("bwrap: execvp /bin/true: No such file or directory").is_none());
        assert!(userns_restriction_hint("").is_none());
        let plain = describe_probe_failure(Some(127), "bwrap: execvp /bin/true: No such file or directory");
        assert!(!plain.contains("hint:"), "{plain}");
    }
}
