//! Orchestrates the full `ct-agent manifest activate` control flow (steps 1-10 of the Phase 1
//! plan's section C). Every step is fail-closed: a rejection at any point stops immediately and
//! reports exactly why, before anything reaching `docker compose up` has a chance to run.

use crate::allowlist::TrustAllowlist;
use crate::report::{InstallReport, StepResult};
use crate::{fetch, guardrails, process};
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

    // 4. installer_kind -- exhaustive match, no fallback arm. Non-Compose variants have no
    //    executor code path at all in Phase 1.
    match manifest.installer_kind {
        InstallerKind::Compose => {}
        InstallerKind::Binary | InstallerKind::K8s => {
            return InstallReport::Rejected {
                reason: format!("unsupported_installer_kind: {:?} (Phase 1 supports Compose only)", manifest.installer_kind),
                manifest_id: Some(manifest_id_hex),
            };
        }
    }

    // 5. Pre-flight collision guard, BEFORE fetching/unpacking/running anything.
    if let Err(e) = preflight_collision_check(&opts.project_name, &opts.protected_name_substrings) {
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

    // 7. Static guardrail scan -- BEFORE any docker command runs.
    let compose_path = opts.work_dir.join(&manifest.bundle.compose_file);
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
    if let Err(e) = std::fs::write(&env_file_path, dotenv) {
        return InstallReport::Rejected { reason: format!("write .env: {e}"), manifest_id: Some(manifest_id_hex) };
    }

    let publisher_hex = hex32(&manifest.publisher_pubkey);

    // 9. `docker compose up -d --build`, bounded, whole-process-group-killed on timeout.
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
    let up_outcome = match process::run_bounded("docker", &up_args, &opts.work_dir, &[], Duration::from_secs(300)) {
        Ok(o) => o,
        Err(e) => {
            return InstallReport::Failed {
                manifest_id: manifest_id_hex,
                publisher_pubkey: publisher_hex,
                project_name: opts.project_name,
                step: "compose_up".into(),
                detail: e,
            }
        }
    };
    if up_outcome.timed_out || up_outcome.exit_code != Some(0) {
        return InstallReport::Failed {
            manifest_id: manifest_id_hex,
            publisher_pubkey: publisher_hex,
            project_name: opts.project_name,
            step: "compose_up".into(),
            detail: format!(
                "exit={:?} timed_out={} stderr={}",
                up_outcome.exit_code, up_outcome.timed_out, up_outcome.stderr
            ),
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
        };
    }

    InstallReport::Ok {
        manifest_id: manifest_id_hex,
        publisher_pubkey: publisher_hex,
        project_name: opts.project_name,
        compose_up: StepResult { exit_code: up_outcome.exit_code, duration_ms: up_outcome.duration_ms },
        verify: StepResult { exit_code: verify_outcome.exit_code, duration_ms: verify_outcome.duration_ms },
    }
}

/// F.11: refuse to proceed if `project_name` itself resembles a protected real deployment, or if
/// any container/volume/network this run would create already exists (a stale collision from a
/// previous run left running, or a genuine name clash with real infra). Checked BEFORE any
/// fetch/unpack, so a colliding activation attempt never even reaches network I/O.
fn preflight_collision_check(project_name: &str, protected_name_substrings: &[String]) -> Result<(), String> {
    let lower = project_name.to_lowercase();
    for protected in protected_name_substrings {
        if lower.contains(&protected.to_lowercase()) {
            return Err(format!(
                "project_name '{project_name}' contains protected substring '{protected}' -- refusing to risk colliding with real infra"
            ));
        }
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
        let err = preflight_collision_check("litellm-proxy", &["litellm-proxy".to_string()]).unwrap_err();
        assert!(err.contains("protected substring"));
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
}
