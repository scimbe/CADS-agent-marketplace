//! `bp-collab-crdt`: the collaboration blueprint the composer instantiates for "many people edit one
//! vector document at the same time, also offline".
//!
//! The design in one paragraph. Every property of every shape is a last-writer-wins register ordered
//! by a Lamport [`Stamp`] (lamport counter, 64-bit replica id); a document is the map of those
//! registers, and merging two documents is the register-wise maximum. That merge is commutative,
//! associative and idempotent, so any two replicas that have seen the same set of deltas are in the
//! same state, in whatever order, with whatever duplicates the network produced: strong eventual
//! consistency (Shapiro et al., "Conflict-free Replicated Data Types", SSS 2011). Z-order is a
//! fractional index per shape ([`frac`]), the parent of a shape is a register too, and the one
//! non-local rule -- a reparenting cycle -- is broken deterministically at read time ([`doc`]). The
//! same register-per-property shape is what Figma's multiplayer uses in production (Figma
//! engineering blog, "How Figma's multiplayer technology works", 2019).
//!
//! Because domination between two deltas for the same register is decided by the stamp alone, a relay
//! can drop and compact superseded deltas without reading them ([`relay`]): the payload stays
//! end-to-end encrypted ([`wire`]) and the relay only sees a pseudonymous route key and the stamp. A
//! relay tree ([`sim`], [`net`]) spreads the fan-out to thousands of editors; the root is the only
//! sequencer, per document.
//!
//! Nothing here depends on a platform: pure Rust, no OS-specific API in the CRDT, so the same core
//! compiles for iOS, Android, desktop and wasm. The transport is a plain byte stream, so it runs over
//! a CADS channel (ct-agent forwards a local TCP port over an A2A channel) or over any TCP/QUIC path
//! a customer migrates to.

pub mod doc;
pub mod frac;
pub mod net;
pub mod outbox;
pub mod relay;
pub mod sim;
pub mod stamp;
pub mod value;
pub mod wire;

pub use doc::{Delta, Doc, Prop, RegKey, Scene, SceneNode, ShapeId};
pub use stamp::Stamp;
pub use value::Value;
