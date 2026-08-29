//! `SignedTask`: a holder-signed instruction for the Phase 2 harness (`ct-agent harness run`) to
//! execute against ONE specific manifest-installed bundle. Mirrors [`crate::manifest::ServiceManifest`]'s
//! signing shape exactly -- same `Preimage` discipline, same publisher-key family -- deliberately
//! not a divergent scheme (see that module's doc for the rationale).
//!
//! **What binds a task to a bundle**: `manifest_id`. The harness resolves the `ServiceManifest`
//! with that id (already installed by `manifest activate`), finds ITS `work_dir`, and every
//! filesystem operation the harness's tools perform is containment-checked against that specific
//! directory -- a task cannot name or imply any other path. `max_turns`/`max_output_tokens` are
//! signed fields, not harness-local config, so a compromised or malicious task cannot self-escalate
//! its own budget after the fact -- the signature covers the ceiling, not just the instruction.

use crate::preimage::Preimage;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// Domain separator for [`SignedTask`] signatures. Never reused for another signed type in this
/// crate -- see `preimage.rs`'s module doc on why domain separation matters.
const SIGNED_TASK_DOMAIN: &[u8] = b"cads-signed-task-v1";

/// A holder-signed instruction to run the harness against one bundle. See the module doc.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignedTask {
    /// The publisher's ed25519 holder public key -- same key family as [`crate::ServiceManifest`].
    #[serde(with = "crate::hex::b32")]
    pub publisher_pubkey: [u8; 32],
    #[serde(with = "crate::hex::b32")]
    pub task_id: [u8; 32],
    /// The [`crate::ServiceManifest::manifest_id`] whose installed bundle this task may touch --
    /// the harness refuses to run if no manifest with this id was actually activated locally.
    #[serde(with = "crate::hex::b32")]
    pub manifest_id: [u8; 32],
    pub prompt: String,
    /// The LiteLLM `model_name` to call -- operator-controlled infrastructure naming, not a model
    /// the harness or the task author chooses freely; the harness's own config still gates which
    /// `model` values it will actually accept (an allowlist, mirroring the publisher allowlist
    /// pattern), so a signed task naming an unexpected model is refused before any API call.
    pub model: String,
    /// Bounded agent loop -- part of the SIGNED preimage, so it cannot be raised after signing.
    pub max_turns: u32,
    /// Per-turn output token cap -- defense in depth under the LiteLLM key's own budget cap.
    pub max_output_tokens: u64,
    pub issued_at: u64,
    pub expires_at: u64,
    #[serde(with = "crate::hex::b64")]
    pub signature: [u8; 64],
}

impl SignedTask {
    /// Domain-separated, canonical, injective preimage -- same discipline as
    /// [`crate::ServiceManifest::signing_bytes`]: every variable-length field length-prefixed via
    /// [`Preimage::var_bytes`], fixed fields appended verbatim. Field order is part of the signed
    /// meaning -- changing it changes every future signature.
    #[allow(clippy::too_many_arguments)]
    pub fn signing_bytes(
        publisher_pubkey: &[u8; 32],
        task_id: &[u8; 32],
        manifest_id: &[u8; 32],
        prompt: &str,
        model: &str,
        max_turns: u32,
        max_output_tokens: u64,
        issued_at: u64,
        expires_at: u64,
    ) -> Vec<u8> {
        Preimage::new(SIGNED_TASK_DOMAIN)
            .fixed(publisher_pubkey)
            .fixed(task_id)
            .fixed(manifest_id)
            .var_bytes(prompt.as_bytes())
            .var_bytes(model.as_bytes())
            .u32(max_turns)
            .u64(max_output_tokens)
            .u64(issued_at)
            .u64(expires_at)
            .finish()
    }

    /// Whether this task is authentic AND still current at `now`. Same "issuance, not trust"
    /// caveat as [`crate::ServiceManifest::is_valid`] -- a caller MUST additionally check
    /// `publisher_pubkey` against its own trust allowlist; a valid signature from an untrusted key
    /// is never sufficient grounds to run the harness.
    pub fn is_valid(&self, now: u64) -> bool {
        if now >= self.expires_at {
            return false;
        }
        let Ok(vk) = VerifyingKey::from_bytes(&self.publisher_pubkey) else {
            return false;
        };
        let preimage = Self::signing_bytes(
            &self.publisher_pubkey,
            &self.task_id,
            &self.manifest_id,
            &self.prompt,
            &self.model,
            self.max_turns,
            self.max_output_tokens,
            self.issued_at,
            self.expires_at,
        );
        vk.verify(&preimage, &Signature::from_bytes(&self.signature)).is_ok()
    }

    /// Construct and sign a task. `publisher_pubkey` is always derived from `signing_key` itself,
    /// so a caller cannot mint a task claiming a key it does not hold.
    #[allow(clippy::too_many_arguments)]
    pub fn sign_new(
        signing_key: &SigningKey,
        task_id: [u8; 32],
        manifest_id: [u8; 32],
        prompt: String,
        model: String,
        max_turns: u32,
        max_output_tokens: u64,
        issued_at: u64,
        expires_at: u64,
    ) -> SignedTask {
        let publisher_pubkey = signing_key.verifying_key().to_bytes();
        let preimage = Self::signing_bytes(
            &publisher_pubkey,
            &task_id,
            &manifest_id,
            &prompt,
            &model,
            max_turns,
            max_output_tokens,
            issued_at,
            expires_at,
        );
        let signature = signing_key.sign(&preimage).to_bytes();
        SignedTask {
            publisher_pubkey,
            task_id,
            manifest_id,
            prompt,
            model,
            max_turns,
            max_output_tokens,
            issued_at,
            expires_at,
            signature,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::RngCore;

    fn random_signing_key() -> SigningKey {
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        SigningKey::from_bytes(&seed)
    }

    fn sample(signing_key: &SigningKey, issued_at: u64, expires_at: u64) -> SignedTask {
        SignedTask::sign_new(
            signing_key,
            [1u8; 32],
            [2u8; 32],
            "add a comment explaining dispatch()".into(),
            "local-devstral-small2".into(),
            10,
            2048,
            issued_at,
            expires_at,
        )
    }

    #[test]
    fn round_trips_sign_and_verify() {
        let key = random_signing_key();
        let t = sample(&key, 1_000, 2_000);
        assert!(t.is_valid(1_500));
        assert_eq!(t.publisher_pubkey, key.verifying_key().to_bytes());
    }

    #[test]
    fn expired_task_is_invalid_even_with_a_correct_signature() {
        let key = random_signing_key();
        let t = sample(&key, 1_000, 2_000);
        assert!(!t.is_valid(2_000));
        assert!(!t.is_valid(5_000));
    }

    #[test]
    fn tampering_max_turns_after_signing_invalidates_the_signature() {
        // The whole point of signing the budget fields: a task cannot be replayed with a raised
        // ceiling after the fact.
        let key = random_signing_key();
        let mut t = sample(&key, 1_000, 2_000);
        t.max_turns = 10_000;
        assert!(!t.is_valid(1_500));
    }

    #[test]
    fn tampering_manifest_id_after_signing_invalidates_the_signature() {
        // manifest_id is what scopes the harness's filesystem access -- retargeting it post-hoc
        // must not be possible.
        let key = random_signing_key();
        let mut t = sample(&key, 1_000, 2_000);
        t.manifest_id = [0xAA; 32];
        assert!(!t.is_valid(1_500));
    }

    #[test]
    fn a_service_manifest_signature_does_not_verify_as_a_signed_task() {
        // The concrete cross-type-replay check: sign a ServiceManifest-shaped preimage's bytes
        // as if they were a task, confirm is_valid rejects it -- domain separation isn't just a
        // distinct constant, it must actually change what verifies.
        use crate::manifest::{BundleRef, InstallerKind, ServiceManifest, VerifySpec};
        let key = random_signing_key();
        let manifest = ServiceManifest::sign_new(
            &key,
            [1u8; 32],
            "x".into(),
            "0.1.0".into(),
            InstallerKind::Compose,
            BundleRef { url: "https://example.invalid/b.tar.gz".into(), sha256: [0u8; 32], compose_file: "docker-compose.yml".into() },
            vec![],
            VerifySpec { script: "verify.sh".into(), timeout_secs: 60 },
            1_000,
            2_000,
            None,
        );
        // Graft the manifest's signature onto a same-shaped task and confirm it does not verify.
        let mut t = sample(&key, 1_000, 2_000);
        t.task_id = manifest.manifest_id;
        t.signature = manifest.signature;
        assert!(!t.is_valid(1_500), "a ServiceManifest signature must not verify as a SignedTask");
    }
}
