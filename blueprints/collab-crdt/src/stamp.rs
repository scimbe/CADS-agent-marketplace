//! Lamport stamps: the total order every register merge is decided by.

use serde::{Deserialize, Serialize};

/// `(lamport, replica)`, compared lexicographically. A replica increments `lamport` for every local
/// delta and raises it to the highest lamport it has seen ([`crate::Doc::apply`]), so a write made
/// after observing another write always wins over it (causality is respected), and two concurrent
/// writes are ordered by the replica id.
///
/// The replica id is 64 bits on purpose: two replicas with the same id could issue two different
/// values under the same stamp, and the documents would then diverge. With random 32-bit ids and
/// 10 000 editors that happens with about 1 % probability (birthday bound); with 64 bits, about 3e-12.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Stamp {
    pub lamport: u64,
    pub replica: u64,
}

impl Stamp {
    pub const ZERO: Stamp = Stamp { lamport: 0, replica: 0 };

    pub fn to_bytes(self) -> [u8; 16] {
        let mut out = [0u8; 16];
        out[..8].copy_from_slice(&self.lamport.to_be_bytes());
        out[8..].copy_from_slice(&self.replica.to_be_bytes());
        out
    }

    pub fn from_bytes(b: &[u8; 16]) -> Stamp {
        Stamp {
            lamport: u64::from_be_bytes(b[..8].try_into().unwrap()),
            replica: u64::from_be_bytes(b[8..].try_into().unwrap()),
        }
    }
}
