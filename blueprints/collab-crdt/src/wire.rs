//! End-to-end encryption of deltas and the byte format of frames.
//!
//! Every member of a document holds the document secret; the relay does not. A delta becomes a
//! frame whose route key is a keyed hash of the register key (the relay can group, not name) and
//! whose payload is the delta sealed with XChaCha20-Poly1305. The nonce is the stamp: unique per
//! delta as long as a replica never reuses a `(lamport, replica)` pair, which [`crate::Doc`]
//! guarantees within one process. A replica that restarts without its persisted clock MUST take a
//! fresh replica id -- reusing the old one would reuse nonces and also break the CRDT's own
//! uniqueness of stamps.
//!
//! [`DocKey::open`] rejects a frame whose route key or stamp does not match the sealed delta, so a
//! relay (or a hostile peer) cannot relabel a payload to make it dominate a different register.

use crate::doc::{Delta, RegKey};
use crate::relay::{Frame, RouteKey, Tiles};
use crate::stamp::Stamp;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use sha2::{Digest, Sha256};

pub type WireFrame = Frame<Vec<u8>>;

#[derive(Debug, PartialEq, Eq)]
pub enum OpenError {
    Decrypt,
    Malformed,
    Relabelled,
}

pub struct DocKey {
    aead: XChaCha20Poly1305,
    route_secret: [u8; 32],
}

fn derive(secret: &[u8; 32], label: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(b"cads-collab-crdt-v1\0");
    h.update(label);
    h.update(secret);
    h.finalize().into()
}

impl DocKey {
    pub fn new(secret: &[u8; 32]) -> DocKey {
        DocKey { aead: XChaCha20Poly1305::new(&derive(secret, b"aead").into()), route_secret: derive(secret, b"route") }
    }

    /// The token a relay asks for before it lets a connection read or write this document. Derived
    /// from the secret, so members need nothing extra; the relay stores only its hash.
    pub fn relay_token(secret: &[u8; 32]) -> [u8; 32] {
        derive(secret, b"relay-token")
    }

    /// `keyed hash of the shape (80 bits) | keyed hash of shape and property (48 bits)`: the relay
    /// can tell which registers belong to one shape (it needs that to deliver a shape entering a
    /// tile whole), not which shape or which property.
    pub fn route(&self, key: &RegKey) -> RouteKey {
        let mut h = Sha256::new();
        h.update(self.route_secret);
        h.update(b"shape");
        h.update(key.shape.to_bytes());
        let shape = h.finalize();
        let mut h = Sha256::new();
        h.update(self.route_secret);
        h.update(b"prop");
        h.update(key.shape.to_bytes());
        h.update(key.prop.0.to_be_bytes());
        let prop = h.finalize();
        let mut out = [0u8; 16];
        out[..10].copy_from_slice(&shape[..10]);
        out[10..].copy_from_slice(&prop[..6]);
        u128::from_be_bytes(out)
    }

    fn nonce(stamp: Stamp) -> XNonce {
        let mut n = [0u8; 24];
        n[..16].copy_from_slice(&stamp.to_bytes());
        n.into()
    }

    /// Route, stamp and tiles are bound to the ciphertext: a relay that rewrites any of them gets a
    /// frame no member will open.
    fn aad(route: RouteKey, stamp: Stamp, tiles: Tiles) -> [u8; 40] {
        let mut a = [0u8; 40];
        a[..16].copy_from_slice(&route.to_be_bytes());
        a[16..32].copy_from_slice(&stamp.to_bytes());
        a[32..36].copy_from_slice(&tiles[0].to_be_bytes());
        a[36..].copy_from_slice(&tiles[1].to_be_bytes());
        a
    }

    pub fn seal(&self, d: &Delta, tiles: Tiles) -> WireFrame {
        let route = self.route(&d.key);
        let mut plain = Vec::with_capacity(48);
        d.encode(&mut plain);
        let payload = self
            .aead
            .encrypt(&Self::nonce(d.stamp), Payload { msg: &plain, aad: &Self::aad(route, d.stamp, tiles) })
            .expect("XChaCha20-Poly1305 encryption cannot fail for in-memory buffers");
        Frame { route, stamp: d.stamp, tiles, payload }
    }

    pub fn open(&self, f: &WireFrame) -> Result<Delta, OpenError> {
        let plain = self
            .aead
            .decrypt(&Self::nonce(f.stamp), Payload { msg: &f.payload, aad: &Self::aad(f.route, f.stamp, f.tiles) })
            .map_err(|_| OpenError::Decrypt)?;
        let (d, n) = Delta::decode(&plain).ok_or(OpenError::Malformed)?;
        if n != plain.len() {
            return Err(OpenError::Malformed);
        }
        if d.stamp != f.stamp || self.route(&d.key) != f.route {
            return Err(OpenError::Relabelled);
        }
        Ok(d)
    }
}

/// `route (16) | stamp (16) | tiles (2 x 4) | len (4) | payload`.
pub fn encode_frame(f: &WireFrame, out: &mut Vec<u8>) {
    out.extend_from_slice(&f.route.to_be_bytes());
    out.extend_from_slice(&f.stamp.to_bytes());
    out.extend_from_slice(&f.tiles[0].to_be_bytes());
    out.extend_from_slice(&f.tiles[1].to_be_bytes());
    out.extend_from_slice(&(f.payload.len() as u32).to_be_bytes());
    out.extend_from_slice(&f.payload);
}

/// Payloads larger than this are refused: a delta is a register write, not a file upload.
pub const MAX_PAYLOAD: usize = 64 * 1024;

pub fn decode_frame(b: &[u8]) -> Option<(WireFrame, usize)> {
    let route = u128::from_be_bytes(b.get(..16)?.try_into().ok()?);
    let stamp = Stamp::from_bytes(b.get(16..32)?.try_into().ok()?);
    let t0 = u32::from_be_bytes(b.get(32..36)?.try_into().ok()?);
    let t1 = u32::from_be_bytes(b.get(36..40)?.try_into().ok()?);
    let n = u32::from_be_bytes(b.get(40..44)?.try_into().ok()?) as usize;
    if n > MAX_PAYLOAD {
        return None;
    }
    let payload = b.get(44..44 + n)?.to_vec();
    Some((Frame { route, stamp, tiles: [t0, t1], payload }, 44 + n))
}

pub const FRAME_HEADER: usize = 44;

/// Bytes a sealed frame of this delta takes on the wire (header + ciphertext + tag).
pub fn wire_size(d: &Delta) -> usize {
    let mut plain = Vec::with_capacity(48);
    d.encode(&mut plain);
    FRAME_HEADER + plain.len() + 16
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Doc, Prop, Value};

    #[test]
    fn seal_open_roundtrip_and_relabelling_is_rejected() {
        let key = DocKey::new(&[7; 32]);
        let mut doc = Doc::new(3);
        let (id, _) = doc.create(1, None);
        let d = doc.set(id, Prop::TEXT, Value::bytes(b"hello"));
        let f = key.seal(&d, [4, 4]);
        assert_eq!(key.open(&f), Ok(d.clone()));

        let mut buf = Vec::new();
        encode_frame(&f, &mut buf);
        assert_eq!(decode_frame(&buf), Some((f.clone(), buf.len())));

        let other = doc.set(id, Prop::FILL, Value::Int(1));
        let mut moved = f.clone();
        moved.route = key.route(&other.key);
        assert_eq!(key.open(&moved), Err(OpenError::Decrypt), "route is bound by the AAD");

        let mut bumped = f.clone();
        bumped.stamp.lamport += 1_000_000;
        assert_eq!(key.open(&bumped), Err(OpenError::Decrypt), "stamp is bound by nonce and AAD");

        let mut rerouted = f.clone();
        rerouted.tiles = [5, 5];
        assert_eq!(key.open(&rerouted), Err(OpenError::Decrypt), "tiles are bound by the AAD");

        assert_eq!(DocKey::new(&[8; 32]).open(&f), Err(OpenError::Decrypt));

        let same_shape = key.route(&other.key);
        assert_eq!(crate::relay::shape_of(same_shape), crate::relay::shape_of(f.route), "one shape, one prefix");
        let (id2, _) = doc.create(1, None);
        let elsewhere = key.route(&doc.set(id2, Prop::TEXT, Value::Nil).key);
        assert_ne!(crate::relay::shape_of(elsewhere), crate::relay::shape_of(f.route));
    }
}
