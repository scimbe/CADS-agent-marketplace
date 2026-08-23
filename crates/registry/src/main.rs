//! `registry` binary: runs the Phase 3 marketplace registry as a real HTTP process.
//!
//! Env config (fail-loud, no silent defaults on anything security-relevant -- same discipline as
//! every CLI parser elsewhere in this workspace):
//! - `REGISTRY_BIND_ADDR` -- e.g. `127.0.0.1:8787`
//! - `REGISTRY_DB_PATH` -- SQLite file path (created if absent)
//! - `REGISTRY_BUNDLES_DIR` -- directory bundles are stored under (created if absent)
//! - `REGISTRY_WRITE_TOKEN` -- bearer token required on `POST /manifests` and
//!   `POST /manifests/:id/activations`

use registry::db::Db;
use registry::AppState;
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
    let bind_addr = req("REGISTRY_BIND_ADDR");
    let db_path = req("REGISTRY_DB_PATH");
    let bundles_dir = req("REGISTRY_BUNDLES_DIR");
    let write_token = req("REGISTRY_WRITE_TOKEN");
    if write_token.trim().is_empty() {
        panic!("REGISTRY_WRITE_TOKEN must not be blank");
    }

    let db = Db::open(&db_path).unwrap_or_else(|e| panic!("{e}"));
    std::fs::create_dir_all(&bundles_dir).unwrap_or_else(|e| panic!("create REGISTRY_BUNDLES_DIR {bundles_dir}: {e}"));

    let state = Arc::new(AppState {
        db,
        bundles_dir: bundles_dir.into(),
        write_token,
        now: Box::new(unix_now),
    });

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .unwrap_or_else(|e| panic!("bind {bind_addr}: {e}"));
    eprintln!("registry listening on {bind_addr} (db={db_path})");
    axum::serve(listener, registry::app(state))
        .await
        .unwrap_or_else(|e| panic!("serve: {e}"));
}
