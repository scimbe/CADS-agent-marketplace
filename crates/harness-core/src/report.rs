//! The structured result `harness run` prints, and the transcript entries written to
//! `<state_dir>/harness/<manifest_id>.transcript.jsonl` -- "measure, don't assume" applies to
//! what the harness actually did, not just what it was asked to do.
//!
//! The transcript lives OUTSIDE the bundle since scimbe/ct-agent#183 (phase 1): the bundle is the
//! one directory the harness's `write_file` tool may write to, so an audit record kept there was
//! rewritable by the very actions it records. `containment::resolve_in_bundle` additionally
//! refuses the old in-bundle name, so a bundle that still carries one cannot be edited by a task.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TranscriptEntry {
    ModelMessage { turn: u32, content: Option<String>, tool_call_count: usize },
    ToolCall { turn: u32, tool: String, arguments: String, result: Result<String, String> },
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum HarnessReport {
    Rejected {
        reason: String,
        task_id: Option<String>,
    },
    Ok {
        task_id: String,
        manifest_id: String,
        turns_used: u32,
        files_changed: Vec<String>,
        rebuild_ran: bool,
    },
    Failed {
        task_id: String,
        manifest_id: String,
        turns_used: u32,
        reason: String,
    },
}

impl HarnessReport {
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_else(|e| format!("{{\"status\":\"report_serialize_error\",\"detail\":{e:?}}}"))
    }
}

/// File name of the legacy in-bundle transcript (see [`append_transcript_in_bundle`]).
pub const LEGACY_IN_BUNDLE_TRANSCRIPT: &str = ".harness-transcript.jsonl";

/// Where a run's transcript lives: `<state_dir>/harness/<manifest_id>.transcript.jsonl`.
/// `state_dir` is ct-agent's own state directory (`CT_AGENT_STATE_DIR`), never the bundle.
/// `manifest_id` is expected to be the 64-hex manifest id; any character outside
/// `[A-Za-z0-9_-]` is replaced by `_` so a caller-supplied id can never turn into a path
/// component (`..`, `/`) that leaves the harness directory. Pure -- creates nothing; see
/// [`append_transcript`] for the write.
pub fn transcript_path(state_dir: &Path, manifest_id: &str) -> PathBuf {
    let safe: String = manifest_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    state_dir.join("harness").join(format!("{safe}.transcript.jsonl"))
}

/// Append one entry to the run's transcript at [`transcript_path`]`(state_dir, manifest_id)`,
/// creating `<state_dir>/harness/` (0700 on Unix) and the file (0600 on Unix) as needed.
/// Best-effort -- a transcript-write failure must never abort the run itself (the run's OWN
/// outcome, not its logging, is what matters), but it IS surfaced to stderr so a silent logging
/// failure isn't itself silent.
pub fn append_transcript(state_dir: &Path, manifest_id: &str, entry: &TranscriptEntry) {
    append_transcript_to(&transcript_path(state_dir, manifest_id), entry);
}

/// The pre-#183 behaviour: append to `<bundle_dir>/.harness-transcript.jsonl`, INSIDE the
/// writable bundle. Kept so a caller pinned to the old signature still compiles until it passes
/// a state dir; it will be removed once ct-agent has switched.
#[deprecated(
    since = "0.1.1",
    note = "writes the transcript inside the writable bundle; use `append_transcript(state_dir, manifest_id, entry)` \
            (and `run_task_with_state_dir`) so the audit record lives outside what a task can edit"
)]
pub fn append_transcript_in_bundle(bundle_dir: &Path, entry: &TranscriptEntry) {
    append_transcript_to(&bundle_dir.join(LEGACY_IN_BUNDLE_TRANSCRIPT), entry);
}

fn append_transcript_to(path: &Path, entry: &TranscriptEntry) {
    let line = match serde_json::to_string(entry) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("harness: failed to serialize transcript entry: {e}");
            return;
        }
    };
    if let Some(parent) = path.parent() {
        if let Err(e) = create_private_dir(parent) {
            eprintln!("harness: failed to create transcript dir {}: {e}", parent.display());
            return;
        }
    }
    use std::io::Write;
    match open_private_append(path) {
        Ok(mut f) => {
            if let Err(e) = writeln!(f, "{line}") {
                eprintln!("harness: failed to write transcript entry to {}: {e}", path.display());
            }
        }
        Err(e) => eprintln!("harness: failed to open transcript {}: {e}", path.display()),
    }
}

/// `create_dir_all` plus owner-only mode on Unix -- mirrors `installer_engine::activate::
/// write_env_file`'s narrow-at-create discipline for the directory the transcripts live in.
#[cfg(unix)]
fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(dir)?;
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)
}

/// Open for append, creating with mode 0600 and narrowing a pre-existing wider file, so the
/// transcript (which carries every model message and tool argument, potentially including file
/// contents a task wrote) is never readable beyond the owner.
#[cfg(unix)]
fn open_private_append(path: &Path) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let f = std::fs::OpenOptions::new().create(true).append(true).mode(0o600).open(path)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    Ok(f)
}

#[cfg(not(unix))]
fn open_private_append(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::OpenOptions::new().create(true).append(true).open(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(turn: u32) -> TranscriptEntry {
        TranscriptEntry::ModelMessage { turn, content: Some("hi".into()), tool_call_count: 0 }
    }

    #[test]
    fn transcript_path_is_under_state_dir_harness_and_never_the_bundle() {
        let p = transcript_path(Path::new("/var/lib/ct-agent"), "abc123");
        assert_eq!(p, PathBuf::from("/var/lib/ct-agent/harness/abc123.transcript.jsonl"));
    }

    #[test]
    fn transcript_path_neutralizes_a_manifest_id_that_looks_like_a_path() {
        let p = transcript_path(Path::new("/state"), "../../etc/passwd");
        assert!(p.starts_with("/state/harness"), "{p:?}");
        assert!(!p.to_string_lossy().contains(".."), "{p:?}");
        assert!(!p.to_string_lossy().contains("passwd/"), "{p:?}");
    }

    /// scimbe/ct-agent#183 phase 1: the transcript lands OUTSIDE the bundle, owner-only.
    #[test]
    fn append_transcript_writes_outside_the_bundle_with_owner_only_permissions() {
        let bundle = tempfile::tempdir().unwrap();
        let state = tempfile::tempdir().unwrap();
        let manifest_id = "42".repeat(32);

        append_transcript(state.path(), &manifest_id, &entry(0));
        append_transcript(state.path(), &manifest_id, &entry(1));

        let path = transcript_path(state.path(), &manifest_id);
        assert!(path.exists(), "{path:?}");
        assert!(!path.starts_with(bundle.path()));
        assert!(
            !bundle.path().join(LEGACY_IN_BUNDLE_TRANSCRIPT).exists(),
            "nothing may be written into the bundle any more"
        );
        let lines: Vec<String> = std::fs::read_to_string(&path).unwrap().lines().map(str::to_string).collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("\"turn\":0"));
        assert!(lines[1].contains("\"turn\":1"));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "transcript must be owner-only, got {mode:o}");
            let dir_mode = std::fs::metadata(path.parent().unwrap()).unwrap().permissions().mode() & 0o777;
            assert_eq!(dir_mode, 0o700, "harness dir must be owner-only, got {dir_mode:o}");
        }
    }

    #[test]
    #[cfg(unix)]
    fn append_transcript_narrows_a_pre_existing_wider_file() {
        use std::os::unix::fs::PermissionsExt;
        let state = tempfile::tempdir().unwrap();
        let path = transcript_path(state.path(), "m");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "stale\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();

        append_transcript(state.path(), "m", &entry(7));

        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "got {mode:o}");
        assert_eq!(std::fs::read_to_string(&path).unwrap().lines().count(), 2, "appended, not truncated");
    }

    #[test]
    #[allow(deprecated)]
    fn the_deprecated_in_bundle_wrapper_still_writes_the_legacy_location() {
        let bundle = tempfile::tempdir().unwrap();
        append_transcript_in_bundle(bundle.path(), &entry(0));
        assert!(bundle.path().join(LEGACY_IN_BUNDLE_TRANSCRIPT).exists());
    }
}
