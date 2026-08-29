//! Orchestrates installing a [`manifest_core::CompositionManifest`]: steps 1-3 of
//! `docs/design/composition-manifest.md`'s "Install flow" --
//!
//! 1. **Verify**: the composition's own signature, every [`manifest_core::SubManifestRef`]
//!    resolved against the registry and checked against its pinned `(publisher_pubkey,
//!    manifest_id, signature)` triple, and the existing publisher-allowlist trust check applied
//!    to every distinct publisher involved (the composition's own, plus each sub-manifest's --
//!    cross-publisher compositions are allowed, per the design doc's operator decision).
//! 2. **Install each sub-manifest**, unchanged from today's single-agent flow: one
//!    [`crate::activate::activate`] call per `sub_manifests[i]`, pure reuse of the existing
//!    per-[`manifest_core::InstallerKind`] executors.
//! 3. **Resolve symbolic -> real** holder-key bookkeeping, via a caller-supplied
//!    [`HolderKeyResolver`] -- see that trait's doc for why this crate cannot fill it in itself
//!    today.
//!
//! Step 4 (topology materialization via `/me/topologies/*`) and step 5 (applying
//! `upgrade_hint`s) are OUT OF SCOPE for this module -- see
//! [`materialize_topology_and_apply_upgrade_hints`]'s doc comment for why and where that work
//! picks up.
//!
//! **Failure handling is full rollback** (operator decision, 2026-08-28): if any sub-manifest
//! fails to install, every sub-manifest activation that already succeeded in this attempt is torn
//! down, in reverse order, before returning [`CompositionInstallReport::RolledBack`].

use crate::activate::{self, hex32, ActivateOptions};
use crate::allowlist::TrustAllowlist;
use crate::fetch;
use crate::process;
use crate::report::InstallReport;
use manifest_core::{CompositionEdge, CompositionManifest, InstallerKind, ServiceManifest};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;

/// Resolves "which real holder key came up" for a just-activated sub-manifest (design doc step
/// 3). `installer-engine` has no existing mechanism to observe an activated `ct-agent` process's
/// own holder key today -- `activate()` runs the bundle's primary artifact and its `verify.sh`,
/// and neither surfaces one; this is genuinely new bookkeeping the design doc flags as needed
/// without defining a wire/IPC mechanism for it (that mechanism is out of this PR's scope, same
/// as step 4/5). Rather than inventing one, resolution is a caller-supplied hook: a caller with a
/// real signal (e.g. a key file convention a future `ct-agent` writes on startup) can plug it in
/// without this crate's install-flow orchestration changing shape. [`NullHolderKeyResolver`] is
/// the honest default -- it always returns `None`, exactly what this codebase can support today.
pub trait HolderKeyResolver {
    fn resolve(&self, index: usize, report: &InstallReport, sub_manifest: &ServiceManifest) -> Option<[u8; 32]>;
}

/// Default [`HolderKeyResolver`]: no real resolution mechanism exists yet, so this always returns
/// `None` rather than fabricating a value.
pub struct NullHolderKeyResolver;

impl HolderKeyResolver for NullHolderKeyResolver {
    fn resolve(&self, _index: usize, _report: &InstallReport, _sub_manifest: &ServiceManifest) -> Option<[u8; 32]> {
        None
    }
}

pub struct CompositionActivateOptions {
    pub composition: CompositionManifest,
    pub allowlist: TrustAllowlist,
    /// Same meaning as [`ActivateOptions::env_file`], applied to every sub-manifest activation.
    pub env_file: Option<PathBuf>,
    /// Each sub-manifest's compose project is named `"{project_name_prefix}-{index}"`, keeping
    /// every sub-install's docker resources distinctly namespaced from one another and from any
    /// unrelated single-manifest activation on the same host.
    pub project_name_prefix: String,
    pub protected_name_substrings: Vec<String>,
    /// Fresh, empty scratch directory this run unpacks every sub-manifest's bundle into, one
    /// `sub-{index}/` subdirectory each.
    pub work_dir_root: PathBuf,
    pub now: u64,
    pub holder_key_resolver: Box<dyn HolderKeyResolver>,
}

/// One already-succeeded sub-manifest activation's bookkeeping -- exactly what full rollback (on
/// a later failure) needs to reverse it, plus what step 3's holder-key capture recorded.
struct SubInstallState {
    index: usize,
    kind: InstallerKind,
    project_name: String,
    work_dir: PathBuf,
    compose_file: String,
    holder_key: Option<[u8; 32]>,
    report: InstallReport,
}

/// The result of tearing down one already-succeeded sub-manifest activation during rollback.
#[derive(Debug, Clone, Serialize)]
pub struct TeardownOutcome {
    pub index: usize,
    pub kind: InstallerKind,
    /// `None` on success. `Some(_)` if the teardown command itself failed -- a real error, left
    /// standing for the operator to clean up manually, not silently swallowed.
    pub error: Option<String>,
    /// `true` for [`InstallerKind::Binary`]: `activate()` already waited for that process to exit
    /// before reporting success (see [`teardown_sub_manifest`]'s doc comment) -- there is nothing
    /// installer-engine can reverse for this kind. Surfaced explicitly rather than reported as a
    /// silent "torn down".
    pub nothing_to_reverse: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CompositionInstallReport {
    /// Step 1 (verify) failed -- nothing was installed, nothing to roll back.
    Rejected { reason: String, composition_id: String },
    /// A later step failed after at least the composition-level verify succeeded; every
    /// sub-manifest activation that DID succeed in this attempt has been torn down, in reverse
    /// order (`teardown`, index 0 = the most-recently-succeeded one torn down first).
    RolledBack {
        composition_id: String,
        failed_index: usize,
        failed_reason: String,
        teardown: Vec<TeardownOutcome>,
    },
    /// Every sub-manifest installed successfully (steps 1-3 of the design doc's install flow).
    /// Step 4/5 (topology materialization, upgrade-hint application) are NOT performed here -- see
    /// [`materialize_topology_and_apply_upgrade_hints`].
    Ok {
        composition_id: String,
        sub_reports: Vec<InstallReport>,
        /// Per-index, per [`HolderKeyResolver`] -- `None` where no real key could be resolved
        /// (the honest common case today; see that trait's doc comment).
        resolved_holder_keys: Vec<Option<[u8; 32]>>,
    },
}

pub fn activate_composition(opts: CompositionActivateOptions) -> CompositionInstallReport {
    let composition_id_hex = hex32(&opts.composition.composition_id);

    // Step 1a: the composition's own signature.
    if !opts.composition.is_valid(opts.now) {
        return CompositionInstallReport::Rejected {
            reason: "invalid_composition_signature_or_expired".into(),
            composition_id: composition_id_hex,
        };
    }

    // Step 1b: resolve + verify every SubManifestRef against the registry.
    let mut resolved_subs: Vec<ServiceManifest> = Vec::with_capacity(opts.composition.sub_manifests.len());
    for (i, r) in opts.composition.sub_manifests.iter().enumerate() {
        let url = format!("{}/manifests/{}", r.registry_url.trim_end_matches('/'), hex32(&r.manifest_id));
        let bytes = match fetch::fetch_bytes(&url) {
            Ok(b) => b,
            Err(e) => {
                return CompositionInstallReport::Rejected {
                    reason: format!("sub_manifest[{i}] fetch: {e}"),
                    composition_id: composition_id_hex,
                }
            }
        };
        let fetched: ServiceManifest = match serde_json::from_slice(&bytes) {
            Ok(m) => m,
            Err(e) => {
                return CompositionInstallReport::Rejected {
                    reason: format!("sub_manifest[{i}] at {url} is not valid manifest JSON: {e}"),
                    composition_id: composition_id_hex,
                }
            }
        };
        if fetched.publisher_pubkey != r.publisher_pubkey || fetched.manifest_id != r.manifest_id || fetched.signature != r.signature {
            return CompositionInstallReport::Rejected {
                reason: format!(
                    "sub_manifest[{i}]: the manifest fetched from {url} does not match the composition's pinned \
                     (publisher_pubkey, manifest_id, signature) triple -- refusing, this is exactly the tamper \
                     `SubManifestRef` pinning exists to catch"
                ),
                composition_id: composition_id_hex,
            };
        }
        if !fetched.is_valid(opts.now) {
            return CompositionInstallReport::Rejected {
                reason: format!("sub_manifest[{i}] is not currently valid (bad signature or expired), even though the pinned triple matches"),
                composition_id: composition_id_hex,
            };
        }
        resolved_subs.push(fetched);
    }

    // Edge indices are u32 into sub_manifests -- an out-of-range index is a malformed composition,
    // caught here rather than panicking later when translating symbolic -> real.
    for e in &opts.composition.edges {
        if e.a as usize >= resolved_subs.len() || e.b as usize >= resolved_subs.len() {
            return CompositionInstallReport::Rejected {
                reason: format!(
                    "edge ({}, {}) references an out-of-range sub_manifests index (there are {})",
                    e.a,
                    e.b,
                    resolved_subs.len()
                ),
                composition_id: composition_id_hex,
            };
        }
    }

    // Step 1c: publisher trust allowlist, against every DISTINCT publisher present -- the
    // composition's own, plus each sub-manifest's. Cross-publisher compositions are allowed (2026-
    // 08-28 operator decision); this is what makes that safe: every publisher involved, not just
    // the composition's own, must independently be trusted.
    let mut distinct_publishers: Vec<[u8; 32]> = vec![opts.composition.publisher_pubkey];
    for m in &resolved_subs {
        if !distinct_publishers.contains(&m.publisher_pubkey) {
            distinct_publishers.push(m.publisher_pubkey);
        }
    }
    for p in &distinct_publishers {
        if !opts.allowlist.contains(p) {
            return CompositionInstallReport::Rejected {
                reason: format!("publisher {} not on trust allowlist", hex32(p)),
                composition_id: composition_id_hex,
            };
        }
    }

    // Steps 2-3: install each sub-manifest via the EXISTING activate() logic, one call per index,
    // full rollback the moment any one fails.
    let mut succeeded: Vec<SubInstallState> = Vec::with_capacity(resolved_subs.len());
    for (i, sub) in resolved_subs.iter().enumerate() {
        let sub_dir = opts.work_dir_root.join(format!("sub-{i}"));
        let manifest_path = sub_dir.join("manifest.json");
        if let Err(e) = std::fs::create_dir_all(&sub_dir).and_then(|_| {
            std::fs::write(&manifest_path, serde_json::to_vec(sub).expect("ServiceManifest always serializes"))
        }) {
            let teardown = roll_back(&succeeded);
            return CompositionInstallReport::RolledBack {
                composition_id: composition_id_hex,
                failed_index: i,
                failed_reason: format!("write resolved sub_manifest[{i}] to {}: {e}", manifest_path.display()),
                teardown,
            };
        }

        let project_name = format!("{}-{i}", opts.project_name_prefix);
        let sub_work_dir = sub_dir.join("work");
        let report = activate::activate(ActivateOptions {
            manifest_location: manifest_path.to_string_lossy().into_owned(),
            allowlist: opts.allowlist.clone(),
            env_file: opts.env_file.clone(),
            project_name: project_name.clone(),
            protected_name_substrings: opts.protected_name_substrings.clone(),
            work_dir: sub_work_dir.clone(),
            now: opts.now,
        });

        match &report {
            InstallReport::Ok { .. } => {
                let holder_key = opts.holder_key_resolver.resolve(i, &report, sub);
                succeeded.push(SubInstallState {
                    index: i,
                    kind: sub.installer_kind,
                    project_name,
                    work_dir: sub_work_dir,
                    compose_file: sub.bundle.compose_file.clone(),
                    holder_key,
                    report,
                });
            }
            InstallReport::Rejected { reason, .. } => {
                let teardown = roll_back(&succeeded);
                return CompositionInstallReport::RolledBack {
                    composition_id: composition_id_hex,
                    failed_index: i,
                    failed_reason: format!("sub_manifest[{i}] rejected: {reason}"),
                    teardown,
                };
            }
            InstallReport::Failed { step, detail, .. } => {
                let teardown = roll_back(&succeeded);
                return CompositionInstallReport::RolledBack {
                    composition_id: composition_id_hex,
                    failed_index: i,
                    failed_reason: format!("sub_manifest[{i}] failed at step '{step}': {detail}"),
                    teardown,
                };
            }
        }
    }

    let resolved_holder_keys: Vec<Option<[u8; 32]>> = succeeded.iter().map(|s| s.holder_key).collect();
    materialize_topology_and_apply_upgrade_hints(&resolved_holder_keys, &opts.composition.edges);

    CompositionInstallReport::Ok {
        composition_id: composition_id_hex,
        sub_reports: succeeded.into_iter().map(|s| s.report).collect(),
        resolved_holder_keys,
    }
}

/// Step 4 (topology materialization via the backbone's `/me/topologies/*` REST surface) and step
/// 5 (`upgrade_hint` application) of the design doc's install flow.
///
/// TODO(composition-manifest step 4/5): blocked on CADS-Tunnel's answer to the design doc's
/// escalated question ("The gap this flow cannot paper over: who authenticates step 4") --
/// `/me/topologies/*` is OIDC-bearer authenticated (a logged-in human's session),
/// `installer-engine`'s existing model holds no such credential and is not an interactive flow.
/// Until core decides between the two options in the design doc (an interactive OIDC step, or a
/// new agent-key-authenticated topology-mutation primitive), this function deliberately does
/// nothing: it is a no-op, not an error, so an otherwise-fully-successful composition install
/// (every sub-manifest activated) is never turned into a rollback over work this PR was told not
/// to build. `activate_composition`'s happy path already calls this at the natural point step
/// 4/5 would run, with exactly the inputs they need (resolved holder keys, the composition's own
/// edge list), so implementing it later changes only this function's body, not the call site's
/// shape.
fn materialize_topology_and_apply_upgrade_hints(_resolved_holder_keys: &[Option<[u8; 32]>], _edges: &[CompositionEdge]) {
    // Intentionally empty -- see doc comment above.
}

/// Tear down every already-succeeded sub-manifest activation in `succeeded`, in reverse order
/// (undo most-recent-first). See [`teardown_sub_manifest`] for what "tear down" means per kind,
/// including the [`InstallerKind::Binary`] gap.
fn roll_back(succeeded: &[SubInstallState]) -> Vec<TeardownOutcome> {
    succeeded.iter().rev().map(teardown_sub_manifest).collect()
}

/// Reverse one sub-manifest's successful [`crate::activate::activate`] call.
///
/// - [`InstallerKind::Compose`]: `docker compose -p <project_name> -f <compose_file> down -v`,
///   run in the same `work_dir` the original `up` ran in (so relative `compose_file` resolves the
///   same way) -- the natural symmetric teardown for a `docker compose up -d` this crate already
///   knows how to invoke.
/// - [`InstallerKind::Binary`]: **a real gap, confirmed while implementing this**, not an
///   oversight. `activate()`'s step 9 runs the binary via `process::run_bounded`, which blocks
///   until that process exits (bounded by a timeout) BEFORE `InstallReport::Ok` is ever returned
///   -- by the time a Binary sub-manifest activation is known to have succeeded, its process has
///   already exited. There is no persistent process, pid, or other resource installer-engine
///   tracks for a Binary activation, so there is nothing to reverse. Reported via
///   [`TeardownOutcome::nothing_to_reverse`], not silently treated as a successful teardown.
/// - [`InstallerKind::K8s`]: unreachable -- `activate()` rejects `K8s` before anything is
///   installed (see `activate.rs` step 4), so it can never appear in `succeeded`.
fn teardown_sub_manifest(state: &SubInstallState) -> TeardownOutcome {
    match state.kind {
        InstallerKind::Compose => {
            let args = ["compose", "-p", state.project_name.as_str(), "-f", state.compose_file.as_str(), "down", "-v"];
            let error = match process::run_bounded("docker", &args, &state.work_dir, &[], Duration::from_secs(120)) {
                Ok(out) if !out.timed_out && out.exit_code == Some(0) => None,
                Ok(out) => Some(format!(
                    "docker compose down: exit={:?} timed_out={} stderr={}",
                    out.exit_code, out.timed_out, out.stderr
                )),
                Err(e) => Some(e),
            };
            TeardownOutcome { index: state.index, kind: state.kind, error, nothing_to_reverse: false }
        }
        InstallerKind::Binary => TeardownOutcome { index: state.index, kind: state.kind, error: None, nothing_to_reverse: true },
        InstallerKind::K8s => unreachable!("activate() rejects K8s before a successful activation can exist"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;
    use manifest_core::{CompositionEdge, CompositionManifest, EdgeUpgradeHint, SubManifestRef};
    use rand::RngCore;

    fn random_signing_key() -> SigningKey {
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        SigningKey::from_bytes(&seed)
    }

    /// Lays out a fake local "registry" at `registry_dir/manifests/<manifest_id_hex>` -- exactly
    /// the path shape `activate_composition` builds
    /// (`{registry_url}/manifests/{manifest_id_hex}`) and exactly what `fetch::fetch_bytes` reads
    /// for a non-`http(s)://` location (a plain local path), reusing that existing test-support
    /// path rather than standing up a real HTTP server.
    fn publish_to_fake_registry(registry_dir: &std::path::Path, manifest: &ServiceManifest) {
        let dir = registry_dir.join("manifests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(hex32(&manifest.manifest_id));
        std::fs::write(path, serde_json::to_vec(manifest).unwrap()).unwrap();
    }

    /// Wraps `activate.rs`'s own `write_binary_fixture` (the exact fixture its Binary-executor
    /// integration tests use) so this module reuses that real signing/tarball-building logic
    /// rather than duplicating it, and hands back the parsed [`ServiceManifest`] this module needs
    /// to build a [`SubManifestRef`] and publish into the fake registry.
    fn write_and_parse_binary_fixture(dir: &std::path::Path, manifest_id: [u8; 32], stdout_line: &str) -> (ServiceManifest, [u8; 32]) {
        std::fs::create_dir_all(dir).unwrap();
        let (manifest_path, pubkey) = crate::activate::tests::write_binary_fixture(dir, manifest_id, stdout_line);
        let bytes = std::fs::read(&manifest_path).unwrap();
        let manifest: ServiceManifest = serde_json::from_slice(&bytes).unwrap();
        (manifest, pubkey)
    }

    /// Builds a 2-sub-manifest composition (both Binary kind -- no docker daemon required, same
    /// rationale as `activate.rs`'s own Binary-fixture tests being the cheap, hermetic way to
    /// prove the real `activate()` executor path) published to a fake local registry, ready to
    /// hand to `activate_composition`.
    fn build_fixture(dir: &std::path::Path) -> (CompositionManifest, [u8; 32], [u8; 32]) {
        let registry_dir = dir.join("registry");
        std::fs::create_dir_all(&registry_dir).unwrap();

        let (m0, pub0) = write_and_parse_binary_fixture(&dir.join("src-0"), [0x10; 32], "sub-0-ran");
        let (m1, pub1) = write_and_parse_binary_fixture(&dir.join("src-1"), [0x11; 32], "sub-1-ran");
        publish_to_fake_registry(&registry_dir, &m0);
        publish_to_fake_registry(&registry_dir, &m1);

        let composition_key = random_signing_key();
        let registry_url = registry_dir.to_str().unwrap().to_string();
        let composition = CompositionManifest::sign_new(
            &composition_key,
            [0xC0; 32],
            "ingest-publish-demo".into(),
            "0.1.0".into(),
            vec![
                SubManifestRef {
                    publisher_pubkey: m0.publisher_pubkey,
                    manifest_id: m0.manifest_id,
                    signature: m0.signature,
                    registry_url: registry_url.clone(),
                },
                SubManifestRef {
                    publisher_pubkey: m1.publisher_pubkey,
                    manifest_id: m1.manifest_id,
                    signature: m1.signature,
                    registry_url,
                },
            ],
            vec![CompositionEdge { a: 0, b: 1, upgrade_hint: EdgeUpgradeHint::RelayOnly }],
            0,
            u64::MAX / 2,
        );
        (composition, pub0, pub1)
    }

    fn allowlist_of(keys: &[[u8; 32]]) -> TrustAllowlist {
        let csv = keys.iter().map(hex32).collect::<Vec<_>>().join(",");
        TrustAllowlist::parse(&csv).unwrap()
    }

    #[test]
    fn a_valid_two_agent_composition_installs_both_sub_manifests() {
        let dir = tempfile::tempdir().unwrap();
        let (composition, pub0, pub1) = build_fixture(dir.path());
        let allowlist = allowlist_of(&[composition.publisher_pubkey, pub0, pub1]);

        let report = activate_composition(CompositionActivateOptions {
            composition,
            allowlist,
            env_file: None,
            project_name_prefix: format!("composition-test-{}", std::process::id()),
            protected_name_substrings: vec!["litellm-proxy".into(), "kali".into(), "sort-demo".into(), "game2048".into()],
            work_dir_root: dir.path().join("work"),
            now: 1,
            holder_key_resolver: Box::new(NullHolderKeyResolver),
        });

        match report {
            CompositionInstallReport::Ok { sub_reports, resolved_holder_keys, .. } => {
                assert_eq!(sub_reports.len(), 2);
                assert_eq!(resolved_holder_keys.len(), 2);
                assert!(resolved_holder_keys.iter().all(Option::is_none), "NullHolderKeyResolver always returns None");
                for r in &sub_reports {
                    match r {
                        InstallReport::Ok { captured_stdout, .. } => assert!(captured_stdout.is_some()),
                        other => panic!("expected each sub_report to be Ok, got {other:?}"),
                    }
                }
            }
            other => panic!("expected CompositionInstallReport::Ok, got {other:?}"),
        }
    }

    #[test]
    fn a_composition_referencing_an_untrusted_sub_manifest_publisher_is_rejected_before_installing_anything() {
        let dir = tempfile::tempdir().unwrap();
        let (composition, pub0, _pub1) = build_fixture(dir.path());
        // pub1 (the second sub-manifest's publisher) is deliberately left off the allowlist --
        // cross-publisher compositions are allowed, but EVERY distinct publisher must be trusted.
        let allowlist = allowlist_of(&[composition.publisher_pubkey, pub0]);

        let report = activate_composition(CompositionActivateOptions {
            composition,
            allowlist,
            env_file: None,
            project_name_prefix: format!("composition-untrusted-{}", std::process::id()),
            protected_name_substrings: vec![],
            work_dir_root: dir.path().join("work"),
            now: 1,
            holder_key_resolver: Box::new(NullHolderKeyResolver),
        });

        match report {
            CompositionInstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("not on trust allowlist"), "{reason}");
            }
            other => panic!("expected Rejected, got {other:?}"),
        }
        assert!(!dir.path().join("work").exists(), "nothing should have been installed before the trust check");
    }

    #[test]
    fn a_tampered_composition_signature_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let (mut composition, pub0, pub1) = build_fixture(dir.path());
        composition.name = "not-the-signed-name".into();
        let allowlist = allowlist_of(&[composition.publisher_pubkey, pub0, pub1]);

        let report = activate_composition(CompositionActivateOptions {
            composition,
            allowlist,
            env_file: None,
            project_name_prefix: format!("composition-tampered-{}", std::process::id()),
            protected_name_substrings: vec![],
            work_dir_root: dir.path().join("work"),
            now: 1,
            holder_key_resolver: Box::new(NullHolderKeyResolver),
        });

        match report {
            CompositionInstallReport::Rejected { reason, .. } => {
                assert_eq!(reason, "invalid_composition_signature_or_expired");
            }
            other => panic!("expected Rejected, got {other:?}"),
        }
    }

    /// The central full-rollback proof: sub_manifests[0] installs successfully, sub_manifests[1]
    /// is signed by a publisher NOT on the allowlist actually passed to the per-sub-manifest
    /// `activate()` call -- wait, step 1c already gates on that; instead this test drives the
    /// rollback path via a second sub-manifest whose OWN `ServiceManifest` signature is broken
    /// (fails inside `activate()`'s step 2, not this module's step 1, since composition-level
    /// verify only checks `SubManifestRef` tamper-evidence against what the registry actually
    /// returns -- publishing an already-invalid manifest to the fake registry is the honest way to
    /// reach `activate()`'s own rejection from here).
    #[test]
    fn a_failure_partway_through_tears_down_every_sub_manifest_that_already_succeeded() {
        let dir = tempfile::tempdir().unwrap();
        let registry_dir = dir.path().join("registry");
        std::fs::create_dir_all(&registry_dir).unwrap();

        let (m0, pub0) = write_and_parse_binary_fixture(&dir.path().join("src-0"), [0x10; 32], "sub-0-ran");
        publish_to_fake_registry(&registry_dir, &m0);

        // sub_manifests[1]: a well-formed, validly-signed Binary manifest whose publisher will
        // simply be left off the allowlist passed to `activate()` (the allowlist this test builds
        // includes it at the COMPOSITION level so step 1c's ref-resolution passes, but `activate`'s
        // own step 3 trust check uses the SAME allowlist -- so instead, tamper the registry copy
        // after publishing to break `is_valid` at `activate()`'s step 2, which composition-level
        // verify does NOT re-check per-byte, only the pinned triple match plus is_valid at fetch
        // time -- so tampering it BEFORE fetch means composition-level verify itself would already
        // catch it (as the tampered-signature test above proves). To reach `activate()`'s own
        // rejection specifically, use `InstallerKind::K8s`, which composition-level verify has no
        // opinion on but `activate()` unconditionally refuses.
        let (m1, pub1) = write_k8s_fixture_for_composition_tests(&dir.path().join("src-1"));
        publish_to_fake_registry(&registry_dir, &m1);

        let composition_key = random_signing_key();
        let registry_url = registry_dir.to_str().unwrap().to_string();
        let composition = CompositionManifest::sign_new(
            &composition_key,
            [0xC1; 32],
            "rollback-demo".into(),
            "0.1.0".into(),
            vec![
                SubManifestRef { publisher_pubkey: m0.publisher_pubkey, manifest_id: m0.manifest_id, signature: m0.signature, registry_url: registry_url.clone() },
                SubManifestRef { publisher_pubkey: m1.publisher_pubkey, manifest_id: m1.manifest_id, signature: m1.signature, registry_url },
            ],
            vec![CompositionEdge { a: 0, b: 1, upgrade_hint: EdgeUpgradeHint::RelayOnly }],
            0,
            u64::MAX / 2,
        );
        let allowlist = allowlist_of(&[composition.publisher_pubkey, pub0, pub1]);
        let project_name_prefix = format!("composition-rollback-{}", std::process::id());

        let report = activate_composition(CompositionActivateOptions {
            composition,
            allowlist,
            env_file: None,
            project_name_prefix: project_name_prefix.clone(),
            protected_name_substrings: vec![],
            work_dir_root: dir.path().join("work"),
            now: 1,
            holder_key_resolver: Box::new(NullHolderKeyResolver),
        });

        match report {
            CompositionInstallReport::RolledBack { failed_index, teardown, .. } => {
                assert_eq!(failed_index, 1, "sub_manifests[1] (K8s) is the one activate() rejects");
                assert_eq!(teardown.len(), 1, "only index 0 had succeeded and needed rolling back");
                assert_eq!(teardown[0].index, 0);
                assert!(teardown[0].nothing_to_reverse, "index 0 is Binary kind -- no persistent process to reverse");
                assert!(teardown[0].error.is_none());
            }
            other => panic!("expected RolledBack, got {other:?}"),
        }
    }

    fn write_k8s_fixture_for_composition_tests(dir: &std::path::Path) -> (ServiceManifest, [u8; 32]) {
        use manifest_core::{BundleRef, VerifySpec};
        std::fs::create_dir_all(dir).unwrap();
        let signing_key = random_signing_key();
        let pubkey = signing_key.verifying_key().to_bytes();
        let manifest = ServiceManifest::sign_new(
            &signing_key,
            [0x99; 32],
            "composition-k8s-placeholder".into(),
            "0.1.0".into(),
            InstallerKind::K8s,
            BundleRef { url: "unused://".into(), sha256: [0u8; 32], compose_file: "unused".into() },
            vec![],
            VerifySpec { script: "unused".into(), timeout_secs: 1 },
            0,
            u64::MAX / 2,
        );
        (manifest, pubkey)
    }
}
