//! Phase 2: a bounded, containment-checked, local-LLM-backed agent loop that maintains ONE
//! manifest-installed bundle's own files -- `ct-agent harness run`'s implementation. Three tools
//! only (`read_file`/`write_file`/`rebuild`), no bash, no host-wide filesystem access. See
//! `agent_loop::run_task` for the entry point and the full fail-closed control flow.

pub mod agent_loop;
pub mod containment;
pub mod llm_client;
pub mod report;
pub mod tools;

pub use agent_loop::{run_task, RunOptions};
pub use report::HarnessReport;
