//! Typed client for the platform's `/me/installations` API (CADS-Tunnel control plane).
//!
//! Wire contract (CADS-Tunnel `crates/control-plane/src/installations.rs`):
//! * Bearer tokens only. Requests with an `Authorization` header are exempt from the server's
//!   CSRF guard; cookies are never used or sent.
//! * `PUT` needs `If-Match: <revision>` (409 on mismatch, 428 without); `DELETE` honours it.
//! * 422 carries a plain-text body `"<json.path>: <reason>"` and never echoes the value.
//! * A record of another account is a plain 404.
//!
//! TLS is always verified (rustls, bundled webpki roots). Plain `http` is accepted for loopback
//! hosts only, so local development and the unit tests can run against a mock server.

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ureq::http::Response;

use crate::template::{ComponentInfo, RenderedPrompt};
use crate::MobileError;

/// Supplies the current access token. Called before every request, so the app can refresh it
/// lazily. Returning `None` yields `MobileError::Unauthorized` without any network traffic.
#[uniffi::export(with_foreign)]
pub trait TokenProvider: Send + Sync {
    fn access_token(&self) -> Option<String>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum InstallationStatus {
    Draft,
    Installed,
    Removed,
}

impl InstallationStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Installed => "installed",
            Self::Removed => "removed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, uniffi::Record)]
pub struct ComponentRecord {
    pub name: String,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, uniffi::Record)]
pub struct TargetRecord {
    pub os: String,
    #[serde(default)]
    pub device_label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_holder_pubkey: Option<String>,
}

/// A saved installation as the server returns it. `values_json` is the customer's input as a
/// JSON object string (UniFFI has no JSON value type).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct InstallationRecord {
    pub id: String,
    pub name: String,
    pub template_id: String,
    pub template_digest: String,
    pub values_json: String,
    pub values_digest: String,
    pub components: Vec<ComponentRecord>,
    pub manifest_ids: Vec<String>,
    pub target: TargetRecord,
    pub status: InstallationStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub revision: i64,
}

/// What a client may set; id, timestamps and revision are server-owned.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct InstallationInput {
    pub name: String,
    pub template_id: String,
    pub template_digest: String,
    pub values_json: String,
    pub values_digest: String,
    pub components: Vec<ComponentRecord>,
    pub manifest_ids: Vec<String>,
    pub target: TargetRecord,
    /// `None`: draft on create, unchanged on update.
    pub status: Option<InstallationStatus>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct InstallationPage {
    pub items: Vec<InstallationRecord>,
    pub total: u64,
    pub limit: u64,
    pub offset: u64,
}

// Wire shapes (values as a JSON value).
#[derive(Serialize, Deserialize)]
struct WireRecord {
    id: String,
    name: String,
    template_id: String,
    template_digest: String,
    values: Value,
    values_digest: String,
    components: Vec<ComponentRecord>,
    manifest_ids: Vec<String>,
    target: TargetRecord,
    status: InstallationStatus,
    created_at: i64,
    updated_at: i64,
    revision: i64,
}

#[derive(Serialize)]
struct WireInput<'a> {
    name: &'a str,
    template_id: &'a str,
    template_digest: &'a str,
    values: Value,
    values_digest: &'a str,
    components: &'a [ComponentRecord],
    manifest_ids: &'a [String],
    target: &'a TargetRecord,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<InstallationStatus>,
}

#[derive(Deserialize)]
struct WirePage {
    items: Vec<WireRecord>,
    total: u64,
    limit: u64,
    offset: u64,
}

impl From<WireRecord> for InstallationRecord {
    fn from(w: WireRecord) -> Self {
        InstallationRecord {
            id: w.id,
            name: w.name,
            template_id: w.template_id,
            template_digest: w.template_digest,
            values_json: w.values.to_string(),
            values_digest: w.values_digest,
            components: w.components,
            manifest_ids: w.manifest_ids,
            target: w.target,
            status: w.status,
            created_at: w.created_at,
            updated_at: w.updated_at,
            revision: w.revision,
        }
    }
}

fn wire_input(i: &InstallationInput) -> Result<String, MobileError> {
    let values: Value = serde_json::from_str(&i.values_json)
        .ok()
        .filter(Value::is_object)
        .ok_or_else(|| MobileError::InvalidInput {
            detail: "values_json must be a JSON object".into(),
        })?;
    serde_json::to_string(&WireInput {
        name: &i.name,
        template_id: &i.template_id,
        template_digest: &i.template_digest,
        values,
        values_digest: &i.values_digest,
        components: &i.components,
        manifest_ids: &i.manifest_ids,
        target: &i.target,
        status: i.status,
    })
    .map_err(|e| MobileError::InvalidInput {
        detail: e.to_string(),
    })
}

fn component_record(c: &ComponentInfo) -> ComponentRecord {
    ComponentRecord {
        name: c.name.clone(),
        sha256: c.sha256.clone(),
    }
}

/// Build the payload to save a freshly rendered prompt: digests and components come from the
/// verified render, `values_json` is exactly what the customer entered.
#[uniffi::export]
pub fn installation_input_from_render(
    name: String,
    rendered: RenderedPrompt,
    values_json: String,
    target: TargetRecord,
) -> InstallationInput {
    InstallationInput {
        name,
        template_id: rendered.template_id,
        template_digest: rendered.template_digest,
        values_json,
        values_digest: rendered.values_digest,
        components: rendered.components.iter().map(component_record).collect(),
        manifest_ids: rendered
            .components
            .iter()
            .filter_map(|c| c.manifest_id.clone())
            .collect(),
        target,
        status: None,
    }
}

/// Turn a stored record back into an input (for "adapt": edit name/values, then `update`).
#[uniffi::export]
pub fn installation_input_from_record(r: InstallationRecord) -> InstallationInput {
    InstallationInput {
        name: r.name,
        template_id: r.template_id,
        template_digest: r.template_digest,
        values_json: r.values_json,
        values_digest: r.values_digest,
        components: r.components,
        manifest_ids: r.manifest_ids,
        target: r.target,
        status: Some(r.status),
    }
}

#[derive(uniffi::Object)]
pub struct InstallationsClient {
    base: String,
    tokens: Arc<dyn TokenProvider>,
    agent: ureq::Agent,
}

fn is_loopback(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

/// Normalised base URL; `https` required except for loopback hosts.
fn check_base(base_url: &str) -> Result<(String, bool), MobileError> {
    let bad = |m: &str| MobileError::InvalidInput {
        detail: m.to_string(),
    };
    let trimmed = base_url.trim().trim_end_matches('/');
    let (scheme, rest) = trimmed
        .split_once("://")
        .ok_or_else(|| bad("base_url needs a scheme"))?;
    let authority = rest.split('/').next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return Err(bad("base_url needs a host and no credentials"));
    }
    let host = if authority.starts_with('[') {
        authority
            .split_once(']')
            .map_or(authority, |(h, _)| &authority[..h.len() + 1])
    } else {
        authority.split(':').next().unwrap_or("")
    };
    match scheme {
        "https" => Ok((trimmed.to_string(), true)),
        "http" if is_loopback(host) => Ok((trimmed.to_string(), false)),
        _ => Err(bad("base_url must use https (http only for localhost)")),
    }
}

#[uniffi::export]
impl InstallationsClient {
    /// `base_url` is the platform origin, e.g. `https://bunsenbrenner.org`.
    #[uniffi::constructor]
    pub fn new(base_url: String, tokens: Arc<dyn TokenProvider>) -> Result<Arc<Self>, MobileError> {
        let (base, https_only) = check_base(&base_url)?;
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(20)))
            .http_status_as_error(false)
            .https_only(https_only)
            .max_redirects(0)
            .build()
            .into();
        Ok(Arc::new(Self {
            base,
            tokens,
            agent,
        }))
    }

    pub fn list(
        &self,
        status: Option<InstallationStatus>,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<InstallationPage, MobileError> {
        let mut q = Vec::new();
        if let Some(s) = status {
            q.push(format!("status={}", s.as_str()));
        }
        if let Some(l) = limit {
            q.push(format!("limit={l}"));
        }
        if let Some(o) = offset {
            q.push(format!("offset={o}"));
        }
        let qs = if q.is_empty() {
            String::new()
        } else {
            format!("?{}", q.join("&"))
        };
        let (_, body) = self.send("GET", &format!("/me/installations{qs}"), None, None)?;
        let p: WirePage = decode(&body)?;
        Ok(InstallationPage {
            items: p.items.into_iter().map(Into::into).collect(),
            total: p.total,
            limit: p.limit,
            offset: p.offset,
        })
    }

    pub fn get(&self, id: String) -> Result<InstallationRecord, MobileError> {
        let (_, body) = self.send("GET", &item_path(&id)?, None, None)?;
        Ok(decode::<WireRecord>(&body)?.into())
    }

    pub fn create(&self, input: InstallationInput) -> Result<InstallationRecord, MobileError> {
        let body = wire_input(&input)?;
        let (_, resp) = self.send("POST", "/me/installations", Some(&body), None)?;
        Ok(decode::<WireRecord>(&resp)?.into())
    }

    /// Update with optimistic concurrency: `if_match` is the revision the edit was based on.
    /// A stale one yields `Conflict { current_revision }`; reload with `get` and retry.
    pub fn update(
        &self,
        id: String,
        if_match: i64,
        input: InstallationInput,
    ) -> Result<InstallationRecord, MobileError> {
        let body = wire_input(&input)?;
        let (_, resp) = self.send("PUT", &item_path(&id)?, Some(&body), Some(if_match))?;
        Ok(decode::<WireRecord>(&resp)?.into())
    }

    /// Resolve a 409 in favour of the user's edit: always re-GET the current record, then PUT the
    /// user's edited fields (`name`, and `values_json`/`values_digest` when given) on top of the
    /// FRESH record, so status, components and everything the user did not edit come from the
    /// server's current state, with `If-Match` set to the fresh revision. Does not depend on the
    /// 409 body carrying a revision. A concurrent change between the GET and the PUT yields
    /// another `Conflict`.
    pub fn overwrite(
        &self,
        id: String,
        name: String,
        values_json: Option<String>,
        values_digest: Option<String>,
    ) -> Result<InstallationRecord, MobileError> {
        let fresh = self.get(id.clone())?;
        let rev = fresh.revision;
        let mut input = installation_input_from_record(fresh);
        input.name = name;
        if let Some(v) = values_json {
            input.values_json = v;
        }
        if let Some(d) = values_digest {
            input.values_digest = d;
        }
        self.update(id, rev, input)
    }

    /// Soft delete (the server keeps the newest removed records restorable via `update`).
    pub fn delete(&self, id: String, if_match: Option<i64>) -> Result<(), MobileError> {
        self.send("DELETE", &item_path(&id)?, None, if_match)
            .map(|_| ())
    }

    /// New draft copy; the server appends " (copy)" when `name` is `None`.
    pub fn duplicate(
        &self,
        id: String,
        name: Option<String>,
    ) -> Result<InstallationRecord, MobileError> {
        let body = name.map(|n| serde_json::json!({ "name": n }).to_string());
        let path = format!("{}/duplicate", item_path(&id)?);
        let (_, resp) = self.send("POST", &path, body.as_deref(), None)?;
        Ok(decode::<WireRecord>(&resp)?.into())
    }

    /// The account's installations as the server's export document (`installations.json`).
    pub fn export(&self) -> Result<String, MobileError> {
        self.send("GET", "/me/installations/export", None, None)
            .map(|(_, b)| b)
    }
}

impl InstallationsClient {
    fn send(
        &self,
        method: &str,
        path: &str,
        body: Option<&str>,
        if_match: Option<i64>,
    ) -> Result<(u16, String), MobileError> {
        let token = self
            .tokens
            .access_token()
            .filter(|t| !t.is_empty())
            .ok_or(MobileError::Unauthorized)?;
        let url = format!("{}{}", self.base, path);
        let auth = format!("Bearer {token}");
        let net = |e: ureq::Error| MobileError::Network {
            detail: sanitize(&e.to_string(), &token),
        };
        let if_match = if_match.map(|r| format!("\"{r}\""));

        macro_rules! common {
            ($req:expr) => {{
                let mut r = $req
                    .header("Authorization", &auth)
                    .header("Accept", "application/json");
                if let Some(im) = &if_match {
                    r = r.header("If-Match", im);
                }
                r
            }};
        }
        let resp: Response<ureq::Body> = match method {
            "GET" => common!(self.agent.get(&url)).call(),
            "DELETE" => common!(self.agent.delete(&url)).call(),
            "POST" | "PUT" => {
                let req = if method == "POST" {
                    self.agent.post(&url)
                } else {
                    self.agent.put(&url)
                };
                let req = common!(req);
                match body {
                    Some(b) => req.header("Content-Type", "application/json").send(b),
                    None => req.send_empty(),
                }
            }
            _ => unreachable!("internal method set"),
        }
        .map_err(net)?;

        let status = resp.status().as_u16();
        let mut resp = resp;
        let text = resp
            .body_mut()
            .with_config()
            .limit(16 * 1024 * 1024)
            .read_to_string()
            .map_err(net)?;
        if (200..300).contains(&status) {
            Ok((status, text))
        } else {
            Err(map_status(status, &text))
        }
    }
}

/// Defence in depth: should a transport error ever embed the token, drop it.
fn sanitize(msg: &str, token: &str) -> String {
    msg.replace(token, "[redacted]")
}

fn item_path(id: &str) -> Result<String, MobileError> {
    let ok = !id.is_empty()
        && id.len() <= 200
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'));
    if ok {
        Ok(format!("/me/installations/{id}"))
    } else {
        Err(MobileError::InvalidInput {
            detail: "invalid installation id".into(),
        })
    }
}

fn decode<T: serde::de::DeserializeOwned>(body: &str) -> Result<T, MobileError> {
    serde_json::from_str(body).map_err(|e| MobileError::Server {
        status: 200,
        detail: format!("unexpected response shape: {e}"),
    })
}

fn short(body: &str) -> String {
    body.chars().take(300).collect()
}

/// `values.api_key: key looks like ...` -> `("values.api_key", "key looks like ...")`.
fn split_path(body: &str) -> (String, String) {
    match body.split_once(": ") {
        Some((p, rest)) if !p.is_empty() && !p.contains(' ') => (p.to_string(), short(rest)),
        _ => (String::new(), short(body)),
    }
}

/// `... is at revision 7; reload and retry` -> `Some(7)`.
fn parse_revision(body: &str) -> Option<i64> {
    let rest = body.split("at revision ").nth(1)?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

pub(crate) fn map_status(status: u16, body: &str) -> MobileError {
    match status {
        401 => MobileError::Unauthorized,
        404 => MobileError::NotFound,
        409 => MobileError::Conflict {
            current_revision: parse_revision(body),
        },
        428 => MobileError::PreconditionRequired,
        422 => {
            let (path, message) = split_path(body);
            MobileError::Rejected422 {
                path,
                detail: message,
            }
        }
        s => MobileError::Server {
            status: s,
            detail: short(body),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_policy() {
        assert!(check_base("https://bunsenbrenner.org/").is_ok());
        assert!(check_base("http://127.0.0.1:8080").is_ok());
        assert!(check_base("http://localhost:3000").is_ok());
        assert!(check_base("http://[::1]:3000").is_ok());
        for bad in [
            "http://bunsenbrenner.org",
            "ftp://x",
            "bunsenbrenner.org",
            "https://",
            "https://user:pw@host",
            "http://127.0.0.1.evil.org",
        ] {
            assert!(check_base(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn status_mapping() {
        assert!(matches!(map_status(401, ""), MobileError::Unauthorized));
        assert!(matches!(map_status(404, "x"), MobileError::NotFound));
        assert!(matches!(
            map_status(
                409,
                "revision mismatch: the installation is at revision 7; reload and retry"
            ),
            MobileError::Conflict {
                current_revision: Some(7)
            }
        ));
        match map_status(422, "values.api_key: key looks like a secret") {
            MobileError::Rejected422 { path, .. } => assert_eq!(path, "values.api_key"),
            e => panic!("{e:?}"),
        }
        match map_status(422, "values must be a JSON object") {
            MobileError::Rejected422 { path, .. } => assert_eq!(path, ""),
            e => panic!("{e:?}"),
        }
        assert!(matches!(
            map_status(500, "boom"),
            MobileError::Server { status: 500, .. }
        ));
    }

    #[test]
    fn item_ids_are_validated() {
        assert!(item_path("0a1b-2c").is_ok());
        assert!(item_path("../x").is_err());
        assert!(item_path("").is_err());
    }
}
