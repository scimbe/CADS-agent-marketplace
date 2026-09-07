//! Orchestrates the full `ct-agent manifest activate` control flow (steps 1-10 of the Phase 1
//! plan's section C). Every step is fail-closed: a rejection at any point stops immediately and
//! reports exactly why, before anything reaching `docker compose up` has a chance to run.

use crate::allowlist::TrustAllowlist;
use crate::report::{InstallReport, StepResult};
use crate::{fetch, guardrails, process, sandbox};
use manifest_core::{EnvVarSpec, EnvironmentContract, InstallerKind, NetworkMode};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Opt-out that lets a Binary manifest run with NO sandbox on a host where no backend is usable.
/// Read by [`require_binary_sandbox_from_env`]; documented in `docs/security-model.md` (F.14).
pub const ALLOW_UNSANDBOXED_ENV: &str = "CT_ALLOW_UNSANDBOXED";

pub struct ActivateOptions {
    /// A URL (https://) or local file path to the signed manifest JSON.
    pub manifest_location: String,
    pub allowlist: TrustAllowlist,
    /// Local file supplying secret VALUES for `env_template` names (`KEY=value` per line,
    /// `#`-comments/blank lines ignored) -- never the manifest itself. May be absent if every
    /// declared var is satisfied by the process environment instead.
    pub env_file: Option<PathBuf>,
    /// Isolated compose project name for this run.
    pub project_name: String,
    /// Name substrings that must never appear in `project_name`, nor collide with any
    /// already-running container/volume this run is about to create -- the concrete guard
    /// against a proof/test run touching a real, live deployment (F.11).
    pub protected_name_substrings: Vec<String>,
    /// Fresh, empty scratch directory this run unpacks the bundle into.
    pub work_dir: PathBuf,
    pub now: u64,
    /// Binary kind only. **Fail closed is the default** (scimbe/ct-agent#183, phase 1, superseding
    /// the 2026-08-28 warn-and-proceed decision): when no sandbox backend is usable on this host,
    /// a Binary activation is REFUSED, naming the probe's own failure and the opt-out. Wire it
    /// from the environment with [`require_binary_sandbox_from_env`], which yields `true` unless
    /// `CT_ALLOW_UNSANDBOXED=1` is set (the old `CT_REQUIRE_BINARY_SANDBOX=1` is still accepted
    /// and is now a no-op, since it asks for what is already the default). `false` here means the
    /// operator explicitly opted out: the executable runs unconfined behind the loud pre-execution
    /// warning. Never blocks Compose, and never blocks a Binary run when a backend IS available.
    pub require_binary_sandbox: bool,
}

/// The one place the `CT_ALLOW_UNSANDBOXED` / `CT_REQUIRE_BINARY_SANDBOX` semantics live, so every
/// wiring (`examples/dev_activate.rs`, ct-agent's `manifest activate`) agrees. `var` is the
/// environment lookup, passed in rather than read ambiently so the mapping is testable without
/// mutating the process environment (see `sandbox::bwrap::probe_with_path` for why that matters).
///
/// | `CT_ALLOW_UNSANDBOXED` | `CT_REQUIRE_BINARY_SANDBOX` | result |
/// |---|---|---|
/// | unset / not `1` | anything | `true` (fail closed -- the default) |
/// | `1` | unset / not `1` | `false` (opt-out: warn and proceed unsandboxed) |
/// | `1` | `1` | `true` -- an explicit "require" still wins over an explicit "allow" |
pub fn require_binary_sandbox_from_env(var: impl Fn(&str) -> Option<String>) -> bool {
    let is_one = |name: &str| var(name).map(|v| v.trim() == "1").unwrap_or(false);
    if is_one("CT_REQUIRE_BINARY_SANDBOX") {
        return true;
    }
    !is_one(ALLOW_UNSANDBOXED_ENV)
}

/// scimbe/ct-agent#183 phase 1: the contract is signed and validated but NOT yet enforced by the
/// installer, with one exception -- a contract that claims more than the sandbox can give is
/// refused, so no manifest ships promising host-loopback reachability or egress the runtime will
/// silently not honour. `None` (no contract) is the strictest default and is never refused here.
/// Shared by [`activate`] and [`crate::plan`] so both say the same thing.
pub(crate) fn environment_contract_refusal(env: Option<&EnvironmentContract>) -> Option<String> {
    let env = env?;
    if let Err(e) = env.validate() {
        return Some(format!("environment_contract_invalid: {e}"));
    }
    if env.network.mode == NetworkMode::HostLoopback {
        return Some(
            "environment_contract_unsupported: network.mode = host_loopback is not supported in phase 1 \
             (the bwrap backend provides a PRIVATE loopback only; declare private_loopback or none)"
                .to_string(),
        );
    }
    if !env.network.egress.is_empty() {
        return Some(format!(
            "environment_contract_unsupported: {} egress rule(s) declared, but egress is not supported in \
             phase 1 (no backend can honour it; remove the entries)",
            env.network.egress.len()
        ));
    }
    None
}

/// The fail-closed refusal text, shared by [`activate`] and [`crate::plan`]: names every backend
/// candidate that was tried and its probe's own reason (which, for bwrap, already carries the
/// remediation hint), and the exact opt-out.
pub(crate) fn unsandboxed_refusal(tried: &[(&'static str, String)]) -> String {
    let tried_text = if tried.is_empty() {
        "no sandbox backend candidate exists for this OS yet".to_string()
    } else {
        tried.iter().map(|(candidate, reason)| format!("{candidate}: {reason}")).collect::<Vec<_>>().join("; ")
    };
    format!(
        "require_binary_sandbox: no sandbox backend is usable on this host ({tried_text}). Refusing to run \
         this Binary manifest unsandboxed (fail-closed default since scimbe/ct-agent#183 phase 1). To run \
         it anyway with FULL access to this host, set {ALLOW_UNSANDBOXED_ENV}=1."
    )
}

/// scimbe/ct-agent#183, decision B3 (2026-09-07): on Windows a Binary manifest is refused
/// outright, fail closed, before anything is fetched. There is no sandbox candidate for Windows
/// at all (`sandbox::platform_candidates` is empty there, and no Job-Objects backend is
/// designed -- see `docs/design/sandbox-fallback.md`'s "Windows" section) AND no supported
/// unsandboxed mode either: unlike Linux, where `CT_ALLOW_UNSANDBOXED=1` restores warn-and-
/// proceed, the opt-out does not apply here, so the refusal says so instead of pointing at it.
/// Compose manifests (Docker Desktop) and `manifest plan` stay available, which is what the text
/// steers an operator towards. macOS keeps the existing selection/refusal logic unchanged (its
/// sandbox backend is a later milestone), so it is `Ok(())` here.
///
/// Pure over `os` (an `std::env::consts::OS`-shaped string, matched case-sensitively exactly like
/// that constant) rather than a `cfg`, so the verdict and its text are testable on every host.
pub fn binary_manifest_platform_verdict(os: &str) -> Result<(), String> {
    if os == "windows" {
        return Err(format!(
            "binary manifests are not supported on windows (scimbe/ct-agent#183, decision B3): install this \
             service as a compose manifest, or use `manifest plan`; {ALLOW_UNSANDBOXED_ENV} does not apply on \
             this platform"
        ));
    }
    Ok(())
}

/// The B3 refusal as it appears in an [`InstallReport::Rejected`] reason and a [`crate::Plan`]'s
/// `refusals`: the stable `unsupported_platform: ` prefix (the same shape as the other step
/// prefixes, e.g. `unsupported_installer_kind: `) plus [`binary_manifest_platform_verdict`]'s
/// text. `None` for every non-Binary kind and for every OS but Windows. Shared by [`activate`]
/// and [`crate::plan`] so both say the same thing.
pub(crate) fn binary_manifest_platform_refusal(kind: InstallerKind, os: &str) -> Option<String> {
    if kind != InstallerKind::Binary {
        return None;
    }
    binary_manifest_platform_verdict(os).err().map(|text| format!("unsupported_platform: {text}"))
}

pub fn activate(opts: ActivateOptions) -> InstallReport {
    activate_with_selector(opts, &sandbox::select)
}

/// [`activate`] with the sandbox-backend selection injected. Production always passes
/// [`sandbox::select`]; tests pass a closure returning a fixed [`sandbox::Selection`] so the
/// fail-closed and opt-out paths are exercised deterministically on every host, including CI
/// runners where bwrap IS usable (the skip-if-backend-available idiom would otherwise leave the
/// refusal path untested exactly where it matters).
pub(crate) fn activate_with_selector(opts: ActivateOptions, select: &dyn Fn() -> sandbox::Selection) -> InstallReport {
    activate_with_selector_on(opts, select, std::env::consts::OS)
}

/// [`activate_with_selector`] with the host OS injected as well (`os` is what
/// `std::env::consts::OS` would say), so the Windows-only B3 refusal
/// ([`binary_manifest_platform_verdict`]) is exercised deterministically on every host, the same
/// way the injected `select` exercises the fail-closed path on hosts where bwrap IS usable.
pub(crate) fn activate_with_selector_on(
    opts: ActivateOptions,
    select: &dyn Fn() -> sandbox::Selection,
    os: &str,
) -> InstallReport {
    // 1. Fetch manifest.
    let manifest = match fetch::fetch_manifest(&opts.manifest_location) {
        Ok(m) => m,
        Err(e) => return InstallReport::Rejected { reason: format!("fetch_manifest: {e}"), manifest_id: None },
    };
    let manifest_id_hex = hex32(&manifest.manifest_id);

    // 2. Signature + expiry.
    if !manifest.is_valid(opts.now) {
        return InstallReport::Rejected {
            reason: "invalid_signature_or_expired".into(),
            manifest_id: Some(manifest_id_hex),
        };
    }

    // 3. Publisher trust allowlist -- deliberately separate from step 2. A valid-but-untrusted
    //    signature is rejected identically to an invalid one.
    if !opts.allowlist.contains(&manifest.publisher_pubkey) {
        return InstallReport::Rejected {
            reason: "publisher_not_on_trust_allowlist".into(),
            manifest_id: Some(manifest_id_hex),
        };
    }

    // 4. installer_kind -- exhaustive match, no fallback arm. K8s has no executor code path at
    //    all yet (see manifest-core's InstallerKind doc for why: no real cluster to prove one
    //    against). Compose and Binary both proceed; they diverge at steps 7/9 below.
    match manifest.installer_kind {
        InstallerKind::Compose | InstallerKind::Binary => {}
        InstallerKind::K8s => {
            return InstallReport::Rejected {
                reason: format!(
                    "unsupported_installer_kind: {:?} (K8s is schema-only -- no executor exists, \
                     see manifest-core::InstallerKind's doc comment)",
                    manifest.installer_kind
                ),
                manifest_id: Some(manifest_id_hex),
            };
        }
    }

    // 4a. Platform (scimbe/ct-agent#183, decision B3): a Binary manifest on Windows is refused
    //    here, before the environment contract and long before the bundle fetch or the sandbox
    //    selection in step 9 -- there is no backend to select and no opt-out to honour, so
    //    nothing later in the pipeline could change the verdict. Static, like steps 2-4.
    if let Some(reason) = binary_manifest_platform_refusal(manifest.installer_kind, os) {
        eprintln!("ct-agent: REFUSING Binary manifest {manifest_id_hex} -- {reason}");
        return InstallReport::Rejected { reason, manifest_id: Some(manifest_id_hex) };
    }

    // 4b. Environment contract (scimbe/ct-agent#183, phase 1): validate, and refuse a contract
    //    that asks for more than the sandbox gives. Not enforced beyond that yet -- see
    //    `environment_contract_refusal`. Checked BEFORE any fetch, like the other static checks.
    if let Some(reason) = environment_contract_refusal(manifest.environment.as_ref()) {
        return InstallReport::Rejected { reason, manifest_id: Some(manifest_id_hex) };
    }

    // 5. Pre-flight collision guard, BEFORE fetching/unpacking/running anything. The
    //    docker-resource half of this check (existing containers/volumes/networks) is a Compose-
    //    only concern -- Binary never creates any docker resource, so it has nothing to collide
    //    with, and shelling out to `docker` unconditionally made a Binary manifest unusable on
    //    exactly the host class it exists for: one with no Docker daemon running (tester-found,
    //    CADS-agent-marketplace#11 -- CI's `ubuntu-latest` always has a live daemon, so this
    //    never failed there). The protected-substring check on `project_name` itself has nothing
    //    to do with Docker and stays unconditional for both kinds.
    if let Err(e) = preflight_collision_check(
        &opts.project_name,
        &opts.protected_name_substrings,
        manifest.installer_kind == InstallerKind::Compose,
    ) {
        return InstallReport::Rejected { reason: format!("collision_guard: {e}"), manifest_id: Some(manifest_id_hex) };
    }

    // 6. Fetch bundle, verify hash, unpack with path-traversal protection.
    let bundle_bytes = match fetch::fetch_bundle(&manifest.bundle.url) {
        Ok(b) => b,
        Err(e) => return InstallReport::Rejected { reason: format!("fetch_bundle: {e}"), manifest_id: Some(manifest_id_hex) },
    };
    if !fetch::verify_sha256(&bundle_bytes, &manifest.bundle.sha256) {
        return InstallReport::Rejected { reason: "bundle_sha256_mismatch".into(), manifest_id: Some(manifest_id_hex) };
    }
    if let Err(e) = std::fs::create_dir_all(&opts.work_dir) {
        return InstallReport::Rejected { reason: format!("create work_dir: {e}"), manifest_id: Some(manifest_id_hex) };
    }
    if let Err(e) = fetch::unpack_tar_gz_safely(&bundle_bytes, &opts.work_dir) {
        return InstallReport::Rejected { reason: format!("unpack_bundle: {e}"), manifest_id: Some(manifest_id_hex) };
    }

    // 6b. `bundle.compose_file` doubles as "path to the Compose file" (Compose kind) AND "path to
    //    the executable" (Binary kind) -- see the field's doc comment in manifest-core. Either
    //    way it is manifest-supplied, signed-but-attacker-authorable data, exactly like a tar
    //    entry path, so it gets the SAME traversal/absolute-path check `unpack_tar_gz_safely`
    //    already applies to entries inside the bundle (fetch.rs). Without this, `Path::join`
    //    silently discards `work_dir` for an absolute component and a trusted-but-malicious
    //    publisher's Binary manifest can point outside the sandboxed work_dir at a pre-existing
    //    host file -- one whose content the bundle's sha256 never covered -- and have it chmod
    //    +x'd and executed in step 9 below.
    let bundle_path = match safe_join_within_work_dir(&opts.work_dir, &manifest.bundle.compose_file) {
        Ok(p) => p,
        Err(e) => return InstallReport::Rejected { reason: format!("bundle.compose_file: {e}"), manifest_id: Some(manifest_id_hex) },
    };

    // 7. Static guardrail scan -- BEFORE any docker command runs. Compose only: there is no
    //    static-analysis equivalent for an arbitrary executable, which is exactly why Binary
    //    leans more heavily on the allowlist check in step 3 (see manifest-core::InstallerKind's
    //    doc comment for the acknowledged tradeoff).
    if manifest.installer_kind == InstallerKind::Compose {
        let compose_path = &bundle_path;
        let compose_yaml = match std::fs::read_to_string(compose_path) {
            Ok(s) => s,
            Err(e) => {
                return InstallReport::Rejected {
                    reason: format!("read compose file {}: {e}", compose_path.display()),
                    manifest_id: Some(manifest_id_hex),
                }
            }
        };
        let violations = match guardrails::scan_compose(&compose_yaml, &opts.work_dir) {
            Ok(v) => v,
            Err(e) => return InstallReport::Rejected { reason: format!("guardrail_scan_error: {e}"), manifest_id: Some(manifest_id_hex) },
        };
        if !violations.is_empty() {
            let detail = violations
                .iter()
                .map(|v| format!("{}[{}]: {}", v.service, v.rule, v.detail))
                .collect::<Vec<_>>()
                .join("; ");
            return InstallReport::Rejected { reason: format!("guardrail_violations: {detail}"), manifest_id: Some(manifest_id_hex) };
        }
    }

    // 8. Template env: NAMES only in the manifest, VALUES only from local, out-of-band sources.
    let env_values = match load_env_values(opts.env_file.as_deref()) {
        Ok(v) => v,
        Err(e) => return InstallReport::Rejected { reason: format!("load_env_file: {e}"), manifest_id: Some(manifest_id_hex) },
    };
    let dotenv = match resolve_env_template(&manifest.env_template, &env_values) {
        Ok(d) => d,
        Err(e) => return InstallReport::Rejected { reason: e, manifest_id: Some(manifest_id_hex) },
    };
    let env_file_path = opts.work_dir.join(".env");
    if let Err(e) = write_env_file(&env_file_path, &dotenv) {
        return InstallReport::Rejected { reason: format!("write .env: {e}"), manifest_id: Some(manifest_id_hex) };
    }

    let publisher_hex = hex32(&manifest.publisher_pubkey);

    // 9. Run the bundle's primary artifact, bounded, whole-process-group-killed on timeout.
    //    Compose: `docker compose up -d --build`. Binary: the executable itself, made
    //    executable first, env passed the SAME resolved values as Compose's `.env` (parsed back
    //    out of the file just written in step 8 -- one source of truth, not a second env
    //    resolution path).
    let (up_outcome, captured_stdout, sandbox_name) = match manifest.installer_kind {
        InstallerKind::Compose => {
            let compose_file_arg = manifest.bundle.compose_file.clone();
            let up_args = vec![
                "compose",
                "-p",
                opts.project_name.as_str(),
                "-f",
                compose_file_arg.as_str(),
                "--env-file",
                ".env",
                "up",
                "-d",
                "--build",
            ];
            let outcome = match process::run_bounded("docker", &up_args, &opts.work_dir, &[], Duration::from_secs(300)) {
                Ok(o) => o,
                Err(e) => {
                    return InstallReport::Failed {
                        manifest_id: manifest_id_hex,
                        publisher_pubkey: publisher_hex,
                        project_name: opts.project_name,
                        step: "compose_up".into(),
                        detail: e,
                        sandbox: None,
                    }
                }
            };
            (outcome, None, None)
        }
        InstallerKind::Binary => {
            let binary_path = bundle_path.clone();
            if let Err(e) = mark_executable(&binary_path) {
                return InstallReport::Failed {
                    manifest_id: manifest_id_hex,
                    publisher_pubkey: publisher_hex,
                    project_name: opts.project_name,
                    step: "binary_chmod".into(),
                    detail: e,
                    sandbox: None,
                };
            }
            let env_pairs = parse_dotenv_pairs(&dotenv);
            let env_refs: Vec<(&str, &str)> = env_pairs.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
            let binary_str = match binary_path.to_str() {
                Some(s) => s,
                None => {
                    return InstallReport::Failed {
                        manifest_id: manifest_id_hex,
                        publisher_pubkey: publisher_hex,
                        project_name: opts.project_name,
                        step: "binary_run".into(),
                        detail: format!("{} is not valid UTF-8", binary_path.display()),
                        sandbox: None,
                    }
                }
            };

            // Milestone 1: select a sandbox backend for this Binary run (or none, if this host has
            // no usable candidate). Selected fresh per activation rather than cached -- one extra
            // subprocess is worth it over a stale "probed sandboxed once" claim outliving a host
            // config change. See `sandbox::select`'s doc and `docs/design/sandbox-fallback.md`.
            let selection = select();
            let (program, wrapped_args, sandbox_name): (String, Vec<String>, Option<String>) = match &selection {
                sandbox::Selection::Sandboxed(backend) => {
                    let (p, a) = backend.wrap_command(binary_str, &[], &opts.work_dir, &env_refs);
                    eprintln!(
                        "ct-agent: activating Binary manifest {manifest_id_hex} under {} sandbox -- {}",
                        backend.name(),
                        backend.isolation_summary()
                    );
                    (p, a, Some(backend.name().to_string()))
                }
                sandbox::Selection::Unsandboxed { tried } => {
                    // Fail closed by default (scimbe/ct-agent#183 phase 1): refuse, naming the
                    // probe's own failure (bwrap's stderr plus the AppArmor/userns hint) and the
                    // opt-out. The refusal reason is the operator-facing remediation.
                    if opts.require_binary_sandbox {
                        let reason = unsandboxed_refusal(tried);
                        eprintln!("ct-agent: REFUSING Binary manifest {manifest_id_hex} -- {reason}");
                        return InstallReport::Rejected { reason, manifest_id: Some(manifest_id_hex) };
                    }
                    // Opt-out path (`CT_ALLOW_UNSANDBOXED=1`) only: the loud pre-execution warning
                    // (M0, marketplace#12) still fires before every unsandboxed Binary execution.
                    eprintln!(
                        "ct-agent: WARNING -- no sandbox available for Binary manifest {manifest_id_hex} \
                         (tried: {tried:?}) and {ALLOW_UNSANDBOXED_ENV}=1 is set. This executable will run \
                         with FULL ACCESS TO THIS ENTIRE HOST -- not just this install -- including your \
                         filesystem, network, and every other process. This is only as safe as your trust \
                         in the publisher (publisher_pubkey={publisher_hex}). Install `bwrap` (and, on \
                         Ubuntu 24.04+, its `bwrap-userns-restrict` AppArmor profile) and unset \
                         {ALLOW_UNSANDBOXED_ENV} to get the fail-closed default back."
                    );
                    (binary_str.to_string(), vec![], None)
                }
            };
            let arg_refs: Vec<&str> = wrapped_args.iter().map(String::as_str).collect();
            let outcome = match process::run_bounded(&program, &arg_refs, &opts.work_dir, &env_refs, Duration::from_secs(300)) {
                Ok(o) => o,
                Err(e) => {
                    return InstallReport::Failed {
                        manifest_id: manifest_id_hex,
                        publisher_pubkey: publisher_hex,
                        project_name: opts.project_name,
                        step: "binary_run".into(),
                        detail: e,
                        sandbox: sandbox_name,
                    }
                }
            };
            let stdout = outcome.stdout.clone();
            (outcome, Some(stdout), sandbox_name)
        }
        InstallerKind::K8s => unreachable!("step 4 already rejected K8s"),
    };
    if up_outcome.timed_out || up_outcome.exit_code != Some(0) {
        let step = match manifest.installer_kind {
            InstallerKind::Compose => "compose_up",
            InstallerKind::Binary => "binary_run",
            InstallerKind::K8s => unreachable!("step 4 already rejected K8s"),
        };
        return InstallReport::Failed {
            manifest_id: manifest_id_hex,
            publisher_pubkey: publisher_hex,
            project_name: opts.project_name,
            step: step.into(),
            detail: format!(
                "exit={:?} timed_out={} stderr={}",
                up_outcome.exit_code, up_outcome.timed_out, up_outcome.stderr
            ),
            sandbox: sandbox_name,
        };
    }

    // 10. Run the bundle's own verify.sh -- SCRUBBED environment (no secret values; only the
    //     non-secret project name a verify script needs to find its own containers/ports).
    //     Invoked via `bash`, not POSIX `sh` (`sh` on a Debian/Ubuntu host is `dash`, which
    //     doesn't support `pipefail` -- and every other verify/setup script in this operator's
    //     other deployments, e.g. kali-desktop's `setup.sh`, is itself `#!/usr/bin/env bash` with
    //     `set -uo pipefail`; bundle verify scripts follow the same convention, documented in
    //     this crate's README).
    let verify_outcome = match process::run_bounded(
        "bash",
        &[manifest.verify.script.as_str()],
        &opts.work_dir,
        &[("CT_MANIFEST_PROJECT_NAME", opts.project_name.as_str())],
        Duration::from_secs(manifest.verify.timeout_secs),
    ) {
        Ok(o) => o,
        Err(e) => {
            return InstallReport::Failed {
                manifest_id: manifest_id_hex,
                publisher_pubkey: publisher_hex,
                project_name: opts.project_name,
                step: "verify".into(),
                detail: e,
                sandbox: sandbox_name,
            }
        }
    };

    if verify_outcome.timed_out || verify_outcome.exit_code != Some(0) {
        return InstallReport::Failed {
            manifest_id: manifest_id_hex,
            publisher_pubkey: publisher_hex,
            project_name: opts.project_name,
            step: "verify".into(),
            detail: format!(
                "exit={:?} timed_out={} stdout={} stderr={}",
                verify_outcome.exit_code, verify_outcome.timed_out, verify_outcome.stdout, verify_outcome.stderr
            ),
            sandbox: sandbox_name,
        };
    }

    InstallReport::Ok {
        manifest_id: manifest_id_hex,
        publisher_pubkey: publisher_hex,
        project_name: opts.project_name,
        compose_up: StepResult { exit_code: up_outcome.exit_code, duration_ms: up_outcome.duration_ms },
        verify: StepResult { exit_code: verify_outcome.exit_code, duration_ms: verify_outcome.duration_ms },
        captured_stdout,
        sandbox: sandbox_name,
    }
}

/// Join a manifest-supplied relative path (`bundle.compose_file`) onto `work_dir`, refusing an
/// absolute path or any `..` component first -- the SAME check `fetch::unpack_tar_gz_safely`
/// applies to tar entry paths, applied here to the other manifest field that names a path inside
/// the unpacked bundle. `Path::join` silently discards `work_dir` and returns an absolute `rel`
/// verbatim, so without this check a signed-but-untrusted-content manifest field could point the
/// Compose file read (step 7) or the Binary executable run (step 9) completely outside the
/// sandboxed work_dir -- at a pre-existing host file the bundle's sha256 verification (step 6)
/// never covered.
fn safe_join_within_work_dir(work_dir: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() || rel_path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!(
            "{rel} is an absolute path or contains '..' components, refusing to use it as a path inside the bundle"
        ));
    }
    let target = work_dir.join(rel_path);
    if !target.starts_with(work_dir) {
        return Err(format!("{rel} resolves outside work_dir, refusing to use it as a path inside the bundle"));
    }
    Ok(target)
}

/// Binary kind only: add the owner-execute bit without touching the rest of the file's mode
/// (mirrors `write_env_file`'s narrow-not-clobber discipline just above).
#[cfg(unix)]
fn mark_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let meta = std::fs::metadata(path).map_err(|e| format!("stat {}: {e}", path.display()))?;
    let mut perms = meta.permissions();
    perms.set_mode(perms.mode() | 0o100);
    std::fs::set_permissions(path, perms).map_err(|e| format!("chmod +x {}: {e}", path.display()))
}

#[cfg(not(unix))]
fn mark_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// Parse step 8's already-resolved `KEY=value` dotenv text back into pairs for `run_bounded`'s
/// `env` parameter -- ONE resolution (`resolve_env_template`) feeds both the `.env` file Compose
/// reads via `--env-file` and the pairs Binary gets passed directly; never re-resolve secret
/// values a second, divergent way.
fn parse_dotenv_pairs(dotenv: &str) -> Vec<(String, String)> {
    dotenv
        .lines()
        .filter_map(|line| line.split_once('='))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// F.11: refuse to proceed if `project_name` itself resembles a protected real deployment, or if
/// any container/volume/network this run would create already exists (a stale collision from a
/// previous run left running, or a genuine name clash with real infra). Checked BEFORE any
/// fetch/unpack, so a colliding activation attempt never even reaches network I/O.
fn preflight_collision_check(
    project_name: &str,
    protected_name_substrings: &[String],
    check_docker_resources: bool,
) -> Result<(), String> {
    let lower = project_name.to_lowercase();
    for protected in protected_name_substrings {
        if lower.contains(&protected.to_lowercase()) {
            return Err(format!(
                "project_name '{project_name}' contains protected substring '{protected}' -- refusing to risk colliding with real infra"
            ));
        }
    }
    if !check_docker_resources {
        return Ok(());
    }
    let existing_names = docker_names("docker", &["ps", "-a", "--format", "{{.Names}}"])?;
    let existing_volumes = docker_names("docker", &["volume", "ls", "--format", "{{.Name}}"])?;
    // Compose derives a network's default name from the project name the exact same way it does
    // for volumes (`<project>_default`, `<project>-<net>` for a named network) -- a collision here
    // is just as real a risk as a container/volume collision (a manifest could plant a network
    // that a later, legitimate `docker compose -p <protected-name>` deployment would collide with,
    // or attach to), so it gets the identical check.
    let existing_networks = docker_names("docker", &["network", "ls", "--format", "{{.Name}}"])?;
    let prefix = format!("{project_name}-");
    for name in existing_names.iter().chain(existing_volumes.iter()).chain(existing_networks.iter()) {
        if name == project_name || name.starts_with(&prefix) {
            return Err(format!(
                "a container, volume, or network named '{name}' already exists for project '{project_name}' -- refusing to proceed (stale run left over, or a genuine name collision)"
            ));
        }
        for protected in protected_name_substrings {
            if name.to_lowercase().contains(&protected.to_lowercase()) && name.to_lowercase().contains(&lower) {
                return Err(format!(
                    "'{name}' matches both this project_name and a protected substring '{protected}' -- refusing to proceed"
                ));
            }
        }
    }
    Ok(())
}

fn docker_names(program: &str, args: &[&str]) -> Result<Vec<String>, String> {
    let out = process::run_bounded(program, args, Path::new("."), &[], Duration::from_secs(15))?;
    if out.timed_out || out.exit_code != Some(0) {
        return Err(format!("{program} {args:?} failed: exit={:?} stderr={}", out.exit_code, out.stderr));
    }
    Ok(out.stdout.lines().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string).collect())
}

/// Write the resolved `.env` (real secret VALUES, not just names) so its content is never on
/// disk wider than `0600` -- mirrors ct-agent's `secret_file.rs::write_private` idiom. `mode`
/// applies at CREATE time so the common case (fresh work_dir) has no window at all; `set_permissions`
/// afterwards additionally corrects a pre-existing file left at a wider mode.
#[cfg(unix)]
fn write_env_file(path: &Path, content: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(path)?;
    f.write_all(content.as_bytes())?;
    f.sync_all()?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn write_env_file(path: &Path, content: &str) -> std::io::Result<()> {
    std::fs::write(path, content)
}

fn load_env_values(env_file: Option<&Path>) -> Result<std::collections::HashMap<String, String>, String> {
    let mut map = std::collections::HashMap::new();
    if let Some(path) = env_file {
        let content = std::fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                map.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }
    Ok(map)
}

fn resolve_env_template(
    template: &[EnvVarSpec],
    from_file: &std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let mut out = String::new();
    for spec in template {
        let value = from_file
            .get(&spec.name)
            .cloned()
            .or_else(|| std::env::var(&spec.name).ok());
        match value {
            Some(v) => {
                out.push_str(&spec.name);
                out.push('=');
                out.push_str(&v);
                out.push('\n');
            }
            None if spec.required => {
                return Err(format!(
                    "missing_required_env_var: {} ({}) -- supply it via the env_file, never embed it in the manifest",
                    spec.name, spec.description
                ));
            }
            None => {}
        }
    }
    Ok(out)
}

pub(crate) fn hex32(b: &[u8; 32]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(64);
    for byte in b {
        let _ = write!(s, "{byte:02x}");
    }
    s
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    // PATH_MUTATION_LOCK lives in `process.rs` (`crate::process::PATH_MUTATION_LOCK`) -- shared
    // crate-wide, not module-local, because the race it guards against isn't specific to this
    // module. See its doc comment there for the full story, including why a module-local version
    // of this same lock was tried first and turned out not to be enough.
    use crate::process::PATH_MUTATION_LOCK;

    #[test]
    fn collision_guard_rejects_a_protected_name() {
        let err = preflight_collision_check("litellm-proxy", &["litellm-proxy".to_string()], true).unwrap_err();
        assert!(err.contains("protected substring"));
    }

    /// CADS-agent-marketplace#11: `check_docker_resources: false` (Binary's path) must genuinely
    /// never shell out to `docker` -- not just skip its own error handling around it. Proven
    /// hermetically by pointing `PATH` at an empty directory (no `docker` resolvable at all,
    /// standing in for a host with no Docker daemon/CLI, without touching this host's real one)
    /// and confirming `true` still fails exactly the way the bug reproduced (shelling out and
    /// failing to find/run `docker`), while `false` succeeds -- the same project_name, same
    /// process, only the flag differs. A `struct` guard restores `PATH` even if an assertion
    /// panics, so a failure here can't leak a broken `PATH` into later tests.
    #[test]
    fn collision_guard_skips_docker_entirely_when_told_to() {
        let _path_lock = PATH_MUTATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        struct PathGuard(Option<String>);
        impl Drop for PathGuard {
            fn drop(&mut self) {
                match &self.0 {
                    Some(p) => std::env::set_var("PATH", p),
                    None => std::env::remove_var("PATH"),
                }
            }
        }
        let empty_dir = tempfile::tempdir().unwrap();
        let _guard = PathGuard(std::env::var("PATH").ok());
        std::env::set_var("PATH", empty_dir.path());

        let project = format!("phase5-no-docker-{}", std::process::id());

        let with_docker_check = preflight_collision_check(&project, &[], true);
        assert!(
            with_docker_check.is_err(),
            "with no docker on PATH, the docker-resource check must still fail closed, not silently pass"
        );

        let without_docker_check = preflight_collision_check(&project, &[], false);
        assert!(
            without_docker_check.is_ok(),
            "Binary's path (check_docker_resources=false) must succeed even with zero docker on PATH: {without_docker_check:?}"
        );
    }

    #[test]
    fn resolve_env_template_fails_closed_on_missing_required_var() {
        let template = vec![EnvVarSpec { name: "X".into(), required: true, description: "d".into() }];
        let empty = std::collections::HashMap::new();
        assert!(resolve_env_template(&template, &empty).is_err());
    }

    #[test]
    fn resolve_env_template_allows_missing_optional_var() {
        let template = vec![EnvVarSpec { name: "X".into(), required: false, description: "d".into() }];
        let empty = std::collections::HashMap::new();
        assert_eq!(resolve_env_template(&template, &empty).unwrap(), "");
    }

    #[test]
    fn resolve_env_template_never_reads_the_value_from_anywhere_but_the_supplied_map_or_process_env() {
        let template = vec![EnvVarSpec { name: "SECRET".into(), required: true, description: "d".into() }];
        let mut file_values = std::collections::HashMap::new();
        file_values.insert("SECRET".to_string(), "s3cr3t".to_string());
        let dotenv = resolve_env_template(&template, &file_values).unwrap();
        assert_eq!(dotenv, "SECRET=s3cr3t\n");
    }

    /// #4: the resolved `.env` carries real secret VALUES (not just names) -- it must never be
    /// readable by anyone but the owner, on a fresh file or one that already existed wider.
    #[test]
    #[cfg(unix)]
    fn write_env_file_is_never_group_or_world_readable_on_a_fresh_file() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("cads-marketplace-envfile-fresh-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(".env");

        write_env_file(&path, "SECRET=s3cr3t\n").unwrap();

        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "fresh .env must be owner-only, got {mode:o}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn write_env_file_narrows_a_pre_existing_wider_mode_file() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("cads-marketplace-envfile-preexisting-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(".env");
        std::fs::write(&path, "STALE=old\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();

        write_env_file(&path, "SECRET=s3cr3t\n").unwrap();

        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "a re-activated .env must be narrowed to owner-only, got {mode:o}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parse_dotenv_pairs_round_trips_resolve_env_templates_output() {
        let template = vec![
            EnvVarSpec { name: "A".into(), required: true, description: "d".into() },
            EnvVarSpec { name: "B".into(), required: true, description: "d".into() },
        ];
        let mut values = std::collections::HashMap::new();
        values.insert("A".to_string(), "1".to_string());
        values.insert("B".to_string(), "two=equals=ok".to_string());
        let dotenv = resolve_env_template(&template, &values).unwrap();
        let pairs = parse_dotenv_pairs(&dotenv);
        assert_eq!(pairs.len(), 2);
        assert!(pairs.contains(&("A".to_string(), "1".to_string())));
        assert!(pairs.contains(&("B".to_string(), "two=equals=ok".to_string())));
    }

    #[test]
    #[cfg(unix)]
    fn mark_executable_adds_owner_execute_without_touching_the_rest_of_the_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("script.sh");
        std::fs::write(&path, "#!/bin/sh\necho hi\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();

        mark_executable(&path).unwrap();

        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o740, "owner-execute bit should be added, group/other bits left as they were, got {mode:o}");
    }

    // -- Binary installer_kind: real, full `activate()` runs (no docker container involved --
    // this is exactly the proof this crate's docker-based Compose path can't cheaply give in a
    // unit test) -------------------------------------------------------------------------------

    fn make_tar_gz(entries: &[(&str, &[u8])]) -> Vec<u8> {
        use std::io::Write;
        let mut tar_bytes = Vec::new();
        {
            let mut builder = tar::Builder::new(&mut tar_bytes);
            for (name, content) in entries {
                let mut header = tar::Header::new_gnu();
                header.set_size(content.len() as u64);
                header.set_mode(0o755);
                header.set_cksum();
                builder.append_data(&mut header, name, *content).unwrap();
            }
            builder.finish().unwrap();
        }
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        encoder.finish().unwrap()
    }

    /// Builds a real, signed `Binary`-kind manifest + tarball on disk (a "hello world" shell
    /// script as the "binary" -- `run_bounded` just execs whatever `mark_executable` made
    /// runnable, it does not care whether that's an ELF or a script with a shebang) and returns
    /// `(manifest_path, signer_pubkey)`. `dir` is where both files + the work_dir live (must
    /// already exist). `manifest_id` is caller-supplied (rather than a fixed constant) so callers
    /// needing more than one distinct fixture in the same registry/composition -- e.g.
    /// `composition.rs`'s tests -- don't collide on manifest id.
    pub(crate) fn write_binary_fixture(dir: &Path, manifest_id: [u8; 32], stdout_line: &str) -> (PathBuf, [u8; 32]) {
        write_binary_fixture_with_environment(dir, manifest_id, stdout_line, None)
    }

    /// `write_binary_fixture` plus an optional signed `environment` contract (scimbe/ct-agent#183).
    fn write_binary_fixture_with_environment(
        dir: &Path,
        manifest_id: [u8; 32],
        stdout_line: &str,
        environment: Option<EnvironmentContract>,
    ) -> (PathBuf, [u8; 32]) {
        use ed25519_dalek::SigningKey;
        use manifest_core::{BundleRef, ServiceManifest, VerifySpec};
        use rand::RngCore;
        use sha2::{Digest, Sha256};

        // ed25519_dalek::SigningKey::generate needs the `rand_core` feature; this crate matches
        // manifest-core's own test convention (see its `random_signing_key`) of using rand's own
        // OsRng directly + `from_bytes`, which needs no feature flag.
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        let signing_key = SigningKey::from_bytes(&seed);
        let pubkey = signing_key.verifying_key().to_bytes();

        let script = format!("#!/bin/sh\necho '{stdout_line}'\nexit 0\n");
        let verify_script = "#!/bin/sh\nexit 0\n";
        let tarball = make_tar_gz(&[("run.sh", script.as_bytes()), ("verify.sh", verify_script.as_bytes())]);
        let bundle_path = dir.join("bundle.tar.gz");
        std::fs::write(&bundle_path, &tarball).unwrap();

        let mut hasher = Sha256::new();
        hasher.update(&tarball);
        let sha256: [u8; 32] = hasher.finalize().into();

        let manifest = ServiceManifest::sign_new(
            &signing_key,
            manifest_id,
            "phase5-hello".to_string(),
            "0.1.0".to_string(),
            InstallerKind::Binary,
            BundleRef {
                url: bundle_path.to_str().unwrap().to_string(),
                sha256,
                compose_file: "run.sh".to_string(),
            },
            vec![],
            VerifySpec { script: "verify.sh".to_string(), timeout_secs: 30 },
            0,
            u64::MAX / 2,
            None,
            environment,
        );
        let manifest_path = dir.join("manifest.json");
        std::fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        (manifest_path, pubkey)
    }

    fn protected_names() -> Vec<String> {
        vec!["litellm-proxy".to_string(), "kali".to_string(), "sort-demo".to_string(), "game2048".to_string()]
    }

    /// A `Selection` a test can hand to `activate_with_selector` to stand in for "this host has no
    /// usable backend" -- with a bwrap-shaped probe reason, so the refusal text can be checked for
    /// carrying the probe's own diagnosis through.
    fn no_backend_available() -> sandbox::Selection {
        sandbox::Selection::Unsandboxed {
            tried: vec![(
                "bwrap",
                "real sandboxed-exec probe (bwrap --unshare-user --unshare-pid --unshare-net ...) failed: exit=Some(1) \
                 stderr=bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted -- hint: this is the symptom of \
                 Ubuntu 24.04+'s `kernel.apparmor_restrict_unprivileged_userns=1` ... `bwrap-userns-restrict` ..."
                    .to_string(),
            )],
        }
    }

    #[test]
    fn a_trusted_signed_binary_manifest_actually_runs_and_its_stdout_is_captured() {
        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, pubkey) = write_binary_fixture(dir.path(), [0x42; 32], "hello-from-phase5");

        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();

        let report = activate(ActivateOptions {
            manifest_location: manifest_path.to_str().unwrap().to_string(),
            allowlist,
            env_file: None,
            project_name: format!("phase5-binary-test-{}", std::process::id()),
            protected_name_substrings: vec!["litellm-proxy".to_string(), "kali".to_string(), "sort-demo".to_string(), "game2048".to_string()],
            work_dir: dir.path().join("work"),
            now: 1,
            require_binary_sandbox: false,
        });

        match report {
            InstallReport::Ok { compose_up, captured_stdout, .. } => {
                assert_eq!(compose_up.exit_code, Some(0));
                assert_eq!(captured_stdout.as_deref(), Some("hello-from-phase5\n"));
            }
            other => panic!("expected InstallReport::Ok, got {other:?}"),
        }
    }

    #[test]
    fn an_untrusted_publishers_binary_manifest_is_refused_before_it_ever_runs() {
        let dir = tempfile::tempdir().unwrap();
        // stdout_line is irrelevant here -- if this binary ever actually ran, that alone is the
        // bug this test exists to catch, regardless of what it printed.
        let (manifest_path, _untrusted_pubkey) = write_binary_fixture(dir.path(), [0x42; 32], "should-not-run");

        // A real, well-formed, but EMPTY allowlist -- the signer above is a genuine, validly
        // signing key, just not on it. Built from a different, unrelated pubkey so this is a
        // realistic "allowlist configured for other publishers" state, not just "no allowlist".
        let allowlist = TrustAllowlist::parse(&hex32(&[0x99; 32])).unwrap();

        let report = activate(ActivateOptions {
            manifest_location: manifest_path.to_str().unwrap().to_string(),
            allowlist,
            env_file: None,
            project_name: format!("phase5-binary-untrusted-{}", std::process::id()),
            protected_name_substrings: vec!["litellm-proxy".to_string(), "kali".to_string(), "sort-demo".to_string(), "game2048".to_string()],
            work_dir: dir.path().join("work"),
            now: 1,
            require_binary_sandbox: false,
        });

        match report {
            InstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("publisher_not_on_trust_allowlist"), "{reason}");
            }
            other => panic!("expected InstallReport::Rejected (identically to how an untrusted Compose manifest is refused), got {other:?}"),
        }
        assert!(!dir.path().join("work").exists(), "nothing should have been fetched/unpacked before the allowlist check");
    }

    /// Same as `write_binary_fixture` but lets the caller supply an arbitrary
    /// `bundle.compose_file` value -- used below to prove a traversal/absolute value is refused
    /// before anything is chmod+x'd or run, rather than trusting `write_binary_fixture`'s always
    /// -safe `"run.sh"`.
    fn write_binary_fixture_with_compose_file(dir: &Path, compose_file: &str) -> (PathBuf, [u8; 32]) {
        use ed25519_dalek::SigningKey;
        use manifest_core::{BundleRef, ServiceManifest, VerifySpec};
        use rand::RngCore;
        use sha2::{Digest, Sha256};

        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        let signing_key = SigningKey::from_bytes(&seed);
        let pubkey = signing_key.verifying_key().to_bytes();

        // The bundle itself is benign and unrelated to `compose_file` -- the attack this test
        // guards against is `compose_file` pointing OUTSIDE the unpacked bundle entirely, at a
        // pre-existing host path never covered by this sha256 at all.
        let verify_script = "#!/bin/sh\nexit 0\n";
        let tarball = make_tar_gz(&[("verify.sh", verify_script.as_bytes())]);
        let bundle_path = dir.join("bundle.tar.gz");
        std::fs::write(&bundle_path, &tarball).unwrap();

        let mut hasher = Sha256::new();
        hasher.update(&tarball);
        let sha256: [u8; 32] = hasher.finalize().into();

        let manifest = ServiceManifest::sign_new(
            &signing_key,
            [0x42; 32],
            "phase5-traversal".to_string(),
            "0.1.0".to_string(),
            InstallerKind::Binary,
            BundleRef { url: bundle_path.to_str().unwrap().to_string(), sha256, compose_file: compose_file.to_string() },
            vec![],
            VerifySpec { script: "verify.sh".to_string(), timeout_secs: 30 },
            0,
            u64::MAX / 2,
            None,
            None,
        );
        let manifest_path = dir.join("manifest.json");
        std::fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        (manifest_path, pubkey)
    }

    /// The security-relevant regression this module exists to cover: a manifest whose
    /// `bundle.compose_file` is an ABSOLUTE path pointing at a pre-existing host file. Without
    /// the `safe_join_within_work_dir` check, `work_dir.join(absolute)` silently discards
    /// `work_dir` and returns the absolute path verbatim (`std::path::PathBuf::join`'s documented
    /// behavior) -- so a trusted-but-malicious publisher's Binary manifest could chmod+x and run
    /// that host file directly, completely bypassing the bundle's sha256 verification. This test
    /// proves activation is REJECTED before the canary file is ever touched.
    #[test]
    #[cfg(unix)]
    fn a_binary_manifests_absolute_compose_file_is_rejected_before_it_can_be_run() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        // A "pre-existing host file" outside anything activate() will ever unpack -- a stand-in
        // for e.g. a real system binary. If this test ever regresses, the assertion on its
        // permissions below (never touched) is what would catch it, not just the reject reason.
        let canary = dir.path().join("host-canary.sh");
        std::fs::write(&canary, "#!/bin/sh\ntouch /tmp/should-never-run-from-a-manifest\n").unwrap();
        std::fs::set_permissions(&canary, std::fs::Permissions::from_mode(0o644)).unwrap();

        let (manifest_path, pubkey) = write_binary_fixture_with_compose_file(dir.path(), canary.to_str().unwrap());
        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();

        let report = activate(ActivateOptions {
            manifest_location: manifest_path.to_str().unwrap().to_string(),
            allowlist,
            env_file: None,
            project_name: format!("phase5-traversal-abs-{}", std::process::id()),
            protected_name_substrings: vec!["litellm-proxy".to_string(), "kali".to_string(), "sort-demo".to_string(), "game2048".to_string()],
            work_dir: dir.path().join("work"),
            now: 1,
            require_binary_sandbox: false,
        });

        match report {
            InstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("bundle.compose_file"), "{reason}");
            }
            other => panic!("expected InstallReport::Rejected, got {other:?} -- an absolute compose_file must never reach binary_chmod/binary_run"),
        }
        let mode = std::fs::metadata(&canary).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o644, "the out-of-bundle canary file must never be chmod+x'd");
    }

    /// Same regression, `..`-traversal flavor rather than a bare absolute path -- both branches
    /// of `safe_join_within_work_dir`'s check need coverage since they're independent guards.
    #[test]
    fn a_binary_manifests_dotdot_compose_file_is_rejected_before_it_can_be_run() {
        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, pubkey) = write_binary_fixture_with_compose_file(dir.path(), "../escaped.sh");
        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();

        let report = activate(ActivateOptions {
            manifest_location: manifest_path.to_str().unwrap().to_string(),
            allowlist,
            env_file: None,
            project_name: format!("phase5-traversal-dotdot-{}", std::process::id()),
            protected_name_substrings: vec!["litellm-proxy".to_string(), "kali".to_string(), "sort-demo".to_string(), "game2048".to_string()],
            work_dir: dir.path().join("work"),
            now: 1,
            require_binary_sandbox: false,
        });

        match report {
            InstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("bundle.compose_file"), "{reason}");
            }
            other => panic!("expected InstallReport::Rejected, got {other:?}"),
        }
    }

    #[test]
    fn an_unsigned_k8s_manifest_is_still_refused_with_the_schema_only_reason() {
        use ed25519_dalek::SigningKey;
        use manifest_core::{BundleRef, ServiceManifest, VerifySpec};
        use rand::RngCore;

        let dir = tempfile::tempdir().unwrap();
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        let signing_key = SigningKey::from_bytes(&seed);
        let manifest = ServiceManifest::sign_new(
            &signing_key,
            [0x43; 32],
            "phase5-k8s-placeholder".to_string(),
            "0.1.0".to_string(),
            InstallerKind::K8s,
            BundleRef { url: "unused://".to_string(), sha256: [0u8; 32], compose_file: "unused".to_string() },
            vec![],
            VerifySpec { script: "unused".to_string(), timeout_secs: 1 },
            0,
            u64::MAX / 2,
            None,
            None,
        );
        let manifest_path = dir.path().join("manifest.json");
        std::fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();

        let allowlist = TrustAllowlist::parse(&hex32(&manifest.publisher_pubkey)).unwrap();

        let report = activate(ActivateOptions {
            manifest_location: manifest_path.to_str().unwrap().to_string(),
            allowlist,
            env_file: None,
            project_name: format!("phase5-k8s-test-{}", std::process::id()),
            protected_name_substrings: vec![],
            work_dir: dir.path().join("work"),
            now: 1,
            require_binary_sandbox: false,
        });

        match report {
            InstallReport::Rejected { reason, .. } => assert!(reason.contains("K8s is schema-only"), "{reason}"),
            other => panic!("expected InstallReport::Rejected, got {other:?}"),
        }
    }

    // -- Milestone 1: real sandboxed-activation proof (docs/design/sandbox-fallback.md's testing
    // plan item 2) -------------------------------------------------------------------------------

    /// A `run.sh` that asserts, from INSIDE the (possibly) sandboxed process, exactly the two
    /// F.1/F.3-equivalent properties `docs/design/sandbox-fallback.md` claims for the bwrap
    /// backend: (a) this process is in a DIFFERENT network namespace than the host (proven by
    /// comparing `/proc/self/ns/net`'s symlink target -- a real, per-task kernel property that's
    /// accurate regardless of how `/proc` itself got into this mount namespace -- against
    /// `$HOST_NET_NS`, captured on the host side BEFORE `activate()` ran); (b) a write to
    /// `$OUTSIDE_TARGET` (a path under the SAME tempdir as `work_dir`, but not inside it) fails;
    /// (c) a write inside the current directory (bwrap `--chdir`s into `work_dir`) succeeds. Each
    /// check prints its own `OK: ...`/`FAIL: ...` line so a failing run's captured stdout says
    /// exactly which property broke, not just "exit 1".
    ///
    /// **Not `ls /sys/class/net`** (an earlier version of this test used that, and was itself
    /// wrong -- CADS-agent-marketplace#20's CI run caught it): `wrap_command`'s `--ro-bind / /`
    /// bind-mounts the HOST's already-mounted `/sys` as-is. A sysfs instance's device LISTING is
    /// captured at MOUNT time against whichever network namespace was active then (the host's) --
    /// a bind mount doesn't create a new sysfs instance, so `/sys/class/net` keeps showing host
    /// interfaces forever, regardless of whether `--unshare-net` genuinely put this process in a
    /// new namespace. `/proc/self/ns/net` has no such staleness: namespace membership is a live
    /// per-task property the kernel reports accurately no matter which mount instance of `/proc`
    /// you read it through. This was confirmed empirically, not assumed: PR#20's CI failure showed
    /// THIS SCRIPT'S OWN "FAIL: non-loopback interfaces visible" message on stderr (not a bwrap
    /// launch error) -- proving bwrap had already successfully unshared namespaces, set up
    /// loopback (which itself requires the CAP_NET_ADMIN a genuinely-created user+net namespace
    /// grants), and exec'd this script; a broken/no-op `--unshare-net` fails LOUDLY at bwrap's own
    /// loopback-setup step, before ever reaching the wrapped command at all (reproduced directly
    /// against this host's own AppArmor-restricted bwrap while building this feature).
    fn sandbox_probe_script() -> &'static str {
        "#!/bin/sh\n\
         set -u\n\
         my_net_ns=$(readlink /proc/self/ns/net)\n\
         if [ \"$my_net_ns\" = \"$HOST_NET_NS\" ]; then\n\
         \techo \"FAIL: sandboxed process is in the SAME network namespace as the host ($my_net_ns)\" >&2\n\
         \texit 1\n\
         fi\n\
         echo \"OK: sandboxed process has its own network namespace ($my_net_ns != host $HOST_NET_NS)\"\n\
         if echo probe > \"$OUTSIDE_TARGET\" 2>/dev/null; then\n\
         \techo \"FAIL: write outside work_dir unexpectedly succeeded\" >&2\n\
         \texit 1\n\
         fi\n\
         echo \"OK: write outside work_dir failed as expected\"\n\
         if ! echo probe > ./inside-write-proof; then\n\
         \techo \"FAIL: write inside work_dir failed\" >&2\n\
         \texit 1\n\
         fi\n\
         echo \"OK: write inside work_dir succeeded\"\n\
         exit 0\n"
    }

    /// Same shape as `write_binary_fixture`, but declares `OUTSIDE_TARGET` and `HOST_NET_NS` in
    /// `env_template` (so `activate`'s normal env-resolution path -- step 8, `--env-file`-
    /// equivalent for Binary -- carries them into the sandboxed process, exactly like any other
    /// manifest-declared var; no second, sandbox-specific env-passing mechanism).
    fn write_binary_fixture_sandbox_probe(dir: &Path) -> (PathBuf, [u8; 32]) {
        use ed25519_dalek::SigningKey;
        use manifest_core::{BundleRef, EnvVarSpec, ServiceManifest, VerifySpec};
        use rand::RngCore;
        use sha2::{Digest, Sha256};

        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        let signing_key = SigningKey::from_bytes(&seed);
        let pubkey = signing_key.verifying_key().to_bytes();

        let verify_script = "#!/bin/sh\nexit 0\n";
        let tarball = make_tar_gz(&[("run.sh", sandbox_probe_script().as_bytes()), ("verify.sh", verify_script.as_bytes())]);
        let bundle_path = dir.join("bundle.tar.gz");
        std::fs::write(&bundle_path, &tarball).unwrap();

        let mut hasher = Sha256::new();
        hasher.update(&tarball);
        let sha256: [u8; 32] = hasher.finalize().into();

        let manifest = ServiceManifest::sign_new(
            &signing_key,
            [0x42; 32],
            "phase5-sandbox-probe".to_string(),
            "0.1.0".to_string(),
            InstallerKind::Binary,
            BundleRef { url: bundle_path.to_str().unwrap().to_string(), sha256, compose_file: "run.sh".to_string() },
            vec![
                EnvVarSpec {
                    name: "OUTSIDE_TARGET".to_string(),
                    required: true,
                    description: "absolute path outside work_dir the probe script must fail to write to".to_string(),
                },
                EnvVarSpec {
                    name: "HOST_NET_NS".to_string(),
                    required: true,
                    description: "this test process's own /proc/self/ns/net target, captured on the host side, for the sandboxed process to prove it differs from".to_string(),
                },
            ],
            VerifySpec { script: "verify.sh".to_string(), timeout_secs: 30 },
            0,
            u64::MAX / 2,
            None,
            None,
        );
        let manifest_path = dir.join("manifest.json");
        std::fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        (manifest_path, pubkey)
    }

    /// The direct, executable proof of the F.1/F.3-equivalent claims in
    /// `docs/design/sandbox-fallback.md`'s Linux `bwrap` section -- not just "the flags look
    /// right" (that's `wrap_command_builds_the_exact_documented_argv` in `sandbox::bwrap`), a real
    /// sandboxed run whose OWN stdout proves isolation held. This host's bwrap availability is
    /// probed for real, not mocked: if THIS host has no usable sandbox backend (bwrap missing, or
    /// unprivileged user-namespace creation blocked -- e.g. by Ubuntu's
    /// `kernel.apparmor_restrict_unprivileged_userns`, verified present on this operator's own dev
    /// host during this feature's implementation, with no non-root way to lift it -- see
    /// `sandbox::bwrap::probe`'s doc comment), this test SKIPS rather than false-failing on an
    /// environment property outside this crate's control. It runs for real wherever a sandbox
    /// backend IS available, in particular Linux CI (`.github/workflows/ci.yml` installs `bwrap`
    /// via `apt` and relaxes that same AppArmor restriction for exactly this test).
    #[test]
    fn a_binary_manifest_is_genuinely_confined_by_bwrap_when_a_sandbox_backend_is_available() {
        // Held for the whole test, including the skip-check below AND the real `activate()` call
        // at the bottom -- both call `sandbox::select()`, which resolves `bwrap` via ambient PATH,
        // and `activate()`'s real spawn of `bwrap` does too. See `PATH_MUTATION_LOCK`'s doc comment.
        let _path_lock = PATH_MUTATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        if !matches!(crate::sandbox::select(), crate::sandbox::Selection::Sandboxed(_)) {
            eprintln!(
                "skipping a_binary_manifest_is_genuinely_confined_by_bwrap_when_a_sandbox_backend_is_available: \
                 no sandbox backend available on this host (see sandbox::bwrap::probe)"
            );
            return;
        }

        let dir = tempfile::tempdir().unwrap();
        // Outside work_dir, but still inside the same tempdir (so it's cleaned up together) --
        // exactly the "a real, existing path this run must never be able to touch" shape.
        let outside_target = dir.path().join("outside-canary.txt");
        let (manifest_path, pubkey) = write_binary_fixture_sandbox_probe(dir.path());
        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();

        // This TEST process's own network namespace -- the baseline the sandboxed process proves
        // it does NOT share. Captured here, on the host side, not hardcoded, so this works
        // identically whatever namespace the CI runner (or a dev host) happens to start in.
        let host_net_ns = std::fs::read_link("/proc/self/ns/net")
            .expect("this test host must have a real /proc/self/ns/net to compare against")
            .to_str()
            .unwrap()
            .to_string();

        let env_file_path = dir.path().join("probe.env");
        std::fs::write(
            &env_file_path,
            format!("OUTSIDE_TARGET={}\nHOST_NET_NS={host_net_ns}\n", outside_target.display()),
        )
        .unwrap();

        let report = activate(ActivateOptions {
            manifest_location: manifest_path.to_str().unwrap().to_string(),
            allowlist,
            env_file: Some(env_file_path),
            project_name: format!("phase5-sandbox-probe-{}", std::process::id()),
            protected_name_substrings: vec!["litellm-proxy".to_string(), "kali".to_string(), "sort-demo".to_string(), "game2048".to_string()],
            work_dir: dir.path().join("work"),
            now: 1,
            require_binary_sandbox: false,
        });

        match report {
            InstallReport::Ok { sandbox, captured_stdout, .. } => {
                assert_eq!(sandbox.as_deref(), Some("bwrap"), "expected the run to be reported as bwrap-sandboxed");
                let stdout = captured_stdout.unwrap_or_default();
                assert!(stdout.contains("OK: sandboxed process has its own network namespace"), "stdout={stdout}");
                assert!(stdout.contains("OK: write outside work_dir failed as expected"), "stdout={stdout}");
                assert!(stdout.contains("OK: write inside work_dir succeeded"), "stdout={stdout}");
            }
            other => panic!("expected InstallReport::Ok proving F.1/F.3-equivalent isolation under bwrap, got {other:?}"),
        }
        assert!(
            !outside_target.exists(),
            "the sandboxed run must never have actually created the outside-work_dir canary file"
        );
    }

    /// scimbe/ct-agent#183 phase 1, fail closed by default: with no usable backend and no opt-out,
    /// a Binary manifest is REFUSED before the executable is chmod+x'd or run, and the refusal
    /// names both the probe's own failure (bwrap's stderr + the userns/AppArmor hint) and the
    /// opt-out. Deterministic on every host via the injected selection -- no skip.
    #[test]
    fn require_binary_sandbox_refuses_to_run_unsandboxed_when_no_backend_is_available() {
        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, pubkey) = write_binary_fixture(dir.path(), [0x42; 32], "should-never-print-this");
        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();

        let report = activate_with_selector(
            ActivateOptions {
                manifest_location: manifest_path.to_str().unwrap().to_string(),
                allowlist,
                env_file: None,
                project_name: format!("phase5-require-sandbox-{}", std::process::id()),
                protected_name_substrings: protected_names(),
                work_dir: dir.path().join("work"),
                now: 1,
                require_binary_sandbox: true,
            },
            &no_backend_available,
        );

        match report {
            InstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("require_binary_sandbox"), "{reason}");
                assert!(reason.contains("Failed RTM_NEWADDR"), "the probe's own diagnosis must be in the refusal: {reason}");
                assert!(reason.contains("bwrap-userns-restrict"), "the remediation hint must survive into the refusal: {reason}");
                assert!(reason.contains("CT_ALLOW_UNSANDBOXED=1"), "the opt-out must be named: {reason}");
            }
            other => panic!("expected InstallReport::Rejected (fail-closed), got {other:?}"),
        }
    }

    /// The explicit opt-out (`CT_ALLOW_UNSANDBOXED=1` -> `require_binary_sandbox: false`) keeps
    /// the pre-#183 behaviour: warn loudly, then run unsandboxed. Same injected "no backend"
    /// selection, only the flag differs.
    #[test]
    fn allow_unsandboxed_opt_out_proceeds_with_the_warning_when_no_backend_is_available() {
        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, pubkey) = write_binary_fixture(dir.path(), [0x42; 32], "ran-unsandboxed-by-explicit-opt-out");
        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();

        let report = activate_with_selector(
            ActivateOptions {
                manifest_location: manifest_path.to_str().unwrap().to_string(),
                allowlist,
                env_file: None,
                project_name: format!("phase5-allow-unsandboxed-{}", std::process::id()),
                protected_name_substrings: protected_names(),
                work_dir: dir.path().join("work"),
                now: 1,
                require_binary_sandbox: false,
            },
            &no_backend_available,
        );

        match report {
            InstallReport::Ok { sandbox, captured_stdout, .. } => {
                assert_eq!(sandbox, None, "an opted-out unsandboxed run must be reported as such");
                assert_eq!(captured_stdout.as_deref(), Some("ran-unsandboxed-by-explicit-opt-out\n"));
            }
            other => panic!("expected InstallReport::Ok via the opt-out, got {other:?}"),
        }
    }

    #[test]
    fn require_binary_sandbox_from_env_is_fail_closed_unless_the_opt_out_is_set() {
        let env = |vars: &[(&str, &str)]| {
            let owned: Vec<(String, String)> = vars.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
            move |name: &str| owned.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone())
        };
        assert!(require_binary_sandbox_from_env(env(&[])), "nothing set: fail closed");
        assert!(require_binary_sandbox_from_env(env(&[("CT_REQUIRE_BINARY_SANDBOX", "1")])), "legacy flag: still fail closed (no-op)");
        assert!(require_binary_sandbox_from_env(env(&[("CT_ALLOW_UNSANDBOXED", "0")])), "opt-out needs exactly 1");
        assert!(require_binary_sandbox_from_env(env(&[("CT_ALLOW_UNSANDBOXED", "true")])), "opt-out needs exactly 1");
        assert!(!require_binary_sandbox_from_env(env(&[("CT_ALLOW_UNSANDBOXED", "1")])), "the opt-out");
        assert!(!require_binary_sandbox_from_env(env(&[("CT_ALLOW_UNSANDBOXED", " 1 ")])), "whitespace-tolerant");
        assert!(
            require_binary_sandbox_from_env(env(&[("CT_ALLOW_UNSANDBOXED", "1"), ("CT_REQUIRE_BINARY_SANDBOX", "1")])),
            "an explicit require wins over an explicit allow"
        );
    }

    // -- scimbe/ct-agent#183 phase 1: environment contract, None-semantics only ----------------

    /// Returns the report and the tempdir (kept alive so a caller can inspect `<dir>/work`).
    const B3_TEXT: &str = "binary manifests are not supported on windows (scimbe/ct-agent#183, decision B3): install \
                           this service as a compose manifest, or use `manifest plan`; CT_ALLOW_UNSANDBOXED does not \
                           apply on this platform";

    #[test]
    fn binary_manifest_platform_verdict_refuses_windows_only_with_the_exact_b3_text() {
        assert_eq!(binary_manifest_platform_verdict("windows"), Err(B3_TEXT.to_string()));
        assert_eq!(binary_manifest_platform_verdict("linux"), Ok(()));
        assert_eq!(binary_manifest_platform_verdict("macos"), Ok(()));
        // Matched exactly like `std::env::consts::OS` spells it -- no case folding, no aliases.
        assert_eq!(binary_manifest_platform_verdict("Windows"), Ok(()));
    }

    #[test]
    fn binary_manifest_platform_refusal_carries_the_stable_prefix_and_applies_to_binary_only() {
        let expected = format!("unsupported_platform: {B3_TEXT}");
        let on_windows = binary_manifest_platform_refusal(InstallerKind::Binary, "windows");
        assert_eq!(on_windows.as_deref(), Some(expected.as_str()));
        assert_eq!(binary_manifest_platform_refusal(InstallerKind::Compose, "windows"), None);
        assert_eq!(binary_manifest_platform_refusal(InstallerKind::K8s, "windows"), None);
        assert_eq!(binary_manifest_platform_refusal(InstallerKind::Binary, "linux"), None);
    }

    /// Decision B3: on Windows a Binary manifest is refused before the sandbox is even probed --
    /// the injected selector panics if step 9 is reached -- and the reason names the compose
    /// alternative and `manifest plan`, and says the opt-out does NOT apply (so it is not the
    /// generic `require_binary_sandbox` refusal, which would point at `CT_ALLOW_UNSANDBOXED=1`).
    /// `require_binary_sandbox: false` here proves the opt-out is ignored on this platform.
    #[test]
    fn a_binary_manifest_is_refused_on_windows_before_the_sandbox_is_probed_regardless_of_the_opt_out() {
        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, pubkey) = write_binary_fixture(dir.path(), [0x42; 32], "should-never-print-this");
        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();

        let report = activate_with_selector_on(
            ActivateOptions {
                manifest_location: manifest_path.to_str().unwrap().to_string(),
                allowlist,
                env_file: None,
                project_name: format!("b3-windows-refusal-{}", std::process::id()),
                protected_name_substrings: protected_names(),
                work_dir: dir.path().join("work"),
                now: 1,
                require_binary_sandbox: false,
            },
            &|| -> sandbox::Selection { panic!("B3: the sandbox must never be probed on windows") },
            "windows",
        );

        match report {
            InstallReport::Rejected { reason, manifest_id } => {
                assert_eq!(reason, format!("unsupported_platform: {B3_TEXT}"));
                assert!(manifest_id.is_some(), "the manifest was fetched and verified, so its id is known");
                assert!(!reason.contains("CT_ALLOW_UNSANDBOXED=1"), "must not advertise the opt-out: {reason}");
            }
            other => panic!("expected InstallReport::Rejected (B3), got {other:?}"),
        }
        assert!(!dir.path().join("work").exists(), "nothing may be fetched or unpacked after a B3 refusal");
    }

    fn activate_binary_with_environment(
        environment: Option<EnvironmentContract>,
        stdout_line: &str,
    ) -> (InstallReport, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, pubkey) = write_binary_fixture_with_environment(dir.path(), [0x42; 32], stdout_line, environment);
        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();
        let report = activate(ActivateOptions {
            manifest_location: manifest_path.to_str().unwrap().to_string(),
            allowlist,
            env_file: None,
            project_name: format!("phase5-env-contract-{}-{}", std::process::id(), stdout_line.len()),
            protected_name_substrings: protected_names(),
            work_dir: dir.path().join("work"),
            now: 1,
            // Opt-out, so this test is about the contract check, not about this host's bwrap.
            require_binary_sandbox: false,
        });
        (report, dir)
    }

    #[test]
    fn a_host_loopback_contract_is_refused_before_anything_is_fetched() {
        let mut env = EnvironmentContract::default();
        env.network.mode = NetworkMode::HostLoopback;
        env.network.host_loopback_ports.push(manifest_core::HostLoopbackPort { port: 4103, justification: "LiteLLM".into() });
        let (report, dir) = activate_binary_with_environment(Some(env), "must-not-run-host-loopback");
        match report {
            InstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("environment_contract_unsupported"), "{reason}");
                assert!(reason.contains("host_loopback"), "{reason}");
                assert!(reason.contains("phase 1"), "{reason}");
            }
            other => panic!("expected Rejected, got {other:?}"),
        }
        assert!(!dir.path().join("work").exists(), "nothing may be fetched/unpacked for a refused contract");
    }

    #[test]
    fn an_egress_contract_is_refused_before_anything_is_fetched() {
        let mut env = EnvironmentContract::default();
        env.network.egress.push(manifest_core::EgressRule { host: "example.invalid".into(), port: 443, justification: "updates".into() });
        let (report, dir) = activate_binary_with_environment(Some(env), "must-not-run-egress");
        match report {
            InstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("environment_contract_unsupported"), "{reason}");
                assert!(reason.contains("egress"), "{reason}");
            }
            other => panic!("expected Rejected, got {other:?}"),
        }
        assert!(!dir.path().join("work").exists());
    }

    #[test]
    fn an_invalid_contract_is_refused_with_the_validation_error() {
        let mut env = EnvironmentContract::default();
        env.resources.wall_secs = 0;
        let (report, _) = activate_binary_with_environment(Some(env), "must-not-run-invalid");
        match report {
            InstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("environment_contract_invalid"), "{reason}");
                assert!(reason.contains("wall_secs"), "{reason}");
            }
            other => panic!("expected Rejected, got {other:?}"),
        }
    }

    #[test]
    fn the_default_contract_and_no_contract_both_proceed_to_a_run() {
        for (environment, line) in [(None, "no-contract"), (Some(EnvironmentContract::default()), "default-contract")] {
            let (report, _) = activate_binary_with_environment(environment, line);
            match report {
                InstallReport::Ok { captured_stdout, .. } => {
                    assert_eq!(captured_stdout.as_deref(), Some(format!("{line}\n").as_str()));
                }
                other => panic!("expected Ok for {line}, got {other:?}"),
            }
        }
    }

    #[test]
    fn environment_contract_refusal_is_none_for_absent_and_default_contracts() {
        assert_eq!(environment_contract_refusal(None), None);
        assert_eq!(environment_contract_refusal(Some(&EnvironmentContract::default())), None);
        let mut strict = EnvironmentContract::default();
        strict.network.mode = NetworkMode::None;
        assert_eq!(environment_contract_refusal(Some(&strict)), None);
    }
}
