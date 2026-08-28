# CADS Agent Marketplace

Signed service manifests + installer for [ct-agent](https://github.com/scimbe/ct-agent). Lets a
ct-agent activate a signed, holder-key-authored manifest that deterministically installs, runs,
and verifies a service behind its tunnel — instead of the operator hand-wiring
`CT_AGENT_SERVICE_HANDLER_CMD` to a locally-trusted script.

**Status: Phase 1.** One `installer_kind` shipped so far (`compose`; `binary` also runs without a
Docker daemon present, with a loud unsandboxed-execution warning — see the
[sandbox fallback design](design/sandbox-fallback.md) for what closes that gap). A
multi-agent composition format is designed but not yet built — see
[the composition manifest design](design/composition-manifest.md). Later phases (a
signed-prompt CLI harness, a `k8s` installer backend, a marketplace registry + billing, an admin
web portal) are named but not built yet — see the repo's
[issues](https://github.com/scimbe/CADS-agent-marketplace/issues).

## Layout

- `crates/manifest-core` — the `ServiceManifest` schema + ed25519 signing/verification. No I/O.
- `crates/installer-engine` — fetch/verify/unpack/guardrail-scan/compose-run/report.
- `manifests/litellm-proof` — the Phase 1 proof-of-concept manifest (an isolated, safely-named
  reproduction of a real LiteLLM proxy stack — never the real, live deployment).
- `scripts/` — local dev loop helpers (sign/activate against a throwaway key).
- `docs/adr/` — architecture decision records, numbered like `CADS-Tunnel`'s own `docs/adr/`.

## Start here

- **[Security model](security-model.md)** — the threat table: what a manifest can and can't do,
  and why a valid signature is never sufficient trust on its own.
- **[Design docs](design/composition-manifest.md)** — proposals for work not yet built, grounded
  against the real shipped code rather than invented from scratch.
- **[ADRs](adr/0001-manifest-signing.md)** — the architecture decisions already made, and why.

## Security model, short version

A manifest is a remote-code-execution primitive by design — it tells a ct-agent what to build and
run. Every manifest is ed25519-signed by its publisher's holder key (the same key family a
ct-agent already uses for channel membership), but **a valid signature is never sufficient
trust** — `installer-engine` additionally checks the publisher against an explicit,
operator-maintained allowlist (never trust-on-first-use), and statically guardrail-scans the
bundle's compose file before running anything (no non-loopback ports, no privileged/host-namespace
flags, no host path bind mounts outside the bundle). See the [security model](security-model.md)
page for the full threat table.
