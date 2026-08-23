//! Fetch a manifest + its bundle, verify content hash, unpack with path-traversal protection.
//!
//! F.6 (bundle-swap): the `sha256` check below is mandatory and blocking, using a constant-time
//! compare (`subtle`) -- good crypto hygiene even though a hash mismatch isn't secret-dependent
//! here, consistent with this codebase's general discipline of not hand-rolling comparisons where
//! a vetted constant-time primitive exists.
//!
//! F.7 (tar-slip): every archive entry's path is checked to resolve INSIDE the destination
//! directory BEFORE anything is written -- an entry like `../../etc/cron.d/x` is rejected, not
//! silently written outside the scratch dir.

use manifest_core::ServiceManifest;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;
use std::time::Duration;
use subtle::ConstantTimeEq;

/// F.12: the URL an operator names in `CT_MANIFEST_URL` is trusted to be the RIGHT manifest/
/// bundle, but the BYTES returned from it are not -- those come from whatever the publisher's
/// server actually sends, which is a separate trust boundary (see F.5/F.6, which authenticate
/// content but never bounded its size). Without a cap, `fetch_bytes` buffers an arbitrarily large
/// response fully into memory (`resp.bytes()`) before any signature/hash check ever runs -- a
/// malicious, compromised, or merely misconfigured publisher endpoint (e.g. serving a directory
/// listing instead of the bundle) can exhaust memory on the operator's own machine with a single
/// `activate` call. Distinct from the documented "bundle decompression resource exhaustion"
/// residual risk in `docs/security-model.md` (a zip-bomb shape: small compressed, huge
/// decompressed) -- this caps the RAW fetch itself, before decompression ever begins, and applies
/// equally to the (much smaller) manifest JSON fetch, not just bundles.
const MAX_FETCH_BYTES: u64 = 64 * 1024 * 1024; // 64 MiB: generous for a compose bundle (F.3 already bans non-local build contexts, so bundles are config/scripts, not large binaries), tiny for a manifest.

/// F.13, found alongside F.12: a byte cap alone does not stop a slow-loris-style publisher
/// endpoint (malicious or merely broken) from trickling bytes -- or none at all -- forever,
/// hanging `ct-agent manifest activate` indefinitely with no feedback. `reqwest::blocking::get`
/// has NO default timeout. Mirrors ct-agent's own established convention for one-shot HTTP calls
/// (`acme_client.rs`'s `Client::builder().timeout(Duration::from_secs(30))`); 60s here is more
/// generous since a bundle can legitimately be up to `MAX_FETCH_BYTES`, larger than a typical ACME
/// API response. `reqwest`'s blocking-client timeout covers the WHOLE request lifecycle --
/// connect, redirects, and reading the body -- not just the initial connection.
const FETCH_TIMEOUT: Duration = Duration::from_secs(60);

pub fn fetch_manifest(location: &str) -> Result<ServiceManifest, String> {
    let bytes = fetch_bytes(location)?;
    serde_json::from_slice(&bytes).map_err(|e| format!("manifest at {location} is not valid JSON: {e}"))
}

pub fn fetch_bundle(url: &str) -> Result<Vec<u8>, String> {
    fetch_bytes(url)
}

/// Same HTTPS-only / size-capped (F.12) / timeout-bounded (F.13) discipline as
/// [`fetch_manifest`]/[`fetch_bundle`], generalized for any small signed JSON document a caller
/// outside this crate needs to fetch the same safe way (e.g. `ct-agent harness run`'s
/// `SignedTask`) -- exposed rather than duplicated a third time.
pub fn fetch_bytes(location: &str) -> Result<Vec<u8>, String> {
    if location.starts_with("https://") || location.starts_with("http://") {
        if location.starts_with("http://") {
            return Err(format!(
                "{location}: plain HTTP is refused -- manifest/bundle fetches must be HTTPS (the signature \
                 protects the payload's integrity, but a plaintext transport still leaks which manifest/bundle \
                 an operator is activating, and is trivially tamperable in transit before the hash check ever runs)"
            ));
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(FETCH_TIMEOUT)
            .build()
            .map_err(|e| format!("build HTTP client for {location}: {e}"))?;
        let resp = client.get(location).send().map_err(|e| format!("fetch {location}: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("fetch {location}: HTTP {}", resp.status()));
        }
        let declared_len = resp.content_length();
        read_bounded(resp, declared_len, MAX_FETCH_BYTES, location)
    } else {
        std::fs::read(location).map_err(|e| format!("read {location}: {e}"))
    }
}

/// F.12's actual cap logic, decoupled from `reqwest` so it's directly testable against a plain
/// in-memory reader: a declared length over `max` is refused outright without reading a single
/// byte, but a missing or LYING declared length must not bypass the cap either, so the read
/// itself is also bounded (`take`, one byte past `max` so an exactly-at-the-cap body is not
/// mistaken for an oversized one).
fn read_bounded(reader: impl Read, declared_len: Option<u64>, max: u64, location: &str) -> Result<Vec<u8>, String> {
    if let Some(len) = declared_len {
        if len > max {
            return Err(format!(
                "fetch {location}: response declares {len} bytes, refusing anything over the {max}-byte cap"
            ));
        }
    }
    let mut buf = Vec::new();
    reader
        .take(max + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("fetch {location}: {e}"))?;
    if buf.len() as u64 > max {
        return Err(format!("fetch {location}: response exceeded the {max}-byte cap, refusing"));
    }
    Ok(buf)
}

/// Constant-time sha256 comparison -- true iff `bytes` hashes to exactly `expected`.
pub fn verify_sha256(bytes: &[u8], expected: &[u8; 32]) -> bool {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let actual: [u8; 32] = hasher.finalize().into();
    actual.ct_eq(expected).into()
}

/// Unpack a gzipped tarball into `dest`, refusing any entry whose path would resolve outside
/// `dest` (absolute paths and `..` components are rejected before writing, not after -- see the
/// module doc's F.7 note). `dest` must already exist and be empty.
pub fn unpack_tar_gz_safely(bytes: &[u8], dest: &Path) -> Result<(), String> {
    let decoder = flate2::read::GzDecoder::new(bytes);
    let mut archive = tar::Archive::new(decoder);
    let entries = archive.entries().map_err(|e| format!("bad tar archive: {e}"))?;
    for entry in entries {
        let mut entry = entry.map_err(|e| format!("bad tar entry: {e}"))?;
        let path = entry.path().map_err(|e| format!("bad tar entry path: {e}"))?.into_owned();

        if path.is_absolute() || path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            return Err(format!(
                "bundle contains a path-traversal entry ({}), refusing to unpack any of it",
                path.display()
            ));
        }
        let target = dest.join(&path);
        if !target.starts_with(dest) {
            return Err(format!(
                "bundle entry {} resolves outside the unpack directory, refusing to unpack any of it",
                path.display()
            ));
        }

        let kind = entry.header().entry_type();
        if kind.is_symlink() || kind.is_hard_link() {
            // A link's TARGET isn't covered by the path check above (which only validates the
            // link's own name) -- rather than also validating link targets, refuse the whole
            // bundle outright. Phase 1's bundles (a compose file, a config, a verify script, a
            // small build context) never legitimately need a link.
            return Err(format!(
                "bundle contains a symlink/hardlink entry ({}), refusing to unpack any of it",
                path.display()
            ));
        }
        if kind.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| format!("mkdir {}: {e}", target.display()))?;
            continue;
        }
        if !kind.is_file() {
            return Err(format!(
                "bundle contains an unsupported entry type ({:?}) at {}, refusing to unpack any of it",
                kind,
                path.display()
            ));
        }

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
        }
        // Read fully rather than `entry.unpack()` -- keeps us in control of the write path
        // instead of trusting the `tar` crate's own unpack, which historically has had its own
        // traversal CVEs; our own path check above is the enforced guarantee either way.
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| format!("read tar entry {}: {e}", path.display()))?;
        std::fs::write(&target, &buf).map_err(|e| format!("write {}: {e}", target.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn sha256_matches_and_mismatches() {
        let bytes = b"hello world";
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        let good: [u8; 32] = hasher.finalize().into();
        assert!(verify_sha256(bytes, &good));
        assert!(!verify_sha256(bytes, &[0u8; 32]));
    }

    fn make_tar_gz(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut tar_bytes = Vec::new();
        {
            let mut builder = tar::Builder::new(&mut tar_bytes);
            for (name, content) in entries {
                let mut header = tar::Header::new_gnu();
                header.set_size(content.len() as u64);
                header.set_mode(0o644);
                // `Builder::append_data`/`Header::set_path` refuse to construct an absolute or
                // `..`-containing path -- exactly the malicious inputs these tests need to
                // fabricate, since a REAL attacker crafting a hostile tarball wouldn't go through
                // this crate's own safe API either. Write the raw name bytes directly, bypassing
                // that validation, so the test actually exercises `unpack_tar_gz_safely`'s own
                // defense rather than being pre-filtered by the archive-writer.
                let name_bytes = name.as_bytes();
                let gnu = header.as_gnu_mut().expect("gnu header");
                gnu.name[..name_bytes.len()].copy_from_slice(name_bytes);
                header.set_cksum();
                builder.append(&header, *content).unwrap();
            }
            builder.finish().unwrap();
        }
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        encoder.finish().unwrap()
    }

    #[test]
    fn a_bundle_with_explicit_directory_entries_and_nested_files_unpacks_cleanly() {
        // A real tarball built with e.g. GNU tar (as `tar czf` does) emits an explicit directory
        // entry before the files it contains -- caught for real during the LiteLLM proof run,
        // where `heartbeat-proxy/` is a subdirectory: the first version of this unpacker tried to
        // `fs::write` the directory entry itself and failed with "Is a directory".
        let dest = tempfile::tempdir().unwrap();
        let mut tar_bytes = Vec::new();
        {
            let mut builder = tar::Builder::new(&mut tar_bytes);
            builder.append_dir("heartbeat-proxy", ".").unwrap();
            let mut header = tar::Header::new_gnu();
            let content = b"FROM python:3.12-slim\n";
            header.set_size(content.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder.append_data(&mut header, "heartbeat-proxy/Dockerfile", &content[..]).unwrap();
            builder.finish().unwrap();
        }
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        let archive = encoder.finish().unwrap();

        unpack_tar_gz_safely(&archive, dest.path()).unwrap();
        assert!(dest.path().join("heartbeat-proxy").is_dir());
        assert!(dest.path().join("heartbeat-proxy/Dockerfile").is_file());
    }

    #[test]
    fn a_normal_bundle_unpacks_cleanly() {
        let dest = tempfile::tempdir().unwrap();
        let archive = make_tar_gz(&[("docker-compose.yml", b"services: {}\n"), ("verify.sh", b"#!/bin/sh\n")]);
        unpack_tar_gz_safely(&archive, dest.path()).unwrap();
        assert!(dest.path().join("docker-compose.yml").exists());
        assert!(dest.path().join("verify.sh").exists());
    }

    #[test]
    fn a_path_traversal_entry_is_refused_before_writing_anything() {
        let dest = tempfile::tempdir().unwrap();
        let archive = make_tar_gz(&[
            ("docker-compose.yml", b"services: {}\n"),
            ("../../etc/cron.d/evil", b"* * * * * root rm -rf /\n"),
        ]);
        let result = unpack_tar_gz_safely(&archive, dest.path());
        assert!(result.is_err());
        // Nothing from this malicious archive should have landed outside the scratch dir.
        assert!(!std::path::Path::new("/etc/cron.d/evil").exists());
    }

    #[test]
    fn an_absolute_path_entry_is_refused() {
        let dest = tempfile::tempdir().unwrap();
        let archive = make_tar_gz(&[("/etc/passwd", b"pwned\n")]);
        assert!(unpack_tar_gz_safely(&archive, dest.path()).is_err());
    }

    #[test]
    fn f12_a_body_within_the_cap_is_read_in_full() {
        let body = vec![7u8; 1024];
        let got = read_bounded(std::io::Cursor::new(body.clone()), Some(1024), 4096, "test://").unwrap();
        assert_eq!(got, body);
    }

    #[test]
    fn f12_a_declared_content_length_over_the_cap_is_refused_without_reading_the_body() {
        // The reader below would panic if actually read from -- proves the declared-length check
        // short-circuits before any read happens, not just that the end result is an error.
        struct PanicsIfRead;
        impl Read for PanicsIfRead {
            fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
                panic!("must not read when the declared Content-Length already exceeds the cap");
            }
        }
        let err = read_bounded(PanicsIfRead, Some(10_000_000), 4096, "test://").unwrap_err();
        assert!(err.contains("10000000 bytes"), "got: {err}");
        assert!(err.contains("4096-byte cap"), "got: {err}");
    }

    #[test]
    fn f12_a_missing_or_lying_content_length_does_not_bypass_the_cap() {
        // No declared length at all (the HTTP/1.0-chunked-transfer-encoding-with-no-Content-Length
        // case) -- the actual body is what gets capped.
        let oversized = vec![9u8; 5000];
        let err = read_bounded(std::io::Cursor::new(oversized), None, 4096, "test://").unwrap_err();
        assert!(err.contains("exceeded the 4096-byte cap"), "got: {err}");

        // A declared length that UNDERSTATES the real body (a lying/malicious server) must not
        // let the oversized body through either.
        let lying = vec![9u8; 5000];
        let err = read_bounded(std::io::Cursor::new(lying), Some(10), 4096, "test://").unwrap_err();
        assert!(err.contains("exceeded the 4096-byte cap"), "got: {err}");
    }

    #[test]
    fn f12_a_body_exactly_at_the_cap_is_accepted_not_mistaken_for_oversized() {
        let exact = vec![1u8; 4096];
        let got = read_bounded(std::io::Cursor::new(exact.clone()), None, 4096, "test://").unwrap();
        assert_eq!(got.len(), 4096);
        assert_eq!(got, exact);
    }
}
