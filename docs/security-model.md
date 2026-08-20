# Security model (Phase 1)

A `ServiceManifest` is, functionally, a remote-code-execution primitive: it tells a ct-agent what
to build and run on a host it controls. This document is the canonical threat table for Phase 1 --
kept in sync with `crates/installer-engine/src/guardrails.rs`'s actual checks, not aspirational.

## Two separate trust checks, never conflated

1. **Signature validity** (`ServiceManifest::is_valid`) -- proves the manifest was *issued* by the
   holder of `publisher_pubkey`, and hasn't expired. It proves nothing about whether that
   publisher should be trusted.
2. **Publisher allowlist** (`installer_engine::allowlist::TrustAllowlist`) -- an explicit, local,
   operator-maintained list of pubkeys `installer-engine` will actually run manifests from. Never
   populated by anything the manifest itself asserts. No trust-on-first-use path exists anywhere
   in this crate.

A manifest that passes (1) but not (2) is rejected identically to one that fails (1).

## ct-agent#32's invariant: the agent must not hold the second secret

`ServiceManifest.env_template` carries variable **names** only, never values (see
`manifest-core`'s module doc). Secret values are always supplied locally, out-of-band, at install
time (`--env-file`/process env) -- never embedded in a signed, potentially-published artifact.
This mirrors `docs/adr/0014-out-of-band-capabilities.md`'s operator-blind philosophy in
CADS-Tunnel and the open discussion in `ct-agent#32` ("a compromised agent must not thereby gain a
general ability to self-authorize into arbitrary services").

## Threat table

| # | Risk | Guardrail | Enforced in |
|---|---|---|---|
| F.1 | Compose file publishes a non-loopback host port | Reject any `ports:` entry without an explicit `127.0.0.1`/`localhost` bind; absence of an explicit bind (Docker's own default is `0.0.0.0`) is a reject, not an allow. | `guardrails::check_ports` |
| F.2 | `privileged`, dangerous `cap_add`, `network_mode`/`pid`/`ipc: host`, `userns_mode`, `seccomp:unconfined` | Reject on presence, unconditionally. | `guardrails::check_dangerous_flags` |
| F.3 | Host path bind mount outside the bundle (container-escape mount, e.g. the Docker socket) | Reject any volume source that isn't a named volume or a path resolving inside the bundle's own scratch dir; the Docker socket path is always rejected outright. | `guardrails::check_volumes` |
| F.4 | `verify.sh` exfiltrates raw secret values | Spawned with a fully-scrubbed environment (`process::run_bounded` clears the environment and passes only the explicitly-listed, non-secret metadata) -- Phase 1's proof manifest needs no secret in `verify.sh` at all; a future manifest that does must inject via a narrowly-scoped mechanism, never a subprocess-inherited env var. | `activate::activate` step 10, `process::run_bounded` |
| F.5 | Manifest signed by an attacker-controlled but internally-consistent key | Publisher allowlist check is separate from and in addition to signature validity. | `activate::activate` steps 2-3 |
| F.6 | Bundle swapped after signing / served differently to different fetchers | Mandatory blocking `sha256` check, constant-time compare (`subtle`). | `fetch::verify_sha256` |
| F.7 | Tar-slip path traversal in the bundle | Every archive entry's resolved path is checked to stay inside the destination dir BEFORE writing; absolute paths and any `..` component are rejected outright. | `fetch::unpack_tar_gz_safely` |
| F.8 | Malicious `Dockerfile` build step (e.g. a bundled sidecar's own build) | **Not solved in Phase 1** -- cannot statically vet arbitrary `RUN` steps without a sandboxed builder. Mitigated by F.5 (publisher allowlist): only manifests from trusted publishers ever reach `docker compose up --build` at all. Documented residual risk, not silently assumed away. | -- (residual) |
| F.9 | Installer or `verify.sh` hangs indefinitely | Both bounded by the same process-group-kill-on-timeout discipline (`SIGKILL(-pgid)` on Unix) -- copies `ct-agent`'s own `run_service_handler_with_timeout` (native/src/channel_run/service_calls.rs:412-541, #183). | `process::run_bounded` |
| F.10 | Manifest declares `binary`/`k8s` but an installer runs it via the compose path anyway (type confusion) | Exhaustive `match` on `InstallerKind` with no fallback arm -- non-`Compose` variants have no executor code path at all. | `activate::activate` step 4 |
| F.11 | A proof/test-run install collides with real running infra (name/port clash) | Pre-flight check refuses to proceed if `project_name` contains a caller-supplied protected substring, or if any container/volume matching the target project name/prefix already exists. Checked BEFORE any network fetch. | `activate::preflight_collision_check` |
| Supply chain | Image tag (e.g. `:main-latest`) could be repointed upstream between signing and install | **Not solved in Phase 1** -- documented fast-follow: require pinned `@sha256:` digests in the guardrail scanner. | -- (residual, fast-follow) |

## What Phase 1 deliberately does not defend against

- A trusted publisher's own manifest containing a logic bug (a compose stack that's insecure by
  design but passes every guardrail above). Guardrails catch *known dangerous patterns*, not
  arbitrary bad judgment -- the allowlist is the actual trust boundary.
- Supply-chain compromise of an upstream base image referenced by tag rather than digest (see the
  table's last row).
- Anything about `Dockerfile` `RUN` step contents (F.8).

These are named here deliberately, per this project's own discipline of reporting refuted/unsolved
concerns explicitly rather than letting a threat table read as more complete than it is.
