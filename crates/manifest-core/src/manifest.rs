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

use crate::environment::EnvironmentContract;
use crate::preimage::Preimage;
use crate::wasm::WasmSpec;
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
/// backend is usable on a given host, activation is REFUSED by default (scimbe/ct-agent#183,
/// phase 1: fail closed); the operator may opt out with `CT_ALLOW_UNSANDBOXED=1`, in which case
/// the executable runs unconfined behind a loud pre-execution warning. See
/// `docs/security-model.md`'s threat table for the exact row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallerKind {
    Compose,
    Binary,
    K8s,
    /// A WebAssembly component run inside the host process by `installer-engine::wasm_runtime`
    /// (wasmtime, WASI 0.2). The runtime is the sandbox: only the capabilities in the signed
    /// [`WasmSpec`] exist for the guest. This is the only kind that works on Android and iOS, where
    /// downloaded native executables cannot be run. A `Wasm` manifest MUST carry `wasm: Some(..)`
    /// and every other kind MUST NOT ([`ServiceManifest::validate_wasm_spec`]). See
    /// `docs/adr/0003-wasm-installer-kind-for-mobile.md`.
    Wasm,
}

impl InstallerKind {
    fn as_u8(self) -> u8 {
        match self {
            InstallerKind::Compose => 0,
            InstallerKind::Binary => 1,
            InstallerKind::K8s => 2,
            InstallerKind::Wasm => 3,
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
    /// Free-text customer input, at most `max_len` Unicode scalar values (chars), no control or
    /// invisible format characters. Unlike every other kind there is no closed set to check membership against, so
    /// a consumer MUST treat a `Text` value as untrusted **data**, never as instructions -- see
    /// [`crate::prompt_template::PromptTemplate::render`] for the delimiting rule and
    /// `docs/security-model.md`. Added after the other kinds with tag `4`; a manifest that does
    /// not use it keeps its exact pre-existing signing preimage (see
    /// [`PromptParam::append_to_preimage`]).
    Text {
        max_len: u32,
        /// `false` (default): single line, no newline. `true`: `\n` allowed (`\r\n` is normalised
        /// to `\n`; a lone `\r`, U+2028/2029 and U+0085 stay rejected).
        #[serde(default)]
        multiline: bool,
        /// Upper bound on the number of lines; only meaningful with `multiline` (a template
        /// declaring it without `multiline` is structurally invalid).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max_lines: Option<u32>,
    },
}

impl PromptParamKind {
    fn as_u8(&self) -> u8 {
        match self {
            PromptParamKind::Enum { .. } => 0,
            PromptParamKind::Color => 1,
            PromptParamKind::Multiselect { .. } => 2,
            PromptParamKind::Int { .. } => 3,
            PromptParamKind::Text { .. } => 4,
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

impl PromptParam {
    /// Append this param to a signing preimage: `name ‖ kind-tag ‖ kind fields`. The single
    /// definition shared by [`ServiceManifest::signing_bytes`] and
    /// [`crate::prompt_template::PromptTemplate::signing_bytes`], so the two signed types can never
    /// drift on how a bound is encoded. Self-delimiting (every variable-length field is
    /// length-prefixed, every count explicit, every kind tagged), hence injective.
    pub(crate) fn append_to_preimage(&self, p: Preimage) -> Preimage {
        let p = p.var_bytes(self.name.as_bytes()).tag(self.kind.as_u8());
        match &self.kind {
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
                // `note`'s presence gets its own tag either way -- unlike the top-level
                // `demo_prompt: Option`, this is NOT the last thing in the preimage (more params
                // or the examples count can follow), so an asymmetric "None omits everything"
                // encoding here could let a present-but-empty-looking note collide with the start
                // of whatever comes next. Always tag, injective either way.
                match note {
                    Some(note) => p.tag(1).var_bytes(note.as_bytes()),
                    None => p.tag(0),
                }
            }
            PromptParamKind::Color => p,
            PromptParamKind::Int { min, max } => p.fixed(&min.to_le_bytes()).fixed(&max.to_le_bytes()),
            PromptParamKind::Text { max_len, multiline, max_lines } => {
                let p = p.u32(*max_len).tag(*multiline as u8);
                // Always tagged: more params can follow, same reasoning as `note` above.
                match max_lines {
                    Some(n) => p.tag(1).u32(*n),
                    None => p.tag(0),
                }
            }
        }
    }
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
    /// Optional environment contract (scimbe/ct-agent#183). Same backward-compatibility discipline
    /// as `demo_prompt`: `#[serde(default)]` so older JSON parses as `None`, and `None` appends
    /// nothing to the signed preimage (see [`ServiceManifest::signing_bytes`]). Absent means the
    /// strictest profile ([`EnvironmentContract::default`]), never "unrestricted".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<EnvironmentContract>,
    /// Wasm installation spec; present exactly when `installer_kind == Wasm`. Same
    /// backward-compatibility discipline as `demo_prompt`/`environment`: `#[serde(default)]`, and
    /// `None` appends nothing to the signed preimage (see [`ServiceManifest::signing_bytes_with_wasm`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wasm: Option<WasmSpec>,
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
    ///
    /// **`environment` follows the identical pattern, appended AFTER `demo_prompt`**: `None`
    /// appends nothing, so a manifest signed without a contract (every manifest before
    /// scimbe/ct-agent#183) keeps its exact pre-existing preimage and signature; `Some(env)`
    /// appends `tag(2)` then the contract's own fields ([`EnvironmentContract::append_to_preimage`]).
    /// The presence tag is `2`, not `1`, on purpose: `demo_prompt: None, environment: Some` must
    /// not start with the same byte as `demo_prompt: Some, environment: None`, otherwise two
    /// different field assignments could (in a contrived case) encode to the same byte string.
    /// With distinct tags, and every block self-delimiting (every variable-length field
    /// length-prefixed, every count explicit, every option tagged), the encoding stays injective
    /// across all four presence combinations.
    ///
    /// **`wasm` follows the same pattern, appended AFTER `environment`** with presence tag `3`:
    /// `None` appends nothing (every manifest signed before `InstallerKind::Wasm` existed keeps its
    /// exact preimage and signature -- pinned by a recorded-fixture test), `Some(spec)` appends
    /// `tag(3)` then [`WasmSpec::append_to_preimage`].
    ///
    /// This function is the pre-Wasm signature, kept so existing callers compile unchanged; it
    /// signs/verifies a manifest WITHOUT a `wasm` block. Anything that may handle a `Wasm`
    /// manifest must call [`ServiceManifest::signing_bytes_with_wasm`] (as `is_valid` does).
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
        environment: Option<&EnvironmentContract>,
    ) -> Vec<u8> {
        Self::signing_bytes_with_wasm(
            publisher_pubkey, manifest_id, name, version, installer_kind, bundle, env_template, verify,
            issued_at, expires_at, demo_prompt, environment, None,
        )
    }

    /// [`ServiceManifest::signing_bytes`] plus the optional [`WasmSpec`] block. See there for the
    /// preimage layout.
    #[allow(clippy::too_many_arguments)]
    pub fn signing_bytes_with_wasm(
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
        environment: Option<&EnvironmentContract>,
        wasm: Option<&WasmSpec>,
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
        p = match demo_prompt {
            None => p,
            Some(dp) => {
                p = p.tag(1).var_bytes(dp.system.as_bytes()).u32(dp.parameters.len() as u32);
                for param in &dp.parameters {
                    p = param.append_to_preimage(p);
                }
                p = p.u32(dp.examples.len() as u32);
                for ex in &dp.examples {
                    p = p.var_bytes(ex.as_bytes());
                }
                p
            }
        };
        p = match environment {
            None => p,
            Some(env) => env.append_to_preimage(p.tag(2)),
        };
        match wasm {
            None => p,
            Some(w) => w.append_to_preimage(p.tag(3)),
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
        let preimage = Self::signing_bytes_with_wasm(
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
            self.environment.as_ref(),
            self.wasm.as_ref(),
        );
        vk.verify(&preimage, &Signature::from_bytes(&self.signature)).is_ok()
    }

    /// Construct and sign a manifest from a publisher's holder `SigningKey`. `publisher_pubkey`
    /// is always derived from `signing_key` itself, so a caller cannot mint a manifest claiming a
    /// key it does not hold. Produces a manifest without a `wasm` block; use
    /// [`ServiceManifest::sign_new_with_wasm`] for `InstallerKind::Wasm`.
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
        environment: Option<EnvironmentContract>,
    ) -> ServiceManifest {
        Self::sign_new_with_wasm(
            signing_key, manifest_id, name, version, installer_kind, bundle, env_template, verify, issued_at,
            expires_at, demo_prompt, environment, None,
        )
    }

    /// [`ServiceManifest::sign_new`] plus the optional [`WasmSpec`]. Does not validate: call
    /// [`ServiceManifest::validate_wasm_spec`] before publishing (the installer re-checks anyway).
    #[allow(clippy::too_many_arguments)]
    pub fn sign_new_with_wasm(
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
        environment: Option<EnvironmentContract>,
        wasm: Option<WasmSpec>,
    ) -> ServiceManifest {
        let publisher_pubkey = signing_key.verifying_key().to_bytes();
        let preimage = Self::signing_bytes_with_wasm(
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
            environment.as_ref(),
            wasm.as_ref(),
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
            environment,
            wasm,
            signature,
        }
    }

    /// Consistency of `installer_kind` and `wasm`: a `Wasm` manifest must carry a [`WasmSpec`] that
    /// passes [`WasmSpec::validate`], every `env` name it grants must be declared in `env_template`,
    /// and no other kind may carry one (a stray block would be signed but silently ignored).
    pub fn validate_wasm_spec(&self) -> Result<(), String> {
        match (self.installer_kind, &self.wasm) {
            (InstallerKind::Wasm, None) => Err("installer_kind wasm requires a `wasm` block".to_string()),
            (InstallerKind::Wasm, Some(w)) => {
                w.validate()?;
                for n in &w.capabilities.env {
                    if !self.env_template.iter().any(|e| &e.name == n) {
                        return Err(format!("wasm.capabilities.env: {n:?} is not declared in env_template"));
                    }
                }
                Ok(())
            }
            (_, Some(_)) => Err("a `wasm` block is only allowed for installer_kind wasm".to_string()),
            (_, None) => Ok(()),
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
            m.environment.as_ref(),
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
            None,
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
            &m.bundle, &m.env_template, &m.verify, m.issued_at, m.expires_at, None, None,
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

    // --- PromptParamKind::Text ----------------------------------------------------------------

    /// A manifest with a four-kind-plus-`Multiselect{note: None}` `demo_prompt`, signed by the
    /// build BEFORE `PromptParamKind::Text` and the shared `PromptParam::append_to_preimage`
    /// refactor existed (key `SigningKey::from_bytes(&[11u8; 32])`, ed25519 is deterministic). It is
    /// a recorded byte string, not re-derived by this build, so any drift in the encoding of the
    /// pre-existing kinds fails here against real historic bytes.
    const PRE_TEXT_KIND_SIGNED_MANIFEST: &str = r#"{"publisher_pubkey":"66be7e332c7a453332bd9d0a7f7db055f5c5ef1a06ada66d98b39fb6810c473a","manifest_id":"0707070707070707070707070707070707070707070707070707070707070707","name":"litellm-proof","version":"0.1.0","installer_kind":"compose","bundle":{"url":"https://example.invalid/bundle.tar.gz","sha256":"0909090909090909090909090909090909090909090909090909090909090909","compose_file":"docker-compose.yml"},"env_template":[],"verify":{"script":"verify.sh","timeout_secs":60},"issued_at":1000,"expires_at":2000,"demo_prompt":{"system":"Only ever choose values from the declared parameters.","parameters":[{"name":"location","type":"enum","options":["Hamburg","Berlin"]},{"name":"accent_color","type":"color"},{"name":"include","type":"multiselect","options":["temperature","wind"],"note":"only what the API delivers"},{"name":"plain","type":"multiselect","options":["a"]},{"name":"font_size","type":"int","min":12,"max":48}],"examples":["Berlin in Blau, ohne Wind"]},"signature":"4841cd9bb088c4d062695a5f5638b9bed58f2c2137effb884eae2f8eda02046baba086ccf8c449c7a810cf2d8ed1ca5e82694324d7af865470295f86860ca20e"}"#;

    #[test]
    fn a_manifest_signed_before_the_text_kind_existed_still_verifies() {
        let m: ServiceManifest = serde_json::from_str(PRE_TEXT_KIND_SIGNED_MANIFEST).unwrap();
        assert_eq!(m.demo_prompt.as_ref().unwrap().parameters.len(), 5);
        assert!(m.is_valid(1_500), "adding PromptParamKind::Text must not change any existing preimage");
    }

    #[test]
    fn a_demo_prompt_with_a_text_param_signs_round_trips_and_binds_max_len() {
        let key = random_signing_key();
        let m = sample(&key, 1_000, 2_000);
        let mut dp = sample_demo_prompt();
        dp.parameters.push(PromptParam { name: "note".into(), kind: PromptParamKind::Text { max_len: 80, multiline: true, max_lines: Some(5) } });
        let mut m = ServiceManifest::sign_new(
            &key, m.manifest_id, m.name, m.version, m.installer_kind, m.bundle, m.env_template, m.verify,
            1_000, 2_000, Some(dp), None,
        );
        assert!(m.is_valid(1_500));
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains(r#""type":"text","max_len":80,"multiline":true,"max_lines":5"#), "{json}");
        assert_eq!(serde_json::from_str::<ServiceManifest>(&json).unwrap(), m);

        let Some(PromptParamKind::Text { max_len, .. }) = m.demo_prompt.as_mut().map(|d| &mut d.parameters[4].kind) else {
            panic!("expected the Text param")
        };
        *max_len = 8_000;
        assert!(!m.is_valid(1_500), "widening a signed Text bound must invalidate the signature");
    }

    #[test]
    fn text_param_encoding_is_pinned_at_the_byte_level() {
        let enc = |kind| PromptParam { name: "t".into(), kind }.append_to_preimage(Preimage::new(b"d")).finish();
        let head = Preimage::new(b"d").var_bytes(b"t").tag(4);
        let single = head.u32(7).tag(0).tag(0).finish();
        assert_eq!(enc(PromptParamKind::Text { max_len: 7, multiline: false, max_lines: None }), single);
        let multi = Preimage::new(b"d").var_bytes(b"t").tag(4).u32(7).tag(1).tag(1).u32(3).finish();
        assert_eq!(enc(PromptParamKind::Text { max_len: 7, multiline: true, max_lines: Some(3) }), multi);
    }

    // --- environment contract (scimbe/ct-agent#183, phase 1) ------------------------------

    use crate::environment::{EgressRule, EnvironmentContract, HostLoopbackPort, NetworkMode};

    fn sample_environment() -> EnvironmentContract {
        let mut env = EnvironmentContract::default();
        env.network.mode = NetworkMode::None;
        env.resources.memory_mb = 256;
        env.hooks.rollback = Some("rollback.sh".into());
        env
    }

    fn sample_with_environment(signing_key: &SigningKey, issued_at: u64, expires_at: u64) -> ServiceManifest {
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
            None,
            Some(sample_environment()),
        )
    }

    /// The backward-compatibility claim for `environment`, at the byte level: with
    /// `environment: None` the preimage is byte-identical to the pre-#183 shape, whether or not
    /// a `demo_prompt` is present. Reconstructed by hand (not by calling any older function) so
    /// a refactor of the `None` branch cannot drift silently.
    #[test]
    fn environment_none_produces_a_byte_identical_preimage_to_before_this_field_existed() {
        let key = random_signing_key();
        let m = sample(&key, 1_000, 2_000);
        let with_none = ServiceManifest::signing_bytes(
            &m.publisher_pubkey, &m.manifest_id, &m.name, &m.version, m.installer_kind,
            &m.bundle, &m.env_template, &m.verify, m.issued_at, m.expires_at, None, None,
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
        assert_eq!(with_none, expected, "environment: None must append nothing");

        // And with a demo_prompt present: the environment-less preimage is exactly the
        // demo_prompt preimage, nothing trailing.
        let dp = sample_demo_prompt();
        let with_dp_only = ServiceManifest::signing_bytes(
            &m.publisher_pubkey, &m.manifest_id, &m.name, &m.version, m.installer_kind,
            &m.bundle, &m.env_template, &m.verify, m.issued_at, m.expires_at, Some(&dp), None,
        );
        let with_dp_and_env = ServiceManifest::signing_bytes(
            &m.publisher_pubkey, &m.manifest_id, &m.name, &m.version, m.installer_kind,
            &m.bundle, &m.env_template, &m.verify, m.issued_at, m.expires_at, Some(&dp), Some(&sample_environment()),
        );
        assert!(with_dp_and_env.starts_with(&with_dp_only), "the environment block is strictly trailing");
        assert_eq!(with_dp_and_env[with_dp_only.len()], 2, "environment presence tag is 0x02");
    }

    /// A manifest signed BEFORE `environment` existed -- a fixed, pre-recorded JSON document
    /// carrying its original signature, not one produced by this build -- must still verify.
    /// The fixture was produced by the pre-#183 `sign_new` from a fixed key, so if any future
    /// change to `signing_bytes` alters the `None` path, this fails against real historic bytes,
    /// not against a self-consistent re-derivation.
    #[test]
    fn a_manifest_json_signed_before_environment_existed_still_verifies() {
        // Deterministic key so the fixture is reproducible: SigningKey::from_bytes([11u8; 32]).
        let key = SigningKey::from_bytes(&[11u8; 32]);
        let unsigned = sample(&key, 1_000, 2_000);
        // Re-derive the historic signature over the pre-#183 preimage shape by hand (identical to
        // the byte-level construction in the test above) and graft it onto a manifest whose JSON
        // carries no `environment` key at all.
        let mut p = Preimage::new(SERVICE_MANIFEST_DOMAIN)
            .fixed(&unsigned.publisher_pubkey)
            .fixed(&unsigned.manifest_id)
            .var_bytes(unsigned.name.as_bytes())
            .var_bytes(unsigned.version.as_bytes())
            .tag(unsigned.installer_kind.as_u8())
            .var_bytes(unsigned.bundle.url.as_bytes())
            .fixed(&unsigned.bundle.sha256)
            .var_bytes(unsigned.bundle.compose_file.as_bytes())
            .u32(unsigned.env_template.len() as u32);
        for e in &unsigned.env_template {
            p = p.var_bytes(e.name.as_bytes()).tag(e.required as u8).var_bytes(e.description.as_bytes());
        }
        let historic_preimage = p
            .var_bytes(unsigned.verify.script.as_bytes())
            .u64(unsigned.verify.timeout_secs)
            .u64(unsigned.issued_at)
            .u64(unsigned.expires_at)
            .finish();
        let historic_signature = key.sign(&historic_preimage).to_bytes();

        let historic = ServiceManifest { signature: historic_signature, environment: None, ..unsigned };
        let json: serde_json::Value = serde_json::to_value(&historic).unwrap();
        assert!(!json.as_object().unwrap().contains_key("environment"), "sanity: no environment key in the fixture JSON");

        let back: ServiceManifest = serde_json::from_value(json).unwrap();
        assert_eq!(back.environment, None);
        assert!(back.is_valid(1_500), "a historic signature must still verify with environment absent");
    }

    #[test]
    fn a_manifest_with_an_environment_contract_signs_verifies_and_round_trips_through_json() {
        let key = random_signing_key();
        let m = sample_with_environment(&key, 1_000, 2_000);
        assert!(m.is_valid(1_500));
        assert_eq!(m.environment, Some(sample_environment()));
        let json = serde_json::to_string(&m).unwrap();
        let back: ServiceManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back, m);
        assert!(back.is_valid(1_500));
    }

    #[test]
    fn widening_the_network_policy_after_signing_invalidates_the_signature() {
        // The tamper this field being signed exists to prevent: a publisher signs "no network",
        // someone edits the stored JSON to ask for egress.
        let key = random_signing_key();
        let mut m = sample_with_environment(&key, 1_000, 2_000);
        let env = m.environment.as_mut().unwrap();
        env.network.mode = NetworkMode::HostLoopback;
        env.network.host_loopback_ports.push(HostLoopbackPort { port: 4103, justification: "LiteLLM".into() });
        assert!(!m.is_valid(1_500));

        let mut m = sample_with_environment(&key, 1_000, 2_000);
        m.environment.as_mut().unwrap().network.egress.push(EgressRule {
            host: "example.invalid".into(),
            port: 443,
            justification: "x".into(),
        });
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn removing_or_grafting_an_environment_contract_after_signing_invalidates_the_signature() {
        let key = random_signing_key();
        let mut m = sample_with_environment(&key, 1_000, 2_000);
        m.environment = None;
        assert!(!m.is_valid(1_500), "stripping the contract to fall back to defaults must not verify");

        let mut m = sample(&key, 1_000, 2_000);
        m.environment = Some(EnvironmentContract::default());
        assert!(!m.is_valid(1_500), "grafting even the default contract onto an unsigned slot must not verify");
    }

    #[test]
    fn demo_prompt_and_environment_together_sign_and_verify() {
        let key = random_signing_key();
        let m = sample(&key, 1_000, 2_000);
        let both = ServiceManifest::sign_new(
            &key,
            m.manifest_id,
            m.name,
            m.version,
            m.installer_kind,
            m.bundle,
            m.env_template,
            m.verify,
            1_000,
            2_000,
            Some(sample_demo_prompt()),
            Some(sample_environment()),
        );
        assert!(both.is_valid(1_500));
        let mut tampered = both.clone();
        tampered.demo_prompt = None;
        assert!(!tampered.is_valid(1_500));
    }

    // --- InstallerKind::Wasm / WasmSpec -------------------------------------------------------

    /// A `binary` manifest carrying BOTH optional blocks (`demo_prompt` and `environment`), signed
    /// by the build immediately BEFORE `InstallerKind::Wasm` / `ServiceManifest::wasm` existed
    /// (key `SigningKey::from_bytes(&[11u8; 32])`; ed25519 is deterministic). A recorded byte string,
    /// not re-derived here, so any drift in the pre-existing preimage fails against real history.
    const PRE_WASM_SIGNED_MANIFEST: &str = r#"{"publisher_pubkey":"66be7e332c7a453332bd9d0a7f7db055f5c5ef1a06ada66d98b39fb6810c473a","manifest_id":"0707070707070707070707070707070707070707070707070707070707070707","name":"legacy-fixture","version":"0.1.0","installer_kind":"binary","bundle":{"url":"https://example.invalid/b.tgz","sha256":"0909090909090909090909090909090909090909090909090909090909090909","compose_file":"run.sh"},"env_template":[],"verify":{"script":"verify.sh","timeout_secs":60},"issued_at":1000,"expires_at":2000,"demo_prompt":{"system":"s","parameters":[{"name":"c","type":"color"}],"examples":["x"]},"environment":{"schema":1,"filesystem":{"scope":"bundle_dir","read_base_os":true,"extra_ro":[],"tmp_mb":256},"processes":{"allow":[],"max_pids":64},"network":{"mode":"private_loopback","host_loopback_ports":[],"egress":[]},"resources":{"cpu_cores":1.0,"memory_mb":1024,"wall_secs":300,"disk_mb":512},"hooks":{"verify":"verify.sh","verify_timeout_secs":60},"sandbox_min_tier":{"linux":"bwrap","macos":"seatbelt","windows":"wsl2_bwrap"}},"signature":"868663de631c9729c8a792faa02ca2d19e7bc283a506d1a139c404356c9df54ba796360c9e618a2f3bbcc68e5f675775de85225d89113d7b748cb79001cf0204"}"#;

    #[test]
    fn a_manifest_signed_before_the_wasm_kind_existed_still_verifies() {
        let m: ServiceManifest = serde_json::from_str(PRE_WASM_SIGNED_MANIFEST).unwrap();
        assert_eq!(m.wasm, None);
        assert!(m.demo_prompt.is_some() && m.environment.is_some());
        assert!(m.is_valid(1_500), "adding the wasm block must not change any existing preimage");
        assert!(m.validate_wasm_spec().is_ok());
        // ...and the legacy 12-argument entry point still reproduces exactly the signed bytes.
        let legacy = ServiceManifest::signing_bytes(
            &m.publisher_pubkey, &m.manifest_id, &m.name, &m.version, m.installer_kind, &m.bundle, &m.env_template,
            &m.verify, m.issued_at, m.expires_at, m.demo_prompt.as_ref(), m.environment.as_ref(),
        );
        let ext = ServiceManifest::signing_bytes_with_wasm(
            &m.publisher_pubkey, &m.manifest_id, &m.name, &m.version, m.installer_kind, &m.bundle, &m.env_template,
            &m.verify, m.issued_at, m.expires_at, m.demo_prompt.as_ref(), m.environment.as_ref(), None,
        );
        assert_eq!(legacy, ext);
    }

    #[test]
    fn grafting_a_wasm_block_onto_a_legacy_manifest_invalidates_the_signature() {
        let mut m: ServiceManifest = serde_json::from_str(PRE_WASM_SIGNED_MANIFEST).unwrap();
        m.wasm = Some(crate::wasm::tests::sample());
        assert!(!m.is_valid(1_500));
    }

    fn sample_wasm_manifest(key: &SigningKey) -> ServiceManifest {
        let base = sample(key, 1_000, 2_000);
        let mut spec = crate::wasm::tests::sample();
        spec.capabilities.env = vec!["LITELLM_MASTER_KEY".into()];
        ServiceManifest::sign_new_with_wasm(
            key, base.manifest_id, "wasm-hello".into(), "0.1.0".into(), InstallerKind::Wasm, base.bundle,
            base.env_template, base.verify, 1_000, 2_000, None, None, Some(spec),
        )
    }

    #[test]
    fn a_wasm_manifest_signs_verifies_validates_and_round_trips_through_json() {
        let key = random_signing_key();
        let m = sample_wasm_manifest(&key);
        assert!(m.is_valid(1_500));
        m.validate_wasm_spec().unwrap();
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains(r#""installer_kind":"wasm""#));
        let back: ServiceManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back, m);
        assert!(back.is_valid(1_500));
    }

    #[test]
    fn every_widening_of_a_signed_wasm_capability_invalidates_the_signature() {
        let key = random_signing_key();
        let base = sample_wasm_manifest(&key);
        let tamper: Vec<(&str, Box<dyn Fn(&mut WasmSpec)>)> = vec![
            ("add http host", Box::new(|w| w.capabilities.allowed_http_hosts.push("evil.example.com".into()))),
            ("preopen ro -> rw", Box::new(|w| w.capabilities.preopens[0].mode = crate::wasm::PreopenMode::Ro)),
            ("raise memory", Box::new(|w| w.limits.max_memory_bytes *= 2)),
            ("raise timeout", Box::new(|w| w.limits.timeout_ms += 1)),
            ("add fuel limit", Box::new(|w| w.limits.fuel = Some(5))),
            ("swap component hash", Box::new(|w| w.component_sha256 = [0xEE; 32])),
            ("swap component path", Box::new(|w| w.component_path = "other.wasm".into())),
            ("grant env name", Box::new(|w| w.capabilities.env.push("OTHER".into()))),
        ];
        for (what, f) in tamper {
            let mut m = base.clone();
            f(m.wasm.as_mut().unwrap());
            assert!(!m.is_valid(1_500), "{what} must invalidate the signature");
        }
        let mut stripped = base.clone();
        stripped.wasm = None;
        assert!(!stripped.is_valid(1_500), "removing the block must invalidate the signature");
    }

    #[test]
    fn the_installer_kind_is_part_of_the_preimage_so_wasm_cannot_be_relabelled() {
        let key = random_signing_key();
        let mut m = sample_wasm_manifest(&key);
        m.installer_kind = InstallerKind::Binary;
        assert!(!m.is_valid(1_500));
    }

    #[test]
    fn validate_wasm_spec_enforces_kind_and_block_agree() {
        let key = random_signing_key();
        let mut m = sample_wasm_manifest(&key);
        m.wasm = None;
        assert!(m.validate_wasm_spec().unwrap_err().contains("requires"));
        let mut m = sample_wasm_manifest(&key);
        m.installer_kind = InstallerKind::Compose;
        assert!(m.validate_wasm_spec().unwrap_err().contains("only allowed"));
        let mut m = sample_wasm_manifest(&key);
        m.wasm.as_mut().unwrap().capabilities.env = vec!["UNDECLARED".into()];
        assert!(m.validate_wasm_spec().unwrap_err().contains("env_template"));
        let mut m = sample_wasm_manifest(&key);
        m.wasm.as_mut().unwrap().limits.timeout_ms = 0;
        assert!(m.validate_wasm_spec().is_err());
    }
}
