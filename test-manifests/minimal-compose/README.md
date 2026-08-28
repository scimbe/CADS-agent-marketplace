# minimal-http-echo — a real, minimal, clean-pass test manifest

Built for interface-conformance testing (llm2's role): a genuinely real signed manifest, deliberately
trivial, that either exercises the full `installer-engine` pipeline (Docker present) or just the
manifest shape/signature/expiry validation (no Docker needed) — see "What it's for" below.

**Not a demo of anything.** It's test fixture, checked in specifically so it can be `git clone`d
and reacted to, per the registry-isn't-reachable-from-outside-this-host constraint (the real
registry only binds `127.0.0.1:8787`, no tunnel exposes it — see the parent repo's marketplace
docs for the general state).

## What's here

```
manifest.json    — a real, dev-signed ServiceManifest (ed25519, ct's actual signing discipline —
                    see manifest-core::ServiceManifest::signing_bytes for the canonical preimage)
bundle.tar.gz     — the signed bundle: compose.yml + verify.sh (sha256 in manifest.json's
                    bundle.sha256, checked by installer-engine before anything runs)
bundle/           — the SAME two files, unpacked, for reading without extracting the tarball
```

`bundle.url` in the manifest is the **relative** path `"bundle.tar.gz"` — this only resolves
correctly if the process reading it has this directory (`test-manifests/minimal-compose/`) as its
own working directory. That's a real, deliberate property of `installer-engine::fetch::fetch_bytes`
(anything not `http(s)://` is read via `std::fs::read(location)`, resolved against the *process's*
CWD, not the manifest.json's own location) — not a bug, but you need to `cd` here first.

## The service itself

One container, `hashicorp/http-echo`, bound to `127.0.0.1:8765` only, answering every request with
a fixed text body (`ECHO_TEXT` env var, optional, defaults to `hello from CADS-agent-marketplace`
if unset — see `manifest.json`'s `env_template`). `verify.sh` curls it and checks the exact body.
Nothing else. It exists to be trivially real, not to demonstrate anything about http-echo itself.

## What's real vs. what you're checking

Verified by the publisher (this session) before commit — re-run these yourself, don't trust this
file's claims:

- `docker compose -f bundle/compose.yml up -d` really brings up a real container that really
  answers on `127.0.0.1:8765` with the expected body — confirmed by hand before packaging.
- The full `installer-engine::activate()` pipeline (fetch → sha256 check → guardrail scan →
  `docker compose up` → `verify.sh`, exact code path a real `ct-agent manifest activate` runs) was
  run against this exact `manifest.json`/`bundle.tar.gz` pair via
  `cargo run --example dev_activate -p installer-engine` from this directory — real output:
  `"status": "ok"`, `compose_up.exit_code: 0`, `verify.exit_code: 0`.
- The signature is real (ed25519 over the canonical preimage, `manifest-core::ServiceManifest::signing_bytes`)
  — this is a throwaway test keypair (`publisher_pubkey` in `manifest.json`), not tied to any real
  holder identity. Don't read anything into whose key signed it beyond "a real signature exists and
  verifies."

## Two ways to react to this, both real

1. **Shape-only**: parse `manifest.json`, validate its field set against the authoritative
   `ServiceManifest` struct (`crates/manifest-core/src/manifest.rs`), verify the signature and
   `expires_at`, check `bundle.sha256` against the actual tarball bytes — all without needing
   Docker or running anything.
2. **Full install→verify loop**: if Docker is available on your host, `cd` into this directory and
   run the real installer-engine pipeline end to end — either build+run
   `cargo run --example dev_activate -p installer-engine` from the parent repo with
   `CT_MANIFEST_URL` pointed at this `manifest.json` and `CT_MANIFEST_TRUST_ALLOWLIST` set to the
   `publisher_pubkey` above, or drive `installer_engine::activate()` directly from your own test
   harness — same function, same semantics, whichever fits how you're testing.

## Round two (not yet built, on request)

A deliberately-flagged manifest (trips one of `guardrails.rs`'s real rules) and an
expired-signature manifest — held back until the first reactive round defines what "passing" needs
to look like, per the plan. Ask if you want them now instead.
