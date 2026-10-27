//! Opt-in real-backend smoke tests (`cargo test -p harness-core --test smoke -- --ignored --nocapture`).
//! Never run in CI. Secrets are only ever referenced by file path and never printed.
#![cfg(unix)]

use harness_core::backend::{AgentBackend, AgentRequest, BackendKind};
use harness_core::report::TranscriptEntry;
use harness_core::{detect_backends, LiteLlmBackend, LocalCliBackend};
use std::time::Duration;

fn run_once(b: &dyn AgentBackend, model: &str, tokens: u64) {
    let work = tempfile::tempdir().unwrap();
    let req = AgentRequest {
        prompt: "Reply with the single word OK. Do not use any tools.",
        model,
        max_turns: 1,
        max_output_tokens: tokens,
        work_dir: work.path(),
        compose_file: "docker-compose.yml",
    };
    let mut log = Vec::new();
    let res = b.run(&req, &mut |e| log.push(e));
    let msgs: Vec<String> = log
        .iter()
        .filter_map(|e| match e {
            TranscriptEntry::ModelMessage { content, .. } => content.clone(),
            _ => None,
        })
        .collect();
    println!(
        "backend={} result={res:?} model_messages={msgs:?}",
        b.kind().id()
    );
    res.expect("smoke run failed");
}

#[test]
#[ignore]
fn real_claude_cli() {
    let d = detect_backends()
        .into_iter()
        .find(|d| d.kind == BackendKind::ClaudeCode)
        .expect("claude not installed");
    println!("detected claude {:?} at {}", d.version, d.binary.display());
    let mut b = LocalCliBackend::new(&d).unwrap();
    b.rebuild_after = false;
    b.timeout = Duration::from_secs(120);
    run_once(&b, "ignored", 200);
}

/// `HARNESS_SMOKE_OLLAMA_URL=http://127.0.0.1:11435/v1 HARNESS_SMOKE_OLLAMA_MODEL=...`
#[test]
#[ignore]
fn real_ollama_loopback() {
    let url = std::env::var("HARNESS_SMOKE_OLLAMA_URL").expect("HARNESS_SMOKE_OLLAMA_URL");
    let model = std::env::var("HARNESS_SMOKE_OLLAMA_MODEL").expect("HARNESS_SMOKE_OLLAMA_MODEL");
    run_once(&LiteLlmBackend::ollama_local(&url).unwrap(), &model, 64);
}

/// `HARNESS_SMOKE_LITELLM_URL`, `HARNESS_SMOKE_LITELLM_KEY_FILE`, `HARNESS_SMOKE_LITELLM_MODEL`.
#[test]
#[ignore]
fn real_litellm() {
    let url = std::env::var("HARNESS_SMOKE_LITELLM_URL").expect("HARNESS_SMOKE_LITELLM_URL");
    let key_file =
        std::env::var("HARNESS_SMOKE_LITELLM_KEY_FILE").expect("HARNESS_SMOKE_LITELLM_KEY_FILE");
    let model = std::env::var("HARNESS_SMOKE_LITELLM_MODEL").expect("HARNESS_SMOKE_LITELLM_MODEL");
    let key = std::fs::read_to_string(key_file)
        .unwrap()
        .trim()
        .to_string();
    run_once(&LiteLlmBackend::litellm(url, key), &model, 64);
}
