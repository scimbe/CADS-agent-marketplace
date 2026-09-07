//! Dry-run planning (scimbe/ct-agent#183, phase 1): what an activation WOULD do on this host,
//! computed without fetching, unpacking, or running anything except the sandbox backend probe.
//! The basis for `ct-agent harness run --plan` / `manifest activate --plan` (the ct-agent side is
//! a follow-up); a [`Plan`] with a non-empty `refusals` list means the real activation would be
//! rejected for exactly those reasons.
//!
//! No model call, no docker call, no network: the caller already holds the manifest (it fetched
//! and verified it, or it is planning from a local activation record), so the plan takes the
//! manifest's relevant fields rather than a location to fetch from.

use crate::activate::{binary_manifest_platform_refusal, environment_contract_refusal, unsandboxed_refusal};
use crate::guardrails::{self, GuardrailPolicy};
use crate::sandbox;
use manifest_core::{EnvironmentContract, InstallerKind};
use serde::Serialize;
use std::path::PathBuf;

pub struct PlanOptions {
    pub installer_kind: InstallerKind,
    /// The manifest's `environment` contract, `None` meaning the strictest default.
    pub environment: Option<EnvironmentContract>,
    /// The manifest's `bundle.compose_file`: the compose file (Compose) or the executable
    /// (Binary), relative to `work_dir`.
    pub entrypoint: String,
    /// Where the bundle would be unpacked. Only used to render paths; never created.
    pub work_dir: PathBuf,
    /// `env_template` NAMES. Values never enter a plan -- they are previewed as `<redacted>`.
    pub env_names: Vec<String>,
    /// Same meaning as [`crate::ActivateOptions::require_binary_sandbox`].
    pub require_binary_sandbox: bool,
    /// Compose project name the real run would use (Compose only, rendered into `argv_preview`).
    pub project_name: String,
    /// Compose only: the compose file's text, when the caller already has it locally. Scanned
    /// statically with `guardrail_policy`; every violation becomes a refusal. `None` skips the
    /// scan (the plan then says so in `compose_overrides`).
    pub compose_yaml: Option<String>,
    pub guardrail_policy: GuardrailPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Plan {
    /// The sandbox backend the run would use (`"bwrap"`), or `None`: for Compose (the docker
    /// daemon runs the services; no bwrap backend applies), or for a Binary run that would
    /// proceed unsandboxed under the opt-out.
    pub backend: Option<String>,
    /// The exact command line the run would execute for the bundle's primary artifact, secret
    /// values redacted.
    pub argv_preview: Vec<String>,
    /// Compose only: the per-service hardening every service must carry (the F.8/F.15/F.16
    /// guardrail rules), rendered from the effective contract, plus what the static scan found.
    pub compose_overrides: Vec<String>,
    /// Every reason the real activation would be rejected, in the order the checks run.
    pub refusals: Vec<String>,
}

impl Plan {
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_else(|e| format!("{{\"status\":\"plan_serialize_error\",\"detail\":{e:?}}}"))
    }

    pub fn would_refuse(&self) -> bool {
        !self.refusals.is_empty()
    }
}

pub fn plan(opts: PlanOptions) -> Plan {
    plan_with_selector(opts, &sandbox::select)
}

/// [`plan`] with the sandbox-backend selection injected (see `activate_with_selector`).
pub fn plan_with_selector(opts: PlanOptions, select: &dyn Fn() -> sandbox::Selection) -> Plan {
    plan_with_selector_on(opts, select, std::env::consts::OS)
}

/// [`plan_with_selector`] with the host OS injected as well (`os` is what `std::env::consts::OS`
/// would say), so the Windows-only B3 refusal (`activate::binary_manifest_platform_verdict`) is
/// plannable -- and testable -- from any host. A separate function rather than a new
/// [`PlanOptions`] field so every existing struct-literal construction (ct-agent's
/// `build_plan_options`) keeps compiling unchanged.
pub fn plan_with_selector_on(opts: PlanOptions, select: &dyn Fn() -> sandbox::Selection, os: &str) -> Plan {
    let mut plan = Plan { backend: None, argv_preview: Vec::new(), compose_overrides: Vec::new(), refusals: Vec::new() };
    let effective = opts.environment.clone().unwrap_or_default();

    // Same order as `activate`: the platform check (step 4a, decision B3) precedes the contract
    // check (step 4b). Binary on Windows only; every other kind/OS pair is `None`.
    let platform_refusal = binary_manifest_platform_refusal(opts.installer_kind, os);
    if let Some(reason) = &platform_refusal {
        plan.refusals.push(reason.clone());
    }

    if let Some(reason) = environment_contract_refusal(opts.environment.as_ref()) {
        plan.refusals.push(reason);
    }

    match opts.installer_kind {
        InstallerKind::K8s => {
            plan.refusals.push("unsupported_installer_kind: K8s (schema-only, no executor exists)".to_string());
        }
        InstallerKind::Compose => {
            plan.argv_preview = vec![
                "docker".to_string(),
                "compose".to_string(),
                "-p".to_string(),
                opts.project_name.clone(),
                "-f".to_string(),
                opts.entrypoint.clone(),
                "--env-file".to_string(),
                ".env".to_string(),
                "up".to_string(),
                "-d".to_string(),
                "--build".to_string(),
            ];
            plan.compose_overrides = vec![
                "read_only: true".to_string(),
                "cap_drop: [ALL]".to_string(),
                "security_opt: [\"no-new-privileges:true\"]".to_string(),
                format!("pids_limit: {}", effective.processes.max_pids),
                format!("mem_limit: {}m", effective.resources.memory_mb),
                format!("cpus: {}", effective.resources.cpu_cores),
                "build.network: none (every `build:` in mapping form)".to_string(),
            ];
            if opts.guardrail_policy.require_image_digest {
                plan.compose_overrides.push("image: <name>@sha256:<digest> (every `image:` digest-pinned)".to_string());
            }
            match &opts.compose_yaml {
                None => plan.compose_overrides.push("(compose file not supplied to the plan -- static scan skipped)".to_string()),
                Some(yaml) => match guardrails::scan_compose_with(opts.guardrail_policy, yaml, &opts.work_dir) {
                    Err(e) => plan.refusals.push(format!("guardrail_scan_error: {e}")),
                    Ok(violations) => {
                        for v in violations {
                            plan.refusals.push(format!("guardrail_violations: {}[{}]: {}", v.service, v.rule, v.detail));
                        }
                    }
                },
            }
        }
        // B3: a refused platform has no backend to probe and nothing that would run -- `activate`
        // never reaches step 9 either -- so the plan stops at the refusal already recorded above.
        InstallerKind::Binary if platform_refusal.is_some() => {}
        InstallerKind::Binary => {
            let entry = opts.work_dir.join(&opts.entrypoint).display().to_string();
            let redacted: Vec<(String, String)> = opts.env_names.iter().map(|n| (n.clone(), "<redacted>".to_string())).collect();
            let env_refs: Vec<(&str, &str)> = redacted.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
            match select() {
                sandbox::Selection::Sandboxed(backend) => {
                    let (program, args) = backend.wrap_command(&entry, &[], &opts.work_dir, &env_refs);
                    plan.backend = Some(backend.name().to_string());
                    plan.argv_preview = std::iter::once(program).chain(args).collect();
                }
                sandbox::Selection::Unsandboxed { tried } => {
                    if opts.require_binary_sandbox {
                        plan.refusals.push(unsandboxed_refusal(&tried));
                    } else {
                        plan.argv_preview = vec![entry];
                    }
                }
            }
        }
    }

    plan
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::{SandboxBackend, Selection};
    use std::path::Path;

    fn binary_opts(require: bool) -> PlanOptions {
        PlanOptions {
            installer_kind: InstallerKind::Binary,
            environment: None,
            entrypoint: "run.sh".to_string(),
            work_dir: PathBuf::from("/scratch/plan-work"),
            env_names: vec!["API_KEY".to_string()],
            require_binary_sandbox: require,
            project_name: "plan-test".to_string(),
            compose_yaml: None,
            guardrail_policy: GuardrailPolicy::default(),
        }
    }

    fn no_backend() -> Selection {
        Selection::Unsandboxed { tried: vec![("bwrap", "bwrap not runnable on PATH: No such file or directory".to_string())] }
    }

    struct FakeBackend;

    impl SandboxBackend for FakeBackend {
        fn name(&self) -> &'static str {
            "fake"
        }

        fn wrap_command(&self, exe: &str, args: &[&str], work_dir: &Path, env: &[(&str, &str)]) -> (String, Vec<String>) {
            let mut a = vec!["--work".to_string(), work_dir.display().to_string()];
            for (k, v) in env {
                a.push(format!("{k}={v}"));
            }
            a.push(exe.to_string());
            a.extend(args.iter().map(|s| s.to_string()));
            ("fake-sandbox".to_string(), a)
        }

        fn isolation_summary(&self) -> &'static str {
            "fake"
        }
    }

    #[test]
    fn a_binary_plan_with_no_backend_lists_the_fail_closed_refusal() {
        let plan = plan_with_selector(binary_opts(true), &no_backend);
        assert!(plan.would_refuse());
        assert_eq!(plan.backend, None);
        assert!(plan.argv_preview.is_empty(), "nothing would run: {plan:?}");
        assert_eq!(plan.refusals.len(), 1, "{plan:?}");
        assert!(plan.refusals[0].contains("require_binary_sandbox"), "{}", plan.refusals[0]);
        assert!(plan.refusals[0].contains("bwrap not runnable on PATH"), "{}", plan.refusals[0]);
        assert!(plan.refusals[0].contains("CT_ALLOW_UNSANDBOXED=1"), "{}", plan.refusals[0]);
    }

    #[test]
    fn a_binary_plan_under_the_opt_out_previews_the_bare_unsandboxed_command() {
        let plan = plan_with_selector(binary_opts(false), &no_backend);
        assert!(!plan.would_refuse(), "{plan:?}");
        assert_eq!(plan.backend, None);
        assert_eq!(plan.argv_preview, vec!["/scratch/plan-work/run.sh"]);
    }

    #[test]
    fn a_binary_plan_with_a_backend_previews_the_wrapped_argv_with_secrets_redacted() {
        let plan = plan_with_selector(binary_opts(true), &|| Selection::Sandboxed(Box::new(FakeBackend)));
        assert!(!plan.would_refuse(), "{plan:?}");
        assert_eq!(plan.backend.as_deref(), Some("fake"));
        assert_eq!(
            plan.argv_preview,
            vec!["fake-sandbox", "--work", "/scratch/plan-work", "API_KEY=<redacted>", "/scratch/plan-work/run.sh"]
        );
    }

    #[test]
    fn a_plan_lists_a_contract_refusal_before_the_backend_refusal() {
        let mut env = EnvironmentContract::default();
        env.network.mode = manifest_core::NetworkMode::HostLoopback;
        let opts = PlanOptions { environment: Some(env), ..binary_opts(true) };
        let plan = plan_with_selector(opts, &no_backend);
        // Same order as `activate`: the static contract check (step 4b) precedes backend selection
        // (step 9), and a plan reports EVERY refusal, not just the first.
        assert_eq!(plan.refusals.len(), 2, "{plan:?}");
        assert!(plan.refusals[0].contains("host_loopback"), "{plan:?}");
        assert!(plan.refusals[1].contains("require_binary_sandbox"), "{plan:?}");
    }

    /// Decision B3: on Windows a Binary plan lists the platform refusal (stable prefix, compose /
    /// `manifest plan` alternatives named, opt-out explicitly NOT applicable) and never probes a
    /// backend -- with `require_binary_sandbox: false` to prove the opt-out changes nothing.
    #[test]
    fn a_binary_plan_on_windows_lists_the_b3_refusal_and_never_probes_a_backend() {
        let plan = plan_with_selector_on(
            binary_opts(false),
            &|| -> Selection { panic!("B3: no backend may be probed for a Binary manifest on windows") },
            "windows",
        );
        assert!(plan.would_refuse());
        assert_eq!(plan.backend, None);
        assert!(plan.argv_preview.is_empty(), "nothing would run: {plan:?}");
        assert_eq!(plan.refusals.len(), 1, "{plan:?}");
        let refusal = &plan.refusals[0];
        let prefix = "unsupported_platform: binary manifests are not supported on windows";
        assert!(refusal.starts_with(prefix), "{refusal}");
        assert!(refusal.contains("decision B3"), "{refusal}");
        assert!(refusal.contains("compose manifest"), "{refusal}");
        assert!(refusal.contains("`manifest plan`"), "{refusal}");
        assert!(refusal.contains("CT_ALLOW_UNSANDBOXED does not apply on this platform"), "{refusal}");
        assert!(!refusal.contains("CT_ALLOW_UNSANDBOXED=1"), "must not advertise the opt-out: {refusal}");
    }

    /// The platform refusal comes first (step 4a precedes 4b in `activate`), and a plan still
    /// reports EVERY refusal -- the contract one is not swallowed by the platform one.
    #[test]
    fn a_binary_plan_on_windows_lists_the_platform_refusal_before_a_contract_refusal() {
        let mut env = EnvironmentContract::default();
        env.network.mode = manifest_core::NetworkMode::HostLoopback;
        let opts = PlanOptions { environment: Some(env), ..binary_opts(true) };
        let plan = plan_with_selector_on(opts, &|| -> Selection { panic!("B3: never probed on windows") }, "windows");
        assert_eq!(plan.refusals.len(), 2, "{plan:?}");
        assert!(plan.refusals[0].starts_with("unsupported_platform: "), "{plan:?}");
        assert!(plan.refusals[1].contains("host_loopback"), "{plan:?}");
    }

    /// Only Binary and only Windows: a Compose plan on Windows and a Binary plan on Linux/macOS
    /// carry no platform refusal (the latter two fall through to the usual backend selection).
    #[test]
    fn the_b3_refusal_applies_to_binary_on_windows_only() {
        let compose_on_windows = PlanOptions {
            installer_kind: InstallerKind::Compose,
            entrypoint: "docker-compose.yml".to_string(),
            ..binary_opts(true)
        };
        let never = || -> Selection { panic!("Compose never probes a Binary sandbox backend") };
        let plan = plan_with_selector_on(compose_on_windows, &never, "windows");
        assert!(!plan.refusals.iter().any(|r| r.starts_with("unsupported_platform: ")), "{plan:?}");
        assert_eq!(plan.argv_preview[..2], ["docker", "compose"]);

        for os in ["linux", "macos"] {
            let plan = plan_with_selector_on(binary_opts(false), &no_backend, os);
            assert!(!plan.would_refuse(), "{os}: {plan:?}");
            assert_eq!(plan.argv_preview, vec!["/scratch/plan-work/run.sh"], "{os}");
        }
    }

    #[test]
    fn a_compose_plan_lists_the_hardening_overrides_and_scan_findings_as_refusals() {
        let yaml = "services:\n  web:\n    image: ghcr.io/berriai/litellm:main-latest\n    ports:\n      - \"127.0.0.1:4101:8080\"\n";
        let opts = PlanOptions {
            installer_kind: InstallerKind::Compose,
            entrypoint: "docker-compose.yml".to_string(),
            compose_yaml: Some(yaml.to_string()),
            ..binary_opts(true)
        };
        let plan = plan_with_selector(opts, &|| -> Selection { panic!("Compose never probes a Binary sandbox backend") });
        assert_eq!(plan.backend, None);
        assert_eq!(plan.argv_preview[..5], ["docker", "compose", "-p", "plan-test", "-f"]);
        assert!(plan.compose_overrides.iter().any(|o| o == "read_only: true"), "{plan:?}");
        assert!(plan.compose_overrides.iter().any(|o| o == "pids_limit: 64"), "{plan:?}");
        assert!(plan.compose_overrides.iter().any(|o| o == "mem_limit: 1024m"), "{plan:?}");
        assert!(plan.would_refuse());
        assert!(plan.refusals.iter().any(|r| r.contains("F.15-image-not-digest-pinned")), "{plan:?}");
        assert!(plan.refusals.iter().any(|r| r.contains("F.16-missing-read-only")), "{plan:?}");
    }

    #[test]
    fn a_plan_serializes_to_json_with_every_field() {
        let plan = plan_with_selector(binary_opts(true), &no_backend);
        let json: serde_json::Value = serde_json::from_str(&plan.to_json()).unwrap();
        assert!(json.get("backend").is_some());
        assert!(json.get("argv_preview").is_some());
        assert!(json.get("compose_overrides").is_some());
        assert_eq!(json["refusals"].as_array().unwrap().len(), 1);
    }
}
