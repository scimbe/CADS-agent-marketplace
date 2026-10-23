//! Deterministic simulation of many editors on one document behind a relay tree, with a hostile
//! network: random delay (reordering), duplication, loss on both directions, and editors that go
//! offline for a while and keep editing.
//!
//! The acceptance question is answered against an oracle, not only between replicas: the oracle is
//! a document that applied every delta any editor ever produced. After the network settles, every
//! replica's state hash must equal the oracle's. Equal among themselves means they converged; equal
//! to the oracle means no write was lost on the way (a relay that dropped one would still let the
//! replicas agree -- on the wrong state).
//!
//! Interest management is part of the model because it is what makes the design usable on a phone:
//! a mobile editor subscribes in real time only to the tiles of its viewport, pans now and then
//! (fetching the newly visible tiles), and pulls everything else as a compacted background catch-up
//! every `background_every` ticks. A share of the editors (`full_replica_share`) are desktops that
//! take everything in real time. The report separates the bandwidth of the three paths.
//!
//! What this exercises: the merge, the outbox (coalescing, resend, acknowledgement by echo), the
//! relay's sequencing, compaction, filtering and catch-up, the leaf mirror, gap detection. What it
//! does not: encryption and the byte format (covered by `wire` tests and the TCP test in
//! `tests/net.rs`), and real time (a tick is a logical step; `tick_ms` only converts counts into
//! rates for the report).
//!
//! Convergence alone would let a broken real-time path pass (the background catch-up heals it
//! later), so freshness is checked too: when the edit phase ends, every phone that was online and
//! did not pan during the last `freshness_lag` ticks must see every register of every shape in its
//! viewport at least as new as the relay had sequenced `freshness_lag` ticks earlier -- for the
//! shapes that are in its viewport by that earlier state and still are by the relay's current one
//! (a shape that was there briefly and has left since need not be complete) -- and the position of
//! every shape it believes to be in its viewport (so that it sees shapes leave).
//!
//! Same config, same seed: same report, whatever the number of threads -- every editor has its own
//! RNG and every cross-editor step runs in editor order.

use crate::doc::{Delta, Doc, Prop, ShapeId};
use crate::outbox::Outbox;
use crate::relay::{is_positional, positional, shape_of, tile, Batch, Frame, Relay, TileSet, Tiles, TILE_ANY};
use crate::value::Value;
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, VecDeque};
use std::sync::Arc;
use std::time::Instant;

type P = Arc<Delta>;

/// The canvas spans [-CANVAS, CANVAS) on both axes.
const CANVAS: f64 = 1000.0;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SimConfig {
    pub editors: usize,
    /// Leaf relays; editors are spread evenly. The root's fan-out is this number.
    pub leaves: usize,
    /// Ticks with edits; the settle phase follows.
    pub ticks: u64,
    /// Interpretation of a tick for the rates in the report (the simulation itself is logical).
    pub tick_ms: u64,
    /// Probability per editor and tick of one edit.
    pub op_prob: f64,
    pub initial_shapes: usize,
    /// Probability per online editor and tick of losing the connection.
    pub offline_prob: f64,
    pub offline_ticks_max: u64,
    /// Downstream delivery delay, uniform in 0..=delay_max ticks (reorders batches).
    pub delay_max: u64,
    pub dup_prob: f64,
    /// Loss probability for a downstream batch and, independently, for an upstream frame.
    pub loss_prob: f64,
    /// Ticks a gap may stay open before the editor asks its leaf for a catch-up.
    pub gap_timeout: u64,
    /// Ticks after which an unacknowledged write is sent again.
    pub resend_every: u64,
    pub settle_max: u64,
    /// Tiles per side of the canvas; 0 = no interest management (everyone takes everything).
    pub tiles_per_side: u32,
    /// Viewport of a mobile editor, in tiles per side.
    pub viewport_side: u32,
    /// Share of editors that are full replicas in real time (desktops).
    pub full_replica_share: f64,
    /// Ticks between the background catch-ups of a mobile editor.
    pub background_every: u64,
    /// Probability per mobile editor and tick of panning the viewport by one tile.
    pub pan_prob: f64,
    /// Ticks a phone may lag behind the relay for shapes in its viewport (must cover the delivery
    /// delay plus the gap timeout plus the repair round trip).
    pub freshness_lag: u64,
    pub seed: u64,
}

impl SimConfig {
    /// The acceptance profile: 10 000 editors, every one of them writing (0.4 writes a second for 30
    /// simulated seconds -- the worst case for bandwidth; in a real session most participants watch),
    /// on one document that grows from 500 to about 1 700 shapes. 10 % are desktops taking
    /// everything in real time, the rest phones with a 3x3-tile viewport on a 10x10-tile canvas and
    /// a background catch-up every 30 s. The document size is bounded by the simulation host, which
    /// holds all 10 000 replicas in one process (~55 bytes per register and replica); a real device
    /// holds one.
    pub fn acceptance() -> SimConfig {
        SimConfig {
            editors: 10_000,
            leaves: 100,
            ticks: 600,
            tick_ms: 50,
            op_prob: 0.02,
            initial_shapes: 500,
            offline_prob: 0.0005,
            offline_ticks_max: 200,
            delay_max: 4,
            dup_prob: 0.02,
            loss_prob: 0.01,
            gap_timeout: 6,
            resend_every: 10,
            settle_max: 4_000,
            tiles_per_side: 10,
            viewport_side: 3,
            full_replica_share: 0.1,
            background_every: 600,
            pan_prob: 0.002,
            freshness_lag: 16,
            seed: 1,
        }
    }

    pub fn small() -> SimConfig {
        SimConfig {
            editors: 60,
            leaves: 4,
            ticks: 160,
            initial_shapes: 20,
            op_prob: 0.3,
            offline_prob: 0.01,
            offline_ticks_max: 40,
            background_every: 40,
            pan_prob: 0.02,
            full_replica_share: 0.2,
            ..SimConfig::acceptance()
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct SimReport {
    pub editors: usize,
    pub leaves: usize,
    pub ticks: u64,
    pub converged: bool,
    pub equals_oracle: bool,
    pub distinct_state_hashes: usize,
    pub distinct_scene_hashes: usize,
    pub state_hash: String,
    pub registers: usize,
    pub live_shapes: usize,
    pub deltas_generated: u64,
    pub frames_uploaded: u64,
    pub frames_sequenced: u64,
    pub batches: u64,
    pub dropped_dominated_at_root: u64,
    pub catch_ups: u64,
    pub catch_up_frames_max: usize,
    /// Freshness at the end of the edit phase: viewport registers checked on eligible phones, and
    /// how many of them were older than the relay's state `freshness_lag` ticks earlier.
    pub fresh_phones_checked: usize,
    pub viewport_registers_checked: u64,
    pub viewport_registers_stale: u64,
    pub settle_ticks: u64,
    /// Coalescing on the way: uploaded / generated and sequenced / uploaded.
    pub client_coalescing: f64,
    pub root_coalescing: f64,
    /// Average downstream bandwidth during the edit phase, sealed frames on the wire, per editor
    /// class and path: real time (viewport or everything), background catch-up, pans and gap repair.
    pub full_replica_bytes_per_s: f64,
    pub mobile_realtime_bytes_per_s: f64,
    pub mobile_background_bytes_per_s: f64,
    pub mobile_pan_and_repair_bytes_per_s: f64,
    pub mobile_total_bytes_per_s: f64,
    /// Root relay output: one copy per leaf.
    pub root_frames_out_per_s: f64,
    #[serde(skip)]
    pub wall_ms: u128,
}

/// Downstream frame counts of one editor, by path.
#[derive(Default, Clone, Copy)]
struct Traffic {
    realtime: u64,
    background: u64,
    pan_repair: u64,
}

/// A batch on its way to one editor, filtered by the leaf when it sent it -- with the subscription
/// valid then, as the relay in [`crate::net`] does. A full replica's share is the batch itself.
#[derive(Clone)]
enum Delivery {
    Whole(Arc<Batch<P>>),
    Part(u64, Arc<Vec<Frame<P>>>),
}

impl Delivery {
    fn seq(&self) -> u64 {
        match self {
            Delivery::Whole(b) => b.seq,
            Delivery::Part(seq, _) => *seq,
        }
    }

    fn frames(&self) -> &[Frame<P>] {
        match self {
            Delivery::Whole(b) => &b.frames,
            Delivery::Part(_, f) => f,
        }
    }
}

struct Editor {
    doc: Doc,
    outbox: Outbox,
    rng: ChaCha8Rng,
    leaf: usize,
    offline_until: u64,
    inbox: Vec<(u64, Delivery)>,
    /// Every frame of the wanted tiles up to here is applied.
    hwm: u64,
    seen: BTreeSet<u64>,
    gap_since: Option<u64>,
    last_resend: u64,
    /// Full replica, or the viewport's origin tile.
    viewport: Option<(u32, u32)>,
    wanted: TileSet,
    /// Every frame of every tile up to here is applied (the last background catch-up).
    bg_hwm: u64,
    next_background: u64,
    pending: Vec<(Path, u64, Vec<Frame<P>>)>,
    traffic: Traffic,
    /// Last tick the editor was offline or panned: the freshness check skips it for a while after.
    last_disturbed: u64,
}

#[derive(Clone, Copy, PartialEq)]
enum Path {
    /// Every tile: afterwards everything up to `upto` is in.
    Background,
    /// The wanted tiles after `hwm` (a gap, a reconnect): afterwards the wanted tiles are complete.
    Repair,
    /// Only the newly visible tiles after `bg_hwm`: completes those, says nothing about the others.
    Pan,
}

fn tile_xy(tps: u32, x: f64, y: f64) -> u32 {
    let side = 2.0 * CANVAS / tps as f64;
    let tx = (((x + CANVAS) / side).floor() as i64).clamp(0, tps as i64 - 1) as u32;
    let ty = (((y + CANVAS) / side).floor() as i64).clamp(0, tps as i64 - 1) as u32;
    ty * tps + tx
}

/// The tile a shape is in, by the editor's own view of its position (a shape without one is
/// everyone's business).
fn tile_of(doc: &Doc, tps: u32, s: ShapeId) -> u32 {
    if tps == 0 {
        return TILE_ANY;
    }
    match doc.get(s, Prop::POS).and_then(Value::as_vec2) {
        Some((x, y)) => tile_xy(tps, x, y),
        None => TILE_ANY,
    }
}

fn viewport_tiles(tps: u32, side: u32, (ox, oy): (u32, u32)) -> BTreeSet<u32> {
    let mut set = BTreeSet::new();
    for dy in 0..side {
        for dx in 0..side {
            set.insert(((oy + dy) % tps) * tps + (ox + dx) % tps);
        }
    }
    set
}

impl Editor {
    fn online(&self, now: u64) -> bool {
        now >= self.offline_until
    }

    fn take_frame(&mut self, f: &Frame<P>) {
        self.doc.apply(&f.payload);
        self.outbox.acknowledge(&f.payload.key, f.stamp);
    }

    /// What the leaf sends this editor of a fresh batch, filtered now (at sending time).
    fn share_of(&self, b: &Arc<Batch<P>>) -> Delivery {
        if self.wanted == TileSet::All {
            Delivery::Whole(b.clone())
        } else {
            Delivery::Part(b.seq, Arc::new(b.filtered_for(&self.wanted, Some(self.doc.replica()))))
        }
    }

    fn receive(&mut self, d: &Delivery) {
        let frames = d.frames();
        self.traffic.realtime += frames.len() as u64;
        for f in frames {
            self.take_frame(f);
        }
        let seq = d.seq();
        if seq <= self.hwm || self.seen.contains(&seq) {
            return; // a duplicate: harmless (idempotent), counted as traffic above
        }
        self.seen.insert(seq);
        self.advance();
    }

    fn advance(&mut self) {
        let hwm = self.hwm;
        self.seen.retain(|s| *s > hwm);
        while self.seen.remove(&(self.hwm + 1)) {
            self.hwm += 1;
        }
    }

    fn apply_fetched(&mut self, path: Path, upto: u64, frames: &[Frame<P>]) {
        for f in frames {
            self.take_frame(f);
        }
        match path {
            Path::Background => {
                self.traffic.background += frames.len() as u64;
                // Everything up to `upto` is in, for every tile.
                self.bg_hwm = self.bg_hwm.max(upto);
                self.hwm = self.hwm.max(upto);
            }
            Path::Repair => {
                self.traffic.pan_repair += frames.len() as u64;
                self.hwm = self.hwm.max(upto);
                if self.wanted == TileSet::All {
                    self.bg_hwm = self.bg_hwm.max(upto);
                }
            }
            Path::Pan => {
                // The new tiles are complete up to `upto` >= hwm; the old ones are what they were.
                self.traffic.pan_repair += frames.len() as u64;
            }
        }
        self.advance();
    }

    /// One edit, recorded with the tiles it concerns (for a move: the tile left and the tile reached).
    fn edit(&mut self, catalog: &[ShapeId], tps: u32, out: &mut Vec<Delta>) {
        let pick = |rng: &mut ChaCha8Rng| catalog[rng.gen_range(0..catalog.len())];
        let r: f64 = self.rng.gen();
        let emit = |e: &mut Editor, out: &mut Vec<Delta>, d: Delta, tiles: Tiles| {
            e.outbox.push_in(d.clone(), tiles);
            out.push(d);
        };
        if catalog.is_empty() || r < 0.01 {
            let parent = if !catalog.is_empty() && self.rng.gen_bool(0.3) { Some(pick(&mut self.rng)) } else { None };
            let (id, ds) = self.doc.create(self.rng.gen_range(0..6), parent);
            let (x, y) = (self.rng.gen_range(-CANVAS..CANVAS), self.rng.gen_range(-CANVAS..CANVAS));
            for d in ds {
                emit(self, out, d, [TILE_ANY, TILE_ANY]);
            }
            let t = if tps == 0 { TILE_ANY } else { tile_xy(tps, x, y) };
            let dp = self.doc.set(id, Prop::POS, Value::vec2(x, y));
            emit(self, out, dp, [TILE_ANY, positional(t)]);
            return;
        }
        // A phone edits what it sees (an edit through a list or a search scrolls the canvas to the
        // shape first, which is a pan): look for a shape in the viewport, by its own view.
        let mut s = pick(&mut self.rng);
        if self.viewport.is_some() {
            let mut found = false;
            for _ in 0..20 {
                if self.wanted.wants(tile_of(&self.doc, tps, s)) {
                    found = true;
                    break;
                }
                s = pick(&mut self.rng);
            }
            if !found {
                return;
            }
        }
        let before = tile_of(&self.doc, tps, s);
        let d = if r < 0.03 {
            self.doc.delete(s)
        } else if r < 0.035 {
            self.doc.set(s, Prop::EXISTS, Value::Bool(true))
        } else if r < 0.07 {
            let p = pick(&mut self.rng);
            self.doc.reparent(s, if self.rng.gen_bool(0.2) { None } else { Some(p) })
        } else if r < 0.17 {
            let (lo, hi) = (pick(&mut self.rng), pick(&mut self.rng));
            self.doc.move_between(s, Some(lo), Some(hi))
        } else if r < 0.45 {
            // A drag: a small step, mostly within the tile.
            let (x, y) = self.doc.get(s, Prop::POS).and_then(Value::as_vec2).unwrap_or((0.0, 0.0));
            let step = |v: f64, rng: &mut ChaCha8Rng| (v + rng.gen_range(-60.0..60.0)).clamp(-CANVAS, CANVAS - 1e-6);
            let (nx, ny) = (step(x, &mut self.rng), step(y, &mut self.rng));
            let d = self.doc.set(s, Prop::POS, Value::vec2(nx, ny));
            let to = if tps == 0 { TILE_ANY } else { tile_xy(tps, nx, ny) };
            emit(self, out, d, [before, positional(to)]);
            return;
        } else {
            let prop = [Prop::W, Prop::H, Prop::ROTATION, Prop::FILL, Prop::TEXT][self.rng.gen_range(0..5)];
            let v = match prop {
                Prop::FILL => Value::Int(self.rng.gen_range(0..0xFF_FF_FF)),
                Prop::TEXT => Value::bytes(&self.rng.gen::<[u8; 12]>()),
                _ => Value::num(self.rng.gen_range(0.0..500.0)),
            };
            self.doc.set(s, prop, v)
        };
        emit(self, out, d, [before, before]);
    }
}

/// Every tile each shape's position was sequenced into by the given batches (the root batches of
/// the freshness window), by the positional frames in them, keyed by the shape's route hash.
pub fn window_positions<'a, Q: 'a>(batches: impl IntoIterator<Item = &'a Batch<Q>>) -> HashMap<u128, Vec<u32>> {
    let mut out: HashMap<u128, Vec<u32>> = HashMap::new();
    for b in batches {
        for f in &b.frames {
            if is_positional(f.tiles[1]) {
                out.entry(shape_of(f.route)).or_default().push(tile(f.tiles[1]));
            }
        }
    }
    out
}

/// Whether a shape stayed in the tiles of `wanted` for the whole window: the relay has it there now
/// (or knows no position) and it never moved out of them in between. A shape that left and came
/// back may still have its entering state on the way, so it is not held to full freshness.
pub fn held_throughout(wanted: &TileSet, now: Option<u32>, window: Option<&[u32]>) -> bool {
    now.is_none_or(|t| wanted.wants(t)) && window.is_none_or(|ts| ts.iter().all(|t| wanted.wants(*t)))
}

pub fn run(cfg: &SimConfig) -> SimReport {
    let started = Instant::now();
    let tps = cfg.tiles_per_side;
    let mut master = ChaCha8Rng::seed_from_u64(cfg.seed);
    let mut editors: Vec<Editor> = (0..cfg.editors)
        .map(|i| {
            // 64-bit random replica ids, as in production.
            let replica: u64 = master.gen::<u64>() | 1;
            let full = tps == 0 || master.gen_bool(cfg.full_replica_share.clamp(0.0, 1.0));
            let viewport = (!full).then(|| (master.gen_range(0..tps), master.gen_range(0..tps)));
            let wanted = match viewport {
                None => TileSet::All,
                Some(o) => TileSet::Only(viewport_tiles(tps, cfg.viewport_side, o)),
            };
            Editor {
                doc: Doc::new(replica),
                outbox: Outbox::default(),
                rng: ChaCha8Rng::seed_from_u64(cfg.seed ^ (i as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)),
                leaf: i * cfg.leaves / cfg.editors.max(1),
                offline_until: 0,
                inbox: Vec::new(),
                hwm: 0,
                seen: BTreeSet::new(),
                gap_since: None,
                last_resend: 0,
                viewport,
                wanted,
                bg_hwm: 0,
                // Spread the background catch-ups over the interval instead of all at once.
                next_background: (i as u64 * 7919) % cfg.background_every.max(1),
                pending: Vec::new(),
                traffic: Traffic::default(),
                last_disturbed: 0,
            }
        })
        .collect();
    // The relay's state as it was `freshness_lag` ticks ago.
    let mut lagged = Doc::new(0);
    let mut lag_queue: VecDeque<(u64, Arc<Batch<P>>)> = VecDeque::new();
    let (mut fresh_phones_checked, mut viewport_registers_checked, mut viewport_registers_stale) = (0usize, 0u64, 0u64);
    let mut root: Relay<P> = Relay::default();
    let mut leaves: Vec<Relay<P>> = (0..cfg.leaves).map(|_| Relay::default()).collect();
    let mut fresh: Vec<Arc<Batch<P>>> = Vec::new();
    let mut oracle = Doc::new(0);
    let mut catalog: Vec<ShapeId> = Vec::new();

    // Editor 0 lays out the initial document.
    let mut seed_rng = ChaCha8Rng::seed_from_u64(cfg.seed.wrapping_add(17));
    for _ in 0..cfg.initial_shapes {
        let e = &mut editors[0];
        let (id, ds) = e.doc.create(0, None);
        catalog.push(id);
        let (x, y) = (seed_rng.gen_range(-CANVAS..CANVAS), seed_rng.gen_range(-CANVAS..CANVAS));
        let t = if tps == 0 { TILE_ANY } else { tile_xy(tps, x, y) };
        for d in ds {
            oracle.apply(&d);
            e.outbox.push_in(d, [TILE_ANY, TILE_ANY]);
        }
        let d = e.doc.set(id, Prop::POS, Value::vec2(x, y));
        oracle.apply(&d);
        e.outbox.push_in(d, [TILE_ANY, positional(t)]);
    }

    let mut deltas_generated = cfg.initial_shapes as u64 * 5;
    let (mut frames_uploaded, mut frames_sequenced, mut batches, mut catch_ups) = (0u64, 0u64, 0u64, 0u64);
    let mut catch_up_frames_max = 0usize;
    let mut edit_phase: Vec<Traffic> = Vec::new();
    let mut edit_phase_sequenced = 0u64;
    let mut now = 0u64;
    let mut settle_ticks = 0u64;
    let mut converged_net = false;

    loop {
        let editing = now < cfg.ticks;
        if now == cfg.ticks && tps > 0 {
            let root_now = &root;
            let lag = cfg.freshness_lag;
            let window_tiles = window_positions(lag_queue.iter().map(|(_, b)| &**b));
            let window_tiles = &window_tiles;
            let checks: Vec<Option<(u64, u64)>> = editors
                .par_iter()
                .map(|e| {
                    if e.viewport.is_none() || !e.online(now) || now - e.last_disturbed <= lag || !e.pending.is_empty() {
                        return None;
                    }
                    let (mut checked, mut stale) = (0u64, 0u64);
                    for (key, stamp, _) in lagged.sorted_registers() {
                        let shape = key.shape;
                        let here = |d: &Doc| e.wanted.matches(&[tile_of(d, tps, shape); 2]);
                        // In the phone's tiles during the whole window, not only at its ends: a shape
                        // that left and came back may have its entering state still on the way.
                        let still_here = || {
                            let pos = crate::doc::RegKey { shape, prop: Prop::POS }.packed();
                            let id = shape_of(pos);
                            held_throughout(&e.wanted, root_now.tile_of_shape(id), window_tiles.get(&id).map(Vec::as_slice))
                        };
                        // A shape in the viewport (then and now): all of it must be fresh. A shape
                        // the phone thinks is there: its position must be (to see it leave).
                        let check = (here(&lagged) && still_here()) || (key.prop == Prop::POS && here(&e.doc));
                        if !check {
                            continue;
                        }
                        checked += 1;
                        if e.doc.stamp_of(&key).is_none_or(|s| s < stamp) {
                            stale += 1;
                        }
                    }
                    Some((checked, stale))
                })
                .collect();
            for (c, s) in checks.into_iter().flatten() {
                fresh_phones_checked += 1;
                viewport_registers_checked += c;
                viewport_registers_stale += s;
            }
        }
        if !editing && settle_ticks == 0 {
            // Settle: everyone back online, nobody edits, the network stays as bad as it was.
            for e in editors.iter_mut() {
                e.offline_until = e.offline_until.min(now);
            }
            edit_phase = editors.iter().map(|e| e.traffic).collect();
            edit_phase_sequenced = frames_sequenced;
        }
        let snapshot = &catalog;
        let fresh_ref = &fresh;
        // Editors, in parallel: receive, detect gaps, pan, edit, upload. Requests to the leaf come
        // back as (path, wanted tiles, after) and are answered below, in editor order.
        let results: Vec<(Vec<Frame<P>>, Vec<Delta>, Vec<(Path, TileSet, u64)>)> = editors
            .par_iter_mut()
            .map(|e| {
                let mut generated = Vec::new();
                let mut requests = Vec::new();
                if e.online(now) && editing && cfg.offline_prob > 0.0 && e.rng.gen_bool(cfg.offline_prob) {
                    e.offline_until = now + e.rng.gen_range(1..=cfg.offline_ticks_max);
                }
                let online = e.online(now);
                if !online {
                    e.last_disturbed = now;
                }
                for (path, upto, frames) in std::mem::take(&mut e.pending) {
                    e.apply_fetched(path, upto, &frames);
                }
                // Fresh batches of this editor's leaf: decide delay, duplication and loss.
                for b in fresh_ref.iter() {
                    if !online || e.rng.gen_bool(cfg.loss_prob) {
                        continue;
                    }
                    let share = e.share_of(b);
                    let at = now + e.rng.gen_range(0..=cfg.delay_max);
                    e.inbox.push((at, share.clone()));
                    if e.rng.gen_bool(cfg.dup_prob) {
                        e.inbox.push((at + e.rng.gen_range(0..=cfg.delay_max), share));
                    }
                }
                if online {
                    e.inbox.sort_by_key(|(at, d)| (*at, d.seq()));
                    let due = e.inbox.iter().take_while(|(at, _)| *at <= now).count();
                    let ready: Vec<_> = e.inbox.drain(..due).collect();
                    for (_, b) in ready {
                        e.receive(&b);
                    }
                } else {
                    e.inbox.clear(); // the link is down: in flight is lost
                }
                let max_seen = e.seen.iter().next_back().copied().unwrap_or(e.hwm);
                if max_seen > e.hwm {
                    e.gap_since.get_or_insert(now);
                } else {
                    e.gap_since = None;
                }
                if online {
                    let reconnect = e.offline_until == now && now > 0;
                    if reconnect || matches!(e.gap_since, Some(t) if now - t >= cfg.gap_timeout) {
                        requests.push((Path::Repair, e.wanted.clone(), e.hwm));
                        e.gap_since = None;
                    }
                    if e.viewport.is_some() && now >= e.next_background {
                        requests.push((Path::Background, TileSet::All, e.bg_hwm));
                        e.next_background = now + cfg.background_every;
                    }
                    if let Some((ox, oy)) = e.viewport {
                        if editing && e.rng.gen_bool(cfg.pan_prob) {
                            let o = if e.rng.gen_bool(0.5) { ((ox + 1) % tps, oy) } else { (ox, (oy + 1) % tps) };
                            let before = viewport_tiles(tps, cfg.viewport_side, (ox, oy));
                            let after = viewport_tiles(tps, cfg.viewport_side, o);
                            let new: BTreeSet<u32> = after.difference(&before).copied().collect();
                            e.viewport = Some(o);
                            e.wanted = TileSet::Only(after);
                            e.last_disturbed = now;
                            // The newly visible tiles are complete up to bg_hwm; fetch the rest.
                            requests.push((Path::Pan, TileSet::Only(new), e.bg_hwm));
                        }
                    }
                }
                if editing && !snapshot.is_empty() && e.rng.gen_bool(cfg.op_prob) {
                    e.edit(snapshot, tps, &mut generated);
                }
                let mut up = Vec::new();
                if online {
                    if now - e.last_resend >= cfg.resend_every {
                        e.outbox.requeue_due(now, cfg.resend_every);
                        e.last_resend = now;
                    }
                    for (d, tiles) in e.outbox.take(now) {
                        if !e.rng.gen_bool(cfg.loss_prob) {
                            up.push(Frame { route: d.key.packed(), stamp: d.stamp, tiles, payload: Arc::new(d) });
                        }
                    }
                }
                (up, generated, requests)
            })
            .collect();

        // Cross-editor steps, in editor order (determinism).
        let mut uploads: Vec<HashMap<u128, Frame<P>, crate::doc::FxBuild>> = (0..cfg.leaves).map(|_| HashMap::default()).collect();
        for (i, (up, generated, requests)) in results.into_iter().enumerate() {
            deltas_generated += generated.len() as u64;
            for d in &generated {
                oracle.apply(d);
                if d.key.prop == Prop::EXISTS && d.stamp == d.key.shape {
                    catalog.push(d.key.shape);
                }
            }
            frames_uploaded += up.len() as u64;
            let leaf = editors[i].leaf;
            for f in up {
                match uploads[leaf].get(&f.route) {
                    Some(cur) if cur.stamp >= f.stamp => {}
                    _ => {
                        uploads[leaf].insert(f.route, f);
                    }
                }
            }
            for (path, wanted, after) in requests {
                let (upto, frames) = leaves[leaf].catch_up_filtered(after, &wanted);
                catch_up_frames_max = catch_up_frames_max.max(frames.len());
                catch_ups += 1;
                editors[i].pending.push((path, upto, frames));
            }
        }
        // Leaves forward their coalesced uploads; the root sequences one batch; the leaves mirror it.
        for ups in uploads {
            let mut frames: Vec<_> = ups.into_values().collect();
            frames.sort_unstable_by_key(|f| (f.route, f.stamp));
            for f in frames {
                root.submit(f);
            }
        }
        fresh.clear();
        if let Some(b) = root.tick() {
            batches += 1;
            frames_sequenced += b.frames.len() as u64;
            for leaf in leaves.iter_mut() {
                leaf.mirror(&b);
            }
            lag_queue.push_back((now, b.clone()));
            fresh.push(b);
        }
        while lag_queue.front().is_some_and(|(at, _)| at + cfg.freshness_lag <= now) {
            let (_, b) = lag_queue.pop_front().unwrap();
            for f in &b.frames {
                lagged.apply(&f.payload);
            }
        }

        now += 1;
        if !editing {
            settle_ticks += 1;
            let quiet = !root.has_pending()
                && fresh.is_empty()
                && editors.iter().all(|e| {
                    // Periodic background fetches go on in a quiet network; only one that still
                    // carries frames means something is outstanding.
                    e.outbox.is_idle()
                        && e.inbox.is_empty()
                        && e.pending.iter().all(|(_, _, frames)| frames.is_empty())
                        && e.hwm == root.seq()
                        && (e.viewport.is_none() || e.bg_hwm == root.seq())
                });
            if quiet {
                converged_net = true;
                break;
            }
            if settle_ticks >= cfg.settle_max {
                break;
            }
            // Idle editors with nothing to see would never notice a lost last batch: a periodic
            // probe (in production: the reconnect/heartbeat) closes that, and mobile editors pull
            // their background sooner once nobody edits.
            // Staggered over the probe period, as a real fleet would be (and so that the
            // simulation does not hold every catch-up of every editor at once).
            let period = cfg.gap_timeout * 2;
            {
                for (i, e) in editors.iter_mut().enumerate() {
                    if (settle_ticks + i as u64) % period != 0 {
                        continue;
                    }
                    let target = root.seq();
                    let behind = e.hwm < target || (e.viewport.is_some() && e.bg_hwm < target);
                    // An unacknowledged write whose newer replacement is outside the viewport is
                    // settled by a catch-up that carries the replacement.
                    if e.pending.is_empty() && (behind || !e.outbox.is_idle()) {
                        let (path, after) = if e.viewport.is_some() { (Path::Background, e.bg_hwm) } else { (Path::Repair, e.hwm) };
                        let (upto, frames) = leaves[e.leaf].catch_up_filtered(after, &TileSet::All);
                        catch_up_frames_max = catch_up_frames_max.max(frames.len());
                        catch_ups += 1;
                        e.pending.push((path, upto, frames));
                    }
                }
            }
        }
    }

    let oracle_hash = oracle.state_hash();
    let oracle_scene = oracle.materialize();
    let hashes: Vec<([u8; 32], [u8; 32])> = editors.par_iter().map(|e| (e.doc.state_hash(), e.doc.materialize().hash())).collect();
    let state: BTreeSet<[u8; 32]> = hashes.iter().map(|h| h.0).collect();
    let scene: BTreeSet<[u8; 32]> = hashes.iter().map(|h| h.1).collect();
    let equals_oracle = state.len() == 1 && state.contains(&oracle_hash) && scene.len() == 1 && scene.contains(&oracle_scene.hash());

    let secs = ((cfg.ticks * cfg.tick_ms) as f64 / 1000.0).max(1e-9);
    // Average sealed size of a frame: header + plaintext + tag, over the oracle's registers.
    let avg_frame = {
        let regs = oracle.sorted_registers();
        let total: usize = regs.iter().map(|(k, s, v)| crate::wire::wire_size(&Delta { key: *k, stamp: *s, value: (*v).clone() })).sum();
        total as f64 / regs.len().max(1) as f64
    };
    let rate = |frames: f64, n: usize| frames * avg_frame / n.max(1) as f64 / secs;
    let (mut full_n, mut mob_n) = (0usize, 0usize);
    let (mut full_rt, mut mob_rt, mut mob_bg, mut mob_pr) = (0f64, 0f64, 0f64, 0f64);
    for (e, t) in editors.iter().zip(&edit_phase) {
        if e.viewport.is_none() {
            full_n += 1;
            full_rt += (t.realtime + t.pan_repair) as f64;
        } else {
            mob_n += 1;
            mob_rt += t.realtime as f64;
            mob_bg += t.background as f64;
            mob_pr += t.pan_repair as f64;
        }
    }
    let hex = |b: &[u8; 32]| b.iter().map(|x| format!("{x:02x}")).collect::<String>();
    SimReport {
        editors: cfg.editors,
        leaves: cfg.leaves,
        ticks: cfg.ticks,
        converged: converged_net && state.len() == 1 && scene.len() == 1,
        equals_oracle,
        distinct_state_hashes: state.len(),
        distinct_scene_hashes: scene.len(),
        state_hash: hex(&oracle_hash),
        registers: oracle.register_count(),
        live_shapes: oracle_scene.nodes.len(),
        deltas_generated,
        frames_uploaded,
        frames_sequenced,
        batches,
        dropped_dominated_at_root: root.dropped_dominated,
        catch_ups,
        catch_up_frames_max,
        fresh_phones_checked,
        viewport_registers_checked,
        viewport_registers_stale,
        settle_ticks,
        client_coalescing: frames_uploaded as f64 / deltas_generated.max(1) as f64,
        root_coalescing: frames_sequenced as f64 / frames_uploaded.max(1) as f64,
        full_replica_bytes_per_s: rate(full_rt, full_n),
        mobile_realtime_bytes_per_s: rate(mob_rt, mob_n),
        mobile_background_bytes_per_s: rate(mob_bg, mob_n),
        mobile_pan_and_repair_bytes_per_s: rate(mob_pr, mob_n),
        mobile_total_bytes_per_s: rate(mob_rt + mob_bg + mob_pr, mob_n),
        root_frames_out_per_s: edit_phase_sequenced as f64 * cfg.leaves as f64 / secs,
        wall_ms: started.elapsed().as_millis(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_small_hostile_run_converges_to_the_oracle() {
        let r = run(&SimConfig::small());
        assert!(r.converged, "{r:?}");
        assert!(r.equals_oracle, "{r:?}");
        assert!(r.catch_ups > 0, "the scenario must exercise catch-up: {r:?}");
        assert!(r.deltas_generated > 1000, "{r:?}");
    }

    #[test]
    fn phones_see_their_viewport_in_real_time() {
        let r = run(&SimConfig { editors: 200, leaves: 4, ticks: 300, op_prob: 0.2, offline_prob: 0.002, ..SimConfig::small() });
        assert!(r.converged && r.equals_oracle, "{r:?}");
        assert!(r.fresh_phones_checked > 50 && r.viewport_registers_checked > 1000, "the check must have something to check: {r:?}");
        assert_eq!(r.viewport_registers_stale, 0, "{r:?}");
    }

    #[test]
    fn same_seed_same_report() {
        let cfg = SimConfig { editors: 40, ticks: 60, ..SimConfig::small() };
        let (a, b) = (run(&cfg), run(&cfg));
        assert_eq!(SimReport { wall_ms: 0, ..a }, SimReport { wall_ms: 0, ..b });
    }

    #[test]
    fn different_seeds_still_converge() {
        for seed in 2..6 {
            let r = run(&SimConfig { seed, editors: 30, ticks: 80, loss_prob: 0.05, dup_prob: 0.1, ..SimConfig::small() });
            assert!(r.converged && r.equals_oracle, "seed {seed}: {r:?}");
        }
    }

    #[test]
    fn without_interest_management_everyone_is_a_full_replica_and_still_converges() {
        let r = run(&SimConfig { tiles_per_side: 0, ..SimConfig::small() });
        assert!(r.converged && r.equals_oracle, "{r:?}");
        assert_eq!(r.mobile_total_bytes_per_s, 0.0);
    }

    #[test]
    fn a_viewport_costs_a_phone_less_than_a_full_replica() {
        let r = run(&SimConfig {
            editors: 200,
            leaves: 4,
            ticks: 400,
            op_prob: 0.1,
            background_every: 200,
            full_replica_share: 0.2,
            ..SimConfig::small()
        });
        assert!(r.converged && r.equals_oracle, "{r:?}");
        assert!(r.mobile_realtime_bytes_per_s < 0.3 * r.full_replica_bytes_per_s, "{r:?}");
    }
}
