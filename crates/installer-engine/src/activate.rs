//! Orchestrates the full `ct-agent manifest activate` control flow (steps 1-10 of the Phase 1
//! plan's section C). Every step is fail-closed: a rejection at any point stops immediately and
//! reports exactly why, before anything reaching `docker compose up` has a chance to run.

use crate::allowlist::TrustAllowlist;
use crate::report::{InstallReport, StepResult};
use crate::{fetch, guardrails, process, sandbox};
use manifest_core::{EnvVarSpec, InstallerKind};
use std::path::{Path, PathBuf};
use std::time::Duration;

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
    /// Binary kind only -- DECIDED (operator, 2026-08-28): warn-and-proceed is the default
    /// (`false`); set `true` (wired from `CT_REQUIRE_BINARY_SANDBOX=1` in
    /// `examples/dev_activate.rs`, the same way `env_file` and every other option here is wired
    /// from its own env var) for an operator who wants fail-closed instead -- refuse a Binary
    /// activation outright rather than run it with no sandbox at all. Never blocks Compose, and
    /// never blocks a Binary run when a sandbox backend IS available.
    pub require_binary_sandbox: bool,
}

pub fn activate(opts: ActivateOptions) -> InstallReport {
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
        let compose_yaml = match std::fs::read_to_string(&compose_path) {
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
            let selection = sandbox::select();
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
                    // M0: close the gap between #12's claimed and actual state -- this warning did
                    // not previously exist (see manifest-core::InstallerKind's and
                    // docs/security-model.md's now-corrected claims).
                    eprintln!(
                        "ct-agent: WARNING -- no sandbox available for Binary manifest {manifest_id_hex} \
                         (tried: {tried:?}). This executable will run with FULL ACCESS TO THIS ENTIRE \
                         HOST -- not just this install -- including your filesystem, network, and every \
                         other process. This is only as safe as your trust in the publisher \
                         (publisher_pubkey={publisher_hex}). Add `bwrap`/ensure sandbox-exec works, or \
                         set CT_REQUIRE_BINARY_SANDBOX=1 to refuse instead of proceeding unsandboxed."
                    );
                    if opts.require_binary_sandbox {
                        return InstallReport::Rejected {
                            reason: format!(
                                "require_binary_sandbox: no sandbox backend available for this host \
                                 (tried: {tried:?}) and CT_REQUIRE_BINARY_SANDBOX=1 is set -- refusing \
                                 to run this Binary manifest unsandboxed"
                            ),
                            manifest_id: Some(manifest_id_hex),
                        };
                    }
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

fn hex32(b: &[u8; 32]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(64);
    for byte in b {
        let _ = write!(s, "{byte:02x}");
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

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
    /// `(manifest_path, signer_pubkey)`. `dir` is where both files + the work_dir live.
    fn write_binary_fixture(dir: &Path, stdout_line: &str) -> (PathBuf, [u8; 32]) {
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
            [0x42; 32],
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
        );
        let manifest_path = dir.join("manifest.json");
        std::fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        (manifest_path, pubkey)
    }

    #[test]
    fn a_trusted_signed_binary_manifest_actually_runs_and_its_stdout_is_captured() {
        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, pubkey) = write_binary_fixture(dir.path(), "hello-from-phase5");

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
        let (manifest_path, _untrusted_pubkey) = write_binary_fixture(dir.path(), "should-not-run");

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

    /// A `run.sh` that asserts, from INSIDE the (possibly) sandboxed process, exactly the three
    /// F.1/F.3-equivalent properties `docs/design/sandbox-fallback.md` claims for the bwrap
    /// backend: (a) no non-loopback network interface is visible at all -- a stronger, more direct
    /// check than "a bind() call fails", since binding the wildcard address `0.0.0.0` would
    /// actually SUCCEED inside an isolated netns (it only needs `lo`), so bind-failure alone
    /// wouldn't discriminate sandboxed from unsandboxed; (b) a write to `$OUTSIDE_TARGET` (a path
    /// under the SAME tempdir as `work_dir`, but not inside it) fails; (c) a write inside the
    /// current directory (bwrap `--chdir`s into `work_dir`) succeeds. Each check prints its own
    /// `OK: ...`/`FAIL: ...` line so a failing run's captured stdout says exactly which property
    /// broke, not just "exit 1".
    fn sandbox_probe_script() -> &'static str {
        "#!/bin/sh\n\
         set -u\n\
         ifaces=$(ls /sys/class/net)\n\
         if [ \"$ifaces\" != \"lo\" ]; then\n\
         \techo \"FAIL: non-loopback interfaces visible: $ifaces\" >&2\n\
         \texit 1\n\
         fi\n\
         echo \"OK: only loopback interface visible\"\n\
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

    /// Same shape as `write_binary_fixture`, but declares `OUTSIDE_TARGET` in `env_template` (so
    /// `activate`'s normal env-resolution path -- step 8, `--env-file`-equivalent for Binary --
    /// carries it into the sandboxed process, exactly like any other manifest-declared var; no
    /// second, sandbox-specific env-passing mechanism).
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
            vec![EnvVarSpec {
                name: "OUTSIDE_TARGET".to_string(),
                required: true,
                description: "absolute path outside work_dir the probe script must fail to write to".to_string(),
            }],
            VerifySpec { script: "verify.sh".to_string(), timeout_secs: 30 },
            0,
            u64::MAX / 2,
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

        let env_file_path = dir.path().join("probe.env");
        std::fs::write(&env_file_path, format!("OUTSIDE_TARGET={}\n", outside_target.display())).unwrap();

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
                assert!(stdout.contains("OK: only loopback interface visible"), "stdout={stdout}");
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

    /// `select()` returning `Unsandboxed` (this crate's own `Unavailable` probe result, hermetically
    /// simulated the same way `sandbox::bwrap`'s own `probe_reports_unavailable_when_bwrap_is_not_on_path`
    /// test is) must refuse to run a Binary manifest at all when `require_binary_sandbox` is set --
    /// the `CT_REQUIRE_BINARY_SANDBOX=1` fail-closed policy, DECIDED (operator, 2026-08-28) as the
    /// opt-in alternative to the warn-and-proceed default.
    #[test]
    fn require_binary_sandbox_refuses_to_run_unsandboxed_when_no_backend_is_available() {
        if matches!(crate::sandbox::select(), crate::sandbox::Selection::Sandboxed(_)) {
            // This test's whole point is exercising the Unsandboxed path -- on a host where bwrap
            // genuinely IS available and usable, skip rather than fabricate a scenario this host
            // can't actually produce (mirrors the skip above, same reasoning).
            eprintln!(
                "skipping require_binary_sandbox_refuses_to_run_unsandboxed_when_no_backend_is_available: \
                 a sandbox backend IS available on this host, so Unsandboxed can't occur naturally here"
            );
            return;
        }

        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, pubkey) = write_binary_fixture(dir.path(), "should-never-print-this");
        let allowlist = TrustAllowlist::parse(&hex32(&pubkey)).unwrap();

        let report = activate(ActivateOptions {
            manifest_location: manifest_path.to_str().unwrap().to_string(),
            allowlist,
            env_file: None,
            project_name: format!("phase5-require-sandbox-{}", std::process::id()),
            protected_name_substrings: vec!["litellm-proxy".to_string(), "kali".to_string(), "sort-demo".to_string(), "game2048".to_string()],
            work_dir: dir.path().join("work"),
            now: 1,
            require_binary_sandbox: true,
        });

        match report {
            InstallReport::Rejected { reason, .. } => {
                assert!(reason.contains("require_binary_sandbox"), "{reason}");
            }
            other => panic!("expected InstallReport::Rejected (fail-closed), got {other:?}"),
        }
    }
}
