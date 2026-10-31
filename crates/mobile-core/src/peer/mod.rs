//! Phone-to-phone channels: one tap to invite, one tap to accept (docs/adr/0004).
//!
//! * [`invite`]: per-contact keys, the single-use invite link and the verification code.
//! * [`cp`]: the handful of control-plane calls (only the inviter needs a bearer token).
//! * [`session`]: join through the edge's `:443` front door and run Noise_IK. The edge relays
//!   ciphertext only; the protocol itself comes from `ct_common`.
//! * [`policy`]: what a peer may ask for. Allow-listed capabilities, always behind a tap.
//! * [`ffi`]: the UniFFI surface for the apps.
//!
//! Nothing here logs. Link, contact JSON and bearer token are secrets and stay out of errors.

pub mod cp;
pub mod ffi;
pub mod invite;
pub mod policy;
pub mod session;

/// What the apps have to tell apart. Messages never contain keys, links or tokens.
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum PeerError {
    #[error("this invite link is not valid")]
    LinkInvalid,
    #[error("this invite link has expired")]
    LinkExpired,
    #[error("this invite link was already used")]
    LinkUsed,
    #[error("not signed in or session expired")]
    Unauthorized,
    /// The peer showed a key other than the one pinned for this contact. Never retried.
    #[error("the other side could not be verified")]
    PeerMismatch,
    /// The edge refused the join (`category` is its closed vocabulary), e.g. after "Trennen".
    #[error("connection refused ({category})")]
    Refused { category: String },
    #[error("the other side is not online")]
    PeerOffline,
    #[error("message too large")]
    TooLarge,
    #[error("session closed")]
    Closed,
    #[error("invalid input: {detail}")]
    InvalidInput { detail: String },
    #[error("server error {status}")]
    Server { status: u16 },
    #[error("network error: {detail}")]
    Network { detail: String },
}

/// Where this app instance talks to. `edge_ca_der` is the edge CA root, the only TLS trust anchor.
#[derive(Debug, Clone, uniffi::Record)]
pub struct PeerConfig {
    pub control_plane_url: String,
    /// `host:port` of the `:443` front door.
    pub front_door: String,
    pub edge_ca_der: Vec<u8>,
    /// TLS server name; empty means "localhost", the name every edge leaf carries.
    pub sni: String,
}

pub(crate) fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}
