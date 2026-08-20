# ADR-0001: ServiceManifest signing follows AgentCard/CapacityOffer's shape, not a new scheme

## Status

Accepted (Phase 1).

## Context

A `ServiceManifest` needs to be authenticated the same way every other self-asserted document in
the CADS-Tunnel/ct-agent ecosystem is: a holder-signed, domain-separated, injective preimage.
CADS-Tunnel's `crates/common/src/channel.rs` already has two working instances of this pattern
(`AgentCard`, `CapacityOffer`), built on a shared `Preimage` builder
(`crates/common/src/preimage.rs`) that centralizes the one discipline that had previously been
hand-rolled ~14 times with the variable-length encoding written inconsistently (see that module's
own doc comment, #184/#252).

## Decision

`manifest-core::ServiceManifest` copies this shape exactly, in its own crate (not a dependency on
`ct_common`, to keep this crate small and independently vendorable into `ct-agent`):

- Its own domain separator, `cads-service-manifest-v1`, never reused for another type.
- A vendored copy of the `Preimage` builder (`manifest-core::preimage`) with byte-identical
  semantics to `ct_common::preimage::Preimage` -- same length-prefixed-domain, same
  `fixed`/`var_bytes`/`tag`/`u32`/`u64` field kinds.
- `sign_new`/`is_valid`/`signing_bytes` with the same signature shape as `AgentCard`'s.
- The publisher key is the SAME ed25519 holder key a ct-agent already uses for channel membership
  -- this is what lets an agent create/sign/publish manifests using its own existing identity,
  with no new PKI or key-management surface.

## Consequences

- No new cryptographic design to review from scratch -- this is a straightforward application of
  an already-reviewed pattern.
- `manifest-core` has zero dependency on `CADS-Tunnel`/`ct_common` crates, so it can be vendored
  into `ct-agent`'s `native/Cargo.toml` as a lightweight git dependency without pulling in that
  crate's much larger surface (channels, settlement, DHT, etc.).
- Signature validity is deliberately NOT sufficient trust -- see `docs/security-model.md`. A
  second, explicit publisher-allowlist check lives in `installer-engine`, never folded into
  `is_valid` itself, so the two concerns (issuance vs. trust) can't be silently conflated by a
  future caller who only checks one.
