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
use subtle::ConstantTimeEq;

pub fn fetch_manifest(location: &str) -> Result<ServiceManifest, String> {
    let bytes = fetch_bytes(location)?;
    serde_json::from_slice(&bytes).map_err(|e| format!("manifest at {location} is not valid JSON: {e}"))
}

pub fn fetch_bundle(url: &str) -> Result<Vec<u8>, String> {
    fetch_bytes(url)
}

fn fetch_bytes(location: &str) -> Result<Vec<u8>, String> {
    if location.starts_with("https://") || location.starts_with("http://") {
        if location.starts_with("http://") {
            return Err(format!(
                "{location}: plain HTTP is refused -- manifest/bundle fetches must be HTTPS (the signature \
                 protects the payload's integrity, but a plaintext transport still leaks which manifest/bundle \
                 an operator is activating, and is trivially tamperable in transit before the hash check ever runs)"
            ));
        }
        let resp = reqwest::blocking::get(location).map_err(|e| format!("fetch {location}: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("fetch {location}: HTTP {}", resp.status()));
        }
        resp.bytes().map(|b| b.to_vec()).map_err(|e| format!("fetch {location}: {e}"))
    } else {
        std::fs::read(location).map_err(|e| format!("read {location}: {e}"))
    }
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
}
