//! Hex (de)serialization for fixed-width byte arrays used in [`crate::manifest`].
//!
//! `from_hex` requires every byte to be an ASCII hex digit *before* any indexed slicing --
//! mirrors CADS-Tunnel's ct-agent `grant/src/main.rs::from_hex32` fix (and channel.rs's own
//! `card_hex::from_hex`, #417): an odd-length-only guard on untrusted, attacker-controlled JSON
//! input can leave `&s[i..i+2]` slicing mid multi-byte-UTF-8-char, which panics rather than
//! returning an error and would echo the panic message (and thus the bad input) back to a
//! caller. Requiring ASCII-hex-only first guarantees single-byte-per-char indexing is safe.

fn to_hex(b: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(b.len() * 2);
    for byte in b {
        let _ = write!(s, "{byte:02x}");
    }
    s
}

fn from_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

pub mod b32 {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(b: &[u8; 32], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&super::to_hex(b))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 32], D::Error> {
        let v = super::from_hex(&String::deserialize(d)?)
            .ok_or_else(|| serde::de::Error::custom("invalid hex"))?;
        v.try_into().map_err(|_| serde::de::Error::custom("expected 32 bytes"))
    }
}

pub mod b64 {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(b: &[u8; 64], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&super::to_hex(b))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 64], D::Error> {
        let v = super::from_hex(&String::deserialize(d)?)
            .ok_or_else(|| serde::de::Error::custom("invalid hex"))?;
        v.try_into().map_err(|_| serde::de::Error::custom("expected 64 bytes"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_hex_rejects_non_ascii_input_cleanly_instead_of_panicking() {
        // A multi-byte UTF-8 char at an odd byte-offset would panic a naive `&s[i..i+2]` slice.
        assert_eq!(from_hex("é0"), None);
        assert_eq!(from_hex("0é"), None);
    }

    #[test]
    fn round_trips() {
        let bytes = [7u8; 32];
        assert_eq!(from_hex(&to_hex(&bytes)).unwrap(), bytes);
    }
}
