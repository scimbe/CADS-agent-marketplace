//! Domain-separated signing-preimage builder.
//!
//! Same discipline as CADS-Tunnel's `ct_common::preimage::Preimage` (crates/common/src/preimage.rs):
//! every signed type in this crate signs `DOMAIN ‖ fields…`, where the domain is itself
//! length-prefixed (so no domain can be a byte-prefix of another and collide) and every
//! variable-length field is length-prefixed via [`Preimage::var_bytes`] -- the one place that
//! discipline lives, so no field can forget it and silently break injectivity.

pub struct Preimage {
    buf: Vec<u8>,
}

impl Preimage {
    pub fn new(domain: &[u8]) -> Self {
        let mut buf = Vec::new();
        buf.extend_from_slice(&(domain.len() as u32).to_le_bytes());
        buf.extend_from_slice(domain);
        Self { buf }
    }

    /// Fixed-width field, appended verbatim (a 32/64-byte key/hash/signature).
    pub fn fixed(mut self, bytes: &[u8]) -> Self {
        self.buf.extend_from_slice(bytes);
        self
    }

    pub fn u64(mut self, v: u64) -> Self {
        self.buf.extend_from_slice(&v.to_le_bytes());
        self
    }

    pub fn u32(mut self, v: u32) -> Self {
        self.buf.extend_from_slice(&v.to_le_bytes());
        self
    }

    /// Single enum-tag byte -- fixed width, no length prefix needed.
    pub fn tag(mut self, t: u8) -> Self {
        self.buf.push(t);
        self
    }

    /// Variable-length field, length-prefixed as `u32-LE length ‖ bytes`.
    pub fn var_bytes(mut self, bytes: &[u8]) -> Self {
        self.buf.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        self.buf.extend_from_slice(bytes);
        self
    }

    pub fn finish(self) -> Vec<u8> {
        self.buf
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_comes_first_length_prefixed_and_fixed_fields_append_verbatim() {
        let out = Preimage::new(b"dom").fixed(&[0xAA; 4]).u64(0x0102030405060708).finish();
        let mut expected = Vec::new();
        expected.extend_from_slice(&3u32.to_le_bytes());
        expected.extend_from_slice(b"dom");
        expected.extend_from_slice(&[0xAA; 4]);
        expected.extend_from_slice(&0x0102030405060708u64.to_le_bytes());
        assert_eq!(out, expected);
    }

    #[test]
    fn var_bytes_length_prefixes_so_the_encoding_is_injective() {
        let a = Preimage::new(b"d").var_bytes(b"ab").var_bytes(b"c").finish();
        let b = Preimage::new(b"d").var_bytes(b"a").var_bytes(b"bc").finish();
        assert_ne!(a, b, "length-prefixing keeps distinct splits distinct");
    }

    #[test]
    fn a_domain_that_is_a_byte_prefix_of_another_no_longer_collides() {
        let a = Preimage::new(b"dom").fixed(b"1payload").finish();
        let b = Preimage::new(b"dom1").fixed(b"payload").finish();
        assert_ne!(a, b, "a domain that is a byte-prefix of another must not collide");
    }
}
