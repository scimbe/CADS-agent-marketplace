//! `bp-spatial-audio`: the blueprint the composer instantiates for "many people in one virtual
//! space hear each other by where they stand".
//!
//! The design follows from one number: mixing every speaker for every listener is O(N^2), 10^12
//! pairs for a million people. So the server never mixes per listener. Per 20 ms frame, a shard:
//!
//! 1. forwards to each listener the `k` most audible nearby speakers unchanged (no decode, no
//!    encode: an SFU for the near field, [`select`]);
//! 2. decodes every active speaker once, mixes them per grid cell into a *cell bed* and encodes each
//!    bed once ([`server`]); a listener receives the `m` nearest cell beds beyond its near field;
//! 3. mixes the cell beds per sector into *sector beds* for the far field (the roar of the stadium).
//!
//! Server work is then proportional to the active speakers and active cells, not to listeners x
//! sources; what grows with the listeners is selection (a grid lookup) and forwarding (a copy).
//! The binaural rendering -- interaural time and level differences, distance, air absorption,
//! reverberation -- runs on the listener's device ([`render`]): it is cheap per source, and it is
//! the only place where head tracking can act without a network round trip.
//!
//! Latency: a forwarded voice adds no server frame; a bed adds one frame (it waits for its frame to
//! be mixed). [`latency`] carries the budget with its assumptions named; the acceptance target is a
//! server processing time below 50 ms at p99, and mouth-to-ear below 150 ms (ITU-T G.114) for the
//! forwarded voices on a typical mobile network.
//!
//! No platform dependency: Opus is portable C (compiled from source), everything else is Rust. The
//! transport is UDP/QUIC or any datagram channel; behind bunsenbrenner, shards exchange their border
//! beds over A2A channels (the composition manifest wires those edges, [`scale`]).

pub mod codec;
pub mod geom;
pub mod grid;
pub mod latency;
pub mod render;
pub mod scale;
pub mod select;
pub mod server;

/// 20 ms frames: Opus' default for voice, and the unit of every budget here.
pub const FRAME_MS: u32 = 20;
