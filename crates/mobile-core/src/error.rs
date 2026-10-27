/// Every failure the apps have to distinguish. Messages never contain customer values or tokens.
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum MobileError {
    /// The template JSON could not be parsed or is structurally invalid.
    #[error("invalid prompt template: {message}")]
    InvalidTemplate { message: String },
    /// The publisher signature does not verify. The template must not be shown as trusted.
    #[error("prompt template signature does not verify")]
    BadSignature,
    /// `now >= expires_at`.
    #[error("prompt template has expired")]
    Expired,
    /// A customer value violates the signed bound of `param` (or names/omits a parameter).
    #[error("invalid value for '{param}': {message}")]
    InvalidValue { param: String, message: String },
    /// A JSON argument handed in by the app is malformed.
    #[error("invalid input: {message}")]
    InvalidInput { message: String },
    /// HTTP 401, or no access token available. The app should run the sign-in flow again.
    #[error("not signed in or session expired")]
    Unauthorized,
    /// HTTP 404 (also for a record of another account: the server never answers 403).
    #[error("installation not found")]
    NotFound,
    /// HTTP 409: `If-Match` named a stale revision. `current_revision` is the server's.
    #[error("revision conflict (server is at revision {current_revision:?})")]
    Conflict { current_revision: Option<i64> },
    /// HTTP 428: update without `If-Match` (a client bug, surfaced instead of hidden).
    #[error("If-Match revision is required")]
    PreconditionRequired,
    /// HTTP 422: the server refused the content (e.g. secret-looking keys or values).
    /// `path` is the JSON path the server named (e.g. `values.api_key`), empty when none.
    #[error("rejected by server at '{path}': {message}")]
    Rejected422 { path: String, message: String },
    /// Any other non-success status.
    #[error("server error {status}: {message}")]
    Server { status: u16, message: String },
    /// Transport failure (DNS, TLS, timeout, ...). TLS verification failures land here and are
    /// never retried with a weaker policy.
    #[error("network error: {message}")]
    Network { message: String },
    /// The on-device Wasm runtime is not wired in yet.
    #[error("wasm runtime unavailable: {message}")]
    WasmUnavailable { message: String },
}
