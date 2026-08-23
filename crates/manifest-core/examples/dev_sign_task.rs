//! Local dev tool: build and sign a `SignedTask` from env vars, print the signed JSON to stdout.
//! Mirrors dev_sign.rs's shape for `ServiceManifest` -- exists so the Phase 2 harness pipeline can
//! be tested end-to-end without a full `ct-agent` build.
//!
//! Run: `cargo run --example dev_sign_task` with the env vars below set.

use manifest_core::SignedTask;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("missing required env var {name}"))
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn decode_hex32(s: &str) -> [u8; 32] {
    assert!(s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()), "{s} is not 64 hex chars");
    let mut out = [0u8; 32];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).unwrap();
    }
    out
}

fn main() {
    let holder_key_hex = env("CT_TASK_HOLDER_KEY");
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&decode_hex32(&holder_key_hex));

    let manifest_id = decode_hex32(&env("CT_TASK_MANIFEST_ID"));
    let prompt = env("CT_TASK_PROMPT");
    let model = env("CT_TASK_MODEL");
    let max_turns: u32 = env_or("CT_TASK_MAX_TURNS", "6").parse().unwrap();
    let max_output_tokens: u64 = env_or("CT_TASK_MAX_OUTPUT_TOKENS", "2048").parse().unwrap();
    let now: u64 = env_or("CT_TASK_NOW", "0").parse().unwrap();
    let expires_in: u64 = env_or("CT_TASK_EXPIRES_IN_SECS", "3600").parse().unwrap();
    let task_id_hex = env_or("CT_TASK_ID", "0808080808080808080808080808080808080808080808080808080808080808");
    let task_id = decode_hex32(&task_id_hex[..64]);

    let task = SignedTask::sign_new(&signing_key, task_id, manifest_id, prompt, model, max_turns, max_output_tokens, now, now + expires_in);

    println!("{}", serde_json::to_string_pretty(&task).unwrap());
}
