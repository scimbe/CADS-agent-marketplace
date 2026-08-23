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
