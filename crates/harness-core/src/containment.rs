//! Path containment for the harness's file tools.
//!
//! Deliberately NOT a reuse of `installer_engine::guardrails`'s lexical `normalize` -- that
//! function is correct for ITS use case (scanning a compose file before the bundle directory
//! necessarily exists on disk, so there's nothing to canonicalize yet), but wrong for this one:
//! by the time the harness runs, `bundle_dir` is a real, already-unpacked directory tree, so a
//! malicious or buggy bundle could plant a symlink pointing outside it -- a purely lexical check
//! would not catch that. This module resolves symlinks for real (`fs::canonicalize`) before the
//! containment check, which is the stronger, correct tool for a live filesystem.

use std::path::{Path, PathBuf};

/// File names the harness must never read or write, at any depth inside the bundle, regardless
/// of what a task prompt asks for:
/// - `.env`: the installer's own resolved secrets file;
/// - `.ct-agent-activation.json`: ct-agent's activation marker (#165) -- the record the harness's
///   own freshness check trusts, so a task must not be able to forge or refresh it;
/// - `.harness-transcript.jsonl`: the legacy in-bundle transcript location
///   (`report::append_transcript_in_bundle`) -- audit data a task must not be able to rewrite.
///   The transcript now lives outside the bundle (`report::transcript_path`); this entry keeps
///   the old location protected on bundles that still carry one.
pub const PROTECTED_FILE_NAMES: [&str; 3] = [".env", ".ct-agent-activation.json", ".harness-transcript.jsonl"];

/// Resolve `relative_path` against `bundle_dir` and confirm the result is really inside it
/// (symlinks resolved). Refuses:
/// - absolute paths and any path containing `..` (rejected before even joining, same discipline
///   as `installer_engine::fetch::unpack_tar_gz_safely`'s tar-slip check),
/// - any component named like one of [`PROTECTED_FILE_NAMES`], at any depth,
/// - a resolved path that canonicalizes outside `bundle_dir`.
pub fn resolve_in_bundle(bundle_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative_path);
    if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("'{relative_path}' is absolute or escapes the bundle directory, refusing"));
    }
    if let Some(protected) = protected_component(rel) {
        return Err(format!(
            "refusing to touch '{protected}' (in '{relative_path}') -- that file belongs to the installer/ct-agent, \
             never to a task"
        ));
    }
    let bundle_canon = std::fs::canonicalize(bundle_dir)
        .map_err(|e| format!("resolve bundle_dir {}: {e}", bundle_dir.display()))?;
    let joined = bundle_dir.join(rel);

    // The target file may not exist yet (a `write_file` creating a new file) -- canonicalize
    // its PARENT instead in that case, then re-join the final component, so containment is still
    // checked against a real, symlink-resolved path rather than skipped for new files.
    if joined.exists() {
        let target_canon =
            std::fs::canonicalize(&joined).map_err(|e| format!("resolve {}: {e}", joined.display()))?;
        if !target_canon.starts_with(&bundle_canon) {
            return Err(format!("'{relative_path}' resolves outside the bundle directory, refusing"));
        }
        Ok(target_canon)
    } else {
        let parent = joined.parent().ok_or_else(|| format!("'{relative_path}' has no parent"))?;
        std::fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
        let parent_canon =
            std::fs::canonicalize(parent).map_err(|e| format!("resolve {}: {e}", parent.display()))?;
        if !parent_canon.starts_with(&bundle_canon) {
            return Err(format!("'{relative_path}' resolves outside the bundle directory, refusing"));
        }
        let file_name = joined.file_name().ok_or_else(|| format!("'{relative_path}' has no file name"))?;
        Ok(parent_canon.join(file_name))
    }
}

/// The first path component (at any depth) whose name is one of [`PROTECTED_FILE_NAMES`].
fn protected_component(rel: &Path) -> Option<&'static str> {
    rel.components().find_map(|c| {
        let name = c.as_os_str().to_str()?;
        PROTECTED_FILE_NAMES.iter().copied().find(|p| *p == name)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_relative_path_inside_the_bundle_resolves() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("app.py"), "x").unwrap();
        let resolved = resolve_in_bundle(dir.path(), "app.py").unwrap();
        assert!(resolved.starts_with(std::fs::canonicalize(dir.path()).unwrap()));
    }

    #[test]
    fn a_new_file_in_a_new_subdir_still_resolves_inside() {
        let dir = tempfile::tempdir().unwrap();
        let resolved = resolve_in_bundle(dir.path(), "sub/new.py").unwrap();
        assert!(resolved.starts_with(std::fs::canonicalize(dir.path()).unwrap()));
        assert_eq!(resolved.file_name().unwrap(), "new.py");
    }

    #[test]
    fn dot_dot_traversal_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve_in_bundle(dir.path(), "../../etc/passwd").is_err());
    }

    #[test]
    fn absolute_path_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve_in_bundle(dir.path(), "/etc/passwd").is_err());
    }

    #[test]
    fn dot_env_is_always_refused_even_though_it_is_inside_the_bundle() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".env"), "SECRET=x").unwrap();
        assert!(resolve_in_bundle(dir.path(), ".env").is_err());
    }

    /// scimbe/ct-agent#183 phase 1: the activation marker and the (legacy) in-bundle transcript
    /// are audit/trust records the harness itself relies on -- a task must never read or rewrite
    /// them, whether they exist yet or not, at the bundle root or nested.
    #[test]
    fn the_activation_marker_and_transcript_are_refused_at_any_depth_existing_or_not() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".ct-agent-activation.json"), "{}").unwrap();
        for rel in [
            ".ct-agent-activation.json",
            ".harness-transcript.jsonl",
            "sub/.ct-agent-activation.json",
            "sub/deeper/.harness-transcript.jsonl",
            "sub/.env",
        ] {
            let err = resolve_in_bundle(dir.path(), rel).unwrap_err();
            assert!(err.contains("refusing to touch"), "{rel}: {err}");
        }
        // And a look-alike that is NOT the protected name still resolves (no over-matching).
        assert!(resolve_in_bundle(dir.path(), "notes/activation.json").is_ok());
        assert!(resolve_in_bundle(dir.path(), "env").is_ok());
    }

    #[test]
    fn a_symlink_escaping_the_bundle_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "outside").unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(outside.path().join("secret.txt"), dir.path().join("link.txt")).unwrap();
            assert!(resolve_in_bundle(dir.path(), "link.txt").is_err());
        }
    }
}
