//! `harness-memory` binary: runs the marketplace#39 shared prompt/harness-candidate memory service
//! as a real HTTP process.
//!
//! Env config (fail-loud, no silent defaults on anything security-relevant -- same discipline as
//! `registry`'s own `main.rs`):
//! - `HARNESS_MEMORY_BIND_ADDR` -- e.g. `127.0.0.1:8788`
//! - `HARNESS_MEMORY_DB_PATH` -- SQLite file path (created if absent)
//! - `HARNESS_MEMORY_WRITE_TOKEN` -- bearer token required on `POST /entries`

use harness_memory::db::Db;
use harness_memory::AppState;
use std::sync::Arc;

fn req(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| panic!("{key} required"))
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock is before the Unix epoch")
        .as_secs() as i64
}

#[tokio::main]
async fn main() {
    let bind_addr = req("HARNESS_MEMORY_BIND_ADDR");
    let db_path = req("HARNESS_MEMORY_DB_PATH");
    let write_token = req("HARNESS_MEMORY_WRITE_TOKEN");
    if write_token.trim().is_empty() {
        panic!("HARNESS_MEMORY_WRITE_TOKEN must not be blank");
    }

    let db = Db::open(&db_path).unwrap_or_else(|e| panic!("{e}"));

    let state = Arc::new(AppState { db, write_token, now: Box::new(unix_now) });

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .unwrap_or_else(|e| panic!("bind {bind_addr}: {e}"));
    eprintln!("harness-memory listening on {bind_addr} (db={db_path})");
    axum::serve(listener, harness_memory::app(state))
        .await
        .unwrap_or_else(|e| panic!("serve: {e}"));
}
