//! Windows backend: `bubblewrap` inside a DEDICATED WSL2 distro (`cads-sandbox`), launched through
//! `wsl.exe --exec`.
//!
//! Windows has no unprivileged, no-install primitive comparable to `bwrap`/Seatbelt that fits an
//! arbitrary fetched executable. WSL2 runs a real Linux kernel, so the same bwrap policy applies
//! ([`super::bwrap::bwrap_args`]: allowlisted filesystem view, private `/proc`, all namespaces,
//! capabilities dropped). What WSL adds, and what this module closes:
//!
//! * **Interop** (a Linux process starting Windows `.exe` files, which would run OUTSIDE the
//!   sandbox with the Windows user's rights). The probe fails closed unless the dedicated distro's
//!   `/etc/wsl.conf` has `[interop] enabled=false` AND the live kernel state agrees
//!   (`/proc/sys/fs/binfmt_misc/WSLInterop` absent or `disabled`), and `appendWindowsPath=false`.
//! * **A dedicated distro** so the hardening never touches (or depends on) the user's own distro.
//!   [`super::doctor`] creates and configures it.
//! * **Windows drives**: with an allowlisted bwrap view only `work_dir` is mounted; the automount
//!   root is read from the distro's `wsl.conf` instead of assumed to be `/mnt`.
//! * Absolute `%SystemRoot%\System32\wsl.exe`, never a `PATH` lookup.
//!
//! The binary must be a Linux executable. Everything pure here compiles and is unit-tested on every
//! OS; only [`probe`] is selected on Windows. NOT measured: no Windows host with WSL has executed
//! this -- see `docs/security-model.md` F.14.
#![cfg_attr(not(windows), allow(dead_code))]

use super::bwrap::bwrap_args;
use super::{Limits, Probe, SandboxBackend, DEFAULT_LIMITS};
use std::path::Path;
use std::process::Command;

const CANDIDATE: &str = "wsl_bwrap";

/// The dedicated distro. Not configurable: the probe must be able to name exactly what it checked.
pub const SANDBOX_DISTRO: &str = "cads-sandbox";

const DEFAULT_MOUNT_ROOT: &str = "/mnt";

pub struct WslBwrap {
    /// The distro's automount root (`[automount] root=` in `wsl.conf`, default `/mnt/`), without a
    /// trailing slash.
    mount_root: String,
}

impl Default for WslBwrap {
    fn default() -> Self {
        Self { mount_root: DEFAULT_MOUNT_ROOT.to_string() }
    }
}

/// `%SystemRoot%\System32\wsl.exe` (default root `C:\Windows`). Pure over the env value.
pub(crate) fn wsl_exe_path(system_root: Option<&str>) -> String {
    let root = system_root.filter(|r| !r.is_empty()).unwrap_or(r"C:\Windows");
    format!(r"{}\System32\wsl.exe", root.trim_end_matches(['\\', '/']))
}

fn wsl_exe() -> String {
    wsl_exe_path(std::env::var("SystemRoot").ok().as_deref())
}

/// `C:\Users\me\w` / `C:/Users/me/w` / `\\?\C:\Users\me\w` -> `<mount_root>/c/Users/me/w`. `None` for
/// anything that is not a plain drive-letter absolute path (UNC shares, `\\wsl$\...`, relative
/// paths) and for any path containing a double quote or control character, which cannot occur in a
/// Windows path and would be an argv-injection vector. Trailing separators are dropped so a path
/// ending in `\` can never escape the closing quote of its argument.
pub(crate) fn windows_to_wsl_path(p: &str, mount_root: &str) -> Option<String> {
    let p = p.strip_prefix(r"\\?\").unwrap_or(p);
    if p.chars().any(|c| c == '"' || c.is_control()) {
        return None;
    }
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
    Some(format!("{}/{}{}", mount_root.trim_end_matches('/'), drive.to_ascii_lowercase(), rest.trim_end_matches('/')))
}

fn to_wsl(p: &str, mount_root: &str) -> String {
    windows_to_wsl_path(p, mount_root).unwrap_or_else(|| p.to_string())
}

/// `[automount] root=` from `wsl.conf` text (default `/mnt`).
pub(crate) fn automount_root_from_wsl_conf(conf: &str) -> String {
    let mut in_automount = false;
    for line in conf.lines().map(str::trim) {
        if line.starts_with('[') {
            in_automount = line.eq_ignore_ascii_case("[automount]");
        } else if in_automount {
            if let Some((k, v)) = line.split_once('=') {
                if k.trim().eq_ignore_ascii_case("root") {
                    let v = v.trim().trim_matches('"').trim_end_matches('/');
                    if v.starts_with('/') && !v.is_empty() {
                        return v.to_string();
                    }
                }
            }
        }
    }
    DEFAULT_MOUNT_ROOT.to_string()
}

fn conf_value(conf: &str, section: &str, key: &str) -> Option<String> {
    let mut in_section = false;
    for line in conf.lines().map(str::trim) {
        if line.starts_with('[') {
            in_section = line.trim_matches(['[', ']']).eq_ignore_ascii_case(section);
        } else if in_section {
            if let Some((k, v)) = line.split_once('=') {
                if k.trim().eq_ignore_ascii_case(key) {
                    return Some(v.trim().trim_matches('"').to_ascii_lowercase());
                }
            }
        }
    }
    None
}

/// Fail-closed check of the dedicated distro's `/etc/wsl.conf`: interop and the Windows `PATH` must
/// be explicitly disabled. Absence of the key is a failure (WSL's default is ENABLED).
pub(crate) fn wsl_conf_hardening_gap(conf: &str) -> Option<String> {
    let mut gaps = Vec::new();
    if conf_value(conf, "interop", "enabled").as_deref() != Some("false") {
        gaps.push("[interop] enabled=false");
    }
    if conf_value(conf, "interop", "appendWindowsPath").as_deref() != Some("false") {
        gaps.push("[interop] appendWindowsPath=false");
    }
    (!gaps.is_empty()).then(|| format!("{SANDBOX_DISTRO}'s /etc/wsl.conf lacks {}", gaps.join(" and ")))
}

/// Live kernel interop state: `/proc/sys/fs/binfmt_misc/WSLInterop` must be absent (empty read) or
/// its first line `disabled`. Anything else means Windows executables can be started.
pub(crate) fn interop_state_gap(binfmt_first_line: &str) -> Option<String> {
    let l = binfmt_first_line.trim();
    (!l.is_empty() && l != "disabled")
        .then(|| format!("WSL interop is live in {SANDBOX_DISTRO} (WSLInterop reads `{l}`); run `wsl --terminate {SANDBOX_DISTRO}` after setting interop off"))
}

fn limit_args(l: Limits) -> Vec<String> {
    vec![
        format!("--cpu={}", l.cpu_secs),
        format!("--fsize={}", l.fsize_bytes),
        format!("--nproc={}", l.nproc),
    ]
}

impl SandboxBackend for WslBwrap {
    fn name(&self) -> &'static str {
        CANDIDATE
    }

    fn wrap_command(&self, exe: &str, args: &[&str], work_dir: &Path, env: &[(&str, &str)]) -> (String, Vec<String>) {
        let work = to_wsl(&work_dir.display().to_string(), &self.mount_root);
        let mut a: Vec<String> = ["-d", SANDBOX_DISTRO, "--exec", "/usr/bin/prlimit"].map(String::from).to_vec();
        a.extend(limit_args(DEFAULT_LIMITS));
        a.extend(["--".to_string(), "/usr/bin/bwrap".to_string()]);
        a.extend(bwrap_args(&to_wsl(exe, &self.mount_root), args, &work, env));
        (wsl_exe(), a)
    }

    fn isolation_summary(&self) -> &'static str {
        "wsl_bwrap (Windows): bubblewrap in the dedicated WSL2 distro `cads-sandbox`; interop and the \
         Windows PATH verified disabled at probe time; no network, all namespaces unshared, capabilities \
         dropped, allowlisted read-only filesystem view, writes confined to work_dir. The payload must be \
         a Linux executable. CPU/file-size/process caps via prlimit; no memory cap."
    }
}

/// bwrap probe through the distro: the runtime argv running `/bin/true`.
pub(crate) fn probe_args(work_dir_in_distro: &str) -> Vec<String> {
    let mut a: Vec<String> = ["-d", SANDBOX_DISTRO, "--exec", "/usr/bin/bwrap"].map(String::from).to_vec();
    a.extend(bwrap_args("/bin/true", &[], work_dir_in_distro, &[]));
    a
}

pub fn probe() -> Probe {
    probe_with(&wsl_exe())
}

fn run_wsl(program: &str, args: &[&str]) -> Result<(Option<i32>, String), String> {
    let o = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("{program} not runnable: {e} -- WSL is not installed. {SETUP_HINT}"))?;
    Ok((o.status.code(), format!("{} {}", decode_wsl_output(&o.stdout), decode_wsl_output(&o.stderr)).trim().to_string()))
}

pub(crate) fn probe_with(program: &str) -> Probe {
    let unavailable = |reason: String| Probe::Unavailable { candidate: CANDIDATE, reason };
    // 1. the dedicated distro exists, and its wsl.conf is hardened.
    let conf = match run_wsl(program, &["-d", SANDBOX_DISTRO, "--exec", "/bin/cat", "/etc/wsl.conf"]) {
        Err(e) => return unavailable(e),
        Ok((Some(0), text)) => text,
        Ok((code, text)) => return unavailable(describe_probe_failure(code, &text)),
    };
    if let Some(gap) = wsl_conf_hardening_gap(&conf) {
        return unavailable(format!("{gap} -- {SETUP_HINT}"));
    }
    // 2. live interop state agrees (wsl.conf only applies after the distro restarts).
    match run_wsl(program, &["-d", SANDBOX_DISTRO, "--exec", "/bin/sh", "-c", "head -n1 /proc/sys/fs/binfmt_misc/WSLInterop 2>/dev/null; true"]) {
        Err(e) => return unavailable(e),
        Ok((Some(0), first)) => {
            if let Some(gap) = interop_state_gap(&first) {
                return unavailable(format!("{gap} -- {SETUP_HINT}"));
            }
        }
        Ok((code, text)) => return unavailable(describe_probe_failure(code, &text)),
    }
    // 3. real sandboxed exec with the runtime flags.
    let mount_root = automount_root_from_wsl_conf(&conf);
    let work = format!("{mount_root}/c/Windows/Temp"); // exists in every Windows install; bound read-write only for the probe
    let probe_args = probe_args(&work);
    let argv: Vec<&str> = probe_args.iter().map(String::as_str).collect();
    match run_wsl(program, &argv) {
        Err(e) => unavailable(e),
        Ok((Some(0), _)) => Probe::Available(Box::new(WslBwrap { mount_root })),
        Ok((code, text)) => unavailable(describe_probe_failure(code, &text)),
    }
}

const SETUP_HINT: &str = "Setup: run the sandbox doctor/setup of ct-agent (`ct-agent doctor sandbox`), which creates the \
     dedicated WSL2 distro `cads-sandbox` with interop disabled and bubblewrap installed (first `wsl --install --no-distribution` \
     in an elevated PowerShell if WSL itself is missing).";

/// `wsl.exe` writes its own diagnostics as UTF-16LE (NUL-interleaved); output of a Linux process
/// run through it is plain UTF-8. Handle both without a dependency.
pub(crate) fn decode_wsl_output(bytes: &[u8]) -> String {
    if bytes.contains(&0) {
        let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units).trim_start_matches('\u{feff}').trim().to_string()
    } else {
        String::from_utf8_lossy(bytes).trim().to_string()
    }
}

pub(crate) fn describe_probe_failure(exit_code: Option<i32>, text: &str) -> String {
    let text = text.trim();
    let lower = text.to_ascii_lowercase();
    let hint = if lower.contains("no installed distributions") || lower.contains("wsl_e_distro_not_found") || lower.contains("there is no distribution") || lower.contains("wsl_e_default_distro_not_found") {
        format!("the dedicated distro `{SANDBOX_DISTRO}` is not installed. {SETUP_HINT}")
    } else if lower.contains("execvp") || lower.contains("bwrap: command not found") || lower.contains("no such file or directory") {
        format!("bubblewrap is not installed in `{SANDBOX_DISTRO}`: run `wsl -d {SANDBOX_DISTRO} -u root --exec apt-get install -y bubblewrap`.")
    } else if lower.contains("wsl 1") || lower.contains("wsl1") || lower.contains("not supported with the current") {
        format!("`{SANDBOX_DISTRO}` runs under WSL1, which lacks the namespaces bwrap needs: `wsl --set-version {SANDBOX_DISTRO} 2`.")
    } else if super::bwrap::userns_restriction_hint(text).is_some() {
        "unprivileged user namespaces are denied inside the distro (check `sysctl kernel.unprivileged_userns_clone` / \
         `kernel.apparmor_restrict_unprivileged_userns`, and that the distro runs under WSL2)."
            .to_string()
    } else {
        "check `wsl --status` and that the distro runs under WSL2.".to_string()
    };
    format!("WSL sandbox probe failed: exit={exit_code:?} output={text} -- {hint}")
}

/// What Windows' `CommandLineToArgvW` / the MSVCRT will reconstruct from a command line built with
/// [`quote_windows_arg`]: documented here so the quoting test states the rule it checks.
/// (Rust's `std::process::Command` applies these same rules itself when spawning `wsl.exe`; this
/// function exists so the rules are pinned by a test that runs on every OS, and so a raw command
/// line, if one is ever built, has one audited quoting routine.)
pub(crate) fn quote_windows_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.chars().any(|c| c == ' ' || c == '\t' || c == '"') {
        return arg.to_string();
    }
    let mut out = String::from("\"");
    let mut backslashes = 0usize;
    for c in arg.chars() {
        match c {
            '\\' => backslashes += 1,
            '"' => {
                out.push_str(&"\\".repeat(backslashes * 2 + 1));
                out.push('"');
                backslashes = 0;
            }
            _ => {
                out.push_str(&"\\".repeat(backslashes));
                out.push(c);
                backslashes = 0;
            }
        }
    }
    out.push_str(&"\\".repeat(backslashes * 2)); // trailing backslashes must not escape the closing quote
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reference parser for the `CommandLineToArgvW` rules, to check that quoting round-trips.
    fn parse_args(cmdline: &str) -> Vec<String> {
        let chars: Vec<char> = cmdline.chars().collect();
        let (mut args, mut cur, mut in_q, mut i, mut have) = (Vec::new(), String::new(), false, 0, false);
        while i < chars.len() {
            let c = chars[i];
            if c == '\\' {
                let mut n = 0;
                while i < chars.len() && chars[i] == '\\' {
                    n += 1;
                    i += 1;
                }
                if i < chars.len() && chars[i] == '"' {
                    cur.push_str(&"\\".repeat(n / 2));
                    if n % 2 == 1 {
                        cur.push('"');
                        i += 1;
                    }
                } else {
                    cur.push_str(&"\\".repeat(n));
                }
                have = true;
                continue;
            }
            if c == '"' {
                in_q = !in_q;
                have = true;
            } else if (c == ' ' || c == '\t') && !in_q {
                if have {
                    args.push(std::mem::take(&mut cur));
                    have = false;
                }
            } else {
                cur.push(c);
                have = true;
            }
            i += 1;
        }
        if have {
            args.push(cur);
        }
        args
    }

    #[test]
    fn windows_paths_translate_to_the_configured_mount_root_and_everything_else_is_refused() {
        assert_eq!(windows_to_wsl_path(r"C:\Users\me\w", "/mnt").as_deref(), Some("/mnt/c/Users/me/w"));
        assert_eq!(windows_to_wsl_path("D:/a/b/", "/mnt").as_deref(), Some("/mnt/d/a/b"));
        assert_eq!(windows_to_wsl_path(r"\\?\C:\Temp\x", "/mnt/").as_deref(), Some("/mnt/c/Temp/x"));
        assert_eq!(windows_to_wsl_path(r"C:\x", "/win").as_deref(), Some("/win/c/x"), "custom automount root");
        for bad in [r"\\server\share\x", r"\\wsl$\Ubuntu\home", r"relative\path", "C:relative", "/already/linux"] {
            assert_eq!(windows_to_wsl_path(bad, "/mnt"), None, "{bad}");
        }
        assert_eq!(to_wsl("/already/linux", "/mnt"), "/already/linux");
    }

    #[test]
    fn hostile_work_dirs_with_spaces_quotes_and_trailing_backslashes_stay_one_safe_argument() {
        // spaces survive as one argument; trailing backslashes are dropped; quotes / control chars refuse translation
        assert_eq!(windows_to_wsl_path(r"C:\Program Files\my work\", "/mnt").as_deref(), Some("/mnt/c/Program Files/my work"));
        assert_eq!(windows_to_wsl_path(r"C:\a\\\", "/mnt").as_deref(), Some("/mnt/c/a"));
        assert_eq!(windows_to_wsl_path("C:\\a\" --bind / /", "/mnt"), None);
        assert_eq!(windows_to_wsl_path("C:\\a\nb", "/mnt"), None);
        let (_, args) = WslBwrap::default().wrap_command(r"C:\my dir\run.sh", &["a b", "c\"d"], Path::new(r"C:\my dir\"), &[("K", "v w")]);
        assert!(args.contains(&"/mnt/c/my dir".to_string()));
        assert!(args.contains(&"a b".to_string()) && args.contains(&"K".to_string()) && args.contains(&"v w".to_string()));
        // Every argv element survives Windows quoting + CommandLineToArgvW parsing unchanged.
        let line = args.iter().map(|a| quote_windows_arg(a)).collect::<Vec<_>>().join(" ");
        assert_eq!(parse_args(&line), args);
    }

    #[test]
    fn quote_windows_arg_follows_the_commandlinetoargv_rules() {
        for (arg, quoted) in [
            ("plain", "plain"),
            ("a b", "\"a b\""),
            (r"C:\dir with space\", r#""C:\dir with space\\""#),
            (r#"say "hi""#, r#""say \"hi\"""#),
            (r#"x\"y"#, r#""x\\\"y""#),
            ("", "\"\""),
        ] {
            assert_eq!(quote_windows_arg(arg), quoted, "{arg:?}");
            assert_eq!(parse_args(quoted), vec![arg.to_string()], "round trip of {arg:?}");
        }
    }

    #[test]
    fn wrap_command_runs_prlimit_then_bwrap_in_the_dedicated_distro_by_absolute_path() {
        let (program, args) = WslBwrap::default().wrap_command(r"C:\w\run.sh", &["--x"], Path::new(r"C:\w"), &[("K", "v")]);
        assert!(program.to_ascii_lowercase().ends_with(r"system32\wsl.exe") && program.contains(':'), "{program}");
        assert_eq!(&args[..4], ["-d", "cads-sandbox", "--exec", "/usr/bin/prlimit"]);
        assert_eq!(&args[4..7], ["--cpu=600", "--fsize=4294967296", "--nproc=8192"]);
        assert_eq!(&args[7..9], ["--", "/usr/bin/bwrap"]);
        assert_eq!(&args[9..], bwrap_args("/mnt/c/w/run.sh", &["--x"], "/mnt/c/w", &[("K", "v")]).as_slice());
        assert!(args.iter().any(|a| a == "--unshare-all") && args.iter().any(|a| a == "--cap-drop"));
    }

    #[test]
    fn wsl_exe_is_resolved_under_systemroot_not_path() {
        assert_eq!(wsl_exe_path(Some(r"D:\Win\")), r"D:\Win\System32\wsl.exe");
        assert_eq!(wsl_exe_path(None), r"C:\Windows\System32\wsl.exe");
        assert_eq!(wsl_exe_path(Some("")), r"C:\Windows\System32\wsl.exe");
    }

    #[test]
    fn automount_root_is_read_from_wsl_conf() {
        assert_eq!(automount_root_from_wsl_conf("[automount]\nroot = /win/\n[interop]\nenabled=false"), "/win");
        assert_eq!(automount_root_from_wsl_conf("[interop]\nroot=/nope"), "/mnt");
        assert_eq!(automount_root_from_wsl_conf(""), "/mnt");
    }

    #[test]
    fn interop_must_be_explicitly_disabled_in_wsl_conf_and_live() {
        let good = "[interop]\nenabled=false\nappendWindowsPath=false\n";
        assert_eq!(wsl_conf_hardening_gap(good), None);
        assert_eq!(wsl_conf_hardening_gap("[interop]\nEnabled = False\nappendWindowsPath = \"false\""), None);
        for bad in ["", "[interop]\nenabled=true\nappendWindowsPath=false", "[interop]\nenabled=false", "[boot]\nenabled=false\nappendWindowsPath=false", "[automount]\nenabled=false"] {
            assert!(wsl_conf_hardening_gap(bad).is_some(), "{bad:?} must fail closed");
        }
        assert_eq!(interop_state_gap(""), None, "WSLInterop absent");
        assert_eq!(interop_state_gap("disabled\n"), None);
        assert!(interop_state_gap("enabled\n").is_some());
        assert!(interop_state_gap("interpreter /init").is_some());
    }

    #[test]
    fn wsl_output_decodes_utf16_diagnostics_and_plain_utf8() {
        let utf16: Vec<u8> = "\u{feff}Windows Subsystem for Linux has no installed distributions."
            .encode_utf16()
            .flat_map(|u| u.to_le_bytes())
            .collect();
        assert!(decode_wsl_output(&utf16).contains("no installed distributions"));
        assert_eq!(decode_wsl_output(b"bwrap: execvp bwrap\n"), "bwrap: execvp bwrap");
    }

    #[test]
    fn probe_failures_name_the_matching_setup_step() {
        let r = describe_probe_failure(Some(1), "There is no distribution with the supplied name.");
        assert!(r.contains("cads-sandbox") && r.contains("ct-agent doctor sandbox"), "{r}");
        let r = describe_probe_failure(Some(1), "execvp /usr/bin/bwrap: No such file or directory");
        assert!(r.contains("apt-get install -y bubblewrap"), "{r}");
        let r = describe_probe_failure(Some(1), "bwrap: setting up uid map: Permission denied");
        assert!(r.contains("user namespaces"), "{r}");
    }

    #[test]
    fn probe_reports_unavailable_with_setup_instructions_when_wsl_is_missing() {
        match probe_with("definitely-not-wsl-xyz") {
            Probe::Unavailable { candidate, reason } => {
                assert_eq!(candidate, "wsl_bwrap");
                assert!(reason.contains("ct-agent doctor sandbox"), "{reason}");
            }
            Probe::Available(_) => panic!("must not be Available without wsl.exe"),
        }
    }

    #[test]
    fn probe_args_are_the_runtime_bwrap_argv_in_the_dedicated_distro() {
        let a = probe_args("/mnt/c/Windows/Temp");
        assert_eq!(&a[..4], ["-d", "cads-sandbox", "--exec", "/usr/bin/bwrap"]);
        assert_eq!(a[4..], bwrap_args("/bin/true", &[], "/mnt/c/Windows/Temp", &[]));
    }
}
