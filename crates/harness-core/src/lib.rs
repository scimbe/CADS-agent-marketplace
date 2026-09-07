//! Phase 2: a bounded, containment-checked, local-LLM-backed agent loop that maintains ONE
//! manifest-installed bundle's own files -- `ct-agent harness run`'s implementation. Three tools
//! only (`read_file`/`write_file`/`rebuild`), no bash, no host-wide filesystem access. See
//! `agent_loop::run_task_with_state_dir` for the entry point and the full fail-closed control
//! flow (`run_task` is the deprecated pre-scimbe/ct-agent#183 entry point that keeps the
//! transcript inside the bundle).

pub mod agent_loop;
pub mod containment;
pub mod llm_client;
pub mod report;
pub mod tools;

#[allow(deprecated)]
pub use agent_loop::run_task;
pub use agent_loop::{run_task_with_state_dir, RunOptions};
pub use report::{transcript_path, HarnessReport};
