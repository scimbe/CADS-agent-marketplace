# CADS-agent-marketplace

Signed service manifests + installer for [ct-agent](https://github.com/scimbe/ct-agent). Lets a
ct-agent activate a signed, holder-key-authored manifest that deterministically installs, runs,
and verifies a service behind its tunnel -- instead of the operator hand-wiring `CT_AGENT_SERVICE_HANDLER_CMD`
to a locally-trusted script.

**Docs:** https://scimbe.github.io/CADS-agent-marketplace-docs/ -- Diataxis-structured (tutorials,
how-to, reference, explanation), same convention as `CADS-Tunnel-docs`/`CADS-devsystem-docs`. The
design docs and security model referenced below also live there in rendered form.

**Status: Phase 1.** One `installer_kind`: `compose`. See `docs/adr/0001-manifest-signing.md` and
`docs/security-model.md` for the design and threat model. Later phases (a signed-prompt CLI
harness, `binary`/`k8s` installer backends, a marketplace registry + billing, an admin web portal)
are named but not built yet -- see this repo's issues.

## Layout

- `crates/manifest-core` -- the `ServiceManifest` schema + ed25519 signing/verification. No I/O.
- `crates/installer-engine` -- fetch/verify/unpack/guardrail-scan/compose-run/report.
- `manifests/litellm-proof` -- the Phase 1 proof-of-concept manifest (an isolated, safely-named
  reproduction of a real LiteLLM proxy stack -- never the real, live deployment).
- `scripts/` -- local dev loop helpers (sign/activate against a throwaway key).
- `docs/adr/` -- architecture decision records, numbered like CADS-Tunnel's own `docs/adr/`.

## Security model (short version)

A manifest is a remote-code-execution primitive by design -- it tells a ct-agent what to build and
run. Every manifest is ed25519-signed by its publisher's holder key (the SAME key family a ct-agent
already uses for channel membership), but **a valid signature is never sufficient trust** --
`installer-engine` additionally checks the publisher against an explicit, operator-maintained
allowlist (never trust-on-first-use), and statically guardrail-scans the bundle's compose file
before running anything (no non-loopback ports, no privileged/host-namespace flags, no host path
bind mounts outside the bundle). See `docs/security-model.md` for the full threat table.
