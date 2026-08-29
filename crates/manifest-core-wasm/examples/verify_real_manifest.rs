//! Dev sanity check, not part of the crate's public surface: confirm
//! `verifyManifest`/`isManifestValid` accept a REAL manifest fetched live from
//! `https://registry.bunsenbrenner.org/manifests/<id>` -- this is what caught
//! `demo_prompt` needing to be part of the signed preimage in the first place
//! (a manifest fetched before this crate accounted for it verified as
//! `false`, tracked down to the registry running the then-unmerged
//! `feat/manifest-core-demo-prompt` branch, not `main`).
//!
//! Run: `curl -s https://registry.bunsenbrenner.org/manifests/<id> -o m.json &&
//! cargo run --example verify_real_manifest -- m.json`
use std::env;
use std::fs;

fn main() {
    let path = env::args().nth(1).expect("usage: verify_real_manifest <path-to-manifest.json>");
    let json = fs::read_to_string(&path).expect("read manifest file");

    let verified = manifest_core_wasm::verify_manifest(&json).expect("verify_manifest call");
    println!("verifyManifest (signature only): {verified}");

    let now = 1_788_040_000u64; // shortly after this manifest's issued_at
    let valid = manifest_core_wasm::is_manifest_valid(&json, now).expect("is_manifest_valid call");
    println!("isManifestValid(now={now}): {valid}");

    assert!(verified, "real registry-signed manifest must verify");
    assert!(valid, "real registry-signed manifest must be valid at a plausible `now`");
    println!("OK: real live-registry manifest verified successfully, extra demo_prompt field tolerated");
}
