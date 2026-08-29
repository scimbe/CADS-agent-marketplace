//! `wasm-bindgen` bindings for [`manifest_core::ServiceManifest`] sign/verify.
//!
//! Deliberately calls [`ServiceManifest::signing_bytes`]/[`ServiceManifest::sign_new`]/
//! [`ServiceManifest::is_valid`] DIRECTLY -- this crate reimplements none of the
//! domain-separated, length-prefixed preimage construction that makes a
//! `ServiceManifest` signature meaningful. That logic lives in exactly one
//! place, `manifest-core::manifest`, verified once by its own test suite; a JS
//! caller (or any other language binding) inherits that correctness for free
//! instead of re-deriving a byte-for-byte-compatible preimage builder and
//! risking silent drift from the canonical one. See `manifest-core`'s own
//! module doc for the full design rationale and threat model.
//!
//! Built for the Keyforge demo (`CADS-DEMO-keyforge`): sign and verify a
//! `ServiceManifest` entirely client-side, with the publisher's ed25519
//! private key never leaving the browser (this crate never sees a private key
//! except as a hex string handed to [`sign_manifest`] for the single call that
//! needs it -- it is never logged, stored, or echoed back).

use manifest_core::{BundleRef, DemoPrompt, EnvVarSpec, InstallerKind, ServiceManifest, VerifySpec};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

/// Panics inside wasm otherwise surface only as an opaque "unreachable
/// executed" in the browser console -- this routes them through
/// `console.error` with the real Rust message/location instead. A no-op on
/// native targets.
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();
}

fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("invalid hex string".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "invalid hex character".to_string()))
        .collect()
}

fn from_hex32(s: &str) -> Result<[u8; 32], String> {
    from_hex(s)?.try_into().map_err(|_| "expected 32 bytes (64 hex chars)".to_string())
}

/// JSON shape [`sign_manifest`] accepts: every [`ServiceManifest`] field
/// EXCEPT `publisher_pubkey` and `signature`, which [`ServiceManifest::sign_new`]
/// derives from the signing key / computes itself -- a caller cannot claim a
/// `publisher_pubkey` it does not hold the matching private key for, by
/// construction. Reuses `manifest-core`'s own field types
/// (`InstallerKind`/`BundleRef`/`EnvVarSpec`/`VerifySpec`) directly rather than
/// re-declaring parallel shapes, so their existing hex (de)serialization
/// (`BundleRef.sha256`) is inherited unchanged.
#[derive(Deserialize)]
struct UnsignedManifestInput {
    /// Hex-encoded 32 bytes, same encoding [`ServiceManifest::manifest_id`]
    /// itself uses -- kept a plain hex string here (rather than reusing the
    /// `#[serde(with = ...)]` field-level attribute, which only applies inside
    /// a type that owns the field) since this is the one field on
    /// `ServiceManifest` without its own dedicated wrapper type to borrow.
    manifest_id: String,
    name: String,
    version: String,
    installer_kind: InstallerKind,
    bundle: BundleRef,
    env_template: Vec<EnvVarSpec>,
    verify: VerifySpec,
    issued_at: u64,
    expires_at: u64,
    /// Optional guided-natural-language-config block -- part of the signed preimage when
    /// present (see [`ServiceManifest::signing_bytes`]'s own doc on `demo_prompt`'s
    /// backward-compatible encoding). `#[serde(default)]` so JSON with no `demo_prompt` key at
    /// all still deserializes.
    #[serde(default)]
    demo_prompt: Option<DemoPrompt>,
}

// Pure, testable cores behind the #[wasm_bindgen] exports below -- plain
// `Result<_, String>`, no JsError construction (JsError calls into imported JS
// functions even just to construct, which panics off-wasm; this mirrors
// ct-agent-wasm's holder_sign_inner/holder_verify_inner split).
fn sign_manifest_inner(signing_key_hex: &str, manifest_json: &str) -> Result<String, String> {
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&from_hex32(signing_key_hex)?);
    let input: UnsignedManifestInput =
        serde_json::from_str(manifest_json).map_err(|e| format!("invalid manifest JSON: {e}"))?;
    let manifest_id = from_hex32(&input.manifest_id)?;
    let signed = ServiceManifest::sign_new(
        &signing_key,
        manifest_id,
        input.name,
        input.version,
        input.installer_kind,
        input.bundle,
        input.env_template,
        input.verify,
        input.issued_at,
        input.expires_at,
        input.demo_prompt,
    );
    serde_json::to_string_pretty(&signed).map_err(|e| format!("failed to serialize signed manifest: {e}"))
}

fn verify_manifest_inner(manifest_json: &str) -> Result<bool, String> {
    let manifest: ServiceManifest =
        serde_json::from_str(manifest_json).map_err(|e| format!("invalid manifest JSON: {e}"))?;
    let Ok(vk) = ed25519_dalek::VerifyingKey::from_bytes(&manifest.publisher_pubkey) else {
        return Ok(false);
    };
    use ed25519_dalek::Verifier;
    let preimage = ServiceManifest::signing_bytes(
        &manifest.publisher_pubkey,
        &manifest.manifest_id,
        &manifest.name,
        &manifest.version,
        manifest.installer_kind,
        &manifest.bundle,
        &manifest.env_template,
        &manifest.verify,
        manifest.issued_at,
        manifest.expires_at,
        manifest.demo_prompt.as_ref(),
    );
    Ok(vk.verify(&preimage, &ed25519_dalek::Signature::from_bytes(&manifest.signature)).is_ok())
}

fn is_manifest_valid_inner(manifest_json: &str, now: u64) -> Result<bool, String> {
    let manifest: ServiceManifest =
        serde_json::from_str(manifest_json).map_err(|e| format!("invalid manifest JSON: {e}"))?;
    Ok(manifest.is_valid(now))
}

/// Sign an unsigned manifest (see [`UnsignedManifestInput`] for the accepted
/// JSON shape) with a publisher's ed25519 holder private key -- the SAME key
/// family/hex encoding `ct-agent-wasm`'s `generate_holder_identity`/`holderSign`
/// use, so a Keyforge holder identity signs a manifest with no key-format
/// translation. `publisher_pubkey` in the returned, signed manifest JSON is
/// always derived from `signing_key_hex` itself (via
/// [`ServiceManifest::sign_new`]) -- a caller cannot mint a manifest claiming a
/// key it does not hold.
///
/// Returns the full, signed [`ServiceManifest`] as pretty-printed JSON
/// (`publisher_pubkey` and `signature` filled in).
#[wasm_bindgen(js_name = signManifest)]
pub fn sign_manifest(signing_key_hex: &str, manifest_json: &str) -> Result<String, JsError> {
    sign_manifest_inner(signing_key_hex, manifest_json).map_err(|e| JsError::new(&e))
}

/// Verify a signed manifest's signature ONLY -- recomputes
/// [`ServiceManifest::signing_bytes`] from the manifest's own fields and checks
/// the ed25519 signature against `publisher_pubkey`, ignoring `expires_at`.
/// Returns `Ok(false)` for a mismatched key, tampered field, or tampered
/// signature (a real answer to "is this authentic?"); `Err`/`JsError` is
/// reserved for malformed input (bad JSON, bad hex) -- "the caller couldn't
/// even ask the question," not "the answer is no."
///
/// This checks authenticity only, never trust or currency -- see
/// [`is_manifest_valid`] for an expiry-aware check, and
/// [`ServiceManifest::is_valid`]'s own doc for why authenticity alone is never
/// sufficient grounds to install/run a manifest's bundle.
#[wasm_bindgen(js_name = verifyManifest)]
pub fn verify_manifest(manifest_json: &str) -> Result<bool, JsError> {
    verify_manifest_inner(manifest_json).map_err(|e| JsError::new(&e))
}

/// Full validity check -- signature AND `now < expires_at`, via
/// [`ServiceManifest::is_valid`] directly. `now` is a caller-supplied Unix
/// timestamp (seconds) rather than read from the wall clock internally, so
/// this stays deterministic/testable and the caller decides its own time
/// source (`Math.floor(Date.now() / 1000)` in a browser).
#[wasm_bindgen(js_name = isManifestValid)]
pub fn is_manifest_valid(manifest_json: &str, now: u64) -> Result<bool, JsError> {
    is_manifest_valid_inner(manifest_json, now).map_err(|e| JsError::new(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifest_core::InstallerKind as IK;

    fn random_signing_key() -> ed25519_dalek::SigningKey {
        use rand::RngCore;
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        ed25519_dalek::SigningKey::from_bytes(&seed)
    }

    fn to_hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    fn sample_unsigned_json(name: &str, issued_at: u64, expires_at: u64) -> String {
        format!(
            r#"{{
                "manifest_id": "{}",
                "name": "{name}",
                "version": "0.1.0",
                "installer_kind": "compose",
                "bundle": {{
                    "url": "https://example.invalid/bundle.tar.gz",
                    "sha256": "{}",
                    "compose_file": "docker-compose.yml"
                }},
                "env_template": [
                    {{"name": "LITELLM_MASTER_KEY", "required": true, "description": "proxy admin key"}}
                ],
                "verify": {{"script": "verify.sh", "timeout_secs": 60}},
                "issued_at": {issued_at},
                "expires_at": {expires_at}
            }}"#,
            to_hex(&[7u8; 32]),
            to_hex(&[9u8; 32]),
        )
    }

    #[test]
    fn sign_then_verify_round_trips() {
        let key = random_signing_key();
        let signing_key_hex = to_hex(&key.to_bytes());
        let unsigned = sample_unsigned_json("keyforge-demo", 1_000, 2_000);

        let signed_json = sign_manifest_inner(&signing_key_hex, &unsigned).unwrap();
        assert!(verify_manifest_inner(&signed_json).unwrap());
        assert!(is_manifest_valid_inner(&signed_json, 1_500).unwrap());

        // publisher_pubkey in the output must match the signing key, not
        // something the caller could have smuggled in via the input JSON
        // (UnsignedManifestInput has no publisher_pubkey field at all).
        let manifest: ServiceManifest = serde_json::from_str(&signed_json).unwrap();
        assert_eq!(manifest.publisher_pubkey, key.verifying_key().to_bytes());
        assert_eq!(manifest.installer_kind, IK::Compose);
    }

    #[test]
    fn expired_manifest_fails_is_valid_but_signature_still_verifies() {
        let key = random_signing_key();
        let signing_key_hex = to_hex(&key.to_bytes());
        let unsigned = sample_unsigned_json("keyforge-demo", 1_000, 2_000);
        let signed_json = sign_manifest_inner(&signing_key_hex, &unsigned).unwrap();

        assert!(verify_manifest_inner(&signed_json).unwrap(), "signature alone is unaffected by expiry");
        assert!(!is_manifest_valid_inner(&signed_json, 5_000).unwrap(), "but is_valid must reject it as expired");
    }

    #[test]
    fn tampered_field_after_signing_fails_verification() {
        let key = random_signing_key();
        let signing_key_hex = to_hex(&key.to_bytes());
        let unsigned = sample_unsigned_json("keyforge-demo", 1_000, 2_000);
        let signed_json = sign_manifest_inner(&signing_key_hex, &unsigned).unwrap();

        let mut manifest: ServiceManifest = serde_json::from_str(&signed_json).unwrap();
        manifest.name = "not-the-signed-name".to_string();
        let tampered_json = serde_json::to_string(&manifest).unwrap();
        assert!(!verify_manifest_inner(&tampered_json).unwrap());
    }

    #[test]
    fn signature_from_a_different_key_does_not_verify() {
        let key = random_signing_key();
        let other_key = random_signing_key();
        let unsigned = sample_unsigned_json("keyforge-demo", 1_000, 2_000);
        let signed_json = sign_manifest_inner(&to_hex(&key.to_bytes()), &unsigned).unwrap();

        // Swap in a different publisher_pubkey (a signature valid for `key`
        // must not verify against a claimed identity of `other_key`).
        let mut manifest: ServiceManifest = serde_json::from_str(&signed_json).unwrap();
        manifest.publisher_pubkey = other_key.verifying_key().to_bytes();
        let tampered_json = serde_json::to_string(&manifest).unwrap();
        assert!(!verify_manifest_inner(&tampered_json).unwrap());
    }

    #[test]
    fn a_manifest_with_a_demo_prompt_signs_and_verifies_through_the_wasm_boundary() {
        let key = random_signing_key();
        let signing_key_hex = to_hex(&key.to_bytes());
        let unsigned = format!(
            r#"{{
                "manifest_id": "{}",
                "name": "keyforge-demo",
                "version": "0.1.0",
                "installer_kind": "compose",
                "bundle": {{
                    "url": "https://example.invalid/bundle.tar.gz",
                    "sha256": "{}",
                    "compose_file": "docker-compose.yml"
                }},
                "env_template": [],
                "verify": {{"script": "verify.sh", "timeout_secs": 60}},
                "issued_at": 1000,
                "expires_at": 2000,
                "demo_prompt": {{
                    "system": "Only choose from the declared options.",
                    "parameters": [
                        {{"name": "location", "type": "enum", "options": ["Hamburg", "Berlin"]}}
                    ],
                    "examples": ["Berlin bitte"]
                }}
            }}"#,
            to_hex(&[7u8; 32]),
            to_hex(&[9u8; 32]),
        );

        let signed_json = sign_manifest_inner(&signing_key_hex, &unsigned).unwrap();
        assert!(verify_manifest_inner(&signed_json).unwrap());

        let manifest: ServiceManifest = serde_json::from_str(&signed_json).unwrap();
        assert!(manifest.demo_prompt.is_some());

        // Widening the signed enum's options post-signature (the exact attack demo_prompt being
        // signed exists to prevent) must invalidate verification at this boundary too, not just
        // inside manifest-core's own test suite.
        let mut tampered = manifest.clone();
        if let Some(dp) = tampered.demo_prompt.as_mut() {
            if let manifest_core::PromptParamKind::Enum { options } = &mut dp.parameters[0].kind {
                options.push("Tokio".into());
            }
        }
        let tampered_json = serde_json::to_string(&tampered).unwrap();
        assert!(!verify_manifest_inner(&tampered_json).unwrap());
    }

    #[test]
    fn rejects_malformed_input_as_an_error_not_a_false() {
        assert!(sign_manifest_inner("nothex", "{}").is_err());
        let key = random_signing_key();
        assert!(sign_manifest_inner(&to_hex(&key.to_bytes()), "not json").is_err());
        assert!(verify_manifest_inner("not json").is_err());
        assert!(is_manifest_valid_inner("not json", 0).is_err());
    }
}
