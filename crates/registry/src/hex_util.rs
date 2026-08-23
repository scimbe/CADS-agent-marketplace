//! Local hex encode/decode -- `manifest-core::hex`'s `b32`/`b64` modules are serde
//! (de)serializers, not exposed as plain functions, so this crate needs its own copy of the
//! same ASCII-hex-before-slicing discipline (`ct-agent`'s `manifest_run::hex32`/`hex_encode`
//! apply the identical pattern on their side of the boundary -- see #417's lesson).

pub fn to_hex(b: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(b.len() * 2);
    for byte in b {
        let _ = write!(s, "{byte:02x}");
    }
    s
}

pub fn from_hex32(s: &str) -> Option<[u8; 32]> {
    let digits = s.trim().as_bytes();
    if digits.len() != 64 || !digits.iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        let hi = (digits[2 * i] as char).to_digit(16)?;
        let lo = (digits[2 * i + 1] as char).to_digit(16)?;
        *byte = (hi * 16 + lo) as u8;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let b = [7u8; 32];
        assert_eq!(from_hex32(&to_hex(&b)).unwrap(), b);
    }

    #[test]
    fn rejects_non_ascii_instead_of_panicking() {
        assert_eq!(from_hex32(&"é".repeat(32)), None);
        assert_eq!(from_hex32("aa"), None);
    }
}
