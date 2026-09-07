//! Static, pre-execution guardrail scan of a bundle's compose file -- section F of the Phase 1
//! plan (`docs/security-model.md`). Runs BEFORE any `docker` command; any violation is a hard,
//! fail-closed reject. Deliberately conservative: an unrecognized/ambiguous compose construct is
//! treated as a violation (reject), never silently allowed through.
//!
//! Encodes conventions this operator already applies by hand across every other deployment in
//! this workspace (kali-desktop, sort-demo, webconference-demo, and litellm-proxy itself): no
//! published host ports beyond `127.0.0.1`, no `privileged`/dangerous capabilities/host
//! namespaces, no host path bind mounts outside the bundle's own directory.

use serde_yaml::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    pub service: String,
    pub rule: &'static str,
    pub detail: String,
}

/// Per-call knobs for [`scan_compose_with`]. `Default` is the strict profile
/// `installer_engine::activate` applies; a caller with a documented reason (e.g. a registry
/// rendering an advisory verdict for a legacy catalogue) may soften individual rules, but never
/// silently -- the softened policy is a value it passes explicitly.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GuardrailPolicy {
    /// F.15: every `image:` must be pinned by an `@sha256:<64 hex>` digest, so the bytes that run
    /// are the bytes the publisher signed against, not whatever a mutable tag points at today.
    pub require_image_digest: bool,
}

impl Default for GuardrailPolicy {
    fn default() -> Self {
        GuardrailPolicy { require_image_digest: true }
    }
}

/// Parse and scan a compose file's raw text under the strict default [`GuardrailPolicy`].
/// `bundle_dir` is the unpacked bundle's own root -- the only host paths a bind mount may resolve
/// inside.
pub fn scan_compose(compose_yaml: &str, bundle_dir: &Path) -> Result<Vec<Violation>, String> {
    scan_compose_with(GuardrailPolicy::default(), compose_yaml, bundle_dir)
}

/// [`scan_compose`] with an explicit policy. Rule order per service is fixed (F.1, F.2, F.3
/// volumes/build/env_file, then F.8 build network, F.15 image digest, F.16 runtime hardening) so
/// a caller reporting only the first violation sees the most severe class first.
pub fn scan_compose_with(policy: GuardrailPolicy, compose_yaml: &str, bundle_dir: &Path) -> Result<Vec<Violation>, String> {
    let doc: Value = serde_yaml::from_str(compose_yaml).map_err(|e| format!("invalid compose YAML: {e}"))?;
    let services = doc
        .get("services")
        .and_then(Value::as_mapping)
        .ok_or_else(|| "compose file has no top-level `services:` mapping".to_string())?;

    let mut violations = Vec::new();
    for (name, svc) in services {
        let name = name.as_str().unwrap_or("<unnamed>").to_string();
        check_ports(&name, svc, &mut violations);
        check_dangerous_flags(&name, svc, &mut violations);
        check_volumes(&name, svc, bundle_dir, &mut violations);
        check_build(&name, svc, bundle_dir, &mut violations);
        check_env_file(&name, svc, bundle_dir, &mut violations);
        check_build_network(&name, svc, &mut violations);
        if policy.require_image_digest {
            check_image_digest(&name, svc, &mut violations);
        }
        check_runtime_hardening(&name, svc, &mut violations);
    }
    Ok(violations)
}

/// F.1: every published port must be explicitly bound to `127.0.0.1`/`localhost`. Absence of an
/// explicit bind address is a REJECT, not an allow -- Docker defaults an unqualified host port to
/// `0.0.0.0`, and that default is exactly the exposure this rule exists to prevent.
fn check_ports(service: &str, svc: &Value, out: &mut Vec<Violation>) {
    let Some(ports) = svc.get("ports").and_then(Value::as_sequence) else { return };
    for p in ports {
        let ok = match p {
            Value::String(s) => port_string_is_loopback_only(s),
            Value::Number(_) => false, // bare container-port-as-number publishes host-wide
            Value::Mapping(m) => m
                .get(Value::String("host_ip".into()))
                .and_then(Value::as_str)
                .map(is_loopback_host)
                .unwrap_or(false), // long syntax with no host_ip -- reject, same as short syntax
            _ => false,
        };
        if !ok {
            out.push(Violation {
                service: service.to_string(),
                rule: "F.1-non-loopback-port",
                detail: format!("{p:?}"),
            });
        }
    }
}

fn is_loopback_host(h: &str) -> bool {
    h == "127.0.0.1" || h == "localhost" || h == "::1"
}

fn port_string_is_loopback_only(s: &str) -> bool {
    // Short syntax: "host_ip:host_port:container_port" | "host_port:container_port" | "container_port[/proto]"
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        3 => is_loopback_host(parts[0]),
        _ => false, // 1 or 2 parts always publishes to 0.0.0.0 by Docker's own default
    }
}

/// F.2: `privileged`, dangerous `cap_add`, and any host-namespace sharing. Presence alone is a
/// reject, regardless of value, except `privileged` which is only dangerous when true and
/// `cap_add`/`security_opt` which are dangerous only when non-empty/matching -- Phase 1 has no
/// legitimate use for any of these in a manifest-installed service.
fn check_dangerous_flags(service: &str, svc: &Value, out: &mut Vec<Violation>) {
    if svc.get("privileged").and_then(Value::as_bool) == Some(true) {
        out.push(violation(service, "F.2-privileged", "privileged: true"));
    }
    if let Some(caps) = svc.get("cap_add").and_then(Value::as_sequence) {
        if !caps.is_empty() {
            out.push(violation(service, "F.2-cap-add", format!("{caps:?}")));
        }
    }
    for key in ["network_mode", "pid", "ipc"] {
        if let Some(v) = svc.get(key).and_then(Value::as_str) {
            if v == "host" {
                out.push(violation(service, "F.2-host-namespace", format!("{key}: host")));
            }
        }
    }
    if svc.get("userns_mode").is_some() {
        out.push(violation(service, "F.2-userns-mode", "userns_mode present"));
    }
    if let Some(opts) = svc.get("security_opt").and_then(Value::as_sequence) {
        for o in opts {
            if let Some(s) = o.as_str() {
                if s.to_lowercase().contains("unconfined") {
                    out.push(violation(service, "F.2-seccomp-unconfined", s.to_string()));
                }
            }
        }
    }
}

/// F.3: host path bind mounts must resolve inside `bundle_dir`. Named volumes (no path
/// separator) are always fine; the Docker socket path is always rejected outright even if it
/// were somehow made to resolve inside the bundle dir (it never legitimately would).
fn check_volumes(service: &str, svc: &Value, bundle_dir: &Path, out: &mut Vec<Violation>) {
    let Some(volumes) = svc.get("volumes").and_then(Value::as_sequence) else { return };
    for v in volumes {
        match v {
            Value::String(s) => {
                let source = volume_source_field(s);
                check_one_source(service, source, bundle_dir, out);
            }
            Value::Mapping(m) => {
                let source = m.get(Value::String("source".into())).and_then(Value::as_str);
                let is_bind = m.get(Value::String("type".into())).and_then(Value::as_str) == Some("bind");
                if is_bind {
                    if let Some(source) = source {
                        check_one_source(service, source, bundle_dir, out);
                    }
                }
            }
            _ => {}
        }
    }
}

/// Split docker-compose's volume short syntax (`source:target[:mode]`) into just its leading
/// `source` field. Naively splitting on the first `:` (the old behavior) breaks the instant
/// `source` itself is a `${VAR:-default}` interpolation (#14): the `:` inside `${...}` is not a
/// field separator, so a naive split truncated `${EVIL_PATH:-/etc}:/host-etc:ro` down to just
/// `${EVIL_PATH`, mangling it before `check_one_source` ever saw the full expression. Tracks
/// `${`/`}` nesting depth so only a `:` outside any interpolation block ends the source field.
fn volume_source_field(s: &str) -> &str {
    let bytes = s.as_bytes();
    let mut depth = 0usize;
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'$' && bytes.get(i + 1) == Some(&b'{') {
            depth += 1;
            i += 2;
            continue;
        }
        if bytes[i] == b'}' && depth > 0 {
            depth -= 1;
            i += 1;
            continue;
        }
        if bytes[i] == b':' && depth == 0 {
            return &s[..i];
        }
        i += 1;
    }
    s
}

fn check_one_source(service: &str, source: &str, bundle_dir: &Path, out: &mut Vec<Violation>) {
    // #14: `$`/`~` are neither a path prefix nor a plain named-volume identifier, so they used
    // to fall straight into the "not looks_like_path -> named volume, always fine" branch below
    // -- silently allowing a bind mount the scanner never actually looked at. Compose expands
    // `${VAR}`/`${VAR:-default}`/`${VAR:?msg}` interpolation itself before anything reaches
    // docker, and the real `CADS-webconference-demo` compose already ships
    // `${WEBCONFERENCE_CERT_DIR:?...}:/certs:ro` with a clean verdict. When a default value is
    // present (`${VAR:-default}`/`${VAR-default}`), Compose substitutes it verbatim whenever VAR
    // is unset, so checking that default catches the concrete bypass exactly. Anything else --
    // `$VAR`, `${VAR}`, `${VAR:?msg}` with no default -- genuinely cannot be resolved at scan
    // time, so it fails closed instead of being waved through as a named volume.
    if let Some(rest) = source.strip_prefix('$') {
        let var_expr = rest.strip_prefix('{').and_then(|s| s.strip_suffix('}')).unwrap_or(rest);
        match extract_compose_default(var_expr) {
            Some(default) => return check_one_source(service, &default, bundle_dir, out),
            None => {
                out.push(violation(
                    service,
                    "F.3-volume-unresolvable-interpolation",
                    format!("{source} -- ${{VAR}} without a resolvable default cannot be vetted at scan time"),
                ));
                return;
            }
        }
    }
    // `~` expands to $HOME in a shell, but whether/how Compose expands it in a volume source is
    // version-dependent and unverified here (#14) -- treated the same as an unresolvable
    // interpolation rather than silently allowed.
    if source.starts_with('~') {
        out.push(violation(
            service,
            "F.3-volume-unresolvable-tilde",
            format!("{source} -- ~ expansion is not vetted at scan time"),
        ));
        return;
    }
    // A named volume (no leading `/`, `./`, `../`) is never a host path -- always fine.
    let looks_like_path = source.starts_with('/') || source.starts_with('.');
    if !looks_like_path {
        return;
    }
    if source == "/var/run/docker.sock" || source.trim_end_matches('/') == "/var/run/docker.sock" {
        out.push(violation(service, "F.3-docker-socket-mount", source.to_string()));
        return;
    }
    check_one_source_with_rule(service, source, bundle_dir, out, "F.3-host-path-escapes-bundle");
}

/// Extract the fallback value from Compose's `${VAR:-default}`/`${VAR-default}` interpolation
/// syntax (`var_expr` is the interior of `${...}`, or the bare `$VAR` text, with `$`/`{`/`}`
/// already stripped) -- the shape that made #14's bypass concrete. `${VAR:?msg}`/`${VAR?msg}`
/// (required, errors out if unset) carries no usable default -- checked first and returns `None`
/// unconditionally, since the message after `:?`/`?` is for a human, not a fallback path, and may
/// itself contain a `-` that would otherwise be mistaken for one. A bare `VAR` (no operator at
/// all) also returns `None`: nothing here is a resolvable path.
fn extract_compose_default(var_expr: &str) -> Option<String> {
    if var_expr.contains(":?") || var_expr.contains('?') {
        return None;
    }
    for sep in [":-", "-"] {
        if let Some(idx) = var_expr.find(sep) {
            return Some(var_expr[idx + sep.len()..].to_string());
        }
    }
    None
}

/// Shared escape check behind [`check_one_source`] (`volumes:`) and [`check_build`]
/// (`build.context`): does `source`, resolved against `bundle_dir`, still resolve inside it.
fn check_one_source_with_rule(
    service: &str,
    source: &str,
    bundle_dir: &Path,
    out: &mut Vec<Violation>,
    rule: &'static str,
) {
    let resolved = normalize(&bundle_dir.join(source));
    let bundle_dir_norm = normalize(bundle_dir);
    if !resolved.starts_with(&bundle_dir_norm) {
        out.push(violation(
            service,
            rule,
            format!("{source} -> {} (outside {})", resolved.display(), bundle_dir_norm.display()),
        ));
    }
}

/// F.3 (build variant): `build.context` is exactly as capable of reading arbitrary host files as
/// a `volumes:` bind mount is -- everything under the resolved context directory is tarred up and
/// sent to the docker daemon as the build context, and any `COPY`/`ADD` in the (unvetted, F.8)
/// Dockerfile can pull those bytes straight into the built image. `check_volumes` above already
/// rejects a host path escaping the bundle; `build:` needed the identical check and never had it.
/// Short string form (`build: ./sub`) and long mapping form (`build: {context: ./sub, ...}`) both
/// covered. A context that isn't a local path at all (a git/http(s) URL) is rejected outright --
/// Phase 1 has no vetting story for a remote build context any more than it does for `RUN` steps.
fn check_build(service: &str, svc: &Value, bundle_dir: &Path, out: &mut Vec<Violation>) {
    let Some(build) = svc.get("build") else { return };
    let context = match build {
        Value::String(s) => Some(s.as_str()),
        Value::Mapping(m) => m.get(Value::String("context".into())).and_then(Value::as_str),
        _ => None,
    };
    let Some(context) = context else {
        out.push(violation(service, "F.3-build-context-unrecognized", format!("{build:?}")));
        return;
    };
    let looks_like_local_path = context.starts_with('/') || context.starts_with('.');
    if !looks_like_local_path {
        out.push(violation(
            service,
            "F.3-build-context-not-local",
            format!("{context} -- remote/URL build contexts have no vetting story in Phase 1"),
        ));
        return;
    }
    check_one_source_with_rule(service, context, bundle_dir, out, "F.3-build-context-escapes-bundle");
}

/// F.3 (env_file variant): `env_file:` reads an arbitrary host file's lines straight into the
/// container's environment -- the exact same host-file-read primitive `volumes:` and
/// `build.context` already guard against (see `check_one_source`/`check_build` above), just
/// without a bind mount. A path escaping `bundle_dir` here (e.g. a sibling project's `.env`) lets
/// an unvetted manifest exfiltrate host secrets into the container's env, where the manifest's own
/// (equally unvetted, F.8) application code can do anything with them. Short string form
/// (`env_file: ./local.env`), sequence-of-strings form, and the long mapping form
/// (`env_file: [{path: ./local.env, required: true}]`) are all covered.
fn check_env_file(service: &str, svc: &Value, bundle_dir: &Path, out: &mut Vec<Violation>) {
    let Some(env_file) = svc.get("env_file") else { return };
    let entries: Vec<&Value> = match env_file {
        Value::Sequence(seq) => seq.iter().collect(),
        single => vec![single],
    };
    for entry in entries {
        let path = match entry {
            Value::String(s) => Some(s.as_str()),
            Value::Mapping(m) => m.get(Value::String("path".into())).and_then(Value::as_str),
            _ => None,
        };
        let Some(path) = path else {
            out.push(violation(service, "F.3-env-file-unrecognized", format!("{entry:?}")));
            continue;
        };
        check_one_source_with_rule(service, path, bundle_dir, out, "F.3-env-file-escapes-bundle");
    }
}

/// F.8 (scimbe/ct-agent#183, phase 1): a `build:` runs arbitrary Dockerfile `RUN` steps inside
/// the Docker daemon, which ct-agent cannot sandbox -- the ONE thing the compose file can take
/// away from those steps is the network. A `build` must therefore be the mapping form with
/// `network: none` (`build.network` is a first-class compose key); the short string form
/// (`build: ./dir`) cannot express it and is rejected for that reason, not for its context.
fn check_build_network(service: &str, svc: &Value, out: &mut Vec<Violation>) {
    let Some(build) = svc.get("build") else { return };
    let network = build.as_mapping().and_then(|m| m.get(Value::String("network".into()))).and_then(Value::as_str);
    if network != Some("none") {
        out.push(violation(
            service,
            "F.8-build-network-not-none",
            match network {
                Some(other) => format!("build.network: {other} -- a build must declare `network: none`"),
                None => "build has no `network: none` (use the mapping form: build: {context: ./dir, network: none})".to_string(),
            },
        ));
    }
}

/// F.15: `image:` must be pinned by digest -- `name[:tag]@sha256:<64 hex>` -- so the image bytes
/// are fixed at signing time. A mutable tag (`:latest`, `:main-latest`, even `:16-alpine`) can be
/// repointed upstream between signing and install, which is exactly the supply-chain residual the
/// threat table carried since Phase 1.
fn check_image_digest(service: &str, svc: &Value, out: &mut Vec<Violation>) {
    let Some(image) = svc.get("image") else { return };
    let Some(image) = image.as_str() else {
        out.push(violation(service, "F.15-image-not-digest-pinned", format!("{image:?} -- image must be a string")));
        return;
    };
    if !image_is_digest_pinned(image) {
        out.push(violation(
            service,
            "F.15-image-not-digest-pinned",
            format!("{image} -- pin it as name@sha256:<64 hex digits>"),
        ));
    }
}

fn image_is_digest_pinned(image: &str) -> bool {
    match image.rsplit_once("@sha256:") {
        Some((name, digest)) => !name.is_empty() && digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit()),
        None => false,
    }
}

/// F.16 (scimbe/ct-agent#183, phase 1): the runtime hardening every manifest-installed service
/// must declare -- read-only rootfs, every capability dropped, no privilege escalation, a pid
/// bound and a memory bound. Each missing key is its own named violation so the operator (and
/// `installer_engine::plan`'s `compose_overrides`) can say exactly which line to add.
fn check_runtime_hardening(service: &str, svc: &Value, out: &mut Vec<Violation>) {
    if svc.get("read_only").and_then(Value::as_bool) != Some(true) {
        out.push(violation(service, "F.16-missing-read-only", "add `read_only: true`"));
    }
    let drops_all = svc
        .get("cap_drop")
        .and_then(Value::as_sequence)
        .map(|caps| caps.iter().any(|c| c.as_str().map(|s| s.eq_ignore_ascii_case("ALL")).unwrap_or(false)))
        .unwrap_or(false);
    if !drops_all {
        out.push(violation(service, "F.16-missing-cap-drop-all", "add `cap_drop: [ALL]`"));
    }
    let no_new_privs = svc
        .get("security_opt")
        .and_then(Value::as_sequence)
        .map(|opts| {
            opts.iter().any(|o| {
                matches!(o.as_str(), Some("no-new-privileges") | Some("no-new-privileges:true") | Some("no-new-privileges=true"))
            })
        })
        .unwrap_or(false);
    if !no_new_privs {
        out.push(violation(service, "F.16-missing-no-new-privileges", "add `security_opt: [\"no-new-privileges:true\"]`"));
    }
    let pids_ok = svc.get("pids_limit").and_then(Value::as_i64).map(|n| n > 0).unwrap_or(false);
    if !pids_ok {
        out.push(violation(service, "F.16-missing-pids-limit", "add `pids_limit: <positive integer>`"));
    }
    let mem_limit = svc.get("mem_limit").map(|v| v.as_str().is_some() || v.as_i64().is_some()).unwrap_or(false);
    let deploy_memory = svc
        .get("deploy")
        .and_then(|d| d.get("resources"))
        .and_then(|r| r.get("limits"))
        .and_then(|l| l.get("memory"))
        .is_some();
    if !mem_limit && !deploy_memory {
        out.push(violation(service, "F.16-missing-mem-limit", "add `mem_limit: <size>` (or deploy.resources.limits.memory)"));
    }
}

/// Lexical `..`/`.`-component normalization (no filesystem access, no symlink resolution --
/// deliberate: the bundle dir may not exist yet at scan time, and this only needs to catch a
/// textual escape, not a symlink-based one, which docker itself will refuse to traverse outside
/// a bind mount's declared source in the same way a normal bind mount always has).
fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

fn violation(service: &str, rule: &'static str, detail: impl Into<String>) -> Violation {
    Violation { service: service.to_string(), rule, detail: detail.into() }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle() -> PathBuf {
        PathBuf::from("/scratch/bundle-abc")
    }

    const DIGEST: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    /// One service body carrying every key the F.15/F.16 rules require, so a test about ONE rule
    /// asserts that rule alone. `extra` is appended verbatim (4-space-indented lines, `\n`-ended).
    fn hardened_service(name: &str, extra: &str) -> String {
        format!(
            "services:\n  {name}:\n    image: example.invalid/app@sha256:{DIGEST}\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n{extra}"
        )
    }

    /// Same, for a service built from the bundle (`build:` instead of `image:`).
    fn hardened_build_service(name: &str, context: &str, extra: &str) -> String {
        format!(
            "services:\n  {name}:\n    build:\n      context: {context}\n      network: none\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n{extra}"
        )
    }

    fn rules(v: &[Violation]) -> Vec<&'static str> {
        v.iter().map(|v| v.rule).collect()
    }

    #[test]
    fn loopback_bound_port_is_allowed() {
        let yaml = hardened_service("web", "    ports:\n      - \"127.0.0.1:4101:4000\"\n");
        assert!(scan_compose(&yaml, &bundle()).unwrap().is_empty());
    }

    #[test]
    fn unqualified_port_is_rejected() {
        let yaml = hardened_service("web", "    ports:\n      - \"4101:4000\"\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.1-non-loopback-port"]);
    }

    #[test]
    fn bare_container_port_number_is_rejected() {
        let yaml = hardened_service("web", "    ports:\n      - 4000\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.1-non-loopback-port"]);
    }

    #[test]
    fn privileged_true_is_rejected() {
        let yaml = hardened_service("web", "    privileged: true\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.2-privileged"]);
    }

    #[test]
    fn network_mode_host_is_rejected() {
        let yaml = hardened_service("web", "    network_mode: host\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.2-host-namespace"]);
    }

    #[test]
    fn docker_socket_bind_mount_is_rejected_even_if_relative_looking() {
        let yaml = hardened_service("web", "    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-docker-socket-mount"]);
    }

    #[test]
    fn bundle_relative_bind_mount_is_allowed() {
        let yaml = hardened_service("web", "    volumes:\n      - ./config.yaml:/app/config.yaml\n");
        assert!(scan_compose(&yaml, &bundle()).unwrap().is_empty());
    }

    #[test]
    fn path_traversal_escaping_the_bundle_is_rejected() {
        let yaml = hardened_service("web", "    volumes:\n      - ../../etc:/etc\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-host-path-escapes-bundle"]);
    }

    #[test]
    fn absolute_host_path_outside_bundle_is_rejected() {
        let yaml = hardened_service("web", "    volumes:\n      - /home/becke/git/litellm-proxy/.env:/app/.env\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-host-path-escapes-bundle"]);
    }

    #[test]
    fn named_volume_is_always_allowed() {
        let yaml = hardened_service("db", "    volumes:\n      - pgdata:/var/lib/postgresql/data\n");
        assert!(scan_compose(&yaml, &bundle()).unwrap().is_empty());
    }

    // #14: the four-row bypass table from the report, reproduced as regression tests.

    #[test]
    fn env_var_volume_source_with_a_default_is_checked_against_that_default() {
        // Compose expands `${VAR:-default}` to `default` whenever VAR is unset -- this is the
        // concrete bypass the real webconference compose already hit, just with `/etc` standing
        // in for a real cert dir default.
        let yaml = hardened_service("web", "    volumes:\n      - \"${EVIL_PATH:-/etc}:/host-etc:ro\"\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-host-path-escapes-bundle"], "the resolved default must go through the normal escape check: {v:?}");
    }

    #[test]
    fn env_var_volume_source_with_no_default_fails_closed_instead_of_passing_as_a_named_volume() {
        let yaml = hardened_service("web", "    volumes:\n      - \"${EVIL_PATH}:/host-etc:ro\"\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-volume-unresolvable-interpolation"], "{v:?}");
    }

    #[test]
    fn env_var_volume_source_with_a_required_message_fails_closed_not_treated_as_a_default() {
        // The real bypass: `${WEBCONFERENCE_CERT_DIR:?...}` from CADS-webconference-demo's own
        // compose file. `:?msg` is "required, error if unset" -- msg is not a fallback path.
        let yaml = hardened_service("web", "    volumes:\n      - \"${WEBCONFERENCE_CERT_DIR:?set WEBCONFERENCE_CERT_DIR}:/certs:ro\"\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-volume-unresolvable-interpolation"], "{v:?}");
    }

    #[test]
    fn tilde_volume_source_fails_closed_instead_of_passing_as_a_named_volume() {
        let yaml = hardened_service("web", "    volumes:\n      - \"~/.ssh:/host-ssh:ro\"\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-volume-unresolvable-tilde"], "{v:?}");
    }

    #[test]
    fn bundle_relative_build_context_mapping_form_with_network_none_is_allowed() {
        let yaml = hardened_build_service("heartbeat", "./heartbeat-proxy", "");
        assert!(scan_compose(&yaml, &bundle()).unwrap().is_empty());
    }

    #[test]
    fn build_context_escaping_the_bundle_via_relative_traversal_is_rejected() {
        let yaml = hardened_build_service("evil", "../../../etc", "");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-build-context-escapes-bundle"]);
    }

    #[test]
    fn build_context_escaping_the_bundle_via_mapping_form_is_rejected() {
        let yaml = hardened_build_service("evil", "/home/becke/git/litellm-proxy", "");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-build-context-escapes-bundle"]);
    }

    #[test]
    fn remote_build_context_is_rejected_outright() {
        let yaml = hardened_build_service("evil", "https://example.com/some/repo.git", "");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-build-context-not-local"]);
    }

    #[test]
    fn env_file_absolute_host_path_outside_bundle_is_rejected() {
        let yaml = hardened_service("web", "    env_file:\n      - /home/becke/git/litellm-proxy/.env\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-env-file-escapes-bundle"]);
    }

    #[test]
    fn env_file_short_string_form_escaping_the_bundle_is_rejected() {
        let yaml = hardened_service("web", "    env_file: ../../etc/some.env\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-env-file-escapes-bundle"]);
    }

    #[test]
    fn env_file_long_mapping_form_escaping_the_bundle_is_rejected() {
        let yaml = hardened_service("web", "    env_file:\n      - path: /etc/passwd\n        required: true\n");
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.3-env-file-escapes-bundle"]);
    }

    #[test]
    fn env_file_bundle_relative_is_allowed() {
        let yaml = hardened_service("web", "    env_file:\n      - ./config/.env\n");
        assert!(scan_compose(&yaml, &bundle()).unwrap().is_empty());
    }

    // -- scimbe/ct-agent#183 phase 1: F.8 build network, F.15 digest pinning, F.16 hardening ----

    /// The positive case: a fully hardened multi-service stack (digest-pinned images, a
    /// bundle-built sidecar with `network: none`, every F.16 key on every service) passes clean.
    #[test]
    fn a_fully_hardened_multi_service_stack_passes() {
        let yaml = format!(
            r#"
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest@sha256:{DIGEST}
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    pids_limit: 128
    mem_limit: 1g
    ports:
      - "127.0.0.1:4103:4000"
    volumes:
      - ./config.yaml:/app/config.yaml
  db:
    image: postgres@sha256:{DIGEST}
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    pids_limit: 64
    deploy:
      resources:
        limits:
          memory: 512M
    volumes:
      - pgdata:/var/lib/postgresql/data
  heartbeat:
    build:
      context: ./heartbeat-proxy
      network: none
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    pids_limit: 32
    mem_limit: 128m
    ports:
      - "127.0.0.1:4101:8080"
"#
        );
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert!(v.is_empty(), "{v:?}");
    }

    #[test]
    fn build_short_string_form_is_rejected_because_it_cannot_declare_network_none() {
        let yaml = "services:\n  heartbeat:\n    build: ./heartbeat-proxy\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.8-build-network-not-none"], "{v:?}");
    }

    #[test]
    fn build_mapping_form_without_network_none_is_rejected() {
        let yaml = "services:\n  heartbeat:\n    build:\n      context: ./heartbeat-proxy\n      network: host\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.8-build-network-not-none"], "{v:?}");
        assert!(v[0].detail.contains("network: host"), "{}", v[0].detail);
    }

    #[test]
    fn a_tag_only_image_is_rejected_as_not_digest_pinned() {
        let yaml = "services:\n  web:\n    image: ghcr.io/berriai/litellm:main-latest\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.15-image-not-digest-pinned"], "{v:?}");
    }

    #[test]
    fn a_malformed_digest_is_rejected() {
        let yaml = "services:\n  web:\n    image: app@sha256:deadbeef\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.15-image-not-digest-pinned"], "{v:?}");
    }

    #[test]
    fn the_digest_rule_can_be_softened_per_call_but_is_strict_by_default() {
        let yaml = "services:\n  web:\n    image: ghcr.io/berriai/litellm:main-latest\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n";
        assert_eq!(GuardrailPolicy::default(), GuardrailPolicy { require_image_digest: true });
        let lenient = scan_compose_with(GuardrailPolicy { require_image_digest: false }, yaml, &bundle()).unwrap();
        assert!(lenient.is_empty(), "{lenient:?}");
        let strict = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(rules(&strict), vec!["F.15-image-not-digest-pinned"]);
    }

    #[test]
    fn missing_read_only_is_rejected() {
        let yaml = format!(
            "services:\n  web:\n    image: app@sha256:{DIGEST}\n    read_only: false\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n"
        );
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.16-missing-read-only"], "{v:?}");
    }

    #[test]
    fn missing_cap_drop_all_is_rejected() {
        let yaml = format!(
            "services:\n  web:\n    image: app@sha256:{DIGEST}\n    read_only: true\n    cap_drop: [NET_RAW]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    mem_limit: 256m\n"
        );
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.16-missing-cap-drop-all"], "{v:?}");
    }

    #[test]
    fn missing_no_new_privileges_is_rejected() {
        let yaml = format!(
            "services:\n  web:\n    image: app@sha256:{DIGEST}\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"apparmor:docker-default\"]\n    pids_limit: 64\n    mem_limit: 256m\n"
        );
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.16-missing-no-new-privileges"], "{v:?}");
    }

    #[test]
    fn missing_pids_limit_is_rejected() {
        let yaml = format!(
            "services:\n  web:\n    image: app@sha256:{DIGEST}\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    mem_limit: 256m\n"
        );
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.16-missing-pids-limit"], "{v:?}");
    }

    #[test]
    fn missing_mem_limit_is_rejected_unless_deploy_limits_declare_memory() {
        let yaml = format!(
            "services:\n  web:\n    image: app@sha256:{DIGEST}\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n"
        );
        let v = scan_compose(&yaml, &bundle()).unwrap();
        assert_eq!(rules(&v), vec!["F.16-missing-mem-limit"], "{v:?}");

        let via_deploy = format!(
            "services:\n  web:\n    image: app@sha256:{DIGEST}\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [\"no-new-privileges:true\"]\n    pids_limit: 64\n    deploy:\n      resources:\n        limits:\n          memory: 256M\n"
        );
        assert!(scan_compose(&via_deploy, &bundle()).unwrap().is_empty());
    }

    #[test]
    fn a_bare_minimal_service_reports_every_missing_hardening_key_by_name() {
        // The pre-#183 "clean" shape: loopback port, nothing else. Every new rule fires, each with
        // its own name, so an operator upgrading an old bundle gets the full list at once.
        let yaml = "services:\n  web:\n    image: ghcr.io/berriai/litellm:main-latest\n    ports:\n      - \"127.0.0.1:4101:8080\"\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(
            rules(&v),
            vec![
                "F.15-image-not-digest-pinned",
                "F.16-missing-read-only",
                "F.16-missing-cap-drop-all",
                "F.16-missing-no-new-privileges",
                "F.16-missing-pids-limit",
                "F.16-missing-mem-limit",
            ],
            "{v:?}"
        );
    }
}
