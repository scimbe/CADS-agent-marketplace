//! Local dev tool: build and sign a `ServiceManifest` from env vars, print the signed JSON to
//! stdout. Exercises the SAME field set/semantics as the real `ct-agent manifest create`+`sign`
//! subcommands (see `ct-agent`'s `native/src/manifest_run/` for the production CLI) -- this
//! example exists so the installer-engine pipeline can be tested end-to-end without needing a
//! full `ct-agent` build (which needs network access to this repo as a git dependency).
//!
//! Run: `cargo run --example dev_sign` with the env vars below set.

use manifest_core::{BundleRef, DemoPrompt, EnvVarSpec, InstallerKind, ServiceManifest, VerifySpec};

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("missing required env var {name}"))
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn decode_hex32(s: &str) -> [u8; 32] {
    assert!(s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()), "{s} is not 64 hex chars");
    let mut out = [0u8; 32];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).unwrap();
    }
    out
}

fn main() {
    let holder_key_hex = env("CT_MANIFEST_HOLDER_KEY");
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&decode_hex32(&holder_key_hex));

    let name = env("CT_MANIFEST_NAME");
    let version = env("CT_MANIFEST_VERSION");
    let kind = match env_or("CT_MANIFEST_KIND", "compose").as_str() {
        "compose" => InstallerKind::Compose,
        "binary" => InstallerKind::Binary,
        "k8s" => InstallerKind::K8s,
        other => panic!("CT_MANIFEST_KIND '{other}' is not one of compose|binary|k8s"),
    };
    let compose_file = env("CT_MANIFEST_COMPOSE_FILE");
    let bundle_url = env("CT_MANIFEST_BUNDLE_URL");
    let bundle_sha256 = decode_hex32(&env("CT_MANIFEST_BUNDLE_SHA256"));
    let verify_script = env("CT_MANIFEST_VERIFY_SCRIPT");
    let verify_timeout_secs: u64 = env_or("CT_MANIFEST_VERIFY_TIMEOUT_SECS", "60").parse().unwrap();

    let env_template: Vec<EnvVarSpec> = env_or("CT_MANIFEST_ENV_VARS", "")
        .split(';')
        .filter(|s| !s.is_empty())
        .map(|entry| {
            let mut parts = entry.splitn(3, ':');
            let name = parts.next().unwrap().to_string();
            let required = parts.next().unwrap_or("true") == "true";
            let description = parts.next().unwrap_or("").to_string();
            EnvVarSpec { name, required, description }
        })
        .collect();

    let now = env_or("CT_MANIFEST_NOW", "0").parse::<u64>().unwrap();
    let expires_in: u64 = env_or("CT_MANIFEST_EXPIRES_IN_SECS", "31536000").parse().unwrap();

    let manifest_id_hex = env_or("CT_MANIFEST_ID", "0707070707070707070707070707070707070707070707070707070707070707");
    let manifest_id = decode_hex32(&manifest_id_hex[..64]);

    // Optional guided-natural-language-config block, marketplace#43-class -- raw DemoPrompt JSON
    // (see manifest_core::manifest::{DemoPrompt, PromptParam, PromptParamKind} for the exact
    // shape), e.g. {"system":"...","parameters":[{"name":"location","type":"enum","options":["Hamburg","Berlin"]}],"examples":["..."]}.
    // Unset -> None, same as before this field existed. The real `ct-agent manifest create`+`sign`
    // CLI (a separate repo, see the module doc above) needs the equivalent env var wired up there
    // too -- this is a reference implementation for that, not a substitute for it.
    let demo_prompt: Option<DemoPrompt> = match std::env::var("CT_MANIFEST_DEMO_PROMPT") {
        Ok(raw) if !raw.trim().is_empty() => {
            Some(serde_json::from_str(&raw).unwrap_or_else(|e| panic!("CT_MANIFEST_DEMO_PROMPT is not valid DemoPrompt JSON: {e}")))
        }
        _ => None,
    };

    let manifest = ServiceManifest::sign_new(
        &signing_key,
        manifest_id,
        name,
        version,
        kind,
        BundleRef { url: bundle_url, sha256: bundle_sha256, compose_file },
        env_template,
        VerifySpec { script: verify_script, timeout_secs: verify_timeout_secs },
        now,
        now + expires_in,
        demo_prompt,
    );

    println!("{}", serde_json::to_string_pretty(&manifest).unwrap());
}
