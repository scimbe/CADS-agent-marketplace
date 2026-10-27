//! Windows backend: `bubblewrap` inside a WSL2 distro, launched through `wsl.exe --exec`.
//!
//! Windows has no unprivileged, no-install primitive comparable to `bwrap`/Seatbelt that fits an
//! arbitrary fetched executable (AppContainer + Job Objects are two Win32 surfaces glued together,
//! see `docs/design/sandbox-fallback.md`). WSL2 runs a real Linux kernel, so the same bwrap policy
//! applies unchanged ([`super::bwrap::bwrap_args`]); this module adds (1) the Windows->WSL path
//! translation, (2) a `tmpfs` over `/mnt` so the Windows drives are not readable from inside, and
//! (3) a probe that distinguishes "no WSL", "no distro", "no bwrap in the distro" and "WSL1".
//!
//! The binary must be a Linux executable (it runs in the distro). Everything pure here compiles and
//! is unit-tested on every OS; only [`probe`] is selected on Windows (`sandbox::platform_candidates`).
//! What is NOT measured: no Windows host was available to execute this -- see
//! `docs/security-model.md` F.14.
#![cfg_attr(not(windows), allow(dead_code))]

use super::bwrap::bwrap_args;
use super::{Probe, SandboxBackend};
use std::path::Path;
use std::process::Command;

const CANDIDATE: &str = "wsl_bwrap";

/// Windows drives appear under `/mnt/<letter>` in a WSL distro (default automount root).
const DRIVE_MOUNT_ROOT: &str = "/mnt";

pub struct WslBwrap;

/// `C:\Users\me\w` / `C:/Users/me/w` / `\\?\C:\Users\me\w` -> `/mnt/c/Users/me/w`. `None` for
/// anything that is not a plain drive-letter absolute path (UNC shares, `\\wsl$\...`, relative
/// paths): those cannot be bound into the sandbox, and guessing would be worse than refusing.
pub(crate) fn windows_to_wsl_path(p: &str) -> Option<String> {
    let p = p.strip_prefix(r"\\?\").unwrap_or(p);
    let mut chars = p.chars();
    let drive = chars.next()?;
    if !drive.is_ascii_alphabetic() || chars.next()? != ':' {
        return None;
    }
    let rest: String = chars.collect();
    if !(rest.starts_with('\\') || rest.starts_with('/')) {
        return None;
    }
    let rest = rest.replace('\\', "/");
    Some(format!(
        "{DRIVE_MOUNT_ROOT}/{}{}",
        drive.to_ascii_lowercase(),
        rest.trim_end_matches('/')
    ))
}

/// A path that is already a Linux path is passed through; a Windows drive path is translated.
fn to_wsl(p: &str) -> String {
    windows_to_wsl_path(p).unwrap_or_else(|| p.to_string())
}

impl SandboxBackend for WslBwrap {
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
        let work = to_wsl(&work_dir.display().to_string());
        let mut a = vec!["--exec".to_string(), "bwrap".to_string()];
        a.extend(bwrap_args(
            &to_wsl(exe),
            args,
            &work,
            env,
            &[DRIVE_MOUNT_ROOT],
        ));
        ("wsl.exe".to_string(), a)
    }

    fn isolation_summary(&self) -> &'static str {
        "wsl_bwrap (Windows): bubblewrap inside a WSL2 distro -- no network namespace, no PID/UTS/IPC \
         sharing, writes confined to work_dir, Windows drives hidden under /mnt. The payload must be a \
         Linux executable. WSL interop (launching Windows .exe from inside the distro) is NOT disabled \
         by this backend; set `[interop] enabled=false` in the distro's /etc/wsl.conf. No resource limits."
    }
}

/// Same argv as `bwrap::probe_argv`, run through `wsl.exe --exec`, so user/pid/net namespace
/// creation inside the distro is exercised for real.
pub(crate) fn probe_argv() -> Vec<String> {
    let mut a = vec!["--exec".to_string(), "bwrap".to_string()];
    a.extend(super::bwrap::probe_argv().iter().map(|s| (*s).to_string()));
    a
}

pub fn probe() -> Probe {
    probe_with("wsl.exe")
}

pub(crate) fn probe_with(program: &str) -> Probe {
    match Command::new(program).args(probe_argv()).output() {
        Ok(o) if o.status.success() => Probe::Available(Box::new(WslBwrap)),
        Ok(o) => {
            let text = format!(
                "{} {}",
                decode_wsl_output(&o.stdout),
                decode_wsl_output(&o.stderr)
            );
            Probe::Unavailable {
                candidate: CANDIDATE,
                reason: describe_probe_failure(o.status.code(), &text),
            }
        }
        Err(e) => Probe::Unavailable {
            candidate: CANDIDATE,
            reason: format!("{program} not runnable: {e} -- WSL is not installed. {SETUP_HINT}"),
        },
    }
}

const SETUP_HINT: &str =
    "Setup: in an elevated PowerShell run `wsl --install -d Ubuntu`, reboot if asked, then \
     `wsl -u root -- apt-get install -y bubblewrap` (or run the sandbox doctor/setup of ct-agent).";

/// `wsl.exe` writes its own diagnostics as UTF-16LE (NUL-interleaved); output of a Linux process
/// run through it is plain UTF-8. Handle both without a dependency.
pub(crate) fn decode_wsl_output(bytes: &[u8]) -> String {
    if bytes.contains(&0) {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units)
            .trim_start_matches('\u{feff}')
            .trim()
            .to_string()
    } else {
        String::from_utf8_lossy(bytes).trim().to_string()
    }
}

pub(crate) fn describe_probe_failure(exit_code: Option<i32>, text: &str) -> String {
    let text = text.trim();
    let lower = text.to_ascii_lowercase();
    let hint = if lower.contains("no installed distributions")
        || lower.contains("wsl_e_default_distro_not_found")
        || lower.contains("has no distro")
    {
        "no WSL distribution is installed. ".to_string() + SETUP_HINT
    } else if lower.contains("execvp bwrap")
        || lower.contains("bwrap: command not found")
        || lower.contains("bwrap: no such file")
        || lower.contains("executable file not found")
    {
        "bubblewrap is not installed in the default WSL distro: run `wsl -u root -- apt-get install -y bubblewrap` \
         (use dnf/pacman/zypper/apk for non-Debian distros)."
            .to_string()
    } else if lower.contains("wsl 1")
        || lower.contains("wsl1")
        || lower.contains("not supported with the current")
    {
        "the default distro runs under WSL1, which lacks the namespaces bwrap needs: `wsl --set-version <distro> 2`.".to_string()
    } else if super::bwrap::userns_restriction_hint(text).is_some() {
        "unprivileged user namespaces are denied inside the distro (check `sysctl kernel.unprivileged_userns_clone` / \
         `kernel.apparmor_restrict_unprivileged_userns`, and that the distro runs under WSL2)."
            .to_string()
    } else {
        "check `wsl --status` and that the default distro runs under WSL2.".to_string()
    };
    format!("real sandboxed-exec probe (wsl.exe --exec bwrap ...) failed: exit={exit_code:?} output={text} -- {hint}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_paths_translate_to_drive_mounts_and_everything_else_is_refused() {
        assert_eq!(
            windows_to_wsl_path(r"C:\Users\me\w").as_deref(),
            Some("/mnt/c/Users/me/w")
        );
        assert_eq!(
            windows_to_wsl_path("D:/a/b/").as_deref(),
            Some("/mnt/d/a/b")
        );
        assert_eq!(
            windows_to_wsl_path(r"\\?\C:\Temp\x").as_deref(),
            Some("/mnt/c/Temp/x")
        );
        assert_eq!(windows_to_wsl_path(r"\\server\share\x"), None);
        assert_eq!(windows_to_wsl_path(r"\\wsl$\Ubuntu\home"), None);
        assert_eq!(windows_to_wsl_path(r"relative\path"), None);
        assert_eq!(windows_to_wsl_path(r"C:relative"), None);
        assert_eq!(windows_to_wsl_path("/already/linux"), None);
        assert_eq!(to_wsl("/already/linux"), "/already/linux");
    }

    #[test]
    fn wrap_command_runs_bwrap_through_wsl_exec_with_drives_hidden() {
        let (program, args) =
            WslBwrap.wrap_command(r"C:\w\run.sh", &["--x"], Path::new(r"C:\w"), &[("K", "v")]);
        assert_eq!(program, "wsl.exe");
        assert_eq!(
            args,
            vec![
                "--exec",
                "bwrap",
                "--die-with-parent",
                "--unshare-net",
                "--unshare-pid",
                "--unshare-uts",
                "--unshare-ipc",
                "--ro-bind",
                "/",
                "/",
                "--tmpfs",
                "/mnt",
                "--bind",
                "/mnt/c/w",
                "/mnt/c/w",
                "--chdir",
                "/mnt/c/w",
                "--clearenv",
                "--setenv",
                "K",
                "v",
                "--",
                "/mnt/c/w/run.sh",
                "--x",
            ]
        );
        // The tmpfs over /mnt must come after the root bind and before the work_dir bind, or the
        // work_dir mount would be hidden / the drives left visible.
        let pos = |f: &str| args.iter().position(|a| a == f).unwrap();
        assert!(pos("--ro-bind") < pos("--tmpfs") && pos("--tmpfs") < pos("--bind"));
    }

    #[test]
    fn wsl_output_decodes_utf16_diagnostics_and_plain_utf8() {
        let utf16: Vec<u8> = "\u{feff}Windows Subsystem for Linux has no installed distributions."
            .encode_utf16()
            .flat_map(|u| u.to_le_bytes())
            .collect();
        assert!(decode_wsl_output(&utf16).contains("no installed distributions"));
        assert_eq!(
            decode_wsl_output(b"bwrap: execvp bwrap\n"),
            "bwrap: execvp bwrap"
        );
    }

    #[test]
    fn probe_failures_name_the_matching_setup_step() {
        let r = describe_probe_failure(
            Some(1),
            "Windows Subsystem for Linux has no installed distributions",
        );
        assert!(r.contains("wsl --install"), "{r}");
        let r = describe_probe_failure(Some(1), "execvp bwrap: No such file or directory");
        assert!(r.contains("apt-get install -y bubblewrap"), "{r}");
        let r = describe_probe_failure(Some(1), "bwrap: setting up uid map: Permission denied");
        assert!(r.contains("user namespaces"), "{r}");
    }

    #[test]
    fn probe_reports_unavailable_with_setup_instructions_when_wsl_is_missing() {
        match probe_with("definitely-not-wsl-xyz") {
            Probe::Unavailable { candidate, reason } => {
                assert_eq!(candidate, "wsl_bwrap");
                assert!(reason.contains("wsl --install"), "{reason}");
            }
            Probe::Available(_) => panic!("must not be Available without wsl.exe"),
        }
    }

    #[test]
    fn probe_argv_is_the_native_bwrap_probe_through_wsl_exec() {
        let a = probe_argv();
        assert_eq!(&a[..2], ["--exec", "bwrap"]);
        assert!(
            a.iter().any(|x| x == "--unshare-net")
                && a.last().map(String::as_str) == Some("/bin/true")
        );
    }
}
