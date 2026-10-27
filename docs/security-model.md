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
| F.4 | `verify.sh` exfiltrates raw secret values | Spawned with a fully-scrubbed AMBIENT PROCESS environment (`process::run_bounded` clears the environment and passes only the explicitly-listed, non-secret metadata) -- this stops an unrelated ct-agent-process secret from being inherited. It does **not** stop `verify.sh` from reading the `.env` file `activate` itself writes into the same `work_dir` `verify.sh` runs in (that file necessarily holds this deployment's own resolved secret values, since `docker compose --env-file .env` needs them too) -- `verify.sh` can `cat .env` today, and, having full unrestricted network egress, could exfiltrate it out-of-band. The real backstop here is F.5 (publisher allowlist): a `verify.sh` this hostile can only come from an already-trusted publisher. Documented residual risk, not silently assumed away. **scimbe/ct-agent#183 phase 1 (2026-09-07) did not change this**: `verify.sh` still runs on the host, unsandboxed, with full egress, for Compose AND Binary (only the Binary executable itself is sandboxed); the environment contract's `hooks.verify` is signed and validated but not yet enforced. Running the verify hook under the same backend as the Binary arm is the phase-2 item. | `activate::activate` step 10, `process::run_bounded` |
| F.5 | Manifest signed by an attacker-controlled but internally-consistent key | Publisher allowlist check is separate from and in addition to signature validity. | `activate::activate` steps 2-3 |
| F.6 | Bundle swapped after signing / served differently to different fetchers | Mandatory blocking `sha256` check, constant-time compare (`subtle`). | `fetch::verify_sha256` |
| F.7 | Tar-slip path traversal in the bundle | Every archive entry's resolved path is checked to stay inside the destination dir BEFORE writing; absolute paths and any `..` component are rejected outright. | `fetch::unpack_tar_gz_safely` |
| F.8 | Malicious `Dockerfile` build step (e.g. a bundled sidecar's own build) | **Partially mitigated since scimbe/ct-agent#183 phase 1 (2026-09-07)**: every `build:` must be the mapping form declaring `network: none` (`F.8-build-network-not-none`), so `RUN` steps execute with no network at build time -- no download, no exfiltration of the build context. The `RUN` contents themselves still cannot be vetted (the daemon is root-equivalent and ct-agent cannot sandbox it); F.5 (publisher allowlist) remains the backstop. Known gap: `harness-core`'s `rebuild` tool re-runs `docker compose build` on a compose file the task may have edited via `write_file` without re-scanning it -- a re-scan before `rebuild` is a follow-up. | `guardrails::check_build_network` (scan time); residual for `RUN` contents |
| F.9 | Installer or `verify.sh` hangs indefinitely | Both bounded by the same process-group-kill-on-timeout discipline (`SIGKILL(-pgid)` on Unix) -- copies `ct-agent`'s own `run_service_handler_with_timeout` (native/src/channel_run/service_calls.rs:412-541, #183). | `process::run_bounded` |
| F.10 | Manifest declares `binary`/`k8s` but an installer runs it via the compose path anyway (type confusion) | Exhaustive `match` on `InstallerKind` with no fallback arm -- non-`Compose` variants have no executor code path at all. | `activate::activate` step 4 |
| F.11 | A proof/test-run install collides with real running infra (name/port clash) | Pre-flight check refuses to proceed if `project_name` contains a caller-supplied protected substring, or if any container/volume/network matching the target project name/prefix already exists. Checked BEFORE any network fetch. Note: this is a check-then-act race, not a lock -- two concurrent `activate` runs targeting the same `project_name` could both pass the check before either creates anything; not a concern for the single-operator Phase 1 workflow, but a real gap for any future concurrent/automated activation path. | `activate::preflight_collision_check` |
| F.12 | Unbounded manifest/bundle fetch -- a malicious, compromised, or merely misconfigured publisher endpoint returns an arbitrarily large HTTP response, exhausting memory on the operator's machine before any signature/hash check ever runs (F.5/F.6 authenticate content, but never bounded its size) | A 64 MiB cap applies to every `CT_MANIFEST_URL` fetch (manifest AND bundle). A declared `Content-Length` over the cap is refused before reading any body; a missing or lying declared length does not bypass it either -- the read itself is separately bounded. Distinct from the decompression-bomb risk below: this caps the RAW fetch, before decompression begins. | `fetch::read_bounded` |
| F.13 | Slow-loris publisher endpoint -- a byte cap alone does not stop a malicious or broken server from trickling bytes (or none at all) forever, hanging `activate` indefinitely with no feedback | `reqwest::blocking::get`'s bare convenience function has no default timeout. Fetches now go through a `Client` built with a 60s request timeout, which `reqwest`'s blocking client applies to the whole request lifecycle (connect, redirects, AND reading the body) -- mirrors ct-agent's own established `Client::builder().timeout(...)` convention for one-shot HTTP calls. | `fetch::fetch_bytes` |
| F.14 | `InstallerKind::Binary` has no static-analysis equivalent to `guardrails::scan_compose` -- prior to CADS-agent-marketplace#12, a trusted-but-malicious or compromised publisher's Binary executable ran with FULL, unconfined access to the whole host (filesystem, network, every other process), not just the install -- and no pre-execution warning said so | `installer_engine::sandbox` wraps the executable in a per-OS lightweight sandbox when one is available -- `bubblewrap` on Linux (`installer_engine::sandbox::bwrap`), confining network (no namespace at all -- F.1-equivalent), PID/UTS/IPC namespace sharing (F.2-equivalent), and filesystem writes outside `work_dir` (F.3-equivalent), verified by a real sandboxed-exec probe, not just a `--version` check (some hardened kernels/LSM configs let `--version` succeed while a real sandboxed exec fails). **Fail closed by default since scimbe/ct-agent#183 phase 1 (2026-09-07)**: when no backend is usable on a given host (macOS and Windows now have backends -- see the coverage table below), the activation is REFUSED with a reason that carries the probe's own failure (bwrap's stderr verbatim, plus -- when it shows `RTM_NEWADDR`/`userns`/`apparmor`/`Permission denied` -- the hint naming Ubuntu 24.04's `kernel.apparmor_restrict_unprivileged_userns` and the `bwrap-userns-restrict` AppArmor profile). The probe itself now runs with `--unshare-user --unshare-pid --unshare-net --ro-bind / /`, the same namespace flags the real run uses, so the Ubuntu loopback-setup failure is caught at probe time instead of at first use. The only opt-out is `CT_ALLOW_UNSANDBOXED=1` (`activate::require_binary_sandbox_from_env`), which restores warn-and-proceed: the loud pre-execution warning fires, then the executable runs unconfined. `CT_REQUIRE_BINARY_SANDBOX=1` is still accepted and is a no-op. `installer_engine::plan` previews the backend, argv and refusals without running anything but the probe. Since the sandbox-everywhere work (WP4) the bundle's `verify.sh` runs inside the same backend, and macOS (`sandbox_exec`) and Windows (`wsl_bwrap`) have backends -- see "Sandbox coverage by OS" below. Documented residual: even sandboxed there are no resource limits (memory/CPU) yet -- the environment contract declares them (`resources`) but phase 1 does not enforce them. | `installer_engine::sandbox`, `activate::activate` step 9's Binary arm, `activate::require_binary_sandbox_from_env`, `installer_engine::plan` |
| F.15 | Supply chain: an image tag (e.g. `:main-latest`) is repointed upstream between signing and install | Every `image:` must be digest-pinned (`name[:tag]@sha256:<64 hex>`), else `F.15-image-not-digest-pinned` -- the bytes that run are the bytes the publisher signed against. Strict by default; a caller with a documented reason may soften it per call via `GuardrailPolicy { require_image_digest: false }` (`scan_compose_with`); `activate` never does. Since scimbe/ct-agent#183 phase 1 (2026-09-07). | `guardrails::check_image_digest` |
| F.16 | A service runs with a writable rootfs, default capabilities, privilege escalation, unbounded pids or memory | Each service must declare `read_only: true`, `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, a positive `pids_limit`, and `mem_limit` (or `deploy.resources.limits.memory`); each missing key is its own named `F.16-missing-*` violation, so an operator gets the full list at once. CPU limits are declared by the environment contract but not yet required in the compose file. Since scimbe/ct-agent#183 phase 1. | `guardrails::check_runtime_hardening` |
| F.17 | A manifest's environment contract promises more than the sandbox gives (host-loopback reachability, egress), so a publisher's stated policy silently diverges from the runtime's | `ServiceManifest.environment` (`manifest_core::EnvironmentContract`) is optional, signed (trailing tagged preimage block after `demo_prompt`; absent = strictest default, never "unrestricted"), and validated (`validate()`: schema, port ranges, non-empty justifications, positive bounds). `network.mode == host_loopback` or any `egress` entry is REFUSED at activation ("not supported in phase 1"). Everything else in the contract (filesystem scope, process allowlist, resources, hooks, `sandbox_min_tier`) is declared but NOT enforced yet -- documented, not assumed. ct-agent's `UnsignedManifest` (`deny_unknown_fields`) must add the field before it can sign one (follow-up). | `activate::environment_contract_refusal` (step 4b), `manifest_core::environment` |
| F.18 | A harness task rewrites its own audit trail or the activation marker (both used to live inside the writable bundle) | The transcript is written to `<state_dir>/harness/<manifest_id>.transcript.jsonl` (0700 dir, 0600 file; `harness_core::run_task_with_state_dir`), outside the only directory `write_file` can reach; `containment::resolve_in_bundle` additionally refuses `.env`, `.ct-agent-activation.json` and `.harness-transcript.jsonl` at any depth. The deprecated `run_task`/`append_transcript_in_bundle` keep the old in-bundle location until ct-agent switches. Since scimbe/ct-agent#183 phase 1. | `harness_core::containment`, `harness_core::report` |
| Bundle decompression resource exhaustion | A crafted small `.tar.gz` decompresses to an enormous/deeply-nested payload (zip-bomb shape), exhausting disk/memory during unpack | **Not solved in Phase 1** -- `fetch::unpack_tar_gz_safely` has no cap on decompressed entry size, entry count, or nesting depth; every entry is read fully into memory (`entry.read_to_end`) before being written. Mitigated only by F.5 (publisher allowlist) and F.9 (the overall `docker compose up` timeout bounds how long a stuck build can run, but not memory/disk used during unpack, which happens before that timeout even starts). Documented residual risk. | -- (residual) |
| Ambient env var name collision | `env_template` names a var the operator's `--env-file` does NOT supply, but which happens to already be set in the *activating ct-agent process's own environment* for an unrelated reason (e.g. an operational secret ct-agent needs for its other duties) | **By design, not a bug** -- `activate::resolve_env_template` intentionally falls back to `std::env::var` when the env-file lookup misses, exactly as this document's "out-of-band, at install time (`--env-file`/process env)" phrasing describes. This means an operator relying on ambient process env as a deliberate supply mechanism for ONE var is trusting that a malicious `env_template` cannot also pick up an unrelated var the same way. Operators should prefer `--env-file` exclusively and audit `ct-agent`'s own ambient environment before ever invoking `activate`. Documented residual risk, not silently assumed away. | `activate::resolve_env_template` |

### Sandbox coverage by OS (what is measured, what is not)

`installer_engine::sandbox` confines a Binary manifest's executable **and** its `verify.sh` (step
10 runs inside the same backend, no network, writes only to `work_dir`). Compose is not covered by
this: its protection is the static guardrails above, and its `verify.sh` still runs on the host
because it needs the Docker socket and the published ports (F.4).

| OS | Backend | Status | Evidence |
|---|---|---|---|
| Linux | `bwrap` (`/usr/bin/bwrap`) | Built; real-exec probe with the runtime's own flags. After the security review (PR #53): allowlisted read-only view (`/usr`, `/bin`, `/sbin`, `/lib*`, a few `/etc` files; no `$HOME`, no host `/proc`), `--proc`/`--dev`, `--unshare-all`, `--cap-drop ALL`, `--new-session`, `--die-with-parent`, read-only root, rlimits | `sandbox::bwrap::tests::real::*` (host `/proc/<pid>/root` writes and `environ` reads fail; `$HOME/.ssh` unreadable; `/tmp` and `/` read-only) and the activate confinement test, executed in the `gate` CI job (the job fails if they skip). NOT run on the macOS development host |
| macOS | Seatbelt (`sandbox_exec`) | Built; **measured on macOS 27.0.1 (build 26A434), arm64** | `sandbox::sandbox_exec::tests::real::*` and `activate::tests::a_binary_manifest_and_its_verify_script_are_genuinely_confined_by_sandbox_exec_on_macos` execute for real: a write outside `work_dir`, a read of a file outside the allowlist, and a TCP connect to a live loopback listener all fail from inside; `work_dir` writes succeed; the environment is cleared. The `macos-latest` CI job runs them |
| Windows | `wsl_bwrap` (bubblewrap in the DEDICATED WSL2 distro `cads-sandbox`, via `%SystemRoot%\System32\wsl.exe`) | **Compile-tested and unit-tested only** (argv, path translation, quoting round-trip, wsl.conf/interop checks, setup plan); **never executed on Windows** | `sandbox::wsl::tests`; `gate-windows` CI job. The probe fails closed unless `wsl.conf` has `[interop] enabled=false` + `appendWindowsPath=false` and the live `WSLInterop` state is absent/`disabled`. Real isolation and `wsl.exe` argument passing are unmeasured |
| Android | none | **Not built**; Binary manifests are refused (`unsupported_platform`) | ADR-0002 (Proposed) |

#### Agent CLIs in the sandbox (BYO agent subscription)

`harness-core`'s `LocalCliBackend` runs the customer's own agent CLI through the same backends with
an extended `SandboxPolicy` (extra read-only paths for the CLI and its runtime, one writable per-run
HOME and TMPDIR, `NetworkPolicy::Outbound`). Fail closed: no backend, or a
backend that cannot honour the policy (WSL), refuses the run. Measured: a real `claude -p` turn
reaches the API from inside Seatbelt, and a prompt asking it to read a canary outside the work dir
exposes nothing. **The keychain is unreachable**: a review showed that with `/usr/bin` executable and
the Security server reachable, `security find-generic-password -w` returned any application-readable
item, so `security(1)` and `com.apple.SecurityServer` are denied as the last rules of every profile
(regression test with a throw-away keychain), and the Claude credential is a `claude setup-token`
token passed over a file descriptor. **Residual risk:** outbound tcp/443 is not host-restricted, so data the agent can read
(the bundle, its copied login) can be exfiltrated to any 443 endpoint by a prompt-injected agent;
the next step is a provider-host allowlist via a proxy. Details: `docs/byo-agent-backend.md`.

Fail closed on every OS: when the real-exec probe finds no usable backend the activation is
REFUSED, and the refusal names the setup step (`ct-agent doctor sandbox`; programmatically
`installer_engine::sandbox::doctor()` / `setup_plan()` / `apply()`, which run only unelevated
steps and print the elevated ones). The only override is the loudly-logged operator decision
`CT_ALLOW_UNSANDBOXED=1`; `CT_REQUIRE_BINARY_SANDBOX=1` is accepted and is a no-op. On Windows the
override is not honoured: a Linux payload cannot run natively there, so there is no unsandboxed
mode (this is decision B3 of scimbe/ct-agent#183, narrowed: Windows is no longer refused outright,
it is refused only without a working WSL2 backend).

Known limits of the backends, stated rather than implied:

- **macOS Seatbelt** has no PID/UTS/IPC namespace: the payload can still see and signal same-UID
  processes. `file-read-metadata` is allowed everywhere (existence and size are visible, contents
  are not). The policy was derived empirically (dyld needs a read of `/` and of `/System`), is
  specific to the macOS version it was measured on, and `sandbox-exec` is deprecated by Apple with
  no replacement for arbitrary executables. Seatbelt does not nest: inside another sandbox the
  probe fails and the refusal says so. Loopback can be allowed only through the explicit
  `SandboxExec::with_loopback()` constructor, and it is the *host's* shared loopback, not a private
  one; nothing in the installer turns it on, and a `host_loopback` contract is still refused.
- **Windows/WSL2**: interop (launching Windows `.exe` from the distro) is closed by requiring the
  dedicated distro to have interop and the Windows `PATH` disabled, checked in `wsl.conf` and live
  at every probe; doctor creates and configures that distro. The automount root is read from the
  distro's `wsl.conf`; only `work_dir` is mounted into the sandbox. Unmeasured on a real Windows host.
- **Linux/bwrap** needs unprivileged user namespaces. On Ubuntu 24.04+ the AppArmor restriction
  makes bwrap fail with `loopback: Failed RTM_NEWADDR`; doctor recognises that symptom (and the
  sysctl) and prints the AppArmor-profile steps, and the activation stays refused until fixed.
  NixOS-style layouts without `/usr` are not supported by the allowlist.
- Resource caps are `RLIMIT_CPU` (600 s), `RLIMIT_FSIZE` (4 GiB) and `RLIMIT_NPROC` (8192, which counts every process of the user, never raised above the user's own limit), set via `setrlimit` (`prlimit` in WSL). There is NO memory cap and no disk quota; Compose has the same gap.

## Prompt templates (`PromptTemplate`)

A `PromptTemplate` (`manifest-core::prompt_template`, domain `cads-prompt-template-v1`) is a
publisher-signed prompt a customer fills in interactively. It is a separate signed type from
`ServiceManifest`: it installs and runs nothing by itself, it produces text.

**Trust model.**

- The publisher signs the body, every parameter bound (the same `PromptParam` encoding the demo
  prompt uses) and every component reference. Tampering with any of them -- widening an enum or a
  `Text` length, swapping a component digest, rewriting a usage note -- invalidates the signature.
- `validate_structure` makes "may only reference provenance-secured components" a checked property:
  a `{{component:x}}` must name a declared `ComponentRef`, a placeholder must name a declared
  parameter, and declared-but-unused parameters/components are rejected, so what the signature
  covers is exactly what the body can reach.
- As with manifests, signature validity (`is_valid`) is **issuance, not trust**: the consumer still
  checks `publisher_pubkey` against its own trust list. `render` verifies the signature but not
  expiry; the caller applies `is_valid(now)` with its own clock (`render_at(now, …)`, used by the wasm
  `renderPromptTemplate`, does both). The wasm values input refuses duplicate JSON keys.

**What "provenance" means here.** A `ComponentRef` records how the *publisher used and tested* a
component: the sha256 of the exact artifact plus a signed usage note (version, OS, command). It does
**not** establish where the component came from, who wrote it, or that its bytes are benign -- the
same limit as digest-pinned images (F.15 above). A consumer that fetches the artifact must re-hash
it against `sha256` itself; this crate only carries the claim.

**Free text is data, not instructions.** `Text` is the one parameter kind with no closed value set.
`render` therefore (1) bounds it (`max_len` chars, at most 8192; optionally `multiline` with
`max_lines`, signed with the param), (2) rejects hidden-text carriers by Unicode category -- Cc, Cf,
Co, Cn, Zl, Zp (so zero-width, bidi, private-use and unassigned code points), plus variation
selectors, the Tags block (invisible "tag-encoded" text) and a few other invisible characters; the
only control character ever allowed is `\n` in a multi-line param (`\r\n` is normalised to `\n`, a
lone `\r` is refused), (3) substitutes in one pass, so a value containing `{{...}}` is never
expanded, and (4) wraps each occurrence in `<customer-input name="...">...</customer-input>` with
`&`, `<`, `>` and the angle-bracket lookalikes (fullwidth, `‹ ›`, `⟨ ⟩`, `〈 〉`, small forms)
escaped, so the customer can emit neither the closing delimiter nor something that reads like it.
All other kinds are checked against the signed bound (enum/multiselect membership with duplicate
selections refused, int range, `#RRGGBB`) and inserted unwrapped; unknown and missing parameters
are refused. Rejecting unassigned code points fails closed but also refuses legitimate characters
newer than the bundled Unicode tables.

**Evidence for later.** `RenderedPrompt` carries `template_digest` (sha256 of the signing preimage)
and `values_digest` (sha256 of canonical JSON of the values: keys sorted, Multiselect sorted, text after newline normalisation, so equal meaning gives an equal digest), so a saved installation
can show which signed template and which inputs produced its prompt.

**Measured vs. not built.**

- Measured (unit tests): every tamper above, stripped/zeroed signature, expiry, each render-bound
  violation, a closing-delimiter injection attempt, non-expansion of placeholders inside values,
  digest stability, key-order and selection-order independence, tag-encoded hidden text, lookalike escaping, multi-line limits, and that manifests signed before `Text` existed
  still verify (a recorded pre-change signature).
- Not built: the delimiter is a convention, not a guarantee -- a model may still follow
  instructions inside a `customer-input` block; the template body should say to treat it as data,
  and a harness should not give a rendered prompt more authority than the customer has. Nothing
  fetches or re-hashes a component artifact, enforces the usage note, or checks the template
  against a registry yet. There is no revocation of a
  signed template other than its expiry.

## What Phase 1 deliberately does not defend against

- A trusted publisher's own manifest containing a logic bug (a compose stack that's insecure by
  design but passes every guardrail above). Guardrails catch *known dangerous patterns*, not
  arbitrary bad judgment -- the allowlist is the actual trust boundary.
- Supply-chain compromise of a digest-pinned image's *contents* (F.15 fixes which bytes run, not
  whether those bytes are benign), and of a Dockerfile `FROM` base image, which lives inside the
  bundle's build context rather than the compose file and is not digest-checked.
- Anything about `Dockerfile` `RUN` step contents beyond taking their network away (F.8).
- The environment contract's declared-but-unenforced fields (F.17): resource limits, process
  allowlist, filesystem extras, hooks. Phase 1 refuses only what it cannot honour; it does not yet
  enforce what it could.

These are named here deliberately, per this project's own discipline of reporting refuted/unsolved
concerns explicitly rather than letting a threat table read as more complete than it is.
