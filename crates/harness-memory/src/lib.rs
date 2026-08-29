//! marketplace#39: a shared backbone service (same role as `temporal-poc` plays for reliability)
//! storing and retrieving past prompt+harness-candidate attempts by embedding similarity, so other
//! demos in the portfolio can be informed by what has/hasn't worked before instead of every
//! generation starting cold.
//!
//! **This is internal maintainer-team infrastructure, not a redistributable end-user manifest** --
//! unlike #33 (distributed RAG), which has a hard "no external dependency" requirement because
//! anyone must be able to install it standalone, this service is meant to be called BY other
//! demos' own processes over HTTP, and is allowed to depend on this operator's own infrastructure
//! (e.g. an `embed_text` channel service) for computing the embedding it's given -- this service
//! itself does not compute embeddings, callers supply `task_embedding` already computed.
//!
//! Write endpoint (`POST /entries`) requires `Authorization: Bearer <HARNESS_MEMORY_WRITE_TOKEN>`
//! -- same reasoning as `registry`'s own write auth (an unauthenticated store would let anyone
//! poison the corpus). `POST /search` is unauthenticated on purpose -- every consuming demo needs
//! to read without holding a write credential, same asymmetry as the registry's read endpoints.

pub mod db;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use db::{Db, Entry};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub struct AppState {
    pub db: Db,
    pub write_token: String,
    /// Injected so tests can pin a deterministic clock; production wiring always passes the real
    /// wall clock.
    pub now: Box<dyn Fn() -> i64 + Send + Sync>,
}

pub fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/entries", post(create_entry))
        .route("/search", post(search))
        .with_state(state)
}

fn err(status: StatusCode, msg: impl Into<String>) -> Response {
    (status, Json(serde_json::json!({ "error": msg.into() }))).into_response()
}

fn require_write_auth(state: &AppState, headers: &HeaderMap) -> Result<(), Response> {
    let got = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    match got {
        Some(t) if t == state.write_token => Ok(()),
        _ => Err(err(StatusCode::UNAUTHORIZED, "missing or invalid Authorization: Bearer <HARNESS_MEMORY_WRITE_TOKEN>")),
    }
}

#[derive(Deserialize)]
struct CreateEntryRequest {
    prompt: String,
    harness_config: serde_json::Value,
    quality_score: f64,
    outcome: String,
    task_embedding: Vec<f32>,
}

#[derive(Serialize)]
struct CreateEntryResponse {
    id: i64,
}

async fn create_entry(State(state): State<Arc<AppState>>, headers: HeaderMap, Json(body): Json<CreateEntryRequest>) -> Response {
    if let Err(r) = require_write_auth(&state, &headers) {
        return r;
    }
    if !(0.0..=1.0).contains(&body.quality_score) {
        return err(StatusCode::BAD_REQUEST, "quality_score must be between 0.0 and 1.0");
    }
    let entry = Entry {
        prompt: body.prompt,
        harness_config: body.harness_config,
        quality_score: body.quality_score,
        outcome: body.outcome,
        task_embedding: body.task_embedding,
    };
    let now = (state.now)();
    match state.db.insert_entry(&entry, now) {
        Ok(id) => (StatusCode::CREATED, Json(CreateEntryResponse { id })).into_response(),
        Err(e) if e.contains("must not be empty") => err(StatusCode::BAD_REQUEST, e),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Deserialize)]
struct SearchRequest {
    task_embedding: Vec<f32>,
    #[serde(default = "default_top_k")]
    top_k: usize,
}

fn default_top_k() -> usize {
    10
}

/// Hard ceiling regardless of what a caller requests -- a `top_k` of, say, 1_000_000 shouldn't be
/// able to force this service into serializing its entire corpus in one response.
const MAX_TOP_K: usize = 100;

async fn search(State(state): State<Arc<AppState>>, Json(body): Json<SearchRequest>) -> Response {
    if body.task_embedding.is_empty() {
        return err(StatusCode::BAD_REQUEST, "task_embedding must not be empty");
    }
    let top_k = body.top_k.min(MAX_TOP_K);
    match state.db.search(&body.task_embedding, top_k) {
        Ok(results) => Json(results).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn test_state(now: i64) -> Arc<AppState> {
        Arc::new(AppState { db: Db::open_in_memory(), write_token: "test-token".to_string(), now: Box::new(move || now) })
    }

    async fn post_json(state: Arc<AppState>, path: &str, auth: Option<&str>, body: serde_json::Value) -> Response {
        let mut req = Request::post(path).header("content-type", "application/json");
        if let Some(token) = auth {
            req = req.header("authorization", format!("Bearer {token}"));
        }
        app(state).oneshot(req.body(Body::from(body.to_string())).unwrap()).await.unwrap()
    }

    #[tokio::test]
    async fn create_then_search_round_trips() {
        let state = test_state(1_000);
        let resp = post_json(
            state.clone(),
            "/entries",
            Some("test-token"),
            serde_json::json!({
                "prompt": "explain zero-trust tunnels",
                "harness_config": {"tool": "text_generation", "model": "local-devstral-small2"},
                "quality_score": 0.85,
                "outcome": "accepted by reviewer on first pass",
                "task_embedding": [1.0, 0.0, 0.0]
            }),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::CREATED);

        let search_resp = post_json(state, "/search", None, serde_json::json!({"task_embedding": [1.0, 0.0, 0.0], "top_k": 5})).await;
        assert_eq!(search_resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(search_resp.into_body(), usize::MAX).await.unwrap();
        let results: Vec<db::SearchResult> = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].entry.prompt, "explain zero-trust tunnels");
        assert!((results[0].similarity - 1.0).abs() < 1e-6);
    }

    #[tokio::test]
    async fn create_without_the_write_token_is_refused() {
        let state = test_state(1_000);
        let resp = post_json(
            state,
            "/entries",
            None,
            serde_json::json!({"prompt": "x", "harness_config": {}, "quality_score": 0.5, "outcome": "x", "task_embedding": [1.0]}),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn create_with_an_out_of_range_quality_score_is_refused() {
        let state = test_state(1_000);
        let resp = post_json(
            state,
            "/entries",
            Some("test-token"),
            serde_json::json!({"prompt": "x", "harness_config": {}, "quality_score": 1.5, "outcome": "x", "task_embedding": [1.0]}),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn search_does_not_require_auth() {
        let state = test_state(1_000);
        let resp = post_json(state, "/search", None, serde_json::json!({"task_embedding": [1.0, 0.0]})).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn search_with_an_empty_embedding_is_refused() {
        let state = test_state(1_000);
        let resp = post_json(state, "/search", None, serde_json::json!({"task_embedding": []})).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn search_top_k_is_capped_regardless_of_what_the_caller_requests() {
        let state = test_state(1_000);
        for i in 0..5 {
            post_json(
                state.clone(),
                "/entries",
                Some("test-token"),
                serde_json::json!({"prompt": format!("e{i}"), "harness_config": {}, "quality_score": 0.5, "outcome": "x", "task_embedding": [1.0, i as f64]}),
            )
            .await;
        }
        let resp = post_json(state, "/search", None, serde_json::json!({"task_embedding": [1.0, 0.0], "top_k": 1_000_000})).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let results: Vec<db::SearchResult> = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(results.len(), 5, "must return only what was actually stored, not pad or error on an oversized top_k");
    }
}
