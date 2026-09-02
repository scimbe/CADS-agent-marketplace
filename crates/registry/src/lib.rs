//! Phase 3: the marketplace registry. Publish/fetch signed [`manifest_core::ServiceManifest`]s +
//! their bundles, and a ledger-only (no real payment) activation record -- see the Phase 2-5 plan's
//! Phase 3 section for the full design rationale.
//!
//! **Trust boundary this crate adds beyond Phase 1's dumb-PUT publish mode**: a manifest is
//! verified (`is_valid`) AND guardrail-scanned AT PUBLISH TIME, not just later at each individual
//! activator's own `activate` call. A manifest that would be rejected at activation is now
//! visibly flagged here, in the stored `guardrail_verdict`, before anyone ever tries to run it.
//!
//! Write endpoints (`POST /manifests`, `POST /manifests/:id/activations`) require
//! `Authorization: Bearer <REGISTRY_WRITE_TOKEN>` -- a local marketplace registry with no
//! authentication at all would let anyone poison the catalog or forge activation-ledger rows.
//! Read endpoints are unauthenticated on purpose (Phase 4's dashboard, and any future `manifest
//! activate --from-registry` flow, must be able to read without holding a write credential).

pub mod db;
pub mod hex_util;

use axum::extract::{DefaultBodyLimit, Multipart, Path as AxPath, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use db::{Db, StoredManifest};
use manifest_core::{InstallerKind, ServiceManifest};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

/// axum's own default (2 MB) rejects any real-world bundle -- `travel`'s (real routing-engine
/// data included) is ~18 MB, and a future LLM-node/dataset bundle could be considerably larger.
/// 256 MB is generous headroom while still being a bound, not `usize::MAX` -- this is an
/// authenticated (`REGISTRY_WRITE_TOKEN`-gated) write endpoint, but an unbounded body on ANY
/// endpoint is still worth capping (marketplace#38).
const MAX_PUBLISH_BODY_BYTES: usize = 256 * 1024 * 1024;

pub struct AppState {
    pub db: Db,
    pub bundles_dir: PathBuf,
    pub write_token: String,
    /// Injected so tests can pin a deterministic clock; production wiring always passes the real
    /// wall clock (`unix_now` in `main.rs`).
    pub now: Box<dyn Fn() -> i64 + Send + Sync>,
}

pub fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(root_page))
        .route("/manifests", post(publish_manifest).get(list_manifests))
        .route("/manifests/:manifest_id", get(get_manifest))
        .route("/manifests/:manifest_id/bundle", get(get_bundle))
        .route("/manifests/:manifest_id/activations", post(post_activation))
        .route("/publishers/:pubkey/ledger", get(get_ledger))
        .layer(DefaultBodyLimit::max(MAX_PUBLISH_BODY_BYTES))
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
        _ => Err(err(StatusCode::UNAUTHORIZED, "missing or invalid Authorization: Bearer <REGISTRY_WRITE_TOKEN>")),
    }
}

#[derive(Serialize, Deserialize)]
struct PublishResponse {
    manifest_id: String,
    guardrail_verdict: String,
}

/// `POST /manifests`: multipart with a `manifest` field (signed `ServiceManifest` JSON) and a
/// `bundle` field (the tarball its `bundle.sha256` commits to). Rejects, in order: malformed
/// multipart, invalid JSON, an invalid/expired signature (`is_valid`), a bundle whose actual bytes
/// don't hash to the manifest's own declared `bundle.sha256` (the manifest's signature is only
/// meaningful if it's over the bundle that was ACTUALLY uploaded, not a swapped one), and finally
/// a duplicate `manifest_id`. The compose guardrail scan runs and its verdict is stored either
/// way -- a scan failure does not block publish (an operator/Phase 4 dashboard should be able to
/// see and flag a bad manifest, not just have it silently vanish), but IS surfaced.
async fn publish_manifest(State(state): State<Arc<AppState>>, headers: HeaderMap, mut mp: Multipart) -> Response {
    if let Err(r) = require_write_auth(&state, &headers) {
        return r;
    }

    let mut manifest_json: Option<String> = None;
    let mut bundle_bytes: Option<Vec<u8>> = None;
    loop {
        let field = match mp.next_field().await {
            Ok(Some(f)) => f,
            Ok(None) => break,
            Err(e) => return err(StatusCode::BAD_REQUEST, format!("malformed multipart: {e}")),
        };
        match field.name() {
            Some("manifest") => match field.text().await {
                Ok(t) => manifest_json = Some(t),
                Err(e) => return err(StatusCode::BAD_REQUEST, format!("read manifest field: {e}")),
            },
            Some("bundle") => match field.bytes().await {
                Ok(b) => bundle_bytes = Some(b.to_vec()),
                Err(e) => return err(StatusCode::BAD_REQUEST, format!("read bundle field: {e}")),
            },
            _ => {}
        }
    }
    let Some(manifest_json) = manifest_json else {
        return err(StatusCode::BAD_REQUEST, "multipart is missing the 'manifest' field");
    };
    let Some(bundle_bytes) = bundle_bytes else {
        return err(StatusCode::BAD_REQUEST, "multipart is missing the 'bundle' field");
    };

    let manifest: ServiceManifest = match serde_json::from_str(&manifest_json) {
        Ok(m) => m,
        Err(e) => return err(StatusCode::BAD_REQUEST, format!("manifest is not valid JSON: {e}")),
    };
    let now = (state.now)() as u64;
    if !manifest.is_valid(now) {
        return err(StatusCode::BAD_REQUEST, "refusing to publish: signature invalid or manifest expired");
    }
    if !installer_engine::fetch::verify_sha256(&bundle_bytes, &manifest.bundle.sha256) {
        return err(
            StatusCode::BAD_REQUEST,
            "refusing to publish: uploaded bundle bytes do not match the manifest's own signed bundle.sha256",
        );
    }

    let manifest_id_hex = hex_util::to_hex(&manifest.manifest_id);
    let publisher_hex = hex_util::to_hex(&manifest.publisher_pubkey);
    let bundle_sha_hex = hex_util::to_hex(&manifest.bundle.sha256);

    let verdict = match scan_bundle_for_guardrail_violations(
        manifest.installer_kind,
        &bundle_bytes,
        &manifest.bundle.compose_file,
    ) {
        Ok(v) => v,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, format!("guardrail scan failed: {e}")),
    };

    if let Err(e) = std::fs::create_dir_all(&state.bundles_dir) {
        return err(StatusCode::INTERNAL_SERVER_ERROR, format!("create bundles dir: {e}"));
    }
    let bundle_path = state.bundles_dir.join(format!("{bundle_sha_hex}.tar.gz"));
    if let Err(e) = std::fs::write(&bundle_path, &bundle_bytes) {
        return err(StatusCode::INTERNAL_SERVER_ERROR, format!("store bundle: {e}"));
    }

    let stored = StoredManifest {
        manifest_id: manifest_id_hex.clone(),
        publisher_pubkey: publisher_hex,
        name: manifest.name.clone(),
        version: manifest.version.clone(),
        manifest_json,
        bundle_sha256: bundle_sha_hex,
        guardrail_verdict: verdict.clone(),
        published_at: now as i64,
    };
    if let Err(e) = state.db.insert_manifest(&stored) {
        return err(StatusCode::CONFLICT, e);
    }

    (StatusCode::CREATED, Json(PublishResponse { manifest_id: manifest_id_hex, guardrail_verdict: verdict })).into_response()
}

/// Unpacks the bundle into a fresh temp dir and runs `installer_engine::guardrails::scan_compose`
/// against it -- reusing Phase 1's own scanner and its own safe-unpack path
/// (`unpack_tar_gz_safely`, tar-slip-protected) rather than a second implementation.
///
/// **Compose only.** `installer_engine::activate`'s own step 7 comment says it plainly: "there is
/// no static-analysis equivalent for an arbitrary executable" -- `scan_compose` parses YAML, and a
/// Binary-kind `bundle.compose_file` is the executable itself, not YAML (marketplace#37: this used
/// to unconditionally attempt that parse anyway, and every Binary-kind publish crashed with a 500).
/// Binary and K8s get an honest, clearly-labeled "not applicable" verdict instead of either a crash
/// or a fabricated "clean" that would overstate coverage this scanner doesn't have -- matching the
/// tradeoff `manifest-core::InstallerKind`'s own doc comment already acknowledges (Binary leans on
/// the publisher-pubkey allowlist checked at activation time, not a static bundle scan).
fn scan_bundle_for_guardrail_violations(
    installer_kind: InstallerKind,
    bundle_bytes: &[u8],
    compose_file: &str,
) -> Result<String, String> {
    if installer_kind != InstallerKind::Compose {
        let kind_label = match installer_kind {
            InstallerKind::Binary => "binary",
            InstallerKind::K8s => "k8s",
            InstallerKind::Compose => unreachable!("handled above"),
        };
        return Ok(format!(
            "{kind_label}-kind: no static compose-YAML scan applicable (see manifest-core::InstallerKind's \
             own acknowledged tradeoff -- protection relies on the publisher-pubkey allowlist checked at \
             activation time, not a static bundle scan)"
        ));
    }

    let tmp = tempfile::tempdir().map_err(|e| format!("tempdir: {e}"))?;
    installer_engine::fetch::unpack_tar_gz_safely(bundle_bytes, tmp.path())?;
    let compose_path = tmp.path().join(compose_file);
    let compose_yaml = std::fs::read_to_string(&compose_path)
        .map_err(|e| format!("bundle does not contain its own declared compose_file {compose_file}: {e}"))?;
    let violations = installer_engine::guardrails::scan_compose(&compose_yaml, tmp.path())?;
    if violations.is_empty() {
        Ok("clean".to_string())
    } else {
        Ok(violations
            .iter()
            .map(|v| format!("{}[{}]: {}", v.service, v.rule, v.detail))
            .collect::<Vec<_>>()
            .join("; "))
    }
}

async fn get_manifest(State(state): State<Arc<AppState>>, AxPath(manifest_id): AxPath<String>) -> Response {
    match state.db.get_manifest(&manifest_id) {
        Ok(Some(m)) => (
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            m.manifest_json,
        )
            .into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, format!("no manifest {manifest_id}")),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Deserialize)]
struct ListParams {
    publisher: Option<String>,
    name: Option<String>,
}

#[derive(Serialize)]
struct ManifestSummary {
    manifest_id: String,
    publisher_pubkey: String,
    name: String,
    version: String,
    guardrail_verdict: String,
    published_at: i64,
}

fn html_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            other => out.push(other),
        }
    }
    out
}

/// Format a unix-seconds timestamp as `YYYY-MM-DD HH:MM:SS UTC` -- a small,
/// dependency-free UTC civil-calendar conversion (Howard Hinnant's well-known
/// `civil_from_days` algorithm, <http://howardhinnant.github.io/date_algorithms.html>).
/// This crate has no chrono/time dependency, and a listing page's timestamp column
/// doesn't need one.
fn format_unix(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let tod = secs.rem_euclid(86400);
    let (h, mi, s) = (tod / 3600, (tod / 60) % 60, tod % 60);
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02} {h:02}:{mi:02}:{s:02} UTC")
}

/// `GET /` (#47): a human-readable landing page listing everything `GET /manifests`
/// (the machine-readable JSON API) already serves, plus an explicit pointer to that
/// JSON endpoint for any agent/tool that lands on the root by mistake. Read-only,
/// unauthenticated, same posture as `list_manifests` below.
async fn root_page(State(state): State<Arc<AppState>>) -> Response {
    let rows = match state.db.list_manifests(None, None) {
        Ok(rows) => rows,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    let rows_html = if rows.is_empty() {
        "<p>No manifests published yet.</p>".to_string()
    } else {
        let items = rows
            .iter()
            .map(|m| {
                format!(
                    "<tr><td>{name}</td><td>{version}</td><td><code>{publisher}</code></td>\
                     <td>{verdict}</td><td>{published}</td></tr>",
                    name = html_escape(&m.name),
                    version = html_escape(&m.version),
                    publisher = html_escape(&m.publisher_pubkey),
                    verdict = html_escape(&m.guardrail_verdict),
                    published = format_unix(m.published_at),
                )
            })
            .collect::<String>();
        format!(
            "<table><thead><tr><th>Name</th><th>Version</th><th>Publisher</th>\
             <th>Guardrail verdict</th><th>Published</th></tr></thead><tbody>{items}</tbody></table>"
        )
    };
    Html(format!(
        "<!doctype html><html><head><meta charset=\"utf-8\">\
         <title>CADS agent marketplace registry</title>\
         <style>body{{font-family:sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}}\
         table{{border-collapse:collapse;width:100%}}th,td{{text-align:left;padding:.4rem .6rem;\
         border-bottom:1px solid #ccc}}code{{font-size:.85em}}</style></head><body>\
         <h1>CADS agent marketplace registry</h1>\
         <p>{count} manifest(s) published. This is a human-readable listing -- for the \
         machine-readable/LLM-consumable API, see <code>GET /manifests</code> \
         (optionally filtered by <code>?publisher=</code>/<code>?name=</code>), which \
         returns this same data as JSON.</p>\
         {rows_html}\
         </body></html>",
        count = rows.len(),
    ))
    .into_response()
}

async fn list_manifests(State(state): State<Arc<AppState>>, Query(params): Query<ListParams>) -> Response {
    match state.db.list_manifests(params.publisher.as_deref(), params.name.as_deref()) {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|m| ManifestSummary {
                    manifest_id: m.manifest_id,
                    publisher_pubkey: m.publisher_pubkey,
                    name: m.name,
                    version: m.version,
                    guardrail_verdict: m.guardrail_verdict,
                    published_at: m.published_at,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn get_bundle(State(state): State<Arc<AppState>>, AxPath(manifest_id): AxPath<String>) -> Response {
    let stored = match state.db.get_manifest(&manifest_id) {
        Ok(Some(m)) => m,
        Ok(None) => return err(StatusCode::NOT_FOUND, format!("no manifest {manifest_id}")),
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    let path = state.bundles_dir.join(format!("{}.tar.gz", stored.bundle_sha256));
    match std::fs::read(&path) {
        Ok(bytes) => ([(axum::http::header::CONTENT_TYPE, "application/gzip")], bytes).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, format!("read stored bundle: {e}")),
    }
}

#[derive(Deserialize)]
struct ActivationRequest {
    activator_pubkey: String,
    status: String,
}

#[derive(Serialize)]
struct ActivationResponse {
    manifest_id: String,
    activator_pubkey: String,
    timestamp: i64,
    status: String,
}

/// `POST /manifests/:id/activations`: a ledger write ONLY -- no payment is triggered (Phase 3's
/// explicit, operator-chosen scope). `activator_pubkey` is reported, not cryptographically proven
/// here -- Phase 3 ledger entries are honest bookkeeping of what `ct-agent manifest activate`
/// itself observed, not a payment-grade attestation; a later phase can add a signed receipt
/// without an identity-mapping rewrite, since this already uses the same holder-pubkey space.
async fn post_activation(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxPath(manifest_id): AxPath<String>,
    Json(body): Json<ActivationRequest>,
) -> Response {
    if let Err(r) = require_write_auth(&state, &headers) {
        return r;
    }
    if hex_util::from_hex32(&body.activator_pubkey).is_none() {
        return err(StatusCode::BAD_REQUEST, "activator_pubkey must be exactly 64 ASCII hex characters");
    }
    match state.db.get_manifest(&manifest_id) {
        Ok(Some(_)) => {}
        Ok(None) => return err(StatusCode::NOT_FOUND, format!("no manifest {manifest_id}")),
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
    let now = (state.now)();
    if let Err(e) = state.db.insert_activation(&manifest_id, &body.activator_pubkey, now, &body.status) {
        return err(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    (
        StatusCode::CREATED,
        Json(ActivationResponse { manifest_id, activator_pubkey: body.activator_pubkey, timestamp: now, status: body.status }),
    )
        .into_response()
}

async fn get_ledger(State(state): State<Arc<AppState>>, AxPath(pubkey): AxPath<String>) -> Response {
    if hex_util::from_hex32(&pubkey).is_none() {
        return err(StatusCode::BAD_REQUEST, "publisher pubkey must be exactly 64 ASCII hex characters");
    }
    match state.db.publisher_ledger(&pubkey) {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use ed25519_dalek::SigningKey;
    use manifest_core::{BundleRef, EnvVarSpec, InstallerKind, VerifySpec};
    use std::io::Write as _;
    use tower::ServiceExt;

    fn test_state(now: i64) -> Arc<AppState> {
        let bundles = tempfile::tempdir().unwrap();
        Arc::new(AppState {
            db: Db::open_in_memory(),
            bundles_dir: bundles.keep(),
            write_token: "test-token".to_string(),
            now: Box::new(move || now),
        })
    }

    fn make_bundle_tar_gz(compose_yaml: &[u8]) -> Vec<u8> {
        let mut tar_bytes = Vec::new();
        {
            let mut b = tar::Builder::new(&mut tar_bytes);
            let mut h = tar::Header::new_gnu();
            h.set_size(compose_yaml.len() as u64);
            h.set_mode(0o644);
            h.set_cksum();
            b.append_data(&mut h, "docker-compose.yml", compose_yaml).unwrap();
            b.finish().unwrap();
        }
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(&tar_bytes).unwrap();
        enc.finish().unwrap()
    }

    fn signed_manifest_for(bundle_bytes: &[u8], key: &SigningKey, manifest_id: [u8; 32], now: u64) -> ServiceManifest {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(bundle_bytes);
        let sha256: [u8; 32] = hasher.finalize().into();
        ServiceManifest::sign_new(
            key,
            manifest_id,
            "litellm-proof".into(),
            "0.1.0".into(),
            InstallerKind::Compose,
            BundleRef { url: "https://registry.invalid/bundle".into(), sha256, compose_file: "docker-compose.yml".into() },
            vec![EnvVarSpec { name: "X".into(), required: false, description: "d".into() }],
            VerifySpec { script: "verify.sh".into(), timeout_secs: 30 },
            now,
            now + 3600,
            None,
        )
    }

    /// Binary-kind bundle: an executable script at the path `compose_file` names, NOT YAML --
    /// this is exactly the shape that crashed the scanner pre-#37-fix.
    fn make_binary_bundle_tar_gz(script: &[u8]) -> Vec<u8> {
        let mut tar_bytes = Vec::new();
        {
            let mut b = tar::Builder::new(&mut tar_bytes);
            let mut h = tar::Header::new_gnu();
            h.set_size(script.len() as u64);
            h.set_mode(0o755);
            h.set_cksum();
            b.append_data(&mut h, "run.sh", script).unwrap();
            b.finish().unwrap();
        }
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(&tar_bytes).unwrap();
        enc.finish().unwrap()
    }

    fn signed_binary_manifest_for(bundle_bytes: &[u8], key: &SigningKey, manifest_id: [u8; 32], now: u64) -> ServiceManifest {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(bundle_bytes);
        let sha256: [u8; 32] = hasher.finalize().into();
        ServiceManifest::sign_new(
            key,
            manifest_id,
            "binary-proof".into(),
            "0.1.0".into(),
            InstallerKind::Binary,
            BundleRef { url: "https://registry.invalid/bundle".into(), sha256, compose_file: "run.sh".into() },
            vec![],
            VerifySpec { script: "verify.sh".into(), timeout_secs: 30 },
            now,
            now + 3600,
            None,
        )
    }

    fn multipart_body(manifest_json: &str, bundle_bytes: &[u8]) -> (String, Vec<u8>) {
        let boundary = "TESTBOUNDARY";
        let mut body = Vec::new();
        body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"manifest\"\r\n\r\n").as_bytes());
        body.extend_from_slice(manifest_json.as_bytes());
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"bundle\"; filename=\"b.tar.gz\"\r\nContent-Type: application/gzip\r\n\r\n").as_bytes());
        body.extend_from_slice(bundle_bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        (boundary.to_string(), body)
    }

    #[tokio::test]
    async fn publish_a_clean_manifest_then_fetch_it_back() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500);
        let manifest_json = serde_json::to_string(&manifest).unwrap();
        let (boundary, body) = multipart_body(&manifest_json, &bundle);

        let resp = app(state.clone())
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: PublishResponse = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parsed.guardrail_verdict, "clean");

        let get_resp = app(state.clone())
            .oneshot(Request::get(format!("/manifests/{}", parsed.manifest_id)).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(get_resp.status(), StatusCode::OK);
        let got_bytes = axum::body::to_bytes(get_resp.into_body(), usize::MAX).await.unwrap();
        let got: ServiceManifest = serde_json::from_slice(&got_bytes).unwrap();
        assert_eq!(got.manifest_id, manifest.manifest_id);
    }

    #[tokio::test]
    async fn publish_without_the_write_token_is_refused() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500);
        let (boundary, body) = multipart_body(&serde_json::to_string(&manifest).unwrap(), &bundle);
        let resp = app(state)
            .oneshot(
                Request::post("/manifests")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn publish_with_a_tampered_signature_is_refused() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n");
        let mut manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500);
        manifest.name = "tampered-after-signing".to_string();
        let (boundary, body) = multipart_body(&serde_json::to_string(&manifest).unwrap(), &bundle);
        let resp = app(state)
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&bytes).contains("signature invalid"));
    }

    #[tokio::test]
    async fn publish_with_a_bundle_that_does_not_match_the_signed_sha256_is_refused() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500); // signs THIS bundle's hash
        let swapped_bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"0.0.0.0:4101:8080\"\n"); // different bytes, different hash
        let (boundary, body) = multipart_body(&serde_json::to_string(&manifest).unwrap(), &swapped_bundle);
        let resp = app(state)
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&bytes).contains("bundle.sha256"));
    }

    #[tokio::test]
    async fn publish_an_expired_manifest_is_refused() {
        let state = test_state(10_000); // server clock is well past expiry
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500); // expires at 500+3600=4100
        let (boundary, body) = multipart_body(&serde_json::to_string(&manifest).unwrap(), &bundle);
        let resp = app(state)
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn publish_a_manifest_with_a_guardrail_violating_compose_file_still_stores_it_but_flags_it() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        // unqualified port publish -> F.1 violation
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"4101:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500);
        let (boundary, body) = multipart_body(&serde_json::to_string(&manifest).unwrap(), &bundle);
        let resp = app(state)
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: PublishResponse = serde_json::from_slice(&bytes).unwrap();
        assert!(parsed.guardrail_verdict.contains("F.1-non-loopback-port"), "{}", parsed.guardrail_verdict);
    }

    #[tokio::test]
    async fn republishing_the_same_manifest_id_is_refused() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500);
        let manifest_json = serde_json::to_string(&manifest).unwrap();

        for expect in [StatusCode::CREATED, StatusCode::CONFLICT] {
            let (boundary, body) = multipart_body(&manifest_json, &bundle);
            let resp = app(state.clone())
                .oneshot(
                    Request::post("/manifests")
                        .header("authorization", "Bearer test-token")
                        .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                        .body(Body::from(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(resp.status(), expect);
        }
    }

    /// marketplace#37: publishing a Binary-kind manifest used to crash with a 500 ("guardrail
    /// scan failed: invalid compose YAML") because the scanner unconditionally tried to parse
    /// `compose_file` as YAML -- for Binary that path is a shell script, not YAML. It must now
    /// succeed with an honest, clearly-labeled "not applicable" verdict instead.
    #[tokio::test]
    async fn publish_a_binary_kind_manifest_succeeds_instead_of_crashing() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_binary_bundle_tar_gz(b"#!/usr/bin/env bash\nset -euo pipefail\necho hello\n");
        let manifest = signed_binary_manifest_for(&bundle, &key, [9u8; 32], 500);
        let manifest_json = serde_json::to_string(&manifest).unwrap();
        let (boundary, body) = multipart_body(&manifest_json, &bundle);

        let resp = app(state)
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED, "Binary-kind publish must not crash");
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: PublishResponse = serde_json::from_slice(&bytes).unwrap();
        assert!(
            parsed.guardrail_verdict.starts_with("binary-kind: no static compose-YAML scan applicable"),
            "verdict must be honest about NOT scanning, not silently \"clean\": {}",
            parsed.guardrail_verdict
        );
    }

    /// marketplace#38: axum's own default body limit (2 MB) rejected any real-world bundle before
    /// the multipart body was even parsed -- travel's real bundle is ~18 MB. This test pushes a
    /// body well past the OLD default (but far under the new cap) through the full publish path
    /// to prove the fix, without actually allocating hundreds of MB in a unit test.
    #[tokio::test]
    async fn publish_accepts_a_bundle_larger_than_axums_old_2mb_default_body_limit() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        // A real, valid, small compose file PLUS a separate ~3 MB high-entropy (hash-chain)
        // sidecar file in the same bundle -- mirrors a real bundle carrying real binary data
        // (e.g. travel's routing dataset) alongside its compose file. High-entropy padding
        // doesn't meaningfully gzip-compress, so the actual wire body stays large; putting it in
        // its own tar entry (not inside the compose YAML) keeps the YAML itself valid UTF-8/parseable.
        use sha2::{Digest, Sha256};
        let mut padding = Vec::new();
        let mut h: [u8; 32] = Sha256::digest(b"seed for incompressible padding").into();
        while padding.len() < 3 * 1024 * 1024 {
            h = Sha256::digest(h).into();
            padding.extend_from_slice(&h);
        }
        let compose_yaml = b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n";
        let mut tar_bytes = Vec::new();
        {
            let mut b = tar::Builder::new(&mut tar_bytes);
            let mut h1 = tar::Header::new_gnu();
            h1.set_size(compose_yaml.len() as u64);
            h1.set_mode(0o644);
            h1.set_cksum();
            b.append_data(&mut h1, "docker-compose.yml", compose_yaml.as_slice()).unwrap();
            let mut h2 = tar::Header::new_gnu();
            h2.set_size(padding.len() as u64);
            h2.set_mode(0o644);
            h2.set_cksum();
            b.append_data(&mut h2, "assets/dataset.bin", padding.as_slice()).unwrap();
            b.finish().unwrap();
        }
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(&tar_bytes).unwrap();
        let bundle = enc.finish().unwrap();
        let manifest = signed_manifest_for(&bundle, &key, [11u8; 32], 500);
        let manifest_json = serde_json::to_string(&manifest).unwrap();
        let (boundary, body) = multipart_body(&manifest_json, &bundle);
        assert!(body.len() > 2 * 1024 * 1024, "test body must exceed axum's old 2MB default to be meaningful");

        let resp = app(state)
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED, "a >2MB bundle must not be rejected by the body-limit layer");
    }

    #[tokio::test]
    async fn bundle_download_returns_the_exact_uploaded_bytes() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500);
        let manifest_json = serde_json::to_string(&manifest).unwrap();
        let (boundary, body) = multipart_body(&manifest_json, &bundle);
        app(state.clone())
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        let manifest_id_hex = hex_util::to_hex(&manifest.manifest_id);
        let resp = app(state)
            .oneshot(Request::get(format!("/manifests/{manifest_id_hex}/bundle")).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        assert_eq!(bytes.to_vec(), bundle);
    }

    #[tokio::test]
    async fn activation_ledger_records_and_accumulates() {
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[3u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [7u8; 32], 500);
        let manifest_json = serde_json::to_string(&manifest).unwrap();
        let (boundary, body) = multipart_body(&manifest_json, &bundle);
        app(state.clone())
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        let manifest_id_hex = hex_util::to_hex(&manifest.manifest_id);
        let activator = "cc".repeat(32);
        for _ in 0..2 {
            let resp = app(state.clone())
                .oneshot(
                    Request::post(format!("/manifests/{manifest_id_hex}/activations"))
                        .header("authorization", "Bearer test-token")
                        .header("content-type", "application/json")
                        .body(Body::from(serde_json::to_vec(&serde_json::json!({"activator_pubkey": activator, "status": "ok"})).unwrap()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(resp.status(), StatusCode::CREATED);
        }

        let publisher_hex = hex_util::to_hex(&manifest.publisher_pubkey);
        let ledger_resp = app(state)
            .oneshot(Request::get(format!("/publishers/{publisher_hex}/ledger")).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(ledger_resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(ledger_resp.into_body(), usize::MAX).await.unwrap();
        let ledger: Vec<db::LedgerRow> = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(ledger.len(), 1);
        assert_eq!(ledger[0].activation_count, 2);
    }

    #[tokio::test]
    async fn activation_against_an_unknown_manifest_is_refused() {
        let state = test_state(1_000);
        let resp = app(state)
            .oneshot(
                Request::post(format!("/manifests/{}/activations", "ff".repeat(32)))
                    .header("authorization", "Bearer test-token")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&serde_json::json!({"activator_pubkey": "cc".repeat(32), "status": "ok"})).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn root_page_is_a_human_readable_listing_not_a_404() {
        // #47: GET / used to be a bare 404 with no route registered at all.
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[9u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4102:8080\"\n");
        let manifest = signed_manifest_for(&bundle, &key, [8u8; 32], 500);
        let manifest_json = serde_json::to_string(&manifest).unwrap();
        let (boundary, body) = multipart_body(&manifest_json, &bundle);
        let publish_resp = app(state.clone())
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(publish_resp.status(), StatusCode::CREATED);

        let resp = app(state).oneshot(Request::get("/").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let content_type = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        assert!(content_type.starts_with("text/html"), "got content-type {content_type:?}");
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let html = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(html.contains("litellm-proof"), "the published manifest's name is rendered");
        assert!(html.contains("0.1.0"), "the version is rendered");
        assert!(html.contains("clean"), "the guardrail verdict is rendered");
        assert!(
            html.contains("GET /manifests") || html.contains("<code>GET /manifests</code>"),
            "the machine-readable JSON endpoint is pointed to explicitly"
        );
    }

    #[tokio::test]
    async fn root_page_escapes_manifest_fields_and_handles_the_empty_case() {
        // A manifest name/version isn't attacker-controlled input here (publish requires the
        // write token), but this page renders it as raw HTML -- escape unconditionally rather
        // than assume the field is always benign.
        let state = test_state(1_000);
        let key = SigningKey::from_bytes(&[5u8; 32]);
        let bundle = make_bundle_tar_gz(b"services:\n  web:\n    ports:\n      - \"127.0.0.1:4103:8080\"\n");
        let mut manifest = signed_manifest_for(&bundle, &key, [6u8; 32], 500);
        manifest.name = "<script>alert(1)</script>".to_string();
        // Re-sign over the mutated manifest so `is_valid` still accepts it -- publish_manifest
        // rejects a manifest whose signature doesn't cover its actual current fields.
        let manifest = ServiceManifest::sign_new(
            &key,
            manifest.manifest_id,
            manifest.name.clone(),
            manifest.version.clone(),
            manifest.installer_kind,
            manifest.bundle.clone(),
            manifest.env_template.clone(),
            manifest.verify.clone(),
            manifest.issued_at,
            manifest.expires_at,
            manifest.demo_prompt.clone(),
        );
        let manifest_json = serde_json::to_string(&manifest).unwrap();
        let (boundary, body) = multipart_body(&manifest_json, &bundle);
        let publish_resp = app(state.clone())
            .oneshot(
                Request::post("/manifests")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(publish_resp.status(), StatusCode::CREATED);

        let resp = app(state).oneshot(Request::get("/").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let html = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(!html.contains("<script>alert(1)</script>"), "manifest name must be HTML-escaped, not injected raw");
        assert!(html.contains("&lt;script&gt;"), "the escaped form should still be present");
    }

    #[tokio::test]
    async fn root_page_renders_a_clean_empty_state_with_no_manifests_published() {
        let state = test_state(1_000);
        let resp = app(state).oneshot(Request::get("/").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let html = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(html.contains("No manifests published yet"));
    }

    #[test]
    fn format_unix_renders_a_known_timestamp_correctly() {
        assert_eq!(format_unix(0), "1970-01-01 00:00:00 UTC");
        // 2026-01-01 00:00:00 UTC, cross-checked against `date -u -d @1767225600`.
        assert_eq!(format_unix(1_767_225_600), "2026-01-01 00:00:00 UTC");
    }
}
