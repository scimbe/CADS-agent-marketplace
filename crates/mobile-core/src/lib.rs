//! Shared core of the CADS marketplace mobile apps (Android + iOS), exposed via UniFFI.
//!
//! * [`template`]: verify a publisher-signed prompt template on the device and render it. All
//!   signature, structure and value-bound logic lives in `manifest-core`; nothing is re-implemented here.
//! * [`installations`]: typed client for the platform's `/me/installations` API (CADS-Tunnel control
//!   plane). Bearer-token authenticated; the token comes from the app through [`TokenProvider`] on
//!   every request, so refresh/expiry stays the app's concern and the core never persists a token.
//! * `peer` (feature `peer`): phone-to-phone Agent-Fabric channels, see docs/adr/0004.
//! * [`wasm`]: the `WasmExecutor` seam for running Wasm installations on-device (stub for now).
//!
//! No function in this crate logs. Customer input and bearer tokens must never reach a log line.

pub mod error;
pub mod installations;
#[cfg(feature = "peer")]
pub mod peer;
pub mod template;
pub mod wasm;

pub use error::MobileError;

uniffi::setup_scaffolding!();
