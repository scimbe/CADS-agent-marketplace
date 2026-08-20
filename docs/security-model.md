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
| F.3 | Host path bind mount, or `build.context`, outside the bundle (container-escape mount or build-context read, e.g. the Docker socket, or a Dockerfile `COPY`ing an arbitrary host path into the built image) | Reject any volume source, or `build`/`build.context` (short or mapping form), that isn't a named volume or a path resolving inside the bundle's own scratch dir; the Docker socket path is always rejected outright; a non-local (URL) build context is rejected outright. | `guardrails::check_volumes`, `guardrails::check_build` |
| F.4 | `verify.sh` exfiltrates raw secret values | Spawned with a fully-scrubbed AMBIENT PROCESS environment (`process::run_bounded` clears the environment and passes only the explicitly-listed, non-secret metadata) -- this stops an unrelated ct-agent-process secret from being inherited. It does **not** stop `verify.sh` from reading the `.env` file `activate` itself writes into the same `work_dir` `verify.sh` runs in (that file necessarily holds this deployment's own resolved secret values, since `docker compose --env-file .env` needs them too) -- `verify.sh` can `cat .env` today, and, having full unrestricted network egress, could exfiltrate it out-of-band. The real backstop here is F.5 (publisher allowlist): a `verify.sh` this hostile can only come from an already-trusted publisher. Documented residual risk, not silently assumed away. | `activate::activate` step 10, `process::run_bounded` |
| F.5 | Manifest signed by an attacker-controlled but internally-consistent key | Publisher allowlist check is separate from and in addition to signature validity. | `activate::activate` steps 2-3 |
| F.6 | Bundle swapped after signing / served differently to different fetchers | Mandatory blocking `sha256` check, constant-time compare (`subtle`). | `fetch::verify_sha256` |
| F.7 | Tar-slip path traversal in the bundle | Every archive entry's resolved path is checked to stay inside the destination dir BEFORE writing; absolute paths and any `..` component are rejected outright. | `fetch::unpack_tar_gz_safely` |
| F.8 | Malicious `Dockerfile` build step (e.g. a bundled sidecar's own build) | **Not solved in Phase 1** -- cannot statically vet arbitrary `RUN` steps without a sandboxed builder. Mitigated by F.5 (publisher allowlist): only manifests from trusted publishers ever reach `docker compose up --build` at all. Documented residual risk, not silently assumed away. | -- (residual) |
| F.9 | Installer or `verify.sh` hangs indefinitely | Both bounded by the same process-group-kill-on-timeout discipline (`SIGKILL(-pgid)` on Unix) -- copies `ct-agent`'s own `run_service_handler_with_timeout` (native/src/channel_run/service_calls.rs:412-541, #183). | `process::run_bounded` |
| F.10 | Manifest declares `binary`/`k8s` but an installer runs it via the compose path anyway (type confusion) | Exhaustive `match` on `InstallerKind` with no fallback arm -- non-`Compose` variants have no executor code path at all. | `activate::activate` step 4 |
| F.11 | A proof/test-run install collides with real running infra (name/port clash) | Pre-flight check refuses to proceed if `project_name` contains a caller-supplied protected substring, or if any container/volume/network matching the target project name/prefix already exists. Checked BEFORE any network fetch. Note: this is a check-then-act race, not a lock -- two concurrent `activate` runs targeting the same `project_name` could both pass the check before either creates anything; not a concern for the single-operator Phase 1 workflow, but a real gap for any future concurrent/automated activation path. | `activate::preflight_collision_check` |
| F.12 | Unbounded manifest/bundle fetch -- a malicious, compromised, or merely misconfigured publisher endpoint returns an arbitrarily large HTTP response, exhausting memory on the operator's machine before any signature/hash check ever runs (F.5/F.6 authenticate content, but never bounded its size) | A 64 MiB cap applies to every `CT_MANIFEST_URL` fetch (manifest AND bundle). A declared `Content-Length` over the cap is refused before reading any body; a missing or lying declared length does not bypass it either -- the read itself is separately bounded. Distinct from the decompression-bomb risk below: this caps the RAW fetch, before decompression begins. | `fetch::read_bounded` |
| F.13 | Slow-loris publisher endpoint -- a byte cap alone does not stop a malicious or broken server from trickling bytes (or none at all) forever, hanging `activate` indefinitely with no feedback | `reqwest::blocking::get`'s bare convenience function has no default timeout. Fetches now go through a `Client` built with a 60s request timeout, which `reqwest`'s blocking client applies to the whole request lifecycle (connect, redirects, AND reading the body) -- mirrors ct-agent's own established `Client::builder().timeout(...)` convention for one-shot HTTP calls. | `fetch::fetch_bytes` |
| Supply chain | Image tag (e.g. `:main-latest`) could be repointed upstream between signing and install | **Not solved in Phase 1** -- documented fast-follow: require pinned `@sha256:` digests in the guardrail scanner. | -- (residual, fast-follow) |
| Bundle decompression resource exhaustion | A crafted small `.tar.gz` decompresses to an enormous/deeply-nested payload (zip-bomb shape), exhausting disk/memory during unpack | **Not solved in Phase 1** -- `fetch::unpack_tar_gz_safely` has no cap on decompressed entry size, entry count, or nesting depth; every entry is read fully into memory (`entry.read_to_end`) before being written. Mitigated only by F.5 (publisher allowlist) and F.9 (the overall `docker compose up` timeout bounds how long a stuck build can run, but not memory/disk used during unpack, which happens before that timeout even starts). Documented residual risk. | -- (residual) |
| Ambient env var name collision | `env_template` names a var the operator's `--env-file` does NOT supply, but which happens to already be set in the *activating ct-agent process's own environment* for an unrelated reason (e.g. an operational secret ct-agent needs for its other duties) | **By design, not a bug** -- `activate::resolve_env_template` intentionally falls back to `std::env::var` when the env-file lookup misses, exactly as this document's "out-of-band, at install time (`--env-file`/process env)" phrasing describes. This means an operator relying on ambient process env as a deliberate supply mechanism for ONE var is trusting that a malicious `env_template` cannot also pick up an unrelated var the same way. Operators should prefer `--env-file` exclusively and audit `ct-agent`'s own ambient environment before ever invoking `activate`. Documented residual risk, not silently assumed away. | `activate::resolve_env_template` |

## What Phase 1 deliberately does not defend against

- A trusted publisher's own manifest containing a logic bug (a compose stack that's insecure by
  design but passes every guardrail above). Guardrails catch *known dangerous patterns*, not
  arbitrary bad judgment -- the allowlist is the actual trust boundary.
- Supply-chain compromise of an upstream base image referenced by tag rather than digest (see the
  table's last row).
- Anything about `Dockerfile` `RUN` step contents (F.8).

These are named here deliberately, per this project's own discipline of reporting refuted/unsolved
concerns explicitly rather than letting a threat table read as more complete than it is.
