//! The structured result `harness run` prints, and the transcript entries written to
//! `<bundle_dir>/.harness-transcript.jsonl` -- "measure, don't assume" applies to what the
//! harness actually did, not just what it was asked to do.

use serde::Serialize;

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

/// Append one entry to the bundle's transcript log. Best-effort -- a transcript-write failure
/// must never abort the run itself (the run's OWN outcome, not its logging, is what matters), but
/// it IS surfaced to stderr so a silent logging failure isn't itself silent.
pub fn append_transcript(bundle_dir: &std::path::Path, entry: &TranscriptEntry) {
    let path = bundle_dir.join(".harness-transcript.jsonl");
    let line = match serde_json::to_string(entry) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("harness: failed to serialize transcript entry: {e}");
            return;
        }
    };
    use std::io::Write;
    let file = std::fs::OpenOptions::new().create(true).append(true).open(&path);
    match file {
        Ok(mut f) => {
            if let Err(e) = writeln!(f, "{line}") {
                eprintln!("harness: failed to write transcript entry to {}: {e}", path.display());
            }
        }
        Err(e) => eprintln!("harness: failed to open transcript {}: {e}", path.display()),
    }
}
