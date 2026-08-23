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

/// Resolve `relative_path` against `bundle_dir` and confirm the result is really inside it
/// (symlinks resolved). Refuses:
/// - absolute paths and any path containing `..` (rejected before even joining, same discipline
///   as `installer_engine::fetch::unpack_tar_gz_safely`'s tar-slip check),
/// - anything literally named `.env` at any depth (the installer's own secrets file -- the
///   harness must never read or overwrite it, regardless of what a task prompt asks for),
/// - a resolved path that canonicalizes outside `bundle_dir`.
pub fn resolve_in_bundle(bundle_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative_path);
    if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("'{relative_path}' is absolute or escapes the bundle directory, refusing"));
    }
    if rel.file_name().map(|n| n == ".env").unwrap_or(false) {
        return Err("refusing to touch '.env' -- that is the installer's own secrets file".to_string());
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
