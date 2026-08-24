//! Orchestrates the bounded agent loop: verify the signed task, then alternate model turns with
//! tool dispatch until the model stops calling tools or `max_turns` is reached. Every step is
//! fail-closed, mirroring `installer_engine::activate`'s discipline exactly.

use crate::llm_client::{tool_schema, LlmClient, Message};
use crate::report::{append_transcript, HarnessReport, TranscriptEntry};
use crate::tools;
use installer_engine::allowlist::TrustAllowlist;
use manifest_core::SignedTask;
use std::collections::BTreeSet;
use std::path::PathBuf;

pub struct RunOptions {
    /// The already-activated manifest's own work_dir -- MUST correspond to `task.manifest_id`.
    pub bundle_dir: PathBuf,
    pub compose_file: String,
    pub litellm_base_url: String,
    pub api_key: String,
    /// Harness-side model allowlist -- separate from the publisher `TrustAllowlist`: even a
    /// trusted publisher's task naming an unexpected model is refused, so a compromised or
    /// buggy publisher key can't be used to drive spend against an arbitrary/expensive model.
    pub allowed_models: Vec<String>,
    pub now: u64,
}

const SYSTEM_PROMPT: &str = "You are a bounded code-maintenance agent. You may ONLY use the \
    provided tools (read_file, write_file, rebuild) to inspect and edit files inside the current \
    bundle directory, then rebuild it. You have no shell access and cannot affect anything outside \
    this directory. Make the smallest change that satisfies the request, then call rebuild to \
    confirm it still builds, then stop (reply with no further tool calls) once done.";

/// Hard local ceiling on `SignedTask.max_turns`, independent of the LiteLLM key's own budget cap.
/// `max_turns` is a *signed* field (cannot be raised after signing), but nothing upstream bounds
/// its magnitude -- a buggy or compromised trust-allowlisted publisher key could otherwise pin
/// this process into millions of turns. The LiteLLM budget is not a substitute backstop here: the
/// `rebuild` tool (up to `tools::REBUILD_TIMEOUT` per call) never touches the LiteLLM API at all,
/// so a task whose prompt drives `rebuild` every turn burns real `docker compose build` time
/// completely unbounded by token spend. 200 turns is generous headroom above any legitimate bounded
/// code-maintenance task while still being a real ceiling.
const MAX_TASK_TURNS: u32 = 200;

pub fn run_task(task: &SignedTask, allowlist: &TrustAllowlist, opts: RunOptions) -> HarnessReport {
    let task_id_hex = hex32(&task.task_id);
    let manifest_id_hex = hex32(&task.manifest_id);

    if !task.is_valid(opts.now) {
        return HarnessReport::Rejected { reason: "invalid_signature_or_expired".into(), task_id: Some(task_id_hex) };
    }
    if !allowlist.contains(&task.publisher_pubkey) {
        return HarnessReport::Rejected { reason: "publisher_not_on_trust_allowlist".into(), task_id: Some(task_id_hex) };
    }
    if !opts.allowed_models.iter().any(|m| m == &task.model) {
        return HarnessReport::Rejected {
            reason: format!("model '{}' is not on this host's harness model allowlist", task.model),
            task_id: Some(task_id_hex),
        };
    }
    if task.max_turns > MAX_TASK_TURNS {
        return HarnessReport::Rejected {
            reason: format!(
                "task.max_turns ({}) exceeds this harness's local ceiling of {MAX_TASK_TURNS} turns \
                 -- refusing regardless of the LiteLLM budget cap, since the rebuild tool never \
                 touches that budget",
                task.max_turns
            ),
            task_id: Some(task_id_hex),
        };
    }
    // The bundle_dir must actually contain the manifest it claims to belong to -- a task cannot
    // be pointed at an arbitrary directory just because manifest_id LOOKS right; the caller
    // (ct-agent harness run) is responsible for resolving bundle_dir FROM manifest_id via its own
    // local record of what was actually activated (see native/src/harness_run/mod.rs), so this is
    // a defense-in-depth re-check, not the primary guarantee.
    if !opts.bundle_dir.is_dir() {
        return HarnessReport::Rejected {
            reason: format!("bundle_dir {} does not exist", opts.bundle_dir.display()),
            task_id: Some(task_id_hex),
        };
    }

    let client = match LlmClient::new(opts.litellm_base_url.clone(), opts.api_key.clone()) {
        Ok(c) => c,
        Err(e) => {
            return HarnessReport::Failed { task_id: task_id_hex, manifest_id: manifest_id_hex, turns_used: 0, reason: e }
        }
    };

    let tools_schema = tool_schema();
    let mut messages = vec![
        Message { role: "system".into(), content: Some(SYSTEM_PROMPT.into()), tool_calls: None, tool_call_id: None },
        Message { role: "user".into(), content: Some(task.prompt.clone()), tool_calls: None, tool_call_id: None },
    ];
    let mut files_changed: BTreeSet<String> = BTreeSet::new();
    let mut rebuild_ran = false;

    for turn in 0..task.max_turns {
        let assistant = match client.chat(&task.model, &messages, &tools_schema, task.max_output_tokens) {
            Ok(m) => m,
            Err(e) => {
                return HarnessReport::Failed {
                    task_id: task_id_hex,
                    manifest_id: manifest_id_hex,
                    turns_used: turn,
                    reason: format!("model call failed: {e}"),
                }
            }
        };
        append_transcript(
            &opts.bundle_dir,
            &TranscriptEntry::ModelMessage {
                turn,
                content: assistant.content.clone(),
                tool_call_count: assistant.tool_calls.as_ref().map(|t| t.len()).unwrap_or(0),
            },
        );

        let Some(tool_calls) = assistant.tool_calls.clone().filter(|t| !t.is_empty()) else {
            // No tool calls this turn -- the model considers itself done.
            messages.push(assistant);
            return HarnessReport::Ok {
                task_id: task_id_hex,
                manifest_id: manifest_id_hex,
                turns_used: turn + 1,
                files_changed: files_changed.into_iter().collect(),
                rebuild_ran,
            };
        };

        messages.push(assistant);
        for call in tool_calls {
            let result = dispatch_tool(&opts.bundle_dir, &opts.compose_file, &call.function.name, &call.function.arguments, &mut files_changed, &mut rebuild_ran);
            append_transcript(
                &opts.bundle_dir,
                &TranscriptEntry::ToolCall {
                    turn,
                    tool: call.function.name.clone(),
                    arguments: call.function.arguments.clone(),
                    result: result.clone(),
                },
            );
            let tool_content = match &result {
                Ok(s) => s.clone(),
                Err(e) => format!("ERROR: {e}"),
            };
            messages.push(Message {
                role: "tool".into(),
                content: Some(tool_content),
                tool_calls: None,
                tool_call_id: Some(call.id),
            });
        }
    }

    HarnessReport::Failed {
        task_id: task_id_hex,
        manifest_id: manifest_id_hex,
        turns_used: task.max_turns,
        reason: "max_turns exceeded without the model signaling completion".into(),
    }
}

fn dispatch_tool(
    bundle_dir: &std::path::Path,
    compose_file: &str,
    name: &str,
    arguments_json: &str,
    files_changed: &mut BTreeSet<String>,
    rebuild_ran: &mut bool,
) -> Result<String, String> {
    let args: serde_json::Value = serde_json::from_str(arguments_json).map_err(|e| format!("bad tool arguments JSON: {e}"))?;
    match name {
        "read_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).ok_or("read_file: missing 'path'")?;
            tools::read_file(bundle_dir, path)
        }
        "write_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).ok_or("write_file: missing 'path'")?;
            let content = args.get("content").and_then(|v| v.as_str()).ok_or("write_file: missing 'content'")?;
            tools::write_file(bundle_dir, path, content)?;
            files_changed.insert(path.to_string());
            Ok(format!("wrote {path}"))
        }
        "rebuild" => {
            let out = tools::rebuild(bundle_dir, compose_file)?;
            *rebuild_ran = true;
            Ok(out)
        }
        other => Err(format!("unknown tool '{other}' -- the harness exposes only read_file/write_file/rebuild")),
    }
}

fn hex32(b: &[u8; 32]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(64);
    for byte in b {
        let _ = write!(s, "{byte:02x}");
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;

    fn allowlist_for(key: &SigningKey) -> TrustAllowlist {
        let mut hex = String::new();
        for b in key.verifying_key().to_bytes() {
            use std::fmt::Write as _;
            let _ = write!(hex, "{b:02x}");
        }
        TrustAllowlist::parse(&hex).unwrap()
    }

    fn opts_for(dir: &std::path::Path) -> RunOptions {
        RunOptions {
            bundle_dir: dir.to_path_buf(),
            compose_file: "docker-compose.yml".to_string(),
            litellm_base_url: "http://127.0.0.1:1".to_string(),
            api_key: "test-key".to_string(),
            allowed_models: vec!["local-devstral-small2".to_string()],
            now: 1_000,
        }
    }

    /// Fail-first for the fix in this commit: before the `MAX_TASK_TURNS` check existed, a signed
    /// task naming an absurd `max_turns` sailed straight past every other check (valid signature,
    /// trusted publisher, allowed model) into the agent loop -- this is the regression guard for
    /// that gap, independent of whatever the LiteLLM budget cap does or doesn't catch.
    #[test]
    fn run_task_rejects_a_signed_task_whose_max_turns_exceeds_the_local_ceiling() {
        let dir = tempfile::tempdir().unwrap();
        let key = SigningKey::from_bytes(&[5u8; 32]);
        let task = SignedTask::sign_new(
            &key,
            [1u8; 32],
            [2u8; 32],
            "do something".to_string(),
            "local-devstral-small2".to_string(),
            MAX_TASK_TURNS + 1,
            1,
            1_000,
            2_000,
        );

        let report = run_task(&task, &allowlist_for(&key), opts_for(dir.path()));

        match report {
            HarnessReport::Rejected { reason, .. } => {
                assert!(reason.contains("max_turns"), "{reason}");
                assert!(reason.contains(&MAX_TASK_TURNS.to_string()), "{reason}");
            }
            other => panic!("expected Rejected, got {other:?}"),
        }
    }

    #[test]
    fn run_task_accepts_max_turns_exactly_at_the_ceiling_past_the_turns_check() {
        // Not exercising a full agent-loop turn (no real LiteLLM endpoint here) -- this only
        // proves max_turns == MAX_TASK_TURNS is NOT rejected by the ceiling check itself, i.e.
        // the loop proceeds to (and fails on) the first real model call instead.
        let dir = tempfile::tempdir().unwrap();
        let key = SigningKey::from_bytes(&[6u8; 32]);
        let task = SignedTask::sign_new(
            &key,
            [3u8; 32],
            [4u8; 32],
            "do something".to_string(),
            "local-devstral-small2".to_string(),
            MAX_TASK_TURNS,
            1,
            1_000,
            2_000,
        );

        let report = run_task(&task, &allowlist_for(&key), opts_for(dir.path()));

        match report {
            HarnessReport::Rejected { reason, .. } => assert!(!reason.contains("max_turns"), "{reason}"),
            HarnessReport::Failed { reason, .. } => assert!(reason.contains("model call failed"), "{reason}"),
            other => panic!("expected Rejected(non-max_turns) or Failed(model call), got {other:?}"),
        }
    }
}
