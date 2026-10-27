//! macOS backend: Seatbelt via `sandbox-exec`. See `docs/design/sandbox-fallback.md`'s "macOS
//! backend" section for the rationale and the deprecation risk, and `docs/security-model.md` F.14
//! for what is measured and what is not.
//!
//! Profile delivery is `sandbox-exec -p <profile> -D WORK=<dir>`: the profile is passed inline
//! (no file under `work_dir` that the activation could race or tamper with before it is loaded)
//! and the one dynamic value, the work directory, goes in as a Seatbelt *parameter*
//! (`(param "WORK")`), never spliced into the profile text -- so a path containing quotes or
//! parentheses cannot alter the policy.

use super::{Probe, SandboxBackend};
use std::path::{Path, PathBuf};
use std::process::Command;

const CANDIDATE: &str = "sandbox_exec";

/// Absolute path, not a `PATH` lookup: a writable earlier `PATH` entry must not be able to
/// substitute the sandbox launcher itself.
const SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";

/// `deny default`, then the narrowest set a dynamically-linked Mach-O or a `/bin/bash` script needs
/// to start at all (established empirically on macOS 27.0.1, arm64: the dyld shared cache lives under
/// `/System`, and `file-read*` on the literal `/` is required or dyld aborts with exit 134).
///
/// * exec: the bundle (`WORK`) and the OS's own binary directories (so a bundle `run.sh` / the
///   `verify.sh` runner can call `/bin/bash`, `/usr/bin/env`, coreutils). Not Homebrew, not `$HOME`.
/// * read: the OS libraries and the bundle. NOT `$HOME`, NOT other users' data, NOT `/Volumes`.
///   `file-read-metadata` is global (stat anywhere) because path resolution needs it; it reveals
///   existence and size, never contents.
/// * write: `WORK` and `/dev/null` only.
/// * network: denied.
/// * no `mach-lookup`: measured not to be needed to start a process; leaving it out removes the
///   launchd/XPC service surface.
const PROFILE_BASE: &str = r#"(version 1)
(deny default)
(allow process-exec (subpath (param "WORK")) (subpath "/bin") (subpath "/usr/bin") (subpath "/usr/sbin") (subpath "/sbin") (subpath "/usr/libexec"))
(allow process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow file-map-executable)
(allow file-read-metadata)
(allow file-read* (literal "/") (subpath (param "WORK")) (subpath "/usr/lib") (subpath "/System") (subpath "/Library/Preferences/Logging") (subpath "/bin") (subpath "/usr/bin") (subpath "/usr/sbin") (subpath "/sbin") (subpath "/usr/libexec") (subpath "/usr/share") (subpath "/private/etc") (subpath "/private/var/db/dyld") (literal "/dev/urandom") (literal "/dev/random") (literal "/dev/null"))
(allow file-write* (subpath (param "WORK")) (literal "/dev/null"))
(deny network*)
"#;

/// Appended only when the backend was constructed with [`SandboxExec::with_loopback`]. Seatbelt
/// has no network namespace: this is the HOST's loopback, shared with every other local service,
/// not the private loopback bwrap's `--unshare-net` gives. That is why nothing in the installer
/// turns it on by default (see `activate::environment_contract_refusal`).
const PROFILE_LOOPBACK: &str = r#"(allow network-outbound (remote ip "localhost:*"))
(allow network-bind (local ip "localhost:*"))
(allow network-inbound (local ip "localhost:*"))
"#;

pub struct SandboxExec {
    allow_loopback: bool,
}

impl SandboxExec {
    /// The default: no network of any kind.
    pub fn new() -> Self {
        Self {
            allow_loopback: false,
        }
    }

    /// Explicit opt-in to host loopback only (`127.0.0.1` / `::1`); still no other network.
    pub fn with_loopback() -> Self {
        Self {
            allow_loopback: true,
        }
    }

    /// The full SBPL text for this backend's configuration -- a pure function, pinned by tests.
    pub(crate) fn profile(&self) -> String {
        let mut p = PROFILE_BASE.to_string();
        if self.allow_loopback {
            p.push_str(PROFILE_LOOPBACK);
        }
        p
    }

    /// Seatbelt matches the *resolved* path, and `/var`, `/tmp`, `/etc` are symlinks into
    /// `/private`; a `subpath` on the unresolved form would silently match nothing.
    fn resolved(work_dir: &Path) -> PathBuf {
        std::fs::canonicalize(work_dir).unwrap_or_else(|_| work_dir.to_path_buf())
    }

    fn launcher_args(&self, work_dir: &Path) -> Vec<String> {
        vec![
            "-p".to_string(),
            self.profile(),
            "-D".to_string(),
            format!("WORK={}", Self::resolved(work_dir).display()),
        ]
    }
}

impl Default for SandboxExec {
    fn default() -> Self {
        Self::new()
    }
}

impl SandboxBackend for SandboxExec {
    fn name(&self) -> &'static str {
        CANDIDATE
    }

    fn wrap_command(
        &self,
        exe: &str,
        args: &[&str],
        work_dir: &Path,
        env: &[(&str, &str)],
    ) -> (String, Vec<String>) {
        let mut a = self.launcher_args(work_dir);
        // Seatbelt constrains files/network/IPC, not the environment, so the clean environment is
        // built by `env -i` *inside* the sandbox (the launcher's own `run_bounded` scrub already
        // covers the launcher; this is the second, independent scrub of what the payload sees).
        a.push("/usr/bin/env".to_string());
        a.push("-i".to_string());
        for (k, v) in env {
            a.push(format!("{k}={v}"));
        }
        a.push(exe.to_string());
        a.extend(args.iter().map(|s| (*s).to_string()));
        (SANDBOX_EXEC.to_string(), a)
    }

    fn isolation_summary(&self) -> &'static str {
        if self.allow_loopback {
            "sandbox_exec (Seatbelt): writes confined to work_dir, reads limited to OS libraries and \
             work_dir (not $HOME), environment cleared, network denied EXCEPT the host's shared \
             loopback. No PID/UTS/IPC namespace (the process can still see and signal same-UID \
             processes), no resource limits, and sandbox-exec is deprecated by Apple."
        } else {
            "sandbox_exec (Seatbelt): writes confined to work_dir, reads limited to OS libraries and \
             work_dir (not $HOME), environment cleared, all network denied. No PID/UTS/IPC namespace \
             (the process can still see and signal same-UID processes), no resource limits, and \
             sandbox-exec is deprecated by Apple."
        }
    }
}

/// Real-exec probe, same philosophy as `bwrap::probe`: run the actual launcher with the actual
/// profile against `/usr/bin/true`. Catches a missing `sandbox-exec` (a future macOS), and the
/// case where this process is already inside a sandbox (`sandbox_apply: Operation not permitted`
/// -- Seatbelt does not nest), which `--version`-style checks cannot see.
pub fn probe() -> Probe {
    probe_with(Path::new(SANDBOX_EXEC))
}

fn probe_with(launcher: &Path) -> Probe {
    let backend = SandboxExec::new();
    let work = std::env::temp_dir();
    let mut cmd = Command::new(launcher);
    cmd.args(backend.launcher_args(&work))
        .args(["/usr/bin/true"]);
    match cmd.output() {
        Ok(o) if o.status.success() => Probe::Available(Box::new(backend)),
        Ok(o) => Probe::Unavailable { candidate: CANDIDATE, reason: describe_probe_failure(o.status.code(), &String::from_utf8_lossy(&o.stderr)) },
        Err(e) => Probe::Unavailable {
            candidate: CANDIDATE,
            reason: format!("{} not runnable: {e} (macOS ships it in the base system; this host's OS may have removed it)", launcher.display()),
        },
    }
}

pub(crate) fn describe_probe_failure(exit_code: Option<i32>, stderr: &str) -> String {
    let stderr = stderr.trim();
    let mut reason = format!("real sandboxed-exec probe (sandbox-exec ... /usr/bin/true) failed: exit={exit_code:?} stderr={stderr}");
    if stderr.contains("sandbox_apply") || stderr.contains("Operation not permitted") {
        reason.push_str(
            " -- hint: Seatbelt profiles do not nest. This process is probably already running inside a \
             sandbox (an IDE/agent sandbox, another sandbox-exec). Run the installer from a normal \
             terminal session.",
        );
    }
    reason
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_command_builds_the_exact_documented_argv() {
        let dir = tempfile::tempdir().unwrap();
        let resolved = std::fs::canonicalize(dir.path()).unwrap();
        let (program, args) = SandboxExec::new().wrap_command(
            "/x/run.sh",
            &["--flag", "v"],
            dir.path(),
            &[("FOO", "bar"), ("A", "b=c")],
        );
        assert_eq!(program, "/usr/bin/sandbox-exec");
        assert_eq!(args[0], "-p");
        assert_eq!(args[1], SandboxExec::new().profile());
        assert_eq!(args[2], "-D");
        assert_eq!(args[3], format!("WORK={}", resolved.display()));
        assert_eq!(
            &args[4..],
            [
                "/usr/bin/env",
                "-i",
                "FOO=bar",
                "A=b=c",
                "/x/run.sh",
                "--flag",
                "v"
            ]
        );
    }

    #[test]
    fn the_work_dir_is_a_parameter_never_spliced_into_the_profile_text() {
        let evil = Path::new("/tmp/x\") (allow default) (\"");
        let (_, args) = SandboxExec::new().wrap_command("/bin/true", &[], evil, &[]);
        assert!(
            !args[1].contains("allow default"),
            "profile text must not depend on work_dir"
        );
        assert!(
            args[3].starts_with("WORK=") && args[3].contains("allow default"),
            "the value travels as a -D parameter"
        );
    }

    #[test]
    fn default_profile_denies_by_default_and_has_no_network_or_home_access() {
        let p = SandboxExec::new().profile();
        assert!(p.contains("(deny default)"));
        assert!(p.contains("(deny network*)"));
        assert!(
            !p.contains("(allow network"),
            "default profile must not allow any network"
        );
        assert!(
            !p.contains("/Users")
                && !p.contains("(subpath \"/private/var\")")
                && !p.contains("(subpath \"/tmp\")")
        );
        assert!(!p.contains("mach-lookup"));
        assert!(
            p.contains("(allow file-write* (subpath (param \"WORK\")) (literal \"/dev/null\"))")
        );
    }

    #[test]
    fn loopback_is_opt_in_and_loopback_only() {
        let p = SandboxExec::with_loopback().profile();
        assert!(p.contains("localhost:*"));
        assert!(
            !p.contains("(allow network*)"),
            "never a blanket network allow"
        );
        assert!(SandboxExec::new()
            .isolation_summary()
            .contains("all network denied"));
        assert!(SandboxExec::with_loopback()
            .isolation_summary()
            .contains("EXCEPT the host's shared loopback"));
    }

    #[test]
    fn probe_reports_unavailable_when_the_launcher_is_missing() {
        match probe_with(Path::new("/nonexistent/sandbox-exec")) {
            Probe::Unavailable { candidate, reason } => {
                assert_eq!(candidate, "sandbox_exec");
                assert!(reason.contains("not runnable"), "{reason}");
            }
            Probe::Available(_) => panic!("must not be Available without a launcher"),
        }
    }

    #[test]
    fn nested_sandbox_failure_gets_the_remediation_hint() {
        let r = describe_probe_failure(
            Some(71),
            "sandbox-exec: sandbox_apply: Operation not permitted\n",
        );
        assert!(r.contains("do not nest"), "{r}");
        assert!(!describe_probe_failure(Some(1), "other").contains("hint:"));
    }

    // -- Real enforcement, executed on a real macOS host (skipped only if the probe says this
    //    process cannot create a Seatbelt sandbox, e.g. when already inside one). --

    #[cfg(target_os = "macos")]
    mod real {
        use super::*;
        use std::net::TcpListener;

        fn backend_or_skip(test: &str) -> Option<Box<dyn SandboxBackend>> {
            match probe() {
                Probe::Available(b) => Some(b),
                Probe::Unavailable { reason, .. } => {
                    eprintln!("skipping {test}: sandbox_exec unavailable here: {reason}");
                    None
                }
            }
        }

        fn run(backend: &dyn SandboxBackend, work: &Path, script: &str) -> std::process::Output {
            let (program, args) = backend.wrap_command(
                "/bin/sh",
                &["-c", script],
                work,
                &[("CANARY_ENV", "visible")],
            );
            Command::new(program)
                .args(args)
                .current_dir(work)
                .output()
                .unwrap()
        }

        #[test]
        fn writes_outside_work_dir_and_network_connects_both_fail_while_work_dir_writes_succeed() {
            let Some(b) = backend_or_skip("writes_outside_work_dir_and_network_connects_both_fail")
            else {
                return;
            };
            let work = tempfile::tempdir().unwrap();
            let outside = tempfile::tempdir().unwrap();
            let target = outside.path().join("escaped");
            let secret = outside.path().join("secret.txt");
            std::fs::write(&secret, "TOP-SECRET").unwrap();

            // A live loopback listener: the connect must fail because of the sandbox, not because
            // nothing listens (the unsandboxed control below proves it is reachable).
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();

            let control = Command::new("/usr/bin/nc")
                .args(["-z", "-w", "2", "127.0.0.1", &port.to_string()])
                .status()
                .unwrap();
            assert!(
                control.success(),
                "control: the listener must be reachable outside the sandbox"
            );

            let script = format!(
                "echo inside > inside.txt && echo WROTE_INSIDE; \
                 (echo pwned > '{t}') 2>/dev/null && echo WROTE_OUTSIDE; \
                 cat '{s}' 2>/dev/null && echo READ_OUTSIDE; \
                 /usr/bin/nc -z -w 2 127.0.0.1 {port} && echo NET_CONNECTED; \
                 echo env=$CANARY_ENV home=${{HOME:-unset}}",
                t = target.display(),
                s = secret.display(),
            );
            let out = run(b.as_ref(), work.path(), &script);
            let stdout = String::from_utf8_lossy(&out.stdout);
            assert!(
                stdout.contains("WROTE_INSIDE"),
                "work_dir must be writable: {stdout} / {}",
                String::from_utf8_lossy(&out.stderr)
            );
            assert!(work.path().join("inside.txt").exists());
            assert!(
                !stdout.contains("WROTE_OUTSIDE") && !target.exists(),
                "write outside work_dir must fail: {stdout}"
            );
            assert!(
                !stdout.contains("READ_OUTSIDE") && !stdout.contains("TOP-SECRET"),
                "read outside the allowlist must fail: {stdout}"
            );
            assert!(
                !stdout.contains("NET_CONNECTED"),
                "network connect must fail: {stdout}"
            );
            assert!(
                stdout.contains("env=visible home=unset"),
                "env must be cleared except declared vars: {stdout}"
            );
        }

        #[test]
        fn loopback_opt_in_reaches_a_loopback_listener_but_nothing_else() {
            let work = tempfile::tempdir().unwrap();
            if backend_or_skip("loopback_opt_in").is_none() {
                return;
            }
            let b = SandboxExec::with_loopback();
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            let out = run(&b, work.path(), &format!("/usr/bin/nc -z -w 2 127.0.0.1 {port} && echo LOOPBACK_OK; /usr/bin/nc -z -w 2 1.1.1.1 53 && echo INTERNET_OK"));
            let stdout = String::from_utf8_lossy(&out.stdout);
            assert!(
                stdout.contains("LOOPBACK_OK"),
                "{stdout} / {}",
                String::from_utf8_lossy(&out.stderr)
            );
            assert!(!stdout.contains("INTERNET_OK"), "{stdout}");
        }
    }
}
