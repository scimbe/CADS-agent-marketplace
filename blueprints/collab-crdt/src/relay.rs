//! The relay: sequences, coalesces, compacts and fans out frames it cannot read.
//!
//! A frame carries a route key (which register, pseudonymously), the stamp, and an opaque payload.
//! That is enough to decide domination, so the relay keeps only the newest frame per route key: its
//! log is a compacted snapshot of the document in ciphertext, and a replica that was away for a week
//! catches up with one frame per changed register instead of the whole history. The root relay of a
//! document assigns the sequence numbers; leaf relays mirror its batches for their own clients
//! ([`crate::sim`], [`crate::net`]), so the root's fan-out is the number of leaves, not of editors.
//!
//! Interest management: a frame also carries tiles (coarse areas of the canvas) as its writer saw
//! them. A subscriber gets in real time only what concerns the tiles it looks at, and everything
//! else as a compacted background catch-up, as often as its battery and link allow.
//!
//! A writer's view of where a shape is can be stale (someone moved it a moment ago), so routing does
//! not rest on it alone. The frames of a shape's position register carry a positional flag
//! ([`positional`]); since the relay keeps the newest frame per register, it holds exactly the
//! position every replica will converge to, and from it the shape's true tile. Every frame is
//! delivered to its own tiles *and* to the tile the relay knows for its shape ([`Batch::routes`]);
//! a move is announced with the tile the shape really left, and brings the shape's whole state to
//! the subscribers of the tile it entered ([`Entering`]) -- they never saw its other registers. A
//! writer always gets its own frames back: the echo is the acknowledgement
//! ([`crate::outbox::Outbox::acknowledge`]).
//!
//! The route key is `shape hash (80 bits) | property hash (48 bits)` so that the relay can gather a
//! shape's registers without knowing what the shape is. What the relay learns: which pseudonymous
//! registers change, when, from which replica id (part of the stamp), which of them belong to one
//! shape, which is a position, and in which tile a shape is. Not what changes. That metadata is the
//! price of compaction and routing without keys; it is named in the blueprint's threat notes.

use crate::stamp::Stamp;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Arc;

pub type RouteKey = u128;

/// The upper 80 bits of a route key identify the shape (see the module doc).
pub const SHAPE_SHIFT: u32 = 48;

pub fn shape_of(route: RouteKey) -> u128 {
    route >> SHAPE_SHIFT
}

/// The tiles a frame concerns, as its writer saw them: where the shape was and where it is after the
/// write (equal unless it moved). Tile ids are below [`TILE_NONE`]; the top bit is the positional
/// flag.
pub type Tiles = [u32; 2];
/// Every subscriber (document metadata, a shape without a position yet).
pub const TILE_ANY: u32 = 0x7FFF_FFFF;
/// No subscriber (a routing slot with nothing to add).
pub const TILE_NONE: u32 = 0x7FFF_FFFE;
const POSITIONAL: u32 = 0x8000_0000;

/// Mark the destination tile of a write to a shape's position register. Exactly one register per
/// shape may carry it.
pub fn positional(tile: u32) -> u32 {
    tile | POSITIONAL
}

pub fn is_positional(t: u32) -> bool {
    t & POSITIONAL != 0
}

pub fn tile(t: u32) -> u32 {
    t & !POSITIONAL
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Frame<P> {
    pub route: RouteKey,
    pub stamp: Stamp,
    pub tiles: Tiles,
    pub payload: P,
}

impl<P> Frame<P> {
    pub fn concerns(&self, wanted: &TileSet) -> bool {
        wanted.matches(&self.tiles)
    }
}

/// What a subscriber looks at. `All` is a full replica in real time (desktop on a good link).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TileSet {
    All,
    Only(BTreeSet<u32>),
}

impl TileSet {
    pub fn matches(&self, t: &Tiles) -> bool {
        t.iter().any(|x| self.wants(*x))
    }

    pub fn wants(&self, t: u32) -> bool {
        let t = tile(t);
        match self {
            TileSet::All => t != TILE_NONE,
            TileSet::Only(set) => t == TILE_ANY || set.contains(&t),
        }
    }

    pub fn from_list(tiles: &[u32]) -> TileSet {
        if tiles.is_empty() {
            TileSet::All
        } else {
            TileSet::Only(tiles.iter().copied().collect())
        }
    }
}

/// A shape that moved from one tile to another in this batch, with its whole current state: for
/// the subscribers of `to` that are not subscribers of `from`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entering<P> {
    pub from: u32,
    pub to: u32,
    pub frames: Vec<Frame<P>>,
}

/// Frames sequenced in one tick: `seq` is the sequence number of the batch (one per tick that had
/// anything new), so a client detects a gap by a skipped batch number.
#[derive(Clone, Debug)]
pub struct Batch<P> {
    pub seq: u64,
    pub frames: Vec<Frame<P>>,
    /// Per frame, the tiles the relay adds from what it knows: the shape's tile before and after
    /// this frame (equal unless it is a move). [`TILE_NONE`] where the relay knows nothing.
    pub routes: Vec<Tiles>,
    pub entering: Vec<Entering<P>>,
}

impl<P: Clone> Batch<P> {
    /// The part of this batch a subscriber of `wanted` gets in real time: what concerns its tiles by
    /// the writer's or the relay's account, its own frames (`me`, the replica id), and the full state
    /// of shapes that entered its tiles. The sequence number stays, so a subscriber still notices a
    /// lost batch even when its share of it was empty.
    pub fn filtered_for(&self, wanted: &TileSet, me: Option<u64>) -> Vec<Frame<P>> {
        if *wanted == TileSet::All {
            return self.frames.clone();
        }
        let mut out: Vec<Frame<P>> = self
            .frames
            .iter()
            .zip(&self.routes)
            .filter(|(f, r)| f.concerns(wanted) || wanted.matches(r) || Some(f.stamp.replica) == me)
            .map(|(f, _)| f.clone())
            .collect();
        for e in &self.entering {
            if wanted.wants(e.to) && !wanted.wants(e.from) {
                out.extend(e.frames.iter().cloned());
            }
        }
        out
    }

    pub fn filtered(&self, wanted: &TileSet) -> Vec<Frame<P>> {
        self.filtered_for(wanted, None)
    }
}

#[derive(Debug)]
pub struct Relay<P> {
    seq: u64,
    pending: HashMap<RouteKey, Frame<P>, crate::doc::FxBuild>,
    log: HashMap<RouteKey, (u64, Frame<P>), crate::doc::FxBuild>,
    by_seq: BTreeMap<(u64, RouteKey), ()>,
    /// Route keys per shape, for [`Entering`].
    by_shape: HashMap<u128, Vec<RouteKey>, crate::doc::FxBuild>,
    /// The tile of the newest positional frame per shape: where the shape is.
    shape_tile: HashMap<u128, u32, crate::doc::FxBuild>,
    /// Frames that arrived already dominated by the log: dropped, counted.
    pub dropped_dominated: u64,
}

impl<P: Clone> Default for Relay<P> {
    fn default() -> Self {
        Relay {
            seq: 0,
            pending: HashMap::default(),
            log: HashMap::default(),
            by_seq: BTreeMap::new(),
            by_shape: HashMap::default(),
            shape_tile: HashMap::default(),
            dropped_dominated: 0,
        }
    }
}

impl<P: Clone> Relay<P> {
    pub fn seq(&self) -> u64 {
        self.seq
    }

    pub fn log_len(&self) -> usize {
        self.log.len()
    }

    /// Where the relay knows a shape to be.
    pub fn tile_of_shape(&self, shape: u128) -> Option<u32> {
        self.shape_tile.get(&shape).copied()
    }

    /// Accept a frame from a client (or a downstream relay) for the next tick.
    pub fn submit(&mut self, f: Frame<P>) {
        if matches!(self.log.get(&f.route), Some((_, cur)) if cur.stamp >= f.stamp) {
            self.dropped_dominated += 1;
            return;
        }
        match self.pending.get(&f.route) {
            Some(cur) if cur.stamp >= f.stamp => self.dropped_dominated += 1,
            _ => {
                self.pending.insert(f.route, f);
            }
        }
    }

    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty()
    }

    /// Close the tick: sequence everything pending as one batch (frames in route order, so the batch
    /// is the same bytes whatever order the frames arrived in).
    pub fn tick(&mut self) -> Option<Arc<Batch<P>>> {
        if self.pending.is_empty() {
            return None;
        }
        self.seq += 1;
        let mut frames: Vec<Frame<P>> = self.pending.drain().map(|(_, f)| f).collect();
        frames.sort_unstable_by_key(|f| f.route);
        let mut routes = Vec::with_capacity(frames.len());
        let mut moved: BTreeMap<u128, (u32, u32)> = BTreeMap::new();
        for f in &frames {
            let shape = shape_of(f.route);
            let before = self.tile_of_shape(shape);
            self.store(self.seq, f.clone());
            let after = self.tile_of_shape(shape);
            routes.push([before.unwrap_or(TILE_NONE), after.unwrap_or(TILE_NONE)]);
            if let (Some(b), Some(a)) = (before, after) {
                if b != a {
                    moved.entry(shape).and_modify(|m| m.1 = a).or_insert((b, a));
                }
            }
        }
        let entering = moved
            .into_iter()
            .filter(|(_, (from, to))| from != to)
            .map(|(shape, (from, to))| Entering { from, to, frames: self.shape_frames(shape) })
            .collect();
        Some(Arc::new(Batch { seq: self.seq, frames, routes, entering }))
    }

    /// The newest frame of every register of a shape, in route order.
    pub fn shape_frames(&self, shape: u128) -> Vec<Frame<P>> {
        let mut routes = self.by_shape.get(&shape).cloned().unwrap_or_default();
        routes.sort_unstable();
        routes.iter().map(|r| self.log[r].1.clone()).collect()
    }

    /// A leaf relay mirrors the root's batches: same sequence numbers, same compaction, same idea of
    /// where each shape is.
    pub fn mirror(&mut self, b: &Batch<P>) {
        for f in &b.frames {
            if !matches!(self.log.get(&f.route), Some((_, cur)) if cur.stamp >= f.stamp) {
                self.store(b.seq, f.clone());
            }
        }
        self.seq = self.seq.max(b.seq);
    }

    fn store(&mut self, seq: u64, f: Frame<P>) {
        match self.log.get(&f.route) {
            Some((old_seq, _)) => {
                self.by_seq.remove(&(*old_seq, f.route));
            }
            None => self.by_shape.entry(shape_of(f.route)).or_default().push(f.route),
        }
        if is_positional(f.tiles[1]) {
            // The newest frame of the (one) positional register: the position every replica
            // converges to.
            self.shape_tile.insert(shape_of(f.route), tile(f.tiles[1]));
        }
        self.by_seq.insert((seq, f.route), ());
        self.log.insert(f.route, (seq, f));
    }

    /// Everything a replica that has every batch up to `after` is missing: the newest frame of every
    /// register changed since, and the sequence number it is then up to date with.
    pub fn catch_up(&self, after: u64) -> (u64, Vec<Frame<P>>) {
        self.catch_up_filtered(after, &TileSet::All)
    }

    /// The same, restricted to what a subscriber of `wanted` needs:
    ///
    /// - every frame changed since `after` that concerns its tiles, by the frame's own tiles or by
    ///   where the relay knows the shape to be now;
    /// - the whole state of every shape that moved since `after` and is now in its tiles (it never
    ///   saw the registers that did not change on the way);
    /// - every position change since `after`, wherever the shape went: a subscriber that last saw a
    ///   shape in one of its tiles must learn that it left, even if the only frame left in the log is
    ///   a later move between two tiles it does not watch.
    pub fn catch_up_filtered(&self, after: u64, wanted: &TileSet) -> (u64, Vec<Frame<P>>) {
        if *wanted == TileSet::All {
            let frames = self.by_seq.range((after + 1, 0)..).map(|((_, r), _)| self.log[r].1.clone()).collect();
            return (self.seq, frames);
        }
        let mut out: BTreeMap<RouteKey, Frame<P>> = BTreeMap::new();
        let mut entered = BTreeSet::new();
        for ((_, r), _) in self.by_seq.range((after + 1, 0)..) {
            let f = &self.log[r].1;
            let shape = shape_of(f.route);
            let here = self.tile_of_shape(shape).is_some_and(|t| wanted.wants(t));
            if is_positional(f.tiles[1]) {
                out.insert(f.route, f.clone());
                if here {
                    entered.insert(shape);
                }
            } else if f.concerns(wanted) || here {
                out.insert(f.route, f.clone());
            }
        }
        for shape in entered {
            for f in self.shape_frames(shape) {
                out.insert(f.route, f);
            }
        }
        (self.seq, out.into_values().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(route: u128, lamport: u64) -> Frame<u64> {
        Frame { route, stamp: Stamp { lamport, replica: 1 }, tiles: [route as u32, route as u32], payload: lamport }
    }

    #[test]
    fn a_tick_keeps_the_newest_per_register_and_catch_up_is_compacted() {
        let mut r = Relay::default();
        r.submit(f(1, 5));
        r.submit(f(1, 3));
        r.submit(f(2, 1));
        let b = r.tick().unwrap();
        assert_eq!(b.frames.iter().map(|x| x.payload).collect::<Vec<_>>(), vec![5, 1]);
        r.submit(f(1, 9));
        r.tick();
        r.submit(f(1, 4)); // older than the log: never broadcast
        assert!(r.tick().is_none());
        let (seq, frames) = r.catch_up(0);
        assert_eq!(seq, 2);
        assert_eq!(frames.iter().map(|x| x.payload).collect::<Vec<_>>(), vec![1, 9]);
        assert_eq!(r.catch_up(1).1.iter().map(|x| x.payload).collect::<Vec<_>>(), vec![9]);
        let only2 = TileSet::from_list(&[2]);
        assert_eq!(r.catch_up_filtered(0, &only2).1.iter().map(|x| x.payload).collect::<Vec<_>>(), vec![1]);
    }

    #[test]
    fn a_filtered_catch_up_brings_entered_shapes_whole_and_every_departure() {
        let mut r = Relay::default();
        r.submit(sf(1, 1, 7, [3, 3])); // fill, long ago, while in tile 3
        r.submit(sf(2, 2, 7, [TILE_ANY, positional(3)]));
        r.tick();
        r.submit(sf(2, 3, 9, [3, positional(8)])); // moved to 8 ...
        r.tick();
        let (_, got) = r.catch_up_filtered(1, &TileSet::from_list(&[8]));
        assert!(got.iter().any(|f| f.payload == 1), "the old fill comes with the entered shape: {got:?}");
        r.submit(sf(2, 4, 9, [8, positional(6)])); // ... and on to 6, so the log only says "8 -> 6"
        r.tick();
        let (_, got) = r.catch_up_filtered(1, &TileSet::from_list(&[3]));
        assert!(got.iter().any(|f| f.payload == 4), "a subscriber of 3 learns the shape is gone: {got:?}");
    }

    fn sf(prop: u128, lamport: u64, replica: u64, tiles: Tiles) -> Frame<u64> {
        Frame { route: (5u128 << SHAPE_SHIFT) | prop, stamp: Stamp { lamport, replica }, tiles, payload: lamport }
    }

    #[test]
    fn a_shape_entering_a_tile_brings_its_whole_state_and_a_writer_gets_its_echo() {
        let mut r = Relay::default();
        r.submit(sf(1, 1, 7, [3, 3])); // fill, written while the shape is in tile 3
        r.submit(sf(2, 2, 7, [TILE_ANY, positional(3)])); // placed in tile 3
        r.tick();
        r.submit(sf(2, 3, 9, [3, positional(8)])); // moved to tile 8 by replica 9
        let b = r.tick().unwrap();
        let in8 = TileSet::from_list(&[8]);
        let got: Vec<u64> = b.filtered_for(&in8, None).iter().map(|f| f.payload).collect();
        assert!(got.contains(&1) && got.contains(&3), "the fill comes with the move: {got:?}");
        let in3 = TileSet::from_list(&[3]);
        assert_eq!(b.filtered_for(&in3, None).iter().map(|f| f.payload).collect::<Vec<_>>(), vec![3], "tile 3 only sees it leave");
        let elsewhere = TileSet::from_list(&[1]);
        assert!(b.filtered_for(&elsewhere, None).is_empty());
        assert_eq!(b.filtered_for(&elsewhere, Some(9)).len(), 1, "the writer gets its echo");
    }

    #[test]
    fn a_write_tagged_with_a_stale_tile_still_reaches_where_the_shape_is() {
        let mut r = Relay::default();
        r.submit(sf(2, 1, 7, [TILE_ANY, positional(3)]));
        r.tick();
        r.submit(sf(2, 5, 9, [3, positional(8)])); // moved to 8 ...
        r.submit(sf(1, 4, 7, [3, 3])); // ... while replica 7, not knowing, recolours it "in 3"
        let b = r.tick().unwrap();
        let in8 = TileSet::from_list(&[8]);
        assert!(b.filtered_for(&in8, None).iter().any(|f| f.payload == 4));
        assert!(r.catch_up_filtered(0, &in8).1.iter().any(|f| f.payload == 4), "and a later catch-up of tile 8 has it");
    }

    #[test]
    fn concurrent_moves_route_by_the_winner_not_by_the_writers() {
        let mut r = Relay::default();
        r.submit(sf(2, 1, 7, [TILE_ANY, positional(3)]));
        r.tick();
        // Two writers move it at once, both from 3; the higher stamp wins in every replica.
        r.submit(sf(2, 10, 1, [3, positional(4)]));
        r.submit(sf(2, 10, 2, [3, positional(6)]));
        r.tick();
        assert_eq!(r.tile_of_shape(5), Some(6));
        r.submit(sf(1, 11, 1, [4, 4])); // the loser recolours it where it thinks it is
        let b = r.tick().unwrap();
        assert!(b.filtered_for(&TileSet::from_list(&[6]), None).iter().any(|f| f.payload == 11));
    }

    #[test]
    fn any_reaches_everyone_and_none_nobody() {
        let meta = Frame { route: 2, stamp: Stamp::ZERO, tiles: [TILE_ANY, TILE_ANY], payload: () };
        assert!(meta.concerns(&TileSet::from_list(&[4])));
        assert!(!TileSet::from_list(&[4]).matches(&[TILE_NONE, TILE_NONE]));
        assert!(!TileSet::All.wants(TILE_NONE));
    }
}
