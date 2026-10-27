//! The agent-backend abstraction: WHO executes the bounded task prompt.
//!
//! Two families, same bounds (`max_turns`, working-dir confinement, transcript, report types):
//!
//! * [`crate::agent_loop::LiteLlmBackend`] -- the original behaviour: the harness itself drives
//!   an OpenAI-compatible `/chat/completions` endpoint (operator LiteLLM, or a loopback Ollama)
//!   with its three tools `read_file`/`write_file`/`rebuild`.
//! * [`crate::local_cli::LocalCliBackend`] -- "bring your own agent subscription": launches an
//!   agent CLI the customer installed and logged in on their own machine. Credentials stay
//!   inside that CLI's own login; the harness never reads, copies or forwards them, and nothing
//!   is sent to the platform. See `docs/byo-agent-backend.md`.

use crate::report::TranscriptEntry;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::Duration;

/// Which backend executes the task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BackendKind {
    LiteLlm,
    ClaudeCode,
    Codex,
    Gemini,
    Ollama,
}

/// How far a backend's integration has been verified.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Maturity {
    /// Flags checked against the installed CLI AND exercised end to end.
    Supported,
    /// Flags taken from the CLI's `--help`/docs but not (fully) exercised end to end, or a
    /// guarantee (e.g. a turn limit) is not available. Never chosen by `auto`.
    Experimental,
}

impl BackendKind {
    pub const ALL: [BackendKind; 5] = [
        BackendKind::LiteLlm,
        BackendKind::ClaudeCode,
        BackendKind::Codex,
        BackendKind::Gemini,
        BackendKind::Ollama,
    ];

    /// Stable id, as accepted by `CT_HARNESS_BACKEND`.
    pub fn id(self) -> &'static str {
        match self {
            BackendKind::LiteLlm => "litellm",
            BackendKind::ClaudeCode => "claude",
            BackendKind::Codex => "codex",
            BackendKind::Gemini => "gemini",
            BackendKind::Ollama => "ollama",
        }
    }

    pub fn parse(s: &str) -> Option<BackendKind> {
        BackendKind::ALL
            .into_iter()
            .find(|k| k.id() == s.trim().to_ascii_lowercase())
    }

    /// Executable looked up on `PATH` for the CLI-based kinds.
    pub fn binary_name(self) -> Option<&'static str> {
        match self {
            BackendKind::LiteLlm => None,
            BackendKind::ClaudeCode => Some("claude"),
            BackendKind::Codex => Some("codex"),
            BackendKind::Gemini => Some("gemini"),
            BackendKind::Ollama => Some("ollama"),
        }
    }

    pub fn maturity(self) -> Maturity {
        match self {
            BackendKind::LiteLlm | BackendKind::ClaudeCode => Maturity::Supported,
            BackendKind::Codex | BackendKind::Gemini | BackendKind::Ollama => {
                Maturity::Experimental
            }
        }
    }

    /// Whether `SignedTask.model` is sent to the backend and therefore subject to the harness
    /// model allowlist. The agent CLIs choose their own model from the customer's login, so the
    /// publisher/operator model name is meaningless to them (and the quota is the customer's own).
    pub fn enforces_task_model(self) -> bool {
        matches!(self, BackendKind::LiteLlm | BackendKind::Ollama)
    }
}

/// Digests tying a rendered prompt to where it came from. The harness hashes the prompt itself;
/// a template renderer (manifest-core `PromptTemplate::render`) supplies the other two.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromptProvenance {
    /// `"signed_task"` or `"prompt_template"`.
    pub source: String,
    pub template_digest: Option<String>,
    pub inputs_digest: Option<String>,
}

impl PromptProvenance {
    pub fn signed_task() -> Self {
        Self {
            source: "signed_task".into(),
            template_digest: None,
            inputs_digest: None,
        }
    }
}

pub fn sha256_hex(data: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(64);
    for b in Sha256::digest(data) {
        let _ = write!(s, "{b:02x}");
    }
    s
}

/// Everything a backend needs for one run; all bounds already validated by the caller.
pub struct AgentRequest<'a> {
    pub prompt: &'a str,
    /// `SignedTask.model` (LiteLLM model name); ignored by the agent CLIs.
    pub model: &'a str,
    pub max_turns: u32,
    pub max_output_tokens: u64,
    /// The sandboxed bundle directory: cwd of a CLI, root of the file tools.
    pub work_dir: &'a Path,
    pub compose_file: &'a str,
}

#[derive(Debug)]
pub struct AgentSuccess {
    pub turns_used: u32,
    pub files_changed: Vec<String>,
    pub rebuild_ran: bool,
}

#[derive(Debug)]
pub struct AgentFailure {
    pub turns_used: u32,
    pub reason: String,
}

/// Receives transcript entries as the run progresses.
pub type TranscriptFn<'a> = dyn FnMut(TranscriptEntry) + 'a;

pub trait AgentBackend {
    fn kind(&self) -> BackendKind;
    fn run(
        &self,
        req: &AgentRequest<'_>,
        record: &mut TranscriptFn<'_>,
    ) -> Result<AgentSuccess, AgentFailure>;
}

/// An agent CLI found on this machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedBackend {
    pub kind: BackendKind,
    pub binary: std::path::PathBuf,
    pub version: Option<String>,
    pub maturity: Maturity,
}

/// Preference order for `auto`: first installed [`Maturity::Supported`] CLI.
pub fn pick_auto(detected: &[DetectedBackend]) -> Option<&DetectedBackend> {
    [BackendKind::ClaudeCode].iter().find_map(|k| {
        detected
            .iter()
            .find(|d| d.kind == *k && d.maturity == Maturity::Supported)
    })
}

pub(crate) const VERSION_PROBE_TIMEOUT: Duration = Duration::from_secs(5);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_ids_round_trip() {
        for k in BackendKind::ALL {
            assert_eq!(BackendKind::parse(k.id()), Some(k));
        }
        assert_eq!(
            BackendKind::parse(" Claude "),
            Some(BackendKind::ClaudeCode)
        );
        assert_eq!(BackendKind::parse("auto"), None);
    }

    #[test]
    fn auto_never_picks_experimental() {
        let d = |kind| DetectedBackend {
            kind,
            binary: "/x".into(),
            version: None,
            maturity: kind.maturity(),
        };
        assert!(pick_auto(&[d(BackendKind::Codex), d(BackendKind::Gemini)]).is_none());
        assert_eq!(
            pick_auto(&[d(BackendKind::Codex), d(BackendKind::ClaudeCode)])
                .unwrap()
                .kind,
            BackendKind::ClaudeCode
        );
    }
}
