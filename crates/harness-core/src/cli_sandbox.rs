//! Preparation for running an agent CLI inside the installer-engine sandbox: the per-run HOME and
//! TMPDIR, the copy of exactly ONE CLI's login files into that HOME, the read-only trees the CLI
//! binary needs, and the sandbox's environment. Nothing here writes back to the real `$HOME`; the
//! per-run directories are deleted when [`RunDirs`] drops.
//!
//! The harness only opens credential files here, to copy them for the CLI that was selected. It
//! never parses them (the one exception, `~/.claude.json`, is filtered to drop bulky/sensitive
//! non-login keys), never logs them, and [`crate::redact`] protects transcripts.

use crate::backend::BackendKind;
use crate::local_cli::build_env;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

/// Per-run HOME and TMPDIR under one private (0700) temp root, outside the bundle.
pub struct RunDirs {
    _root: tempfile::TempDir,
    pub home: PathBuf,
    pub tmp: PathBuf,
}

pub fn create_run_dirs() -> std::io::Result<RunDirs> {
    let root = tempfile::Builder::new()
        .prefix("cads-harness-run-")
        .tempdir()?;
    // Canonical: Seatbelt matches resolved paths (/var -> /private/var on macOS).
    let base = std::fs::canonicalize(root.path())?;
    let (home, tmp) = (base.join("home"), base.join("tmp"));
    std::fs::create_dir(&home)?;
    std::fs::create_dir(&tmp)?;
    Ok(RunDirs {
        _root: root,
        home,
        tmp,
    })
}

/// How a file lands in the per-run HOME.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CopyKind {
    Plain,
    /// `~/.claude.json`: drop `projects` and `mcpServers` (history and third-party server config),
    /// keep the account/onboarding state the CLI needs to start logged in.
    ClaudeJson,
}

/// `(source, destination relative to the per-run HOME, how)` for exactly the selected CLI. Pure.
pub fn credential_files(
    kind: BackendKind,
    real_home: &Path,
    ambient: &dyn Fn(&str) -> Option<OsString>,
) -> Vec<(PathBuf, PathBuf, CopyKind)> {
    let dir = |var: &str, default: PathBuf| {
        ambient(var)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or(default)
    };
    match kind {
        BackendKind::ClaudeCode => {
            let custom = ambient("CLAUDE_CONFIG_DIR")
                .filter(|v| !v.is_empty())
                .map(PathBuf::from);
            let cfg = custom.clone().unwrap_or_else(|| real_home.join(".claude"));
            let json = custom
                .map(|c| c.join(".claude.json"))
                .unwrap_or_else(|| real_home.join(".claude.json"));
            vec![
                (
                    cfg.join(".credentials.json"),
                    PathBuf::from(".claude/.credentials.json"),
                    CopyKind::Plain,
                ),
                (json, PathBuf::from(".claude.json"), CopyKind::ClaudeJson),
            ]
        }
        BackendKind::Codex => {
            let cfg = dir("CODEX_HOME", real_home.join(".codex"));
            ["auth.json", "config.toml"]
                .iter()
                .map(|f| {
                    (
                        cfg.join(f),
                        PathBuf::from(".codex").join(f),
                        CopyKind::Plain,
                    )
                })
                .collect()
        }
        BackendKind::Gemini => {
            let base = dir("GEMINI_CLI_HOME", real_home.to_path_buf()).join(".gemini");
            [
                "oauth_creds.json",
                "google_accounts.json",
                "settings.json",
                "installation_id",
            ]
            .iter()
            .map(|f| {
                (
                    base.join(f),
                    PathBuf::from(".gemini").join(f),
                    CopyKind::Plain,
                )
            })
            .collect()
        }
        BackendKind::LiteLlm | BackendKind::Ollama => Vec::new(),
    }
}

pub fn filter_claude_json(raw: &str) -> Result<String, String> {
    let mut v: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("not valid JSON: {e}"))?;
    if let Some(o) = v.as_object_mut() {
        o.remove("projects");
        o.remove("mcpServers");
    }
    serde_json::to_string(&v).map_err(|e| e.to_string())
}

/// Copy the selected CLI's existing login files into `run_home`. Returns the relative paths copied
/// (never contents). Symlinks and non-files are skipped.
pub fn prepare_home(
    files: &[(PathBuf, PathBuf, CopyKind)],
    run_home: &Path,
) -> Result<Vec<PathBuf>, String> {
    let mut copied = Vec::new();
    for (src, rel, how) in files {
        match std::fs::symlink_metadata(src) {
            Ok(m) if m.is_file() => {}
            _ => continue,
        }
        let dest = run_home.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        match how {
            CopyKind::Plain => {
                std::fs::copy(src, &dest)
                    .map_err(|e| format!("copy login file {}: {e}", rel.display()))?;
            }
            CopyKind::ClaudeJson => {
                let raw = std::fs::read_to_string(src)
                    .map_err(|e| format!("read {}: {e}", rel.display()))?;
                let filtered =
                    filter_claude_json(&raw).map_err(|e| format!("{}: {e}", rel.display()))?;
                std::fs::write(&dest, filtered)
                    .map_err(|e| format!("write {}: {e}", rel.display()))?;
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o600));
        }
        copied.push(rel.clone());
    }
    Ok(copied)
}

/// Whether the claude login may live in the macOS keychain rather than in a file: on macOS, when no
/// file credential was copied. The caller then lets the sandbox reach the keychain instead.
pub fn needs_keychain(kind: BackendKind, copied: &[PathBuf]) -> bool {
    cfg!(target_os = "macos")
        && kind == BackendKind::ClaudeCode
        && !copied.iter().any(|p| p.ends_with(".credentials.json"))
}

/// Make the real login keychain reachable from the per-run HOME (macOS keychain login): the
/// `security` helper looks in `$HOME/Library/Keychains`, which the per-run HOME does not have, so a
/// symlink to the real directory is created. Access is still gated by the sandbox profile
/// (`KEYCHAINS` read + `SecurityServer`) and by the keychain's own item ACLs.
pub fn link_keychains(real_home: &Path, run_home: &Path) -> Result<bool, String> {
    let real = real_home.join("Library/Keychains");
    if !real.is_dir() {
        return Ok(false);
    }
    let lib = run_home.join("Library");
    std::fs::create_dir_all(&lib).map_err(|e| format!("create {}: {e}", lib.display()))?;
    #[cfg(unix)]
    std::os::unix::fs::symlink(&real, lib.join("Keychains"))
        .map_err(|e| format!("link keychains: {e}"))?;
    Ok(true)
}

/// Read-only trees the CLI needs to start: its own install tree and, for a `#!...node` script, the
/// Node installation. Heuristic and conservative: the canonical binary's directory; an enclosing
/// `node_modules`; a well-known package prefix (`/opt/homebrew`, `/usr/local`) it lives under.
pub fn runtime_ro_paths(binary: &Path, path_var: &OsStr) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut add = |p: PathBuf| {
        if p.parent().is_some() && !out.contains(&p) {
            out.push(p);
        }
    };
    let Ok(canon) = std::fs::canonicalize(binary) else {
        return out;
    };
    if let Some(dir) = canon.parent() {
        add(dir.to_path_buf());
    }
    let prefix_of = |p: &Path| {
        ["/opt/homebrew", "/usr/local"]
            .iter()
            .map(PathBuf::from)
            .find(|pre| p.starts_with(pre))
    };
    if let Some(nm) = canon
        .ancestors()
        .find(|a| a.file_name() == Some(OsStr::new("node_modules")))
    {
        add(nm.to_path_buf());
    }
    if let Some(pre) = prefix_of(&canon) {
        add(pre);
    }
    if is_node_script(&canon) {
        if let Some(node) = crate::local_cli::find_in_path("node", path_var)
            .and_then(|n| std::fs::canonicalize(n).ok())
        {
            match prefix_of(&node) {
                Some(pre) => add(pre),
                None => {
                    if let Some(root) = node.parent().and_then(Path::parent) {
                        add(root.to_path_buf());
                    }
                }
            }
        }
    }
    // OS directories are already visible (bwrap) or executable (Seatbelt); never add system roots,
    // and never a whole home/temp root.
    const OS_PREFIXES: [&str; 6] = ["/usr", "/bin", "/sbin", "/System", "/Library", "/etc"];
    const BROAD: [&str; 5] = ["/private", "/var", "/tmp", "/home", "/Users"];
    out.retain(|p| {
        let os = OS_PREFIXES.iter().any(|s| p.starts_with(s)) && !p.starts_with("/usr/local");
        !os && !BROAD.iter().any(|s| p == Path::new(s))
    });
    out
}

fn is_node_script(p: &Path) -> bool {
    use std::io::Read;
    let mut buf = [0u8; 128];
    let n = std::fs::File::open(p)
        .and_then(|mut f| f.read(&mut buf))
        .unwrap_or(0);
    buf[..n].starts_with(b"#!")
        && String::from_utf8_lossy(&buf[..n])
            .lines()
            .next()
            .is_some_and(|l| l.contains("node"))
}

/// The environment inside the sandbox: [`build_env`] with HOME/TMPDIR pointing at the per-run
/// directories, and no XDG_* / CLI config-dir variable (the CLI finds its copied login under the
/// per-run HOME by default).
pub fn sandbox_env(
    kind: BackendKind,
    ambient: &dyn Fn(&str) -> Option<OsString>,
    max_output_tokens: u64,
    dirs: &RunDirs,
) -> Vec<(OsString, OsString)> {
    const MASKED: [&str; 10] = [
        "HOME",
        "TMPDIR",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_CACHE_HOME",
        "XDG_STATE_HOME",
        "CLAUDE_CONFIG_DIR",
        "CODEX_HOME",
        "GEMINI_CLI_HOME",
        "OLLAMA_HOST",
    ];
    let masked = |k: &str| {
        if MASKED.contains(&k) {
            None
        } else {
            ambient(k)
        }
    };
    let mut env = build_env(kind, &masked, max_output_tokens);
    env.push(("HOME".into(), dirs.home.clone().into_os_string()));
    env.push(("TMPDIR".into(), dirs.tmp.clone().into_os_string()));
    if kind == BackendKind::ClaudeCode {
        // Claude Code otherwise uses a fixed /tmp/claude-<uid> shared with the user's other sessions.
        env.push((
            "CLAUDE_CODE_TMPDIR".into(),
            dirs.tmp.clone().into_os_string(),
        ));
    }
    env
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_env(_: &str) -> Option<OsString> {
        None
    }

    #[test]
    fn credential_files_cover_exactly_the_selected_cli() {
        let h = Path::new("/home/u");
        let files = |k| credential_files(k, h, &no_env);
        let claude = files(BackendKind::ClaudeCode);
        assert!(claude
            .iter()
            .all(|(s, _, _)| s.to_string_lossy().starts_with("/home/u/.claude")));
        assert!(claude
            .iter()
            .any(|(s, d, _)| s == Path::new("/home/u/.claude.json")
                && d == Path::new(".claude.json")));
        let codex = files(BackendKind::Codex);
        assert!(codex
            .iter()
            .all(|(s, _, _)| s.starts_with("/home/u/.codex")));
        assert!(codex
            .iter()
            .any(|(_, d, _)| d == Path::new(".codex/auth.json")));
        let gem = files(BackendKind::Gemini);
        assert!(gem.iter().all(|(s, _, _)| s.starts_with("/home/u/.gemini")));
        assert!(files(BackendKind::LiteLlm).is_empty() && files(BackendKind::Ollama).is_empty());
        // no cross-contamination
        for (s, _, _) in codex.iter().chain(gem.iter()) {
            assert!(!s.to_string_lossy().contains(".claude"));
        }
    }

    #[test]
    fn config_dir_variables_are_honoured_for_the_source() {
        let amb = |k: &str| (k == "CODEX_HOME").then(|| OsString::from("/data/codex"));
        let f = credential_files(BackendKind::Codex, Path::new("/home/u"), &amb);
        assert!(f.iter().all(|(s, _, _)| s.starts_with("/data/codex")));
        let amb = |k: &str| (k == "CLAUDE_CONFIG_DIR").then(|| OsString::from("/data/cc"));
        let f = credential_files(BackendKind::ClaudeCode, Path::new("/home/u"), &amb);
        assert!(f.iter().all(|(s, _, _)| s.starts_with("/data/cc")), "{f:?}");
    }

    #[test]
    fn claude_json_is_filtered_and_invalid_json_is_an_error() {
        let out = filter_claude_json(
            r#"{"oauthAccount":{"a":1},"projects":{"/x":{}},"mcpServers":{"s":{}},"userID":"u"}"#,
        )
        .unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.get("projects").is_none() && v.get("mcpServers").is_none());
        assert!(v.get("oauthAccount").is_some() && v.get("userID").is_some());
        assert!(filter_claude_json("not json").is_err());
    }

    #[test]
    fn prepare_home_copies_only_existing_regular_files_with_private_mode() {
        let real = tempfile::tempdir().unwrap();
        let run = tempfile::tempdir().unwrap();
        std::fs::create_dir(real.path().join(".codex")).unwrap();
        std::fs::write(real.path().join(".codex/auth.json"), "A").unwrap();
        std::fs::write(real.path().join("other.txt"), "NOPE").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(
            real.path().join("other.txt"),
            real.path().join(".codex/config.toml"),
        )
        .unwrap();
        let files = credential_files(BackendKind::Codex, real.path(), &no_env);
        let copied = prepare_home(&files, run.path()).unwrap();
        assert_eq!(copied, vec![PathBuf::from(".codex/auth.json")]);
        assert_eq!(
            std::fs::read_to_string(run.path().join(".codex/auth.json")).unwrap(),
            "A"
        );
        assert!(
            !run.path().join(".codex/config.toml").exists(),
            "symlinks are skipped"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let m = std::fs::metadata(run.path().join(".codex/auth.json"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(m & 0o777, 0o600);
        }
        // the real file is untouched
        assert_eq!(
            std::fs::read_to_string(real.path().join(".codex/auth.json")).unwrap(),
            "A"
        );
    }

    #[test]
    fn sandbox_env_points_home_and_tmp_at_the_run_dirs_and_drops_real_ones() {
        let dirs = create_run_dirs().unwrap();
        let amb = |k: &str| match k {
            "HOME" => Some("/real/home".into()),
            "XDG_CONFIG_HOME" => Some("/real/xdg".into()),
            "CLAUDE_CONFIG_DIR" => Some("/real/cc".into()),
            "PATH" => Some("/bin".into()),
            "ANTHROPIC_API_KEY" => Some("k".into()),
            _ => None,
        };
        let env = sandbox_env(BackendKind::ClaudeCode, &amb, 10, &dirs);
        let get = |n: &str| env.iter().find(|(k, _)| k == n).map(|(_, v)| v.clone());
        assert_eq!(get("HOME"), Some(dirs.home.clone().into_os_string()));
        assert_eq!(get("TMPDIR"), Some(dirs.tmp.clone().into_os_string()));
        assert_eq!(get("PATH"), Some("/bin".into()));
        assert!(
            get("XDG_CONFIG_HOME").is_none()
                && get("CLAUDE_CONFIG_DIR").is_none()
                && get("ANTHROPIC_API_KEY").is_none()
        );
        assert_eq!(env.iter().filter(|(k, _)| k == "HOME").count(), 1);
    }

    #[test]
    fn run_dirs_are_private_and_removed_on_drop() {
        let dirs = create_run_dirs().unwrap();
        let (h, t) = (dirs.home.clone(), dirs.tmp.clone());
        assert!(h.is_dir() && t.is_dir());
        drop(dirs);
        assert!(!h.exists() && !t.exists());
    }

    #[test]
    fn runtime_ro_paths_never_include_system_roots_or_home() {
        let bin = tempfile::tempdir().unwrap();
        let p = bin.path().join("tool");
        std::fs::write(&p, "#!/usr/bin/env node\n").unwrap();
        let r = runtime_ro_paths(&p, OsStr::new(""));
        assert_eq!(r, vec![std::fs::canonicalize(bin.path()).unwrap()]);
        let r = runtime_ro_paths(Path::new("/usr/bin/env"), OsStr::new(""));
        assert!(r.is_empty(), "{r:?}");
    }

    #[test]
    fn keychain_only_on_macos_for_claude_without_a_credentials_file() {
        let none: Vec<PathBuf> = vec![];
        let file = vec![PathBuf::from(".claude/.credentials.json")];
        assert!(!needs_keychain(BackendKind::Codex, &none));
        assert!(!needs_keychain(BackendKind::ClaudeCode, &file));
        assert_eq!(
            needs_keychain(BackendKind::ClaudeCode, &none),
            cfg!(target_os = "macos")
        );
    }
}
