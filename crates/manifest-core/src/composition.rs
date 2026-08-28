//! `CompositionManifest`: a holder-signed description of "install N [`crate::ServiceManifest`]s
//! and wire M A2A edges between them as one unit." See
//! `docs/design/composition-manifest.md` for the full design rationale -- this module implements
//! exactly its "Schema shape" and "Signing" sections, nothing more. It does not replace or modify
//! [`crate::ServiceManifest`]; a composition only ever *references* sub-manifests by their own
//! signature, never embeds or supersedes them.
//!
//! Mirrors [`crate::manifest::ServiceManifest`]'s shape precisely: same [`Preimage`] discipline,
//! same `publisher_pubkey`/`sign_new`/`is_valid` split between issuance-authenticity and
//! (separately, in `installer-engine`) trust.
//!
//! **Honesty constraint (see the design doc's section of the same name)**: `edges` describes M
//! independent pairwise A2A channels, never multi-hop routing -- no doc comment, generated text,
//! or UI built on this type may imply otherwise.

use crate::preimage::Preimage;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// Domain separator for [`CompositionManifest`] signatures. Never reused for another signed type
/// in this crate -- see `preimage.rs`'s module doc on why domain separation matters.
const COMPOSITION_MANIFEST_DOMAIN: &[u8] = b"cads-composition-manifest-v1";

/// Whether the installer SHOULD configure both sides of an edge with a direct listener, once
/// their channel is admitted, if their deployment environment allows one.
///
/// **Advisory only, not enforced by anything cryptographic or server-side** -- per the design
/// doc's "Honesty constraint": nothing in the current stack lets a manifest, topology, or channel
/// *force* the relay-to-direct upgrade (`ct_common::upgrade`). Whether an upgrade is even
/// attempted is a per-process fact of whether that agent's own `ct-agent channel` invocation was
/// given a dialable direct endpoint -- a local network-capability fact this field can only hint
/// at, never dictate. Any generated docs/UI must say "the installer will attempt X", never "this
/// edge runs in X mode".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeUpgradeHint {
    RelayOnly,
    AttemptDirect,
}

impl EdgeUpgradeHint {
    fn as_u8(self) -> u8 {
        match self {
            EdgeUpgradeHint::RelayOnly => 0,
            EdgeUpgradeHint::AttemptDirect => 1,
        }
    }
}

/// One declared A2A edge between two of this composition's sub-manifests, named by their
/// **index** into [`CompositionManifest::sub_manifests`] -- never a real holder key, which
/// doesn't exist yet when the composition is signed. See the design doc's "Why symbolic indices,
/// not real holder keys" section.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompositionEdge {
    pub a: u32,
    pub b: u32,
    pub upgrade_hint: EdgeUpgradeHint,
}

/// A content-addressed reference to one sub-manifest, resolved at install time via the registry's
/// `GET /manifests/:manifest_id`. Pins the referenced [`crate::ServiceManifest`]'s exact signed
/// bytes by committing to its own signature (see the design doc's "Why `SubManifestRef` pins by
/// `signature`, not a separate hash") without embedding the manifest itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubManifestRef {
    #[serde(with = "crate::hex::b32")]
    pub publisher_pubkey: [u8; 32],
    #[serde(with = "crate::hex::b32")]
    pub manifest_id: [u8; 32],
    /// The referenced [`crate::ServiceManifest`]'s OWN signature -- not re-verified here (that
    /// happens at install time, resolving against a fetched manifest); committing to it is what
    /// makes tampering with the fetched manifest detectable.
    #[serde(with = "crate::hex::b64")]
    pub signature: [u8; 64],
    /// Registry base URL to fetch this sub-manifest from at install time -- same
    /// "content commitment pins correctness, URL is just where to look" split as
    /// [`crate::manifest::BundleRef::url`].
    pub registry_url: String,
}

/// A holder-signed description of one multi-agent composition. See the module doc for the design
/// rationale; see [`CompositionManifest::signing_bytes`] for the exact canonical preimage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompositionManifest {
    /// The publishing agent's ed25519 holder public key -- same key family as
    /// [`crate::ServiceManifest::publisher_pubkey`].
    #[serde(with = "crate::hex::b32")]
    pub publisher_pubkey: [u8; 32],
    #[serde(with = "crate::hex::b32")]
    pub composition_id: [u8; 32],
    pub name: String,
    pub version: String,
    /// Ordered; an edge's `a`/`b` are indices into this `Vec`. Order is part of the signed
    /// preimage, so an installer cannot reorder sub-manifests to make an edge mean something
    /// else.
    pub sub_manifests: Vec<SubManifestRef>,
    pub edges: Vec<CompositionEdge>,
    pub issued_at: u64,
    pub expires_at: u64,
    /// The holder's ed25519 signature over [`CompositionManifest::signing_bytes`]. Covers the
    /// exact ref list and edge list -- it answers "is this exact wiring what the publisher
    /// signed", a deliberately separate question from "is each pinned sub-manifest itself still
    /// valid" (checked per-ref at install time; see the design doc's "Signing" section).
    #[serde(with = "crate::hex::b64")]
    pub signature: [u8; 64],
}

impl CompositionManifest {
    /// Domain-separated, canonical, injective preimage -- same discipline as
    /// [`crate::ServiceManifest::signing_bytes`]: domain, `publisher_pubkey`, `composition_id`,
    /// `name`, `version`, then a `u32` count of `sub_manifests` followed by each ref's
    /// `publisher_pubkey ‖ manifest_id ‖ signature ‖ var_bytes(registry_url)`, then a `u32` count
    /// of `edges` followed by each edge's `u32(a) ‖ u32(b) ‖ tag(upgrade_hint)`, then
    /// `issued_at`/`expires_at`. Field order here is the field order any implementation MUST use
    /// -- changing it changes every future signature's meaning, not just this one.
    #[allow(clippy::too_many_arguments)]
    pub fn signing_bytes(
        publisher_pubkey: &[u8; 32],
        composition_id: &[u8; 32],
        name: &str,
        version: &str,
        sub_manifests: &[SubManifestRef],
        edges: &[CompositionEdge],
        issued_at: u64,
        expires_at: u64,
    ) -> Vec<u8> {
        let mut p = Preimage::new(COMPOSITION_MANIFEST_DOMAIN)
            .fixed(publisher_pubkey)
            .fixed(composition_id)
            .var_bytes(name.as_bytes())
            .var_bytes(version.as_bytes())
            .u32(sub_manifests.len() as u32);
        for r in sub_manifests {
            p = p
                .fixed(&r.publisher_pubkey)
                .fixed(&r.manifest_id)
                .fixed(&r.signature)
                .var_bytes(r.registry_url.as_bytes());
        }
        p = p.u32(edges.len() as u32);
        for e in edges {
            p = p.u32(e.a).u32(e.b).tag(e.upgrade_hint.as_u8());
        }
        p.u64(issued_at).u64(expires_at).finish()
    }

    /// Whether this composition's OWN signature is authentic AND still current at `now`: the
    /// publisher's signature verifies over the exact ref list + edge list, and `now < expires_at`.
    ///
    /// **This authenticates the composition's issuance only** -- exactly like
    /// [`crate::ServiceManifest::is_valid`], it says nothing about trust, and nothing about
    /// whether the pinned sub-manifests are themselves still valid (a separate, per-ref check;
    /// see the design doc's "Signing" section and `installer-engine`'s install flow).
    pub fn is_valid(&self, now: u64) -> bool {
        if now >= self.expires_at {
            return false;
        }
        let Ok(vk) = VerifyingKey::from_bytes(&self.publisher_pubkey) else {
            return false;
        };
        let preimage = Self::signing_bytes(
            &self.publisher_pubkey,
            &self.composition_id,
            &self.name,
            &self.version,
            &self.sub_manifests,
            &self.edges,
            self.issued_at,
            self.expires_at,
        );
        vk.verify(&preimage, &Signature::from_bytes(&self.signature)).is_ok()
    }

    /// Construct and sign a composition from a publisher's holder `SigningKey`. `publisher_pubkey`
    /// is always derived from `signing_key` itself, so a caller cannot mint a composition claiming
    /// a key it does not hold.
    #[allow(clippy::too_many_arguments)]
    pub fn sign_new(
        signing_key: &SigningKey,
        composition_id: [u8; 32],
        name: String,
        version: String,
        sub_manifests: Vec<SubManifestRef>,
        edges: Vec<CompositionEdge>,
        issued_at: u64,
        expires_at: u64,
    ) -> CompositionManifest {
        let publisher_pubkey = signing_key.verifying_key().to_bytes();
        let preimage = Self::signing_bytes(
            &publisher_pubkey,
            &composition_id,
            &name,
            &version,
            &sub_manifests,
            &edges,
            issued_at,
            expires_at,
        );
        let signature = signing_key.sign(&preimage).to_bytes();
        CompositionManifest {
            publisher_pubkey,
            composition_id,
            name,
            version,
            sub_manifests,
            edges,
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

    /// Same OsRng-direct convention as `manifest.rs`'s own `random_signing_key` -- sidesteps the
    /// `ed25519_dalek::SigningKey::generate` / `rand_core` feature-version coupling.
    fn random_signing_key() -> SigningKey {
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        SigningKey::from_bytes(&seed)
    }

    fn sample_ref(seed: u8) -> SubManifestRef {
        SubManifestRef {
            publisher_pubkey: [seed; 32],
            manifest_id: [seed.wrapping_add(1); 32],
            signature: [seed.wrapping_add(2); 64],
            registry_url: format!("https://registry.example.invalid/{seed}"),
        }
    }

    fn sample(signing_key: &SigningKey, issued_at: u64, expires_at: u64) -> CompositionManifest {
        CompositionManifest::sign_new(
            signing_key,
            [7u8; 32],
            "ingest-transform-publish".into(),
            "0.1.0".into(),
            vec![sample_ref(1), sample_ref(2), sample_ref(3)],
            vec![
                CompositionEdge { a: 0, b: 1, upgrade_hint: EdgeUpgradeHint::RelayOnly },
                CompositionEdge { a: 1, b: 2, upgrade_hint: EdgeUpgradeHint::AttemptDirect },
            ],
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
    fn expired_composition_is_invalid_even_with_a_correct_signature() {
        let key = random_signing_key();
        let m = sample(&key, 1_000, 2_000);
        assert!(!m.is_valid(2_000), "now == expires_at must already be invalid");
        assert!(!m.is_valid(5_000));
    }

    #[test]
    fn flipping_a_byte_in_a_sub_manifest_ref_invalidates_the_signature() {
        let key = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        m.sub_manifests[1].manifest_id[0] ^= 0xFF;
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn reordering_sub_manifests_invalidates_the_signature() {
        // Order is part of the signed preimage -- an edge's a/b would mean something different
        // after a silent reorder, so a reorder must break the signature exactly like any other
        // tamper.
        let key = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        m.sub_manifests.swap(0, 1);
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn flipping_an_edge_endpoint_invalidates_the_signature() {
        let key = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        m.edges[0].a = 2;
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn flipping_an_edge_upgrade_hint_invalidates_the_signature() {
        let key = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        m.edges[1].upgrade_hint = EdgeUpgradeHint::RelayOnly;
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn adding_or_removing_an_edge_invalidates_the_signature() {
        let key = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        m.edges.push(CompositionEdge { a: 0, b: 2, upgrade_hint: EdgeUpgradeHint::RelayOnly });
        assert!(!m.is_valid(1_500));

        let mut m2 = sample(&key, 1_000, 2_000);
        m2.edges.pop();
        assert!(!m2.is_valid(1_500));
    }

    #[test]
    fn signature_from_a_different_key_does_not_verify() {
        let key = random_signing_key();
        let other = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        let sig = other.sign(&CompositionManifest::signing_bytes(
            &m.publisher_pubkey,
            &m.composition_id,
            &m.name,
            &m.version,
            &m.sub_manifests,
            &m.edges,
            m.issued_at,
            m.expires_at,
        ));
        m.signature = sig.to_bytes();
        assert!(!m.is_valid(1_500), "a signature from a key other than publisher_pubkey must not verify");
    }

    #[test]
    fn a_domain_separated_type_cannot_replay_as_a_service_manifest() {
        // Mirrors manifest.rs's own equivalent test: assert the domain constant exists, is
        // distinct, and -- since `ServiceManifest::signing_bytes` starts with its own
        // length-prefixed domain -- a `CompositionManifest` preimage can never be misread as a
        // `ServiceManifest` preimage sharing an accidental byte-prefix.
        assert_eq!(COMPOSITION_MANIFEST_DOMAIN, b"cads-composition-manifest-v1");
        assert_ne!(COMPOSITION_MANIFEST_DOMAIN, b"cads-service-manifest-v1" as &[u8]);
    }
}
