//! The replicated vector document: a map of last-writer-wins registers, keyed by (shape, property).

use crate::frac;
use crate::stamp::Stamp;
use crate::value::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::hash::{BuildHasherDefault, Hasher};

/// A shape is identified by the stamp of the delta that created it: unique without coordination.
pub type ShapeId = Stamp;

/// A property number. The first few have a meaning for the scene structure; the rest are opaque to
/// the CRDT (geometry, style, text, ...), so an application adds properties without a schema change.
#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Prop(pub u16);

impl Prop {
    /// `Bool(true)` while the shape exists. Deleting writes `Bool(false)`; a later write of `true`
    /// (an undo) brings it back. Last writer wins, like every other property.
    pub const EXISTS: Prop = Prop(0);
    /// `Ref(parent)` or `Nil` for the root.
    pub const PARENT: Prop = Prop(1);
    /// `Frac(key)`: position among the siblings.
    pub const Z: Prop = Prop(2);
    pub const KIND: Prop = Prop(3);
    pub const X: Prop = Prop(4);
    pub const Y: Prop = Prop(5);
    pub const W: Prop = Prop(6);
    pub const H: Prop = Prop(7);
    pub const ROTATION: Prop = Prop(8);
    pub const FILL: Prop = Prop(9);
    pub const STROKE: Prop = Prop(10);
    pub const PATH: Prop = Prop(11);
    pub const TEXT: Prop = Prop(12);
    /// `Vec2(x, y)`: the position, as one register (see [`Value::Vec2`]). Its frames carry the
    /// positional flag ([`crate::relay::positional`]) that lets a relay know a shape's tile.
    pub const POS: Prop = Prop(13);
    /// First number an application may use for its own properties.
    pub const USER: Prop = Prop(64);
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RegKey {
    pub shape: ShapeId,
    pub prop: Prop,
}

impl RegKey {
    /// The relay's route key in clear mode (the simulation): `shape (80 bits) | property (48 bits)`,
    /// the same layout as the sealed route key ([`crate::wire::DocKey::route`]), so that the relay
    /// can gather a shape's registers ([`crate::relay::SHAPE_SHIFT`]). The shape part is a hash of
    /// the shape id; with 80 bits a collision is negligible for any realistic number of shapes.
    pub fn packed(&self) -> u128 {
        let mut h = FxHasher::default();
        h.write_u64(self.shape.lamport);
        h.write_u64(self.shape.replica);
        let shape = ((h.finish() as u128) << 16) | (self.shape.replica as u128 & 0xFFFF);
        (shape << crate::relay::SHAPE_SHIFT) | self.prop.0 as u128
    }
}

/// One register write: the unit of replication, of the outbox and of the wire.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Delta {
    pub key: RegKey,
    pub stamp: Stamp,
    pub value: Value,
}

impl Delta {
    pub fn encode(&self, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.key.shape.to_bytes());
        out.extend_from_slice(&self.key.prop.0.to_be_bytes());
        out.extend_from_slice(&self.stamp.to_bytes());
        self.value.encode(out);
    }

    pub fn decode(b: &[u8]) -> Option<(Delta, usize)> {
        let shape = Stamp::from_bytes(b.get(..16)?.try_into().ok()?);
        let prop = Prop(u16::from_be_bytes(b.get(16..18)?.try_into().ok()?));
        let stamp = Stamp::from_bytes(b.get(18..34)?.try_into().ok()?);
        let (value, n) = Value::decode(b.get(34..)?)?;
        Some((Delta { key: RegKey { shape, prop }, stamp, value }, 34 + n))
    }
}

/// FxHash: the replicas hold millions of registers between them and the keys are not attacker
/// chosen in a way that matters here (a hostile peer can only slow its own replica down). Iteration
/// order never reaches an output: everything that is hashed or compared is sorted first.
#[derive(Default, Clone, Copy)]
pub struct FxHasher(u64);

impl Hasher for FxHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        for chunk in bytes.chunks(8) {
            let mut w = [0u8; 8];
            w[..chunk.len()].copy_from_slice(chunk);
            self.write_u64(u64::from_le_bytes(w));
        }
    }
    fn write_u64(&mut self, i: u64) {
        self.0 = (self.0.rotate_left(5) ^ i).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
    }
    fn write_u16(&mut self, i: u16) {
        self.write_u64(i as u64)
    }
}

pub type FxBuild = BuildHasherDefault<FxHasher>;

/// One register as stored: property, stamp, value. 48 bytes.
#[derive(Clone, Debug)]
struct Reg {
    stamp: Stamp,
    value: Value,
    prop: Prop,
}

/// One replica of the document.
#[derive(Clone, Debug)]
pub struct Doc {
    replica: u64,
    clock: u64,
    /// Registers grouped by shape, each group sorted by property and allocated to its exact size:
    /// the shape id is stored once per shape instead of once per register (~55 bytes per register,
    /// measured ~100 with a flat map keyed by `(shape, prop)` and also with a growable vector per
    /// shape), iteration is in key order without sorting, and no key distribution can degrade the
    /// B-tree. A new register for a shape reallocates its group: at most a dozen times in a shape's
    /// life, against millions of updates in place.
    shapes: BTreeMap<ShapeId, Box<[Reg]>>,
    count: usize,
}

impl Doc {
    /// `replica` must be unique per document and device (64 random bits are, see [`Stamp`]).
    pub fn new(replica: u64) -> Doc {
        Doc { replica, clock: 0, shapes: BTreeMap::new(), count: 0 }
    }

    pub fn replica(&self) -> u64 {
        self.replica
    }

    pub fn register_count(&self) -> usize {
        self.count
    }

    fn reg(&self, shape: ShapeId, prop: Prop) -> Option<&Reg> {
        let regs = self.shapes.get(&shape)?;
        regs.binary_search_by_key(&prop, |r| r.prop).ok().map(|i| &regs[i])
    }

    pub fn get(&self, shape: ShapeId, prop: Prop) -> Option<&Value> {
        self.reg(shape, prop).map(|r| &r.value)
    }

    pub fn stamp_of(&self, key: &RegKey) -> Option<Stamp> {
        self.reg(key.shape, key.prop).map(|r| r.stamp)
    }

    /// Merge one delta. Returns whether it changed the register. Commutative, associative and
    /// idempotent over any set of deltas: that is the whole convergence argument.
    pub fn apply(&mut self, d: &Delta) -> bool {
        if d.stamp.lamport > self.clock {
            self.clock = d.stamp.lamport;
        }
        let regs = self.shapes.entry(d.key.shape).or_insert_with(|| Box::new([]));
        match regs.binary_search_by_key(&d.key.prop, |r| r.prop) {
            Ok(i) if regs[i].stamp >= d.stamp => false,
            Ok(i) => {
                regs[i].stamp = d.stamp;
                regs[i].value = d.value.clone();
                true
            }
            Err(i) => {
                let mut grown = Vec::with_capacity(regs.len() + 1);
                grown.extend_from_slice(&regs[..i]);
                grown.push(Reg { stamp: d.stamp, value: d.value.clone(), prop: d.key.prop });
                grown.extend_from_slice(&regs[i..]);
                *regs = grown.into_boxed_slice();
                self.count += 1;
                true
            }
        }
    }

    /// Merge a whole other replica (state-based sync, e.g. from a snapshot).
    pub fn merge(&mut self, other: &Doc) {
        for (key, stamp, value) in other.sorted_registers() {
            self.apply(&Delta { key, stamp, value: value.clone() });
        }
    }

    fn next_stamp(&mut self) -> Stamp {
        self.clock += 1;
        Stamp { lamport: self.clock, replica: self.replica }
    }

    /// A local write: stamped above everything this replica has seen, applied, and returned for the
    /// outbox.
    pub fn set(&mut self, shape: ShapeId, prop: Prop, value: Value) -> Delta {
        let d = Delta { key: RegKey { shape, prop }, stamp: self.next_stamp(), value };
        self.apply(&d);
        d
    }

    /// Create a shape on top of its parent's children. Returns its id and the deltas to send.
    pub fn create(&mut self, kind: i64, parent: Option<ShapeId>) -> (ShapeId, Vec<Delta>) {
        let id = self.next_stamp();
        let exists = Delta { key: RegKey { shape: id, prop: Prop::EXISTS }, stamp: id, value: Value::Bool(true) };
        self.apply(&exists);
        let z = frac::append_key(id.lamport, id.replica);
        let rest = [
            self.set(id, Prop::KIND, Value::Int(kind)),
            self.set(id, Prop::PARENT, parent.map_or(Value::Nil, Value::Ref)),
            self.set(id, Prop::Z, Value::Frac(z.into())),
        ];
        let mut out = vec![exists];
        out.extend(rest);
        (id, out)
    }

    pub fn delete(&mut self, shape: ShapeId) -> Delta {
        self.set(shape, Prop::EXISTS, Value::Bool(false))
    }

    pub fn reparent(&mut self, shape: ShapeId, parent: Option<ShapeId>) -> Delta {
        self.set(shape, Prop::PARENT, parent.map_or(Value::Nil, Value::Ref))
    }

    /// Move `shape` between two siblings (either may be absent: bottom or top).
    pub fn move_between(&mut self, shape: ShapeId, below: Option<ShapeId>, above: Option<ShapeId>) -> Delta {
        let key_of = |s: Option<ShapeId>| match s.and_then(|s| self.get(s, Prop::Z)) {
            Some(Value::Frac(k)) => Some(k.to_vec()),
            _ => None,
        };
        let lo = key_of(below).unwrap_or_default();
        let hi = key_of(above);
        let k = frac::between(&lo, hi.as_deref());
        self.set(shape, Prop::Z, Value::Frac(k.into()))
    }

    /// All registers in key order: the full replicated state, tombstones included.
    pub fn sorted_registers(&self) -> Vec<(RegKey, Stamp, &Value)> {
        let mut out = Vec::with_capacity(self.count);
        for (shape, regs) in &self.shapes {
            out.extend(regs.iter().map(|r| (RegKey { shape: *shape, prop: r.prop }, r.stamp, &r.value)));
        }
        out
    }

    /// SHA-256 over every register in key order. Two replicas with the same hash hold the same state.
    pub fn state_hash(&self) -> [u8; 32] {
        let mut h = Sha256::new();
        let mut buf = Vec::with_capacity(64);
        for (shape, regs) in &self.shapes {
            for r in regs {
                buf.clear();
                Delta { key: RegKey { shape: *shape, prop: r.prop }, stamp: r.stamp, value: r.value.clone() }.encode(&mut buf);
                h.update(&buf);
            }
        }
        h.finalize().into()
    }

    /// The document as the user sees it: live shapes in a tree, siblings in z-order.
    pub fn materialize(&self) -> Scene {
        let live: Vec<ShapeId> = self
            .shapes
            .keys()
            .filter(|id| matches!(self.get(**id, Prop::EXISTS), Some(Value::Bool(true))))
            .copied()
            .collect();
        let is_live = |id: &ShapeId| live.binary_search(id).is_ok();
        let mut parent: BTreeMap<ShapeId, Option<ShapeId>> = BTreeMap::new();
        let mut parent_stamp: HashMap<ShapeId, Stamp, FxBuild> = HashMap::default();
        for id in &live {
            let p = match self.reg(*id, Prop::PARENT) {
                Some(r) => {
                    parent_stamp.insert(*id, r.stamp);
                    match &r.value {
                        Value::Ref(p) if is_live(p) && p != id => Some(*p),
                        _ => None,
                    }
                }
                None => None,
            };
            parent.insert(*id, p);
        }
        break_cycles(&mut parent, &parent_stamp);

        let mut children: BTreeMap<Option<ShapeId>, Vec<(Vec<u8>, ShapeId)>> = BTreeMap::new();
        for (id, p) in &parent {
            let z = match self.get(*id, Prop::Z) {
                Some(Value::Frac(k)) => k.to_vec(),
                _ => Vec::new(),
            };
            children.entry(*p).or_default().push((z, *id));
        }
        for list in children.values_mut() {
            list.sort_unstable();
        }
        let mut nodes = Vec::with_capacity(live.len());
        let mut stack: Vec<(ShapeId, u32)> = Vec::new();
        if let Some(roots) = children.get(&None) {
            stack.extend(roots.iter().rev().map(|(_, id)| (*id, 0)));
        }
        while let Some((id, depth)) = stack.pop() {
            let own: Vec<(Prop, Value)> = self.shapes[&id]
                .iter()
                .filter(|r| ![Prop::EXISTS, Prop::PARENT, Prop::Z].contains(&r.prop))
                .map(|r| (r.prop, r.value.clone()))
                .collect();
            nodes.push(SceneNode { id, parent: parent[&id], depth, props: own });
            if let Some(kids) = children.get(&Some(id)) {
                stack.extend(kids.iter().rev().map(|(_, k)| (*k, depth + 1)));
            }
        }
        Scene { nodes }
    }
}

/// Every node has at most one parent, so cycles are disjoint rings. In each ring the edge written
/// last (highest stamp of the parent register) is cut and that shape moves to the root: the later
/// of two concurrent moves that together made a cycle is the one undone. The result depends only on
/// the state, never on iteration order, so every replica cuts the same edge.
fn break_cycles(parent: &mut BTreeMap<ShapeId, Option<ShapeId>>, stamp: &HashMap<ShapeId, Stamp, FxBuild>) {
    // 0 = unvisited, 1 = on the current path, 2 = done.
    let mut state: HashMap<ShapeId, u8, FxBuild> = HashMap::default();
    let ids: Vec<ShapeId> = parent.keys().copied().collect();
    for start in ids {
        if state.get(&start).copied().unwrap_or(0) != 0 {
            continue;
        }
        let mut path = Vec::new();
        let mut cur = Some(start);
        while let Some(n) = cur {
            match state.get(&n).copied().unwrap_or(0) {
                2 => break,
                1 => {
                    let at = path.iter().position(|x| *x == n).expect("on path");
                    let ring = &path[at..];
                    let cut = *ring.iter().max_by_key(|s| stamp.get(s).copied().unwrap_or(Stamp::ZERO)).unwrap();
                    parent.insert(cut, None);
                    break;
                }
                _ => {
                    state.insert(n, 1);
                    path.push(n);
                    cur = parent.get(&n).copied().flatten();
                }
            }
        }
        for n in path {
            state.insert(n, 2);
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SceneNode {
    pub id: ShapeId,
    pub parent: Option<ShapeId>,
    pub depth: u32,
    pub props: Vec<(Prop, Value)>,
}

/// Depth-first, siblings bottom to top: the paint order.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub nodes: Vec<SceneNode>,
}

impl Scene {
    pub fn hash(&self) -> [u8; 32] {
        let mut h = Sha256::new();
        let mut buf = Vec::new();
        for n in &self.nodes {
            buf.clear();
            buf.extend_from_slice(&n.id.to_bytes());
            buf.extend_from_slice(&n.parent.unwrap_or(Stamp::ZERO).to_bytes());
            buf.extend_from_slice(&n.depth.to_be_bytes());
            for (p, v) in &n.props {
                buf.extend_from_slice(&p.0.to_be_bytes());
                v.encode(&mut buf);
            }
            h.update(&buf);
        }
        h.finalize().into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_writes_converge_in_any_order() {
        let mut a = Doc::new(1);
        let (id, created) = a.create(1, None);
        let mut b = Doc::new(2);
        for d in &created {
            b.apply(d);
        }
        let da = a.set(id, Prop::X, Value::num(10.0));
        let db = b.set(id, Prop::X, Value::num(20.0));
        a.apply(&db);
        b.apply(&da);
        b.apply(&da);
        assert_eq!(a.state_hash(), b.state_hash());
        // Same lamport, higher replica id wins.
        assert_eq!(a.get(id, Prop::X), Some(&Value::num(20.0)));
    }

    #[test]
    fn a_write_after_observing_wins_over_the_observed_one() {
        let mut a = Doc::new(9);
        let (id, created) = a.create(1, None);
        let mut b = Doc::new(1);
        for d in &created {
            b.apply(d);
        }
        let first = a.set(id, Prop::FILL, Value::Int(1));
        b.apply(&first);
        let second = b.set(id, Prop::FILL, Value::Int(2)); // replica 1 < 9, but it saw `first`
        a.apply(&second);
        assert_eq!(a.get(id, Prop::FILL), Some(&Value::Int(2)));
    }

    #[test]
    fn concurrent_moves_into_each_other_do_not_lose_shapes() {
        let mut a = Doc::new(1);
        let (x, c1) = a.create(1, None);
        let (y, c2) = a.create(1, None);
        let mut b = Doc::new(2);
        for d in c1.iter().chain(&c2) {
            b.apply(d);
        }
        let ma = a.reparent(x, Some(y)); // a: x under y
        let mb = b.reparent(y, Some(x)); // b: y under x, concurrently
        a.apply(&mb);
        b.apply(&ma);
        let (sa, sb) = (a.materialize(), b.materialize());
        assert_eq!(sa, sb);
        assert_eq!(sa.nodes.len(), 2, "both shapes still visible");
        assert!(sa.nodes.iter().any(|n| n.parent.is_none()), "the cycle is cut");
    }

    #[test]
    fn delete_hides_and_a_later_undo_restores() {
        let mut a = Doc::new(1);
        let (id, _) = a.create(1, None);
        a.delete(id);
        assert!(a.materialize().nodes.is_empty());
        a.set(id, Prop::EXISTS, Value::Bool(true));
        assert_eq!(a.materialize().nodes.len(), 1);
    }

    #[test]
    fn delta_wire_encoding_roundtrips() {
        let mut a = Doc::new(77);
        let (id, _) = a.create(3, None);
        for v in [Value::Nil, Value::Bool(true), Value::Int(-5), Value::num(1.5), Value::Ref(id), Value::vec2(-3.0, 4.5), Value::bytes(b"path")] {
            let d = a.set(id, Prop::USER, v);
            let mut buf = Vec::new();
            d.encode(&mut buf);
            assert_eq!(Delta::decode(&buf), Some((d, buf.len())));
        }
    }
}
