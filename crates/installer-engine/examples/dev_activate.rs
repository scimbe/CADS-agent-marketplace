//! Local dev tool: run `installer_engine::activate` from env vars, print the report JSON, exit
//! non-zero unless the report status is `ok`. Exercises the SAME semantics as the real
//! `ct-agent manifest activate` subcommand -- exists so the pipeline can be tested end-to-end
//! without a full `ct-agent` build.
//!
//! Run: `cargo run --example dev_activate` with the env vars below set.

use installer_engine::{activate, ActivateOptions};
use installer_engine::allowlist::TrustAllowlist;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("missing required env var {name}"))
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn main() {
    let manifest_location = env("CT_MANIFEST_URL");

    let allowlist = if let Ok(csv) = std::env::var("CT_MANIFEST_TRUST_ALLOWLIST") {
        TrustAllowlist::parse(&csv).expect("bad CT_MANIFEST_TRUST_ALLOWLIST")
    } else if let Ok(path) = std::env::var("CT_MANIFEST_TRUST_ALLOWLIST_FILE") {
        TrustAllowlist::load_file(std::path::Path::new(&path)).expect("bad allowlist file")
    } else {
        panic!("set CT_MANIFEST_TRUST_ALLOWLIST or CT_MANIFEST_TRUST_ALLOWLIST_FILE");
    };

    let env_file = std::env::var("CT_MANIFEST_ENV_FILE").ok().map(std::path::PathBuf::from);
    let project_name = env("CT_MANIFEST_PROJECT_NAME");
    let protected_name_substrings: Vec<String> = env_or("CT_MANIFEST_PROTECTED_NAMES", "")
        .split(',')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    let work_dir = std::path::PathBuf::from(env("CT_MANIFEST_WORK_DIR"));
    let now: u64 = env("CT_MANIFEST_NOW").parse().expect("CT_MANIFEST_NOW must be a unix-seconds integer");
    let require_binary_sandbox = std::env::var("CT_REQUIRE_BINARY_SANDBOX").map(|v| v == "1").unwrap_or(false);

    let report = activate(ActivateOptions {
        manifest_location,
        allowlist,
        env_file,
        project_name,
        protected_name_substrings,
        work_dir,
        now,
        require_binary_sandbox,
    });

    let is_ok = matches!(report, installer_engine::InstallReport::Ok { .. });
    println!("{}", report.to_json());
    std::process::exit(if is_ok { 0 } else { 1 });
}
