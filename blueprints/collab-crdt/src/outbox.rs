//! What a replica still has to send: coalesced per register, kept until the relay has sequenced it.
//!
//! Offline-first in one rule: a local write goes to the document and to the outbox at once; the
//! outbox is drained when a connection exists and kept (and persisted, [`Outbox::encode`]) when it
//! does not. Ten thousand writes to the same register while dragging a shape in a tunnel cost one
//! delta on reconnect, because only the newest per register survives -- dropping a dominated delta
//! is safe under last-writer-wins, it would have been overwritten everywhere anyway.

use crate::doc::{Delta, RegKey};
use crate::relay::{Tiles, TILE_ANY};
use crate::stamp::Stamp;
use std::collections::HashMap;

#[derive(Default, Debug, Clone)]
pub struct Outbox {
    /// To send, with the number of times it was already sent.
    pending: HashMap<RegKey, (Delta, Tiles, u32), crate::doc::FxBuild>,
    /// Sent but not yet seen coming back from the relay (the acknowledgement is the echo), with the
    /// time it was last sent (in whatever unit the caller's clock uses) and how often.
    unacked: HashMap<RegKey, (Delta, Tiles, u64, u32), crate::doc::FxBuild>,
}

/// Resends back off exponentially, up to `base << MAX_BACKOFF_SHIFT`.
const MAX_BACKOFF_SHIFT: u32 = 5;

/// Two writes to one register coalesce into one; its tiles are where the first left from and where
/// the last went to, so subscribers of the tile a shape left still see it leave in real time.
/// (A [`TILE_ANY`] on either side survives as such: [`crate::relay::TileSet::matches`] checks both.)
fn merge_tiles(older: Tiles, newer: Tiles) -> Tiles {
    [older[0], newer[1]]
}

impl Outbox {
    /// A shape-less write (no tile known): every subscriber gets it.
    pub fn push(&mut self, d: Delta) {
        self.push_in(d, [TILE_ANY, TILE_ANY]);
    }

    pub fn push_in(&mut self, d: Delta, tiles: Tiles) {
        self.push_attempted(d, tiles, 0);
    }

    fn push_attempted(&mut self, d: Delta, tiles: Tiles, attempts: u32) {
        match self.pending.get_mut(&d.key) {
            Some((cur, _, _)) if cur.stamp >= d.stamp => {}
            Some((cur, t, a)) => {
                *t = merge_tiles(*t, tiles);
                *cur = d;
                *a = attempts;
            }
            None => {
                self.pending.insert(d.key, (d, tiles, attempts));
            }
        }
    }

    pub fn is_idle(&self) -> bool {
        self.pending.is_empty() && self.unacked.is_empty()
    }

    pub fn pending_len(&self) -> usize {
        self.pending.len()
    }

    /// Deltas to send now, in stamp order, with their tiles; they move to `unacked`, stamped `now`.
    pub fn take(&mut self, now: u64) -> Vec<(Delta, Tiles)> {
        let mut out: Vec<(Delta, Tiles, u32)> = self.pending.drain().map(|(_, x)| x).collect();
        out.sort_unstable_by_key(|(d, _, _)| d.stamp);
        for (d, t, attempts) in &out {
            match self.unacked.get(&d.key) {
                Some((cur, _, _, _)) if cur.stamp > d.stamp => {}
                _ => {
                    self.unacked.insert(d.key, (d.clone(), *t, now, attempts + 1));
                }
            }
        }
        out.into_iter().map(|(d, t, _)| (d, t)).collect()
    }

    /// The relay sequenced a write to `key` with `stamp`: anything of ours at or below it is settled
    /// (ours went through, or a newer write superseded it -- either way there is nothing to resend).
    /// That includes a write still pending: the relay would drop it as dominated and never echo it,
    /// so keeping it would mean resending it forever.
    pub fn acknowledge(&mut self, key: &RegKey, stamp: Stamp) {
        if matches!(self.unacked.get(key), Some((cur, _, _, _)) if cur.stamp <= stamp) {
            self.unacked.remove(key);
        }
        if matches!(self.pending.get(key), Some((cur, _, _)) if cur.stamp <= stamp) {
            self.pending.remove(key);
        }
    }

    /// After a lost connection: send everything unacknowledged again (idempotent), backoff reset.
    pub fn requeue_unacked(&mut self) {
        for (_, (d, t, _, _)) in self.unacked.drain().collect::<Vec<_>>() {
            self.push_attempted(d, t, 0);
        }
    }

    /// Resend what is still not echoed after `base` time units, doubling the wait with every
    /// attempt (up to 32 x `base`). A write sent a moment ago whose echo is still on the way is left
    /// alone, and a write the relay dropped as superseded (its echo never comes; the newer write's
    /// arrival settles it) costs a few resends, not one per timer tick.
    pub fn requeue_due(&mut self, now: u64, base: u64) {
        let due: Vec<RegKey> = self
            .unacked
            .iter()
            .filter(|(_, (_, _, at, attempts))| now >= at.saturating_add(base << attempts.saturating_sub(1).min(MAX_BACKOFF_SHIFT)))
            .map(|(k, _)| *k)
            .collect();
        for k in due {
            let (d, t, _, attempts) = self.unacked.remove(&k).expect("listed above");
            self.push_attempted(d, t, attempts);
        }
    }

    pub fn unacked_len(&self) -> usize {
        self.unacked.len()
    }

    /// Persisted form (the app writes it to local storage before going to the background).
    pub fn encode(&self) -> Vec<u8> {
        let mut all: Vec<(&Delta, &Tiles)> =
            self.pending.values().map(|(d, t, _)| (d, t)).chain(self.unacked.values().map(|(d, t, _, _)| (d, t))).collect();
        all.sort_unstable_by_key(|(d, _)| (d.key, d.stamp));
        let mut out = Vec::new();
        out.extend_from_slice(&(all.len() as u32).to_be_bytes());
        for (d, t) in all {
            out.extend_from_slice(&t[0].to_be_bytes());
            out.extend_from_slice(&t[1].to_be_bytes());
            d.encode(&mut out);
        }
        out
    }

    /// Everything persisted comes back as pending: after a restart nothing is known to be acknowledged.
    pub fn decode(b: &[u8]) -> Option<Outbox> {
        let n = u32::from_be_bytes(b.get(..4)?.try_into().ok()?) as usize;
        let mut at = 4;
        let mut ob = Outbox::default();
        for _ in 0..n {
            let t0 = u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?);
            let t1 = u32::from_be_bytes(b.get(at + 4..at + 8)?.try_into().ok()?);
            let (d, used) = Delta::decode(b.get(at + 8..)?)?;
            at += 8 + used;
            ob.push_in(d, [t0, t1]);
        }
        Some(ob)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Doc, Prop, Value};

    #[test]
    fn dragging_coalesces_to_the_last_position_and_survives_a_restart() {
        let mut doc = Doc::new(5);
        let (id, created) = doc.create(1, None);
        let mut ob = Outbox::default();
        created.into_iter().for_each(|d| ob.push(d));
        for x in 0..10_000 {
            ob.push(doc.set(id, Prop::X, Value::num(x as f64)));
        }
        assert_eq!(ob.pending_len(), 5, "4 creation registers + 1 position");
        let restored = Outbox::decode(&ob.encode()).unwrap();
        let mut sent = restored.clone().take(0);
        sent.retain(|(d, _)| d.key.prop == Prop::X);
        assert_eq!(sent[0].0.value, Value::num(9_999.0));
    }

    #[test]
    fn coalesced_moves_keep_the_first_tile_left_and_the_last_reached() {
        let mut doc = Doc::new(5);
        let (id, _) = doc.create(1, None);
        let mut ob = Outbox::default();
        ob.push_in(doc.set(id, Prop::X, Value::num(1.0)), [3, 5]);
        ob.push_in(doc.set(id, Prop::X, Value::num(2.0)), [5, 8]);
        assert_eq!(ob.take(0)[0].1, [3, 8]);
    }

    #[test]
    fn unacknowledged_writes_are_resent_and_an_echo_settles_them() {
        let mut doc = Doc::new(5);
        let (id, _) = doc.create(1, None);
        let mut ob = Outbox::default();
        let d = doc.set(id, Prop::Y, Value::Int(1));
        ob.push(d.clone());
        assert_eq!(ob.take(10).len(), 1);
        ob.requeue_due(15, 10);
        assert!(ob.take(15).is_empty(), "sent at 10, not due before 20");
        ob.requeue_due(20, 10);
        assert_eq!(ob.take(20).len(), 1, "lost on the way, sent again");
        ob.requeue_due(39, 10);
        assert!(ob.take(39).is_empty(), "second attempt waits twice as long");
        ob.requeue_due(40, 10);
        assert_eq!(ob.take(40).len(), 1);
        ob.acknowledge(&d.key, d.stamp);
        assert!(ob.is_idle());
    }
}
