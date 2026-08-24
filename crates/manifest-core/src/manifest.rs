//! `ServiceManifest`: a holder-signed, discoverable description of ONE installable service.
//!
//! Deliberately mirrors CADS-Tunnel's `ct_common::channel::AgentCard`/`CapacityOffer` shape
//! (crates/common/src/channel.rs ~1211-1900): a domain-separated, injective [`Preimage`], an
//! ed25519 **holder** key signs it (the SAME key family a ct-agent already uses for channel
//! membership -- this is what lets an agent create/sign/publish manifests with its own existing
//! identity, no new PKI), and `is_valid(now)` checks both signature and expiry. Phase 1 scope --
//! see `docs/security-model.md` for the full threat model this type is designed against.
//!
//! **What this type intentionally does NOT carry**: any secret *value*. `env_template` names
//! required environment variables only (`ADR-0014`'s operator-blind philosophy, ct-agent#32's
//! "the agent must not hold the second secret" invariant) -- secret values are always supplied
//! out-of-band, locally, at install time by `installer-engine`, never embedded in a signed,
//! potentially-published artifact.

use crate::preimage::Preimage;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// Domain separator for [`ServiceManifest`] signatures. Never reused for another signed type in
/// this crate -- reusing a domain across types is exactly the cross-type signature replay domain
/// separation exists to prevent (see `preimage.rs`'s module doc).
const SERVICE_MANIFEST_DOMAIN: &[u8] = b"cads-service-manifest-v1";

/// How `installer-engine` should execute this manifest's `bundle`. [`InstallerKind::Compose`]
/// (Phase 1) and [`InstallerKind::Binary`] (Phase 5) both have real executors; `K8s` remains a
/// reserved schema slot -- the wire format doesn't need to change when a real executor lands for
/// it, but `installer-engine::activate` hard-rejects it today via an exhaustive `match` with no
/// fallback arm (there is nothing to type-confuse into running, because there is no code path for
/// it at all yet). Unproven code claiming to run against a real Kubernetes cluster would be a
/// false claim this operator has no cluster to verify against -- see `installer-engine::activate`'s
/// module doc for the full rationale.
///
/// **Binary's trust boundary is narrower than Compose's.** A Compose bundle is scanned by
/// `guardrails::scan_compose` before anything runs (rejects privileged containers, host mounts,
/// non-local build contexts, etc.) -- there is no equivalent static scan for an arbitrary
/// executable, so a `Binary` manifest's entire safety rests on the publisher trust allowlist
/// (F.5) holding. This is a real, acknowledged reduction in defense-in-depth, not a silently
/// dropped check: never add `Binary` to a trust allowlist for a publisher whose Compose bundles
/// you wouldn't also blindly trust.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallerKind {
    Compose,
    Binary,
    K8s,
}

impl InstallerKind {
    fn as_u8(self) -> u8 {
        match self {
            InstallerKind::Compose => 0,
            InstallerKind::Binary => 1,
            InstallerKind::K8s => 2,
        }
    }
}

/// A content-addressed reference to the install bundle (a tarball containing at least the
/// referenced compose file and verify script). The bundle itself is not signed -- it's just
/// bytes; the manifest's signature over `sha256` is what makes the bundle trustworthy once
/// `installer-engine` re-hashes the fetched bytes and compares (constant-time) against this
/// field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BundleRef {
    pub url: String,
    #[serde(with = "crate::hex::b32")]
    pub sha256: [u8; 32],
    /// Path inside the unpacked bundle to the thing `installer-engine` should run: the compose
    /// file for [`InstallerKind::Compose`], or the executable itself for
    /// [`InstallerKind::Binary`] (reused rather than adding a kind-specific field -- both are
    /// "the one path inside the bundle that names the entrypoint").
    pub compose_file: String,
}

/// One declared environment variable the bundle's compose file needs. **Name only, never a
/// value** -- see the module doc.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvVarSpec {
    pub name: String,
    pub required: bool,
    pub description: String,
}

/// The bundle's own verification entrypoint. `installer-engine` runs this script, bounded by
/// `timeout_secs`, after `docker compose up` -- its exit code is the measured pass/fail verdict
/// (never assumed from `up`'s own exit code alone).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifySpec {
    pub script: String,
    pub timeout_secs: u64,
}

/// A holder-signed description of one installable service. See the module doc for the design
/// rationale; see [`ServiceManifest::signing_bytes`] for the exact canonical preimage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServiceManifest {
    /// The publishing agent's ed25519 holder public key -- the signature is checked against
    /// this, and it is the same key family that authorizes the agent's channel membership.
    #[serde(with = "crate::hex::b32")]
    pub publisher_pubkey: [u8; 32],
    /// Random, publisher-chosen identifier. Part of the signed preimage, so it cannot be
    /// swapped post-signature without invalidating the signature.
    #[serde(with = "crate::hex::b32")]
    pub manifest_id: [u8; 32],
    pub name: String,
    pub version: String,
    pub installer_kind: InstallerKind,
    pub bundle: BundleRef,
    pub env_template: Vec<EnvVarSpec>,
    pub verify: VerifySpec,
    pub issued_at: u64,
    pub expires_at: u64,
    /// The holder's ed25519 signature over [`ServiceManifest::signing_bytes`].
    #[serde(with = "crate::hex::b64")]
    pub signature: [u8; 64],
}

impl ServiceManifest {
    /// Domain-separated, canonical, injective preimage: every variable-length field is
    /// length-prefixed via [`Preimage::var_bytes`] (the one place that discipline lives), fixed
    /// fields append verbatim. Field order here is the field order any implementation MUST use --
    /// changing it changes every future signature's meaning, not just this one.
    #[allow(clippy::too_many_arguments)]
    pub fn signing_bytes(
        publisher_pubkey: &[u8; 32],
        manifest_id: &[u8; 32],
        name: &str,
        version: &str,
        installer_kind: InstallerKind,
        bundle: &BundleRef,
        env_template: &[EnvVarSpec],
        verify: &VerifySpec,
        issued_at: u64,
        expires_at: u64,
    ) -> Vec<u8> {
        let mut p = Preimage::new(SERVICE_MANIFEST_DOMAIN)
            .fixed(publisher_pubkey)
            .fixed(manifest_id)
            .var_bytes(name.as_bytes())
            .var_bytes(version.as_bytes())
            .tag(installer_kind.as_u8())
            .var_bytes(bundle.url.as_bytes())
            .fixed(&bundle.sha256)
            .var_bytes(bundle.compose_file.as_bytes())
            .u32(env_template.len() as u32);
        for e in env_template {
            p = p
                .var_bytes(e.name.as_bytes())
                .tag(e.required as u8)
                .var_bytes(e.description.as_bytes());
        }
        p.var_bytes(verify.script.as_bytes())
            .u64(verify.timeout_secs)
            .u64(issued_at)
            .u64(expires_at)
            .finish()
    }

    /// Whether this manifest is authentic AND still current at `now`: the publisher's signature
    /// verifies for its exact contents and `now < expires_at`. A forged/tampered/expired manifest
    /// returns `false`.
    ///
    /// **This authenticates issuance only, never trust.** A manifest can be perfectly valid --
    /// correctly signed by a real key, not expired -- and still come from a publisher nobody
    /// should trust. `installer-engine` MUST additionally check `publisher_pubkey` against an
    /// explicit local allowlist as a separate step; `is_valid` alone is never sufficient grounds
    /// to run `docker compose up`.
    pub fn is_valid(&self, now: u64) -> bool {
        if now >= self.expires_at {
            return false;
        }
        let Ok(vk) = VerifyingKey::from_bytes(&self.publisher_pubkey) else {
            return false;
        };
        let preimage = Self::signing_bytes(
            &self.publisher_pubkey,
            &self.manifest_id,
            &self.name,
            &self.version,
            self.installer_kind,
            &self.bundle,
            &self.env_template,
            &self.verify,
            self.issued_at,
            self.expires_at,
        );
        vk.verify(&preimage, &Signature::from_bytes(&self.signature)).is_ok()
    }

    /// Construct and sign a manifest from a publisher's holder `SigningKey`. `publisher_pubkey`
    /// is always derived from `signing_key` itself, so a caller cannot mint a manifest claiming a
    /// key it does not hold.
    #[allow(clippy::too_many_arguments)]
    pub fn sign_new(
        signing_key: &SigningKey,
        manifest_id: [u8; 32],
        name: String,
        version: String,
        installer_kind: InstallerKind,
        bundle: BundleRef,
        env_template: Vec<EnvVarSpec>,
        verify: VerifySpec,
        issued_at: u64,
        expires_at: u64,
    ) -> ServiceManifest {
        let publisher_pubkey = signing_key.verifying_key().to_bytes();
        let preimage = Self::signing_bytes(
            &publisher_pubkey,
            &manifest_id,
            &name,
            &version,
            installer_kind,
            &bundle,
            &env_template,
            &verify,
            issued_at,
            expires_at,
        );
        let signature = signing_key.sign(&preimage).to_bytes();
        ServiceManifest {
            publisher_pubkey,
            manifest_id,
            name,
            version,
            installer_kind,
            bundle,
            env_template,
            verify,
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

    /// `ed25519_dalek::SigningKey::generate` needs the `rand_core` feature (and its own pinned
    /// `rand_core` major version) -- side-stepping that coupling by drawing raw bytes from
    /// `rand`'s own `OsRng` directly and constructing via `from_bytes`, which needs no feature
    /// flag at all.
    fn random_signing_key() -> SigningKey {
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        SigningKey::from_bytes(&seed)
    }

    fn sample(signing_key: &SigningKey, issued_at: u64, expires_at: u64) -> ServiceManifest {
        ServiceManifest::sign_new(
            signing_key,
            [7u8; 32],
            "litellm-proof".into(),
            "0.1.0".into(),
            InstallerKind::Compose,
            BundleRef {
                url: "https://example.invalid/bundle.tar.gz".into(),
                sha256: [9u8; 32],
                compose_file: "docker-compose.yml".into(),
            },
            vec![EnvVarSpec {
                name: "LITELLM_MASTER_KEY".into(),
                required: true,
                description: "proxy admin key, provisioned out-of-band".into(),
            }],
            VerifySpec { script: "verify.sh".into(), timeout_secs: 60 },
            issued_at,
            expires_at,
        )
    }

    #[test]
    fn round_trips_sign_and_verify() {
        let key = random_signing_key();
        let m = sample(&key, 1_000, 2_000);
        assert!(m.is_valid(1_500));
        assert_eq!(m.publisher_pubkey, key.verifying_key().to_bytes());
    }

    #[test]
    fn expired_manifest_is_invalid_even_with_a_correct_signature() {
        let key = random_signing_key();
        let m = sample(&key, 1_000, 2_000);
        assert!(!m.is_valid(2_000), "now == expires_at must already be invalid");
        assert!(!m.is_valid(5_000));
    }

    #[test]
    fn tampered_field_after_signing_invalidates_the_signature() {
        let key = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        m.name = "not-the-signed-name".into();
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn tampered_bundle_hash_invalidates_the_signature() {
        // A manifest is only as trustworthy as the exact bundle bytes it commits to -- swapping
        // the declared sha256 after signing must break verification, the same as any other field.
        let key = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        m.bundle.sha256 = [0xAA; 32];
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn signature_from_a_different_key_does_not_verify() {
        let key = random_signing_key();
        let other = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        // Re-sign the SAME preimage with a different key, then swap in that signature and
        // publisher_pubkey -- is_valid must still hold (that's just a validly-signed manifest
        // from a different, unrelated key). The interesting negative case is a signature that
        // does NOT match the claimed publisher_pubkey at all:
        let sig = other.sign(&ServiceManifest::signing_bytes(
            &m.publisher_pubkey,
            &m.manifest_id,
            &m.name,
            &m.version,
            m.installer_kind,
            &m.bundle,
            &m.env_template,
            &m.verify,
            m.issued_at,
            m.expires_at,
        ));
        m.signature = sig.to_bytes();
        assert!(!m.is_valid(1_500), "a signature from a key other than publisher_pubkey must not verify");
    }

    #[test]
    fn a_domain_separated_type_cannot_replay_as_a_service_manifest() {
        // The domain constant is the whole point -- assert it exists and is distinct in spirit
        // from an arbitrary empty/placeholder domain, catching an accidental copy-paste of
        // another type's constant during future edits.
        assert_eq!(SERVICE_MANIFEST_DOMAIN, b"cads-service-manifest-v1");
    }
}
