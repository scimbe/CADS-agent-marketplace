//! Linux backend: `bubblewrap` (`bwrap`). See `docs/design/sandbox-fallback.md`'s "Linux backend"
//! section for the rationale behind the flags, and `docs/security-model.md` F.14 for the measured
//! limits. The filesystem view is an ALLOWLIST (`/usr`, `/bin`, `/sbin`, `/lib*`, a few `/etc`
//! files, a private `/proc` and `/dev`), not `--ro-bind / /`: a read-only bind of the host root
//! exposes `$HOME` (`~/.ssh`, tokens) and the host's procfs (`/proc/<pid>/root`, `environ` of
//! same-UID processes).

// Compiled on every OS: the Windows/WSL2 backend reuses `bwrap_args`. Only Linux probes/selects it.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use super::{NetworkPolicy, Probe, SandboxBackend, SandboxPolicy};
use std::path::Path;
use std::process::Command;

const CANDIDATE: &str = "bwrap";

/// Where `bwrap` is looked for. Absolute paths only, never a `PATH` search: a user-writable
/// `PATH` entry must not be able to substitute the sandbox launcher (and Ubuntu's AppArmor profile
/// `bwrap-userns-restrict` is attached to `/usr/bin/bwrap`).
const BWRAP_CANDIDATES: [&str; 3] = ["/usr/bin/bwrap", "/bin/bwrap", "/usr/local/bin/bwrap"];

/// The absolute path of an installed `bwrap`, if any.
pub(crate) fn bwrap_path() -> Option<&'static str> {
    BWRAP_CANDIDATES.into_iter().find(|p| Path::new(p).is_file())
}

pub struct Bwrap;

impl SandboxBackend for Bwrap {
    fn name(&self) -> &'static str {
        "bwrap"
    }

    fn wrap_command(&self, exe: &str, args: &[&str], work_dir: &Path, env: &[(&str, &str)]) -> (String, Vec<String>) {
        (
            bwrap_path().unwrap_or(BWRAP_CANDIDATES[0]).to_string(),
            bwrap_args(exe, args, &work_dir.display().to_string(), env),
        )
    }

    fn wrap_command_with_policy(
        &self,
        exe: &str,
        args: &[&str],
        work_dir: &Path,
        env: &[(&str, &str)],
        policy: &SandboxPolicy,
    ) -> Result<(String, Vec<String>), String> {
        policy.validate()?;
        Ok((
            bwrap_path().unwrap_or(BWRAP_CANDIDATES[0]).to_string(),
            bwrap_args_with_policy(exe, args, &work_dir.display().to_string(), env, policy),
        ))
    }

    fn isolation_summary(&self) -> &'static str {
        "bwrap: all namespaces unshared incl. network (F.1-equivalent), PID/UTS/IPC/cgroup, all \
         capabilities dropped, new session (no TIOCSTI), private /proc and /dev, read-only allowlisted \
         filesystem view (no $HOME), writes confined to work_dir (F.3-equivalent), environment cleared. \
         Resource caps: CPU time, file size and a per-UID process cap via setrlimit; no memory cap."
    }
}

/// Read-only host directories bound into the sandbox when present. `/usr` is mandatory (checked by
/// the caller via the bind itself); the rest use `--ro-bind-try`, so merged-`/usr` hosts (where
/// `/bin` is a symlink to `usr/bin`) get the resolved directory at the same path, and non-merged
/// hosts get their real directories.
const RO_DIRS: [&str; 6] = ["/bin", "/sbin", "/lib", "/lib32", "/lib64", "/libx32"];

/// The few `/etc` entries a dynamically linked program or TLS client needs. Deliberately NOT all of
/// `/etc` (`/etc/shadow`-adjacent data, other users' configs) and not `/etc/resolv.conf`: there is
/// no network, and a future network opt-in must add it explicitly.
const RO_ETC: [&str; 11] = [
    "/etc/alternatives",
    "/etc/ld.so.cache",
    "/etc/ld.so.conf",
    "/etc/ld.so.conf.d",
    "/etc/passwd",
    "/etc/group",
    "/etc/nsswitch.conf",
    "/etc/localtime",
    "/etc/ssl",
    "/etc/ca-certificates",
    "/etc/pki",
];

/// The `bwrap` argv (minus the program name). Shared with the Windows/WSL2 backend, which runs the
/// same `bwrap` inside a WSL distro, so `work_dir_str` is a string (a translated Linux path there).
pub(super) fn bwrap_args(exe: &str, args: &[&str], work_dir_str: &str, env: &[(&str, &str)]) -> Vec<String> {
    bwrap_args_with_policy(exe, args, work_dir_str, env, &SandboxPolicy::default())
}

/// Resolver/hosts files added (read-only) only for [`NetworkPolicy::Outbound`]; the TLS trust
/// stores (`/etc/ssl`, `/etc/ca-certificates`, `/etc/pki`) are already in [`RO_ETC`].
const RO_ETC_NET: [&str; 2] = ["/etc/resolv.conf", "/etc/hosts"];

/// [`bwrap_args`] for a non-default [`SandboxPolicy`]. With the default policy the output is
/// byte-identical to the historical argv (pinned by a test). Extra ro paths, HOME and TMPDIR are
/// bound before the root is remounted read-only, exactly like `work_dir`; `--share-net` follows
/// `--unshare-all` so only the network namespace is re-shared.
pub(super) fn bwrap_args_with_policy(
    exe: &str,
    args: &[&str],
    work_dir_str: &str,
    env: &[(&str, &str)],
    policy: &SandboxPolicy,
) -> Vec<String> {
    let work_dir_str = work_dir_str.to_string();
    let mut a: Vec<String> = Vec::new();
    let mut push = |xs: &[&str]| a.extend(xs.iter().map(|s| (*s).to_string()));
    push(&[
        "--die-with-parent",
        // TIOCSTI keystroke injection into the controlling terminal.
        "--new-session",
        // user, ipc, pid, net, uts, cgroup: network is thereby unshared (F.1-equivalent). There is
        // no loopback opt-in on this backend; with `--unshare-net` bwrap brings up a PRIVATE `lo`.
        "--unshare-all",
        "--cap-drop",
        "ALL",
    ]);
    if policy.network == NetworkPolicy::Outbound {
        push(&["--share-net"]);
    }
    push(&["--ro-bind", "/usr", "/usr"]);
    for d in RO_DIRS {
        push(&["--ro-bind-try", d, d]);
    }
    for f in RO_ETC {
        push(&["--ro-bind-try", f, f]);
    }
    if policy.network == NetworkPolicy::Outbound {
        for f in RO_ETC_NET {
            push(&["--ro-bind-try", f, f]);
        }
    }
    for p in &policy.extra_ro_paths {
        let p = p.display().to_string();
        push(&["--ro-bind", p.as_str(), p.as_str()]);
    }
    push(&["--proc", "/proc", "--dev", "/dev"]);
    for p in policy.home_dir.iter().chain(policy.tmp_dir.iter()) {
        let p = p.display().to_string();
        push(&["--bind", p.as_str(), p.as_str()]);
    }
    a.extend(["--bind".to_string(), work_dir_str.clone(), work_dir_str.clone(), "--chdir".to_string(), work_dir_str]);
    // The root is a tmpfs bwrap assembled; make it read-only so `mkdir`/`write` at `/`, `/tmp`,
    // `/home` fail instead of succeeding in a throwaway tmpfs (the work_dir bind stays writable).
    a.extend(["--remount-ro".to_string(), "/".to_string(), "--clearenv".to_string()]);
    for (k, v) in env {
        a.push("--setenv".to_string());
        a.push((*k).to_string());
        a.push((*v).to_string());
    }
    a.push("--".to_string());
    a.push(exe.to_string());
    a.extend(args.iter().map(|s| (*s).to_string()));
    a
}

/// Cheap `--version` first, THEN a real sandboxed exec with the runtime's own flags -- DECIDED
/// (operator, 2026-08-28): hardened kernels/LSM configs (Ubuntu's
/// `kernel.apparmor_restrict_unprivileged_userns`, the older `kernel.unprivileged_userns_clone=0`)
/// let `--version` succeed while a real exec fails.
pub fn probe() -> Probe {
    probe_with(bwrap_path())
}

/// Same probe with the `bwrap` path passed explicitly, so the "not installed" case is testable
/// without touching the process environment (see the `PATH_MUTATION_LOCK` history in
/// `process.rs`).
fn probe_with(bwrap: Option<&str>) -> Probe {
    let Some(bwrap) = bwrap else {
        return Probe::Unavailable {
            candidate: CANDIDATE,
            reason: format!("bwrap not found at any of {BWRAP_CANDIDATES:?}"),
        };
    };
    match Command::new(bwrap).arg("--version").env_clear().output() {
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
        Err(e) => return Probe::Unavailable { candidate: CANDIDATE, reason: format!("{bwrap} not runnable: {e}") },
    }
    match Command::new(bwrap).args(probe_argv(&probe_work_dir())).env_clear().output() {
        Ok(o) if o.status.success() => Probe::Available(Box::new(Bwrap)),
        Ok(o) => Probe::Unavailable {
            candidate: CANDIDATE,
            reason: describe_probe_failure(o.status.code(), &String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => Probe::Unavailable { candidate: CANDIDATE, reason: format!("failed to spawn bwrap for the real-exec probe: {e}") },
    }
}

fn probe_work_dir() -> String {
    std::env::temp_dir().display().to_string()
}

/// The argv of the real sandboxed-exec probe: EXACTLY the runtime argv (`bwrap_args`) running
/// `/bin/true`, so every flag the runtime uses -- `--unshare-all` (whose loopback setup is what
/// Ubuntu 24.04's AppArmor restriction breaks with `RTM_NEWADDR`), `--cap-drop`, `--proc`,
/// `--remount-ro` -- is exercised at probe time, not just a subset.
pub(crate) fn probe_argv(work_dir: &str) -> Vec<String> {
    bwrap_args("/bin/true", &[], work_dir, &[])
}


/// The operator-facing reason for a failed real-exec probe: bwrap's exit code and its own stderr
/// verbatim, plus -- when that stderr shows the known unprivileged-user-namespace restriction --
/// the concrete remediation, so the refusal an operator sees names the fix, not just the symptom.
pub(crate) fn describe_probe_failure(exit_code: Option<i32>, stderr: &str) -> String {
    let stderr = stderr.trim();
    let mut reason = format!(
        "real sandboxed-exec probe (bwrap {}) failed: exit={exit_code:?} stderr={stderr}",
        probe_argv(&probe_work_dir()).join(" ")
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

    fn idx(a: &[String], flag: &str) -> usize {
        a.iter().position(|x| x == flag).unwrap_or_else(|| panic!("{flag} missing from {a:?}"))
    }

    /// `wrap_command`'s output is a pure function of its inputs (and of the absolute `bwrap` path),
    /// so the full flag list is pinned without any sandboxing.
    #[test]
    fn wrap_command_builds_the_exact_documented_argv() {
        let (program, args) =
            Bwrap.wrap_command("/tmp/wd/run.sh", &["--flag", "value"], Path::new("/tmp/wd"), &[("FOO", "bar"), ("BAZ", "qux")]);
        assert!(program.starts_with('/') && program.ends_with("bwrap"), "absolute bwrap path, not a PATH lookup: {program}");
        let mut expected: Vec<String> = ["--die-with-parent", "--new-session", "--unshare-all", "--cap-drop", "ALL", "--ro-bind", "/usr", "/usr"]
            .map(String::from)
            .to_vec();
        for d in RO_DIRS.iter().chain(RO_ETC.iter()) {
            expected.extend(["--ro-bind-try", d, d].map(String::from));
        }
        expected.extend(
            [
                "--proc", "/proc", "--dev", "/dev", "--bind", "/tmp/wd", "/tmp/wd", "--chdir", "/tmp/wd", "--remount-ro", "/",
                "--clearenv", "--setenv", "FOO", "bar", "--setenv", "BAZ", "qux", "--", "/tmp/wd/run.sh", "--flag", "value",
            ]
            .map(String::from),
        );
        assert_eq!(args, expected);
    }

    #[test]
    fn the_host_root_home_and_resolv_conf_are_never_bound() {
        let (_, args) = Bwrap.wrap_command("/w/run.sh", &[], Path::new("/w"), &[]);
        for (i, a) in args.iter().enumerate() {
            if a.starts_with("--ro-bind") {
                assert_ne!(args[i + 1], "/", "no read-only bind of the host root: {args:?}");
                assert!(!args[i + 1].starts_with("/home") && !args[i + 1].starts_with("/root"), "{args:?}");
                assert_ne!(args[i + 1], "/etc", "all of /etc must not be bound");
                assert_ne!(args[i + 1], "/etc/resolv.conf", "no network, so no resolver config");
            }
        }
        // Private procfs/devtmpfs come after the binds and before the writable work_dir bind; the
        // root is made read-only only after everything is mounted.
        assert!(idx(&args, "--proc") > idx(&args, "--ro-bind") && idx(&args, "--proc") < idx(&args, "--bind"));
        assert!(idx(&args, "--remount-ro") > idx(&args, "--bind"));
    }

    fn pol() -> SandboxPolicy {
        SandboxPolicy {
            extra_ro_paths: vec![Path::new("/opt/cli").to_path_buf()],
            home_dir: Some(Path::new("/run/h").to_path_buf()),
            tmp_dir: Some(Path::new("/run/t").to_path_buf()),
            network: NetworkPolicy::Outbound,
            keychain: true,
        }
    }

    #[test]
    fn default_policy_argv_is_byte_identical_to_the_historical_argv() {
        assert_eq!(
            bwrap_args_with_policy("/w/run.sh", &["a"], "/w", &[("K", "v")], &SandboxPolicy::default()),
            bwrap_args("/w/run.sh", &["a"], "/w", &[("K", "v")])
        );
        assert!(!bwrap_args("/x", &[], "/w", &[]).contains(&"--share-net".to_string()));
    }

    #[test]
    fn outbound_policy_shares_only_the_net_namespace_after_unshare_all() {
        let a = bwrap_args_with_policy("/x", &[], "/w", &[], &pol());
        assert!(idx(&a, "--share-net") > idx(&a, "--unshare-all"));
        assert_eq!(a.iter().filter(|x| *x == "--unshare-all").count(), 1);
        for f in ["/etc/resolv.conf", "/etc/hosts", "/etc/ssl", "/etc/ca-certificates"] {
            assert!(a.windows(3).any(|w| w[0] == "--ro-bind-try" && w[1] == f && w[2] == f), "{f}");
        }
        assert!(a.contains(&"--cap-drop".to_string()) && a.contains(&"--new-session".to_string()), "hardening intact");
    }

    #[test]
    fn extra_ro_home_and_tmp_are_bound_before_the_root_goes_read_only() {
        let a = bwrap_args_with_policy("/x", &[], "/w", &[], &pol());
        let bind = |flag: &str, p: &str| a.windows(3).position(|w| w[0] == flag && w[1] == p && w[2] == p).unwrap_or_else(|| panic!("{flag} {p}"));
        let ro = bind("--ro-bind", "/opt/cli");
        let (h, t) = (bind("--bind", "/run/h"), bind("--bind", "/run/t"));
        let remount = idx(&a, "--remount-ro");
        assert!(ro < remount && h < remount && t < remount);
        // the real home is still never bound
        assert!(!a.iter().any(|x| x.starts_with("/home") || x.starts_with("/root")));
    }

    #[test]
    fn network_none_policy_keeps_the_namespace_private() {
        let mut p = pol();
        p.network = NetworkPolicy::None;
        let a = bwrap_args_with_policy("/x", &[], "/w", &[], &p);
        assert!(!a.contains(&"--share-net".to_string()) && !a.contains(&"/etc/resolv.conf".to_string()));
        p.network = NetworkPolicy::Loopback; // bwrap has only the private lo
        assert!(!bwrap_args_with_policy("/x", &[], "/w", &[], &p).contains(&"--share-net".to_string()));
    }

    #[test]
    fn invalid_policies_are_refused() {
        let bad = SandboxPolicy { extra_ro_paths: vec![Path::new("/").to_path_buf()], ..Default::default() };
        assert!(Bwrap.wrap_command_with_policy("/x", &[], Path::new("/w"), &[], &bad).is_err());
        let bad = SandboxPolicy { tmp_dir: Some(Path::new("t").to_path_buf()), ..Default::default() };
        assert!(Bwrap.wrap_command_with_policy("/x", &[], Path::new("/w"), &[], &bad).is_err());
    }

    #[test]
    fn hardening_flags_are_present() {
        let (_, args) = Bwrap.wrap_command("/w/run.sh", &[], Path::new("/w"), &[]);
        for f in ["--die-with-parent", "--new-session", "--unshare-all", "--cap-drop", "--proc", "--dev", "--clearenv"] {
            idx(&args, f);
        }
        assert_eq!(args[idx(&args, "--cap-drop") + 1], "ALL");
        assert!(!args.iter().any(|a| a == "--share-net"), "no network opt-in on this backend");
    }

    #[test]
    fn wrap_command_with_no_env_pairs_still_clears_the_environment() {
        let (_program, args) = Bwrap.wrap_command("/tmp/wd/run.sh", &[], Path::new("/tmp/wd"), &[]);
        assert!(args.iter().any(|a| a == "--clearenv"));
        assert!(!args.iter().any(|a| a == "--setenv"));
        let dashdash = idx(&args, "--");
        assert_eq!(&args[dashdash + 1..], &["/tmp/wd/run.sh"]);
    }

    #[test]
    fn probe_reports_unavailable_when_bwrap_is_not_installed() {
        match probe_with(None) {
            Probe::Unavailable { candidate, reason } => {
                assert_eq!(candidate, "bwrap");
                assert!(reason.contains("/usr/bin/bwrap"), "{reason}");
            }
            Probe::Available(_) => panic!("bwrap must not be reported Available when not found"),
        }
        assert!(matches!(probe_with(Some("/nonexistent/bwrap")), Probe::Unavailable { .. }));
    }

    /// The probe runs the runtime argv itself (so `--unshare-all`, `--cap-drop`, `--proc` are all
    /// exercised), only with `/bin/true` as the payload.
    #[test]
    fn probe_argv_is_the_runtime_argv_running_bin_true() {
        let argv = probe_argv("/tmp");
        let expect = bwrap_args("/bin/true", &[], "/tmp", &[]);
        assert_eq!(argv, expect);
        idx(&argv, "--unshare-all");
        assert!(idx(&argv, "--unshare-all") < idx(&argv, "--"));
    }

    #[test]
    fn probe_failure_reason_carries_bwraps_stderr_and_the_userns_hint_for_the_ubuntu_symptom() {
        let reason = describe_probe_failure(Some(1), "bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted\n");
        assert!(reason.contains("Failed RTM_NEWADDR"), "{reason}");
        assert!(reason.contains("--unshare-all"), "{reason}");
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

    // -- Real enforcement (Linux only; skipped, loudly, when the probe says bwrap is unusable) --

    #[cfg(target_os = "linux")]
    mod real {
        use super::*;
        use std::io::Write;
        use std::os::unix::fs::PermissionsExt;

        fn backend_or_skip(test: &str) -> Option<Bwrap> {
            match probe() {
                Probe::Available(_) => Some(Bwrap),
                Probe::Unavailable { reason, .. } => {
                    eprintln!("skipping {test}: bwrap unavailable here: {reason}");
                    None
                }
            }
        }

        fn run(work: &Path, env: &[(&str, &str)], script: &str) -> std::process::Output {
            let (program, args) = Bwrap.wrap_command("/bin/sh", &["-c", script], work, env);
            Command::new(program).args(args).env_clear().current_dir(work).output().unwrap()
        }

        /// Removes the fixture dir created under the real `$HOME` even if an assert panics.
        struct Cleanup(std::path::PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }

        /// HIGH: `--ro-bind / /` exposed the host procfs. From inside, a same-UID host process's
        /// `/proc/<pid>/root` (a magic link into the host's writable mount namespace) and
        /// `/proc/<pid>/environ` must be unreachable.
        #[test]
        fn host_procfs_is_not_reachable_from_inside() {
            let Some(_) = backend_or_skip("host_procfs_is_not_reachable_from_inside") else { return };
            let work = tempfile::tempdir().unwrap();
            let outside = tempfile::tempdir().unwrap();
            let target = outside.path().join("pwned");
            let mut victim = Command::new("sleep").arg("60").env("SECRET_CANARY", "s3cret-canary").spawn().unwrap();
            let pid = victim.id().to_string();
            let script = format!(
                "( echo x > /proc/{pid}/root{t} ) 2>/dev/null && echo WROTE_VIA_HOST_PROC_ROOT; \
                 ( echo x > /proc/1/root{t} ) 2>/dev/null && echo WROTE_VIA_PROC_1_ROOT; \
                 ( echo x > /proc/$PPID/root{t} ) 2>/dev/null && echo WROTE_VIA_PPID_ROOT; \
                 cat /proc/{pid}/environ 2>/dev/null | grep -q s3cret-canary && echo READ_HOST_ENVIRON; \
                 ls /proc/{pid} >/dev/null 2>&1 && echo HOST_PID_VISIBLE; echo done",
                t = target.display()
            );
            let out = run(work.path(), &[], &script);
            let _ = victim.kill();
            let stdout = String::from_utf8_lossy(&out.stdout);
            assert!(stdout.contains("done"), "script did not run: {stdout} / {}", String::from_utf8_lossy(&out.stderr));
            for bad in ["WROTE_VIA_HOST_PROC_ROOT", "WROTE_VIA_PROC_1_ROOT", "WROTE_VIA_PPID_ROOT", "READ_HOST_ENVIRON", "HOST_PID_VISIBLE"] {
                assert!(!stdout.contains(bad), "{bad}: {stdout}");
            }
            assert!(!target.exists(), "nothing may be written through /proc/<pid>/root");
        }

        /// MEDIUM: `$HOME` (`~/.ssh`) must not be readable; `/tmp` and the root are not writable.
        #[test]
        fn home_is_unreadable_and_everything_but_work_dir_is_read_only() {
            let Some(_) = backend_or_skip("home_is_unreadable_and_everything_but_work_dir_is_read_only") else { return };
            let Ok(home) = std::env::var("HOME") else { return };
            let fixture = Path::new(&home).join(format!(".installer-engine-test-{}", std::process::id()));
            let _cleanup = Cleanup(fixture.clone());
            std::fs::create_dir_all(fixture.join(".ssh")).unwrap();
            let key = fixture.join(".ssh/id_test");
            std::fs::File::create(&key).unwrap().write_all(b"PRIVATE-KEY-CANARY").unwrap();
            std::fs::set_permissions(&key, std::fs::Permissions::from_mode(0o600)).unwrap();
            let work = tempfile::tempdir().unwrap();
            let script = format!(
                "cat '{k}' 2>/dev/null && echo READ_HOME_KEY; ls '{h}' >/dev/null 2>&1 && echo LISTED_HOME; \
                 ( echo x > /tmp/ie-canary ) 2>/dev/null && echo WROTE_TMP; ( echo x > /ie-root-canary ) 2>/dev/null && echo WROTE_ROOT; \
                 echo x > ./inside && echo WROTE_INSIDE; echo done",
                k = key.display(),
                h = home
            );
            let out = run(work.path(), &[], &script);
            let stdout = String::from_utf8_lossy(&out.stdout);
            assert!(stdout.contains("done") && stdout.contains("WROTE_INSIDE"), "{stdout} / {}", String::from_utf8_lossy(&out.stderr));
            for bad in ["READ_HOME_KEY", "PRIVATE-KEY-CANARY", "LISTED_HOME", "WROTE_TMP", "WROTE_ROOT"] {
                assert!(!stdout.contains(bad), "{bad}: {stdout}");
            }
            assert!(!Path::new("/tmp/ie-canary").exists());
        }
    }
}
