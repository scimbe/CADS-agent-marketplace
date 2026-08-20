//! The structured JSON result `activate` prints to stdout -- every rejection path names exactly
//! which step/rule fired (never a bare "failed"), so a caller (or a human reading the log) can
//! tell a signature rejection from a guardrail rejection from a `verify.sh` failure without
//! re-deriving it from prose.

use serde::Serialize;

#[derive(Debug, Serialize)]
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
        compose_up: StepResult,
        verify: StepResult,
    },
}

#[derive(Debug, Serialize)]
pub struct StepResult {
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
}

impl InstallReport {
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_else(|e| format!("{{\"status\":\"report_serialize_error\",\"detail\":{e:?}}}"))
    }
}
