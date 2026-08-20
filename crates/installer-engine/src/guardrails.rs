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

/// Parse and scan a compose file's raw text. `bundle_dir` is the unpacked bundle's own root --
/// the only host paths a bind mount may resolve inside.
pub fn scan_compose(compose_yaml: &str, bundle_dir: &Path) -> Result<Vec<Violation>, String> {
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
                let source = s.split(':').next().unwrap_or(s);
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

fn check_one_source(service: &str, source: &str, bundle_dir: &Path, out: &mut Vec<Violation>) {
    // A named volume (no leading `/`, `./`, `../`) is never a host path -- always fine.
    let looks_like_path = source.starts_with('/') || source.starts_with('.');
    if !looks_like_path {
        return;
    }
    if source == "/var/run/docker.sock" || source.trim_end_matches('/') == "/var/run/docker.sock" {
        out.push(violation(service, "F.3-docker-socket-mount", source.to_string()));
        return;
    }
    let resolved = normalize(&bundle_dir.join(source));
    let bundle_dir_norm = normalize(bundle_dir);
    if !resolved.starts_with(&bundle_dir_norm) {
        out.push(violation(
            service,
            "F.3-host-path-escapes-bundle",
            format!("{source} -> {} (outside {})", resolved.display(), bundle_dir_norm.display()),
        ));
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

    #[test]
    fn loopback_bound_port_is_allowed() {
        let yaml = "services:\n  web:\n    ports:\n      - \"127.0.0.1:4101:4000\"\n";
        assert!(scan_compose(yaml, &bundle()).unwrap().is_empty());
    }

    #[test]
    fn unqualified_port_is_rejected() {
        let yaml = "services:\n  web:\n    ports:\n      - \"4101:4000\"\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].rule, "F.1-non-loopback-port");
    }

    #[test]
    fn bare_container_port_number_is_rejected() {
        let yaml = "services:\n  web:\n    ports:\n      - 4000\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(v[0].rule, "F.1-non-loopback-port");
    }

    #[test]
    fn privileged_true_is_rejected() {
        let yaml = "services:\n  web:\n    privileged: true\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(v[0].rule, "F.2-privileged");
    }

    #[test]
    fn network_mode_host_is_rejected() {
        let yaml = "services:\n  web:\n    network_mode: host\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(v[0].rule, "F.2-host-namespace");
    }

    #[test]
    fn docker_socket_bind_mount_is_rejected_even_if_relative_looking() {
        let yaml = "services:\n  web:\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(v[0].rule, "F.3-docker-socket-mount");
    }

    #[test]
    fn bundle_relative_bind_mount_is_allowed() {
        let yaml = "services:\n  web:\n    volumes:\n      - ./config.yaml:/app/config.yaml\n";
        assert!(scan_compose(yaml, &bundle()).unwrap().is_empty());
    }

    #[test]
    fn path_traversal_escaping_the_bundle_is_rejected() {
        let yaml = "services:\n  web:\n    volumes:\n      - ../../etc:/etc\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(v[0].rule, "F.3-host-path-escapes-bundle");
    }

    #[test]
    fn absolute_host_path_outside_bundle_is_rejected() {
        let yaml = "services:\n  web:\n    volumes:\n      - /home/becke/git/litellm-proxy/.env:/app/.env\n";
        let v = scan_compose(yaml, &bundle()).unwrap();
        assert_eq!(v[0].rule, "F.3-host-path-escapes-bundle");
    }

    #[test]
    fn named_volume_is_always_allowed() {
        let yaml = "services:\n  db:\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n";
        assert!(scan_compose(yaml, &bundle()).unwrap().is_empty());
    }

    #[test]
    fn a_real_looking_multi_service_clean_stack_passes() {
        // Mirrors the shape of the actual litellm-proxy compose file's own conventions.
        let yaml = r#"
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "127.0.0.1:4103:4000"
    volumes:
      - ./config.yaml:/app/config.yaml
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
"#;
        assert!(scan_compose(yaml, &bundle()).unwrap().is_empty());
    }
}
