//! Explicit, operator-maintained publisher trust allowlist.
//!
//! Deliberately separate from [`manifest_core::ServiceManifest::is_valid`]: a manifest can be
//! cryptographically valid -- correctly signed, not expired -- and still come from a publisher
//! nobody should trust to run `docker compose up` on this host. This type is the ONLY place
//! `installer-engine` decides "do I trust this key", and it is never populated by anything the
//! manifest itself asserts (no trust-on-first-use, no "learn" path) -- only by a local file or
//! env var the operator controls out-of-band.

use std::collections::HashSet;

#[derive(Debug, Default)]
pub struct TrustAllowlist {
    trusted: HashSet<[u8; 32]>,
}

impl TrustAllowlist {
    /// Parse a comma-separated list of 64-hex-char ed25519 pubkeys (e.g. from
    /// `CT_MANIFEST_TRUST_ALLOWLIST`). Rejects the whole list on any malformed entry rather than
    /// silently dropping it -- a typo'd allowlist entry should fail loudly at load time, not
    /// quietly narrow (or worse, appear to include a key it doesn't).
    pub fn parse(csv: &str) -> Result<Self, String> {
        let mut trusted = HashSet::new();
        for (i, entry) in csv.split(',').map(str::trim).filter(|s| !s.is_empty()).enumerate() {
            let bytes = decode_hex32(entry)
                .ok_or_else(|| format!("allowlist entry #{i} ('{entry}') is not 64 ASCII hex chars"))?;
            trusted.insert(bytes);
        }
        Ok(Self { trusted })
    }

    /// Load from a file, one hex pubkey per line (`#`-prefixed lines and blank lines ignored).
    pub fn load_file(path: &std::path::Path) -> Result<Self, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("failed to read allowlist file {}: {e}", path.display()))?;
        let mut trusted = HashSet::new();
        for (lineno, raw) in content.lines().enumerate() {
            let line = raw.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let bytes = decode_hex32(line)
                .ok_or_else(|| format!("{}:{}: not 64 ASCII hex chars", path.display(), lineno + 1))?;
            trusted.insert(bytes);
        }
        Ok(Self { trusted })
    }

    pub fn is_empty(&self) -> bool {
        self.trusted.is_empty()
    }

    /// Whether `pubkey` is explicitly trusted. An empty allowlist trusts nothing -- callers must
    /// not treat "no allowlist configured" as "trust everything"; that is the exact
    /// trust-on-first-use failure mode this type exists to prevent.
    pub fn contains(&self, pubkey: &[u8; 32]) -> bool {
        self.trusted.contains(pubkey)
    }
}

fn decode_hex32(s: &str) -> Option<[u8; 32]> {
    if s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        // Byte-safe: the ascii-hexdigit check above guarantees every char is single-byte, so
        // slicing by byte offset can never land mid-char (the same #417/from_hex32 class of bug
        // this codebase has hit twice already -- see manifest-core's hex.rs doc comment).
        let pair = &s.as_bytes()[2 * i..2 * i + 2];
        let digits = std::str::from_utf8(pair).ok()?;
        *byte = u8::from_str_radix(digits, 16).ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_csv() {
        let key = "aa".repeat(32);
        let list = TrustAllowlist::parse(&key).unwrap();
        assert!(list.contains(&[0xaa; 32]));
        assert!(!list.contains(&[0xbb; 32]));
    }

    #[test]
    fn empty_allowlist_trusts_nothing() {
        let list = TrustAllowlist::parse("").unwrap();
        assert!(list.is_empty());
        assert!(!list.contains(&[0xaa; 32]));
    }

    #[test]
    fn malformed_entry_fails_the_whole_load_rather_than_silently_dropping() {
        assert!(TrustAllowlist::parse("aa,not-hex,bb").is_err());
    }

    #[test]
    fn decode_hex32_rejects_non_ascii_input_cleanly_instead_of_panicking() {
        assert_eq!(decode_hex32("é".repeat(32).as_str()), None);
    }
}
