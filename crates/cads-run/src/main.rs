//! `cads-run`: the smallest honest path from the marketplace to a sandbox on your own device.
//!
//! ```text
//! cads-run <name>            newest version from the registry, signed by a trusted publisher
//! cads-run --from <dir>      a local manifest.json + bundle.tar.gz, same checks
//! cads-run doctor            which sandbox this device has, and what is missing
//! ```
//!
//! By default a payload sees only the OS and its own folder. `--allow-read DIR` adds one program
//! tree, read-only, for templates that need an interpreter from it.
//!
//! Everything that matters happens in [`installer_engine::activate`], the code ct-agent uses:
//! signature, expiry, publisher allowlist, bundle sha256, safe unpack, then the OS sandbox
//! (macOS Seatbelt, Linux bubblewrap). This binary only picks the manifest and passes the trust list.
//!
//! **Fail closed, no opt-out.** `require_binary_sandbox` is hard-coded and `CT_ALLOW_UNSANDBOXED` is
//! not read: without a usable sandbox nothing runs. The registry list is only used to find an id;
//! nothing from it is believed.

use installer_engine::allowlist::TrustAllowlist;
use installer_engine::sandbox::SandboxPolicy;
use installer_engine::{activate_with_policy, ActivateOptions, InstallReport};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_REGISTRY: &str = "https://registry.bunsenbrenner.org";
/// The trust root, compiled in. `--trust-file` replaces it with your own list.
const PINNED_PUBLISHERS: &str = "1292c0cc8da75808549be709101acec612a52d5219b188c0adcff6d829ace69b";

const USAGE: &str = "cads-run <name> [--version V] [--env-file F] [--allow-read DIR] [--registry URL] [--trust-file F] [--json]
cads-run --from DIR [--env-file F] [--allow-read DIR] [--trust-file F] [--json]
cads-run doctor";

#[derive(Default)]
struct Args {
    name: Option<String>,
    version: Option<String>,
    from: Option<PathBuf>,
    env_file: Option<PathBuf>,
    registry: Option<String>,
    trust_file: Option<PathBuf>,
    allow_read: Vec<PathBuf>,
    json: bool,
}

fn parse(argv: &[String]) -> Result<Args, String> {
    let mut a = Args::default();
    let mut it = argv.iter();
    while let Some(arg) = it.next() {
        let mut value = |flag: &str| it.next().cloned().ok_or(format!("{flag} needs a value"));
        match arg.as_str() {
            "--version" => a.version = Some(value("--version")?),
            "--from" => a.from = Some(value("--from")?.into()),
            "--env-file" => a.env_file = Some(value("--env-file")?.into()),
            "--registry" => a.registry = Some(value("--registry")?),
            "--trust-file" => a.trust_file = Some(value("--trust-file")?.into()),
            "--allow-read" => a.allow_read.push(value("--allow-read")?.into()),
            "--json" => a.json = true,
            s if s.starts_with('-') => return Err(format!("unknown option {s}")),
            s if a.name.is_none() => a.name = Some(s.to_string()),
            s => return Err(format!("unexpected argument {s}")),
        }
    }
    if a.name.is_some() == a.from.is_some() {
        return Err("name exactly one template, or --from DIR".to_string());
    }
    Ok(a)
}

/// `--allow-read` shows the payload a program tree, read-only (macOS hides Homebrew by default, and
/// a template needs its interpreter). The home directory holds the user's data: neither it, nothing
/// inside it, nor anything containing it can be granted, whatever is typed.
fn checked_read_paths(paths: &[PathBuf], home: &Path) -> Result<Vec<PathBuf>, String> {
    let home = std::fs::canonicalize(home).unwrap_or_else(|_| home.to_path_buf());
    paths
        .iter()
        .map(|p| {
            let real = std::fs::canonicalize(p).map_err(|e| format!("--allow-read {}: {e}", p.display()))?;
            if real.starts_with(&home) || home.starts_with(&real) {
                return Err(format!("--allow-read {}: the home directory stays closed", p.display()));
            }
            Ok(real)
        })
        .collect()
}

/// Newest entry for `name` from a trusted publisher. Only an id: `activate` verifies everything.
fn pick_manifest_id(list: &serde_json::Value, name: &str, version: Option<&str>, trust: &TrustAllowlist) -> Option<String> {
    let trusted = |e: &serde_json::Value| e["publisher_pubkey"].as_str().and_then(decode32).is_some_and(|k| trust.contains(&k));
    list.as_array()?
        .iter()
        .filter(|e| e["name"] == name && version.is_none_or(|v| e["version"] == v) && trusted(e))
        .max_by_key(|e| e["published_at"].as_i64().unwrap_or(0))
        .and_then(|e| e["manifest_id"].as_str().map(str::to_string))
}

fn decode32(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 || !hex.is_ascii() {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

/// Download manifest and bundle into `stage`, HTTPS only (`fetch_bytes` refuses anything else).
fn stage_from_registry(args: &Args, trust: &TrustAllowlist, stage: &Path) -> Result<(), String> {
    use installer_engine::fetch::fetch_bytes;
    let base = args.registry.as_deref().unwrap_or(DEFAULT_REGISTRY).trim_end_matches('/');
    let name = args.name.as_deref().unwrap_or_default();
    let list: serde_json::Value =
        serde_json::from_slice(&fetch_bytes(&format!("{base}/manifests"))?).map_err(|e| format!("registry list: {e}"))?;
    let id = pick_manifest_id(&list, name, args.version.as_deref(), trust)
        .ok_or(format!("no template '{name}' from a trusted publisher in {base}"))?;
    if !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("registry returned a malformed manifest id".to_string());
    }
    let write = |file: &str, bytes: Vec<u8>| std::fs::write(stage.join(file), bytes).map_err(|e| format!("write {file}: {e}"));
    write("manifest.json", fetch_bytes(&format!("{base}/manifests/{id}"))?)?;
    write("bundle.tar.gz", fetch_bytes(&format!("{base}/manifests/{id}/bundle"))?)
}

fn doctor() -> ExitCode {
    let r = installer_engine::sandbox::doctor();
    match &r.backend {
        Some(b) => println!("Sandbox bereit: {b} ({})", r.os),
        None => println!("Keine Sandbox nutzbar ({}). Ohne Sandbox startet cads-run nichts.", r.os),
    }
    for (name, why) in &r.tried {
        println!("  {name}: {why}");
    }
    for step in &r.plan.steps {
        println!("  Schritt: {}", step.command_line().unwrap_or_else(|| step.description.clone()));
    }
    if r.backend.is_some() { ExitCode::SUCCESS } else { ExitCode::FAILURE }
}

fn run(args: Args) -> Result<InstallReport, String> {
    let trust = match &args.trust_file {
        Some(f) => TrustAllowlist::load_file(f)?,
        None => TrustAllowlist::parse(PINNED_PUBLISHERS)?,
    };
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let label = args.name.clone().unwrap_or_else(|| "local".to_string());
    if !label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err(format!("invalid template name '{label}'"));
    }
    let policy = SandboxPolicy { extra_ro_paths: checked_read_paths(&args.allow_read, &home)?, ..SandboxPolicy::default() };
    let root = home.join(".cads-run").join(format!("{label}-{now}-{}", std::process::id()));
    let (stage, work) = (root.join("stage"), root.join("work"));
    for d in [&stage, &work] {
        std::fs::create_dir_all(d).map_err(|e| format!("create {}: {e}", d.display()))?;
    }
    match &args.from {
        Some(dir) => {
            for f in ["manifest.json", "bundle.tar.gz"] {
                std::fs::copy(dir.join(f), stage.join(f)).map_err(|e| format!("{}: {e}", dir.join(f).display()))?;
            }
        }
        None => stage_from_registry(&args, &trust, &stage)?,
    }
    // bundle.url is signed and relative ("bundle.tar.gz"); it resolves against the staged copy.
    std::env::set_current_dir(&stage).map_err(|e| format!("enter {}: {e}", stage.display()))?;
    eprintln!("cads-run: Arbeitsordner {}", work.display());
    Ok(activate_with_policy(ActivateOptions {
        manifest_location: "manifest.json".to_string(),
        allowlist: trust,
        env_file: args.env_file.as_deref().map(std::path::absolute).transpose().map_err(|e| e.to_string())?,
        project_name: format!("cads-run-{label}"),
        protected_name_substrings: Vec::new(),
        work_dir: work,
        now,
        require_binary_sandbox: true,
    }, &policy))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, version: &str, publisher: &str, at: i64) -> serde_json::Value {
        serde_json::json!({ "manifest_id": format!("{name}-{version}"), "name": name, "version": version, "publisher_pubkey": publisher, "published_at": at })
    }

    #[test]
    fn picks_the_newest_trusted_entry_and_ignores_strangers() {
        let trust = TrustAllowlist::parse(PINNED_PUBLISHERS).unwrap();
        let stranger = "ab".repeat(32);
        let list = serde_json::json!([
            entry("demo", "1.0.0", PINNED_PUBLISHERS, 1),
            entry("demo", "2.0.0", PINNED_PUBLISHERS, 2),
            entry("demo", "9.9.9", &stranger, 3),
        ]);
        assert_eq!(pick_manifest_id(&list, "demo", None, &trust).as_deref(), Some("demo-2.0.0"));
        assert_eq!(pick_manifest_id(&list, "demo", Some("1.0.0"), &trust).as_deref(), Some("demo-1.0.0"));
        assert_eq!(pick_manifest_id(&list, "demo", Some("9.9.9"), &trust), None);
        assert_eq!(pick_manifest_id(&list, "other", None, &trust), None);
    }

    #[test]
    fn the_home_directory_cannot_be_granted() {
        let home = tempfile::tempdir().unwrap();
        let inside = home.path().join("sub");
        std::fs::create_dir(&inside).unwrap();
        let other = tempfile::tempdir().unwrap();
        for bad in [home.path().to_path_buf(), inside, PathBuf::from("/")] {
            assert!(checked_read_paths(&[bad.clone()], home.path()).is_err(), "{}", bad.display());
        }
        assert!(checked_read_paths(&[other.path().to_path_buf()], home.path()).is_ok());
        assert!(checked_read_paths(&[PathBuf::from("/does/not/exist")], home.path()).is_err());
    }
}

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    if argv.first().map(String::as_str) == Some("doctor") {
        return doctor();
    }
    let args = match parse(&argv) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("cads-run: {e}\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    let json = args.json;
    let report = match run(args) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("cads-run: abgelehnt: {e}");
            return ExitCode::FAILURE;
        }
    };
    if json {
        println!("{}", report.to_json());
    }
    match report {
        InstallReport::Ok { sandbox, captured_stdout, .. } => {
            if !json {
                print!("{}", captured_stdout.unwrap_or_default());
                println!("cads-run: fertig, geprüft und in der Sandbox gelaufen ({}).", sandbox.as_deref().unwrap_or("?"));
            }
            ExitCode::SUCCESS
        }
        InstallReport::Rejected { reason, .. } => {
            eprintln!("cads-run: abgelehnt: {reason}");
            ExitCode::FAILURE
        }
        InstallReport::Failed { step, detail, sandbox, .. } => {
            eprintln!("cads-run: fehlgeschlagen in {step} (Sandbox {}): {detail}", sandbox.as_deref().unwrap_or("keine"));
            ExitCode::FAILURE
        }
    }
}
