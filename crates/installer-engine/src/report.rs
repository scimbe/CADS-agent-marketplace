//! The structured JSON result `activate` prints to stdout -- every rejection path names exactly
//! which step/rule fired (never a bare "failed"), so a caller (or a human reading the log) can
//! tell a signature rejection from a guardrail rejection from a `verify.sh` failure without
//! re-deriving it from prose.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum InstallReport {
    Rejected {
        reason: String,
        manifest_id: Option<String>,
    },
    Failed {
        manifest_id: String,
        publisher_pubkey: String,
        project_name: String,
        step: String,
        detail: String,
    },
    Ok {
        manifest_id: String,
        publisher_pubkey: String,
        project_name: String,
        /// `docker compose up` for [`manifest_core::InstallerKind::Compose`], the executable's
        /// own run for [`manifest_core::InstallerKind::Binary`] -- one field, same as the pipeline
        /// stage it represents is one step regardless of kind.
        compose_up: StepResult,
        verify: StepResult,
        /// Binary kind only: the executable's captured stdout, so a caller can confirm it
        /// actually did what the manifest claims rather than trusting an exit code alone.
        /// Always `None` for Compose (its stdout is `docker compose`'s own, not the service's).
        captured_stdout: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct StepResult {
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
}

impl InstallReport {
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_else(|e| format!("{{\"status\":\"report_serialize_error\",\"detail\":{e:?}}}"))
    }
}
