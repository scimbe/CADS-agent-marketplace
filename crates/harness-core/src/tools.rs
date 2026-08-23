//! The harness's ENTIRE tool surface: `read_file`, `write_file`, `rebuild`. No bash, no arbitrary
//! command execution -- these three functions are the whole attack surface a `SignedTask` can
//! reach through, and every one of them is containment-checked against the bundle directory.

use crate::containment::resolve_in_bundle;
use installer_engine::process::run_bounded;
use std::path::Path;
use std::time::Duration;

/// Same order of magnitude as `installer_engine::fetch`'s `MAX_FETCH_BYTES` discipline (F.12) --
/// a bundle's source files are never legitimately this large; a cap here is cheap insurance
/// against a runaway model dumping enormous content into a single write.
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024; // 4 MiB

const REBUILD_TIMEOUT: Duration = Duration::from_secs(300);

pub fn read_file(bundle_dir: &Path, relative_path: &str) -> Result<String, String> {
    let target = resolve_in_bundle(bundle_dir, relative_path)?;
    let meta = std::fs::metadata(&target).map_err(|e| format!("stat {relative_path}: {e}"))?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("{relative_path} is {} bytes, over the {MAX_FILE_BYTES}-byte read cap", meta.len()));
    }
    std::fs::read_to_string(&target).map_err(|e| format!("read {relative_path}: {e}"))
}

pub fn write_file(bundle_dir: &Path, relative_path: &str, content: &str) -> Result<(), String> {
    if content.len() as u64 > MAX_FILE_BYTES {
        return Err(format!("refusing to write {relative_path}: {} bytes exceeds the {MAX_FILE_BYTES}-byte cap", content.len()));
    }
    let target = resolve_in_bundle(bundle_dir, relative_path)?;
    std::fs::write(&target, content).map_err(|e| format!("write {relative_path}: {e}"))
}

/// Runs `docker compose -f <compose_file> build` scoped to `bundle_dir` -- never `up`, never
/// `down`. Same process-group-kill-on-timeout discipline as everywhere else in this codebase
/// (`installer_engine::process::run_bounded`, itself copying `ct-agent`'s
/// `run_service_handler_with_timeout`, #183) -- never a bare `Command::new`.
pub fn rebuild(bundle_dir: &Path, compose_file: &str) -> Result<String, String> {
    let outcome = run_bounded("docker", &["compose", "-f", compose_file, "build"], bundle_dir, &[], REBUILD_TIMEOUT)?;
    if outcome.timed_out {
        return Err(format!("rebuild timed out after {}s", REBUILD_TIMEOUT.as_secs()));
    }
    if outcome.exit_code != Some(0) {
        return Err(format!("rebuild exited {:?}: {}", outcome.exit_code, outcome.stderr));
    }
    Ok(outcome.stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_then_write_round_trips_inside_the_bundle() {
        let dir = tempfile::tempdir().unwrap();
        write_file(dir.path(), "app.py", "print('hi')").unwrap();
        assert_eq!(read_file(dir.path(), "app.py").unwrap(), "print('hi')");
    }

    #[test]
    fn write_refuses_to_touch_dot_env() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write_file(dir.path(), ".env", "SECRET=leak").is_err());
    }

    #[test]
    fn read_refuses_a_path_escaping_the_bundle() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_file(dir.path(), "../../etc/passwd").is_err());
    }

    #[test]
    fn write_refuses_oversized_content() {
        let dir = tempfile::tempdir().unwrap();
        let huge = "a".repeat((MAX_FILE_BYTES + 1) as usize);
        assert!(write_file(dir.path(), "big.txt", &huge).is_err());
    }
}
