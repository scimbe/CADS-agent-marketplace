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
///
/// **Runtime sandbox fallback (CADS-agent-marketplace#12,
/// `docs/design/sandbox-fallback.md`).** Since the allowlist above is Binary's ONLY defense
/// (there is no `guardrails::scan_compose` equivalent), `installer_engine::activate` step 9's
/// Binary arm additionally wraps the executable in a per-OS lightweight sandbox
/// (`installer_engine::sandbox`) when one is available on the host -- `bubblewrap` on Linux,
/// confining network (no namespace at all), PID/UTS/IPC namespace sharing, and filesystem writes
/// outside `work_dir`, roughly matching Compose's F.1-F.3 bar without a container runtime. When no
/// backend is usable on a given host, activation proceeds unsandboxed by default (a loud
/// pre-execution warning fires either way), unless the operator has set
/// `CT_REQUIRE_BINARY_SANDBOX=1` to fail closed instead. See `docs/security-model.md`'s threat
/// table for the exact row.
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

/// One bounded, typed parameter a `demo_prompt` may expose for guided natural-language
/// configuration. Deliberately closed-world: an LLM maps free text to a value, but a caller must
/// deterministically validate the result against exactly what's declared here (canonical
/// membership for `Enum`/`Multiselect`, a hex-color regex for `Color`, a clamp for `Int`) before
/// applying it -- this type only declares the bound, it enforces nothing by itself. A dynamic
/// option set (e.g. sourced from a live API response) must still be computed by trusted caller
/// code before the LLM call and is out of scope for what gets signed here; `Enum`/`Multiselect`'s
/// `options` are the publisher's own declared, static bound.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PromptParamKind {
    Enum { options: Vec<String> },
    Color,
    Multiselect {
        options: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        note: Option<String>,
    },
    Int { min: i64, max: i64 },
}

impl PromptParamKind {
    fn as_u8(&self) -> u8 {
        match self {
            PromptParamKind::Enum { .. } => 0,
            PromptParamKind::Color => 1,
            PromptParamKind::Multiselect { .. } => 2,
            PromptParamKind::Int { .. } => 3,
        }
    }
}

/// One named [`PromptParamKind`]. A `Vec`, not a JSON object keyed by name, for the same reason
/// [`ServiceManifest::env_template`] is a `Vec<EnvVarSpec>` and not a map: signing needs a fixed,
/// deterministic field order, which a map does not give you without an extra ordering discipline
/// this crate would rather not depend on (e.g. `indexmap`) for one field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PromptParam {
    pub name: String,
    #[serde(flatten)]
    pub kind: PromptParamKind,
}

/// Guided natural-language parametrization for a demo: a user's free text is turned into a
/// bounded config change through an LLM, `system` states the rules, `parameters` declares
/// exactly what's tunable and how (see [`PromptParamKind`]), `examples` are few-shot prompts for
/// the LLM (not signed-bound in any enforcement sense -- purely descriptive). Optional and
/// backward-compatible: see [`ServiceManifest::signing_bytes`] for exactly how its presence (or
/// absence) affects the signed preimage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DemoPrompt {
    pub system: String,
    pub parameters: Vec<PromptParam>,
    pub examples: Vec<String>,
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
    /// Optional guided-natural-language-configuration block. `#[serde(default)]` so a manifest
    /// signed before this field existed still parses (as `None`) -- see
    /// [`ServiceManifest::signing_bytes`] for why that's also signature-compatible, not just
    /// parse-compatible.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub demo_prompt: Option<DemoPrompt>,
    /// The holder's ed25519 signature over [`ServiceManifest::signing_bytes`].
    #[serde(with = "crate::hex::b64")]
    pub signature: [u8; 64],
}

impl ServiceManifest {
    /// Domain-separated, canonical, injective preimage: every variable-length field is
    /// length-prefixed via [`Preimage::var_bytes`] (the one place that discipline lives), fixed
    /// fields append verbatim. Field order here is the field order any implementation MUST use --
    /// changing it changes every future signature's meaning, not just this one.
    ///
    /// **`demo_prompt` is backward-compatible by construction**: `None` appends NOTHING -- the
    /// preimage is byte-identical to a manifest signed before this field existed, so every
    /// pre-existing signature remains valid unchanged. `Some(dp)` appends `tag(1)` then `dp`'s own
    /// fields; because the `None` case is strictly shorter (nothing after `expires_at` at all) and
    /// the `Some` case always starts with a `0x01` byte, no old preimage can collide with or be
    /// extended into a new one -- ed25519 signs the exact byte string, appending bytes after the
    /// fact does not preserve validity.
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
        demo_prompt: Option<&DemoPrompt>,
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
        p = p
            .var_bytes(verify.script.as_bytes())
            .u64(verify.timeout_secs)
            .u64(issued_at)
            .u64(expires_at);
        match demo_prompt {
            None => p,
            Some(dp) => {
                p = p.tag(1).var_bytes(dp.system.as_bytes()).u32(dp.parameters.len() as u32);
                for param in &dp.parameters {
                    p = p.var_bytes(param.name.as_bytes()).tag(param.kind.as_u8());
                    p = match &param.kind {
                        PromptParamKind::Enum { options } => {
                            let mut p = p.u32(options.len() as u32);
                            for o in options {
                                p = p.var_bytes(o.as_bytes());
                            }
                            p
                        }
                        PromptParamKind::Multiselect { options, note } => {
                            let mut p = p.u32(options.len() as u32);
                            for o in options {
                                p = p.var_bytes(o.as_bytes());
                            }
                            // `note`'s presence gets its own tag either way -- unlike the
                            // top-level `demo_prompt: Option`, this is NOT the last thing in the
                            // preimage (more params or the examples count can follow), so an
                            // asymmetric "None omits everything" encoding here could let a
                            // present-but-empty-looking note collide with the start of whatever
                            // comes next. Always tag, injective either way.
                            match note {
                                Some(note) => p.tag(1).var_bytes(note.as_bytes()),
                                None => p.tag(0),
                            }
                        }
                        PromptParamKind::Color => p,
                        PromptParamKind::Int { min, max } => p.fixed(&min.to_le_bytes()).fixed(&max.to_le_bytes()),
                    };
                }
                p = p.u32(dp.examples.len() as u32);
                for ex in &dp.examples {
                    p = p.var_bytes(ex.as_bytes());
                }
                p
            }
        }
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
            self.demo_prompt.as_ref(),
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
        demo_prompt: Option<DemoPrompt>,
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
            demo_prompt.as_ref(),
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
            demo_prompt,
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
            None,
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
            m.demo_prompt.as_ref(),
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

    // --- demo_prompt ---------------------------------------------------------------------

    fn sample_demo_prompt() -> DemoPrompt {
        DemoPrompt {
            system: "Only ever choose values from the declared parameters.".into(),
            parameters: vec![
                PromptParam {
                    name: "location".into(),
                    kind: PromptParamKind::Enum { options: vec!["Hamburg".into(), "Berlin".into()] },
                },
                PromptParam { name: "accent_color".into(), kind: PromptParamKind::Color },
                PromptParam {
                    name: "include".into(),
                    kind: PromptParamKind::Multiselect {
                        options: vec!["temperature".into(), "wind".into()],
                        note: Some("only what the API delivers".into()),
                    },
                },
                PromptParam { name: "font_size".into(), kind: PromptParamKind::Int { min: 12, max: 48 } },
            ],
            examples: vec!["Berlin in Blau, ohne Wind".into()],
        }
    }

    fn sample_with_demo_prompt(signing_key: &SigningKey, issued_at: u64, expires_at: u64) -> ServiceManifest {
        let m = sample(signing_key, issued_at, expires_at);
        ServiceManifest::sign_new(
            signing_key,
            m.manifest_id,
            m.name,
            m.version,
            m.installer_kind,
            m.bundle,
            m.env_template,
            m.verify,
            issued_at,
            expires_at,
            Some(sample_demo_prompt()),
        )
    }

    #[test]
    fn a_manifest_with_a_demo_prompt_signs_and_verifies() {
        let key = random_signing_key();
        let m = sample_with_demo_prompt(&key, 1_000, 2_000);
        assert!(m.is_valid(1_500));
        assert!(m.demo_prompt.is_some());
    }

    #[test]
    fn widening_a_demo_prompt_enum_after_signing_invalidates_the_signature() {
        // The exact attack this field exists to prevent: a publisher signs a manifest promising
        // "location" is bounded to {Hamburg, Berlin}, then someone (the publisher themselves, or
        // anyone with write access to the stored JSON) adds a third option post-signature to
        // widen what a "fest vorgeschrieben" wrapper would accept. This MUST break verification --
        // an unsigned demo_prompt would let this slide silently, which is the whole reason it's
        // part of the signed preimage now instead of a bolted-on extra field.
        let key = random_signing_key();
        let mut m = sample_with_demo_prompt(&key, 1_000, 2_000);
        let Some(dp) = m.demo_prompt.as_mut() else { panic!("expected Some") };
        match &mut dp.parameters[0].kind {
            PromptParamKind::Enum { options } => options.push("Tokio".into()),
            _ => panic!("expected the location Enum param"),
        }
        assert!(!m.is_valid(1_500), "widening an enum's options post-signature must invalidate the signature");
    }

    #[test]
    fn removing_a_demo_prompt_after_signing_invalidates_the_signature() {
        // The inverse tamper: stripping demo_prompt entirely (e.g. to bypass its constraints
        // altogether) must be caught too, not just editing it in place.
        let key = random_signing_key();
        let mut m = sample_with_demo_prompt(&key, 1_000, 2_000);
        m.demo_prompt = None;
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn adding_a_demo_prompt_to_a_manifest_signed_without_one_invalidates_the_signature() {
        let key = random_signing_key();
        let mut m = sample(&key, 1_000, 2_000);
        assert!(m.is_valid(1_500), "sanity: signed without demo_prompt, must verify as-is");
        m.demo_prompt = Some(sample_demo_prompt());
        assert!(!m.is_valid(1_500), "grafting on a demo_prompt post-signature must invalidate the signature");
    }

    #[test]
    fn demo_prompt_none_produces_a_byte_identical_preimage_to_before_this_field_existed() {
        // The actual backward-compatibility claim, checked directly at the byte level rather than
        // just "old tests still pass": signing_bytes(..., None) must equal signing_bytes(...) as
        // it was defined before demo_prompt existed. Reconstructed by hand here (not by calling
        // the old function, which no longer exists) -- this pins the exact historical shape so a
        // future refactor of the None branch can't silently drift from it.
        let key = random_signing_key();
        let m = sample(&key, 1_000, 2_000);
        let with_none = ServiceManifest::signing_bytes(
            &m.publisher_pubkey, &m.manifest_id, &m.name, &m.version, m.installer_kind,
            &m.bundle, &m.env_template, &m.verify, m.issued_at, m.expires_at, None,
        );

        let mut expected = Preimage::new(SERVICE_MANIFEST_DOMAIN)
            .fixed(&m.publisher_pubkey)
            .fixed(&m.manifest_id)
            .var_bytes(m.name.as_bytes())
            .var_bytes(m.version.as_bytes())
            .tag(m.installer_kind.as_u8())
            .var_bytes(m.bundle.url.as_bytes())
            .fixed(&m.bundle.sha256)
            .var_bytes(m.bundle.compose_file.as_bytes())
            .u32(m.env_template.len() as u32);
        for e in &m.env_template {
            expected = expected.var_bytes(e.name.as_bytes()).tag(e.required as u8).var_bytes(e.description.as_bytes());
        }
        let expected = expected
            .var_bytes(m.verify.script.as_bytes())
            .u64(m.verify.timeout_secs)
            .u64(m.issued_at)
            .u64(m.expires_at)
            .finish();

        assert_eq!(with_none, expected, "None must append nothing beyond the pre-demo_prompt shape");
    }

    #[test]
    fn demo_prompt_round_trips_through_json_including_every_param_kind() {
        let key = random_signing_key();
        let m = sample_with_demo_prompt(&key, 1_000, 2_000);
        let json = serde_json::to_string(&m).unwrap();
        let back: ServiceManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back, m);
        assert!(back.is_valid(1_500));
    }

    #[test]
    fn a_manifest_json_missing_the_demo_prompt_key_entirely_still_parses_as_none() {
        // The literal backward-compat scenario: a manifest signed and stored before this field
        // existed has no "demo_prompt" key in its JSON at all, not even null.
        let key = random_signing_key();
        let m = sample(&key, 1_000, 2_000);
        let mut json: serde_json::Value = serde_json::to_value(&m).unwrap();
        let obj = json.as_object_mut().unwrap();
        assert!(!obj.contains_key("demo_prompt"), "sanity: sample() without demo_prompt should not emit the key (skip_serializing_if)");
        let back: ServiceManifest = serde_json::from_value(json).unwrap();
        assert_eq!(back.demo_prompt, None);
        assert!(back.is_valid(1_500));
    }
}
