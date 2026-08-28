# Design: per-OS lightweight sandbox fallback for `InstallerKind::Binary`

## Status

Proposed (design only -- issue #12). Not implemented. No manifest-core, installer-engine, or
security-model.md change has landed for this yet -- see "Correcting the issue's premise" below.

## Scope

`InstallerKind::Binary` activation (`installer-engine::activate`, step 9's Binary arm) when the
target host has no Docker daemon. Bring its isolation guarantees closer to the `F.1`-`F.3` bar
`guardrails::scan_compose` already enforces for Compose, without requiring a container runtime.

**Non-goals for this design:**
- Resource limits (cgroups memory/CPU caps). Compose manifests get none of these from
  `guardrails.rs` either (F.1-F.3 is namespace/mount/network isolation, not resource accounting)
  -- adding them for Binary only would be a stronger guarantee than Compose gets today, not parity.
  Worth a follow-up issue, not folded in here.
- A manifest-authored sandbox policy field (e.g. `binary_sandbox: { allow_network: bool, ... }`).
  MVP applies one fixed, maximally-restrictive policy to every `Binary` activation, orchestrated
  entirely by `installer-engine` -- no new signed field, no `signing_bytes` preimage change, no
  publisher opt-in surface to design or review. If a real manifest needs relaxed network access,
  that is deliberately future work (see "Deferred: manifest-declared policy" below).
- Windows. No host in this operator's fleet runs `ct-agent` on Windows today (confirmed in
  `dev-workspace/CLAUDE.md`); AppContainer/Job Objects are a meaningfully different integration
  shape from either Unix backend below, not a small addition to them.

## Correcting the issue's premise

Issue #12's "What's already done (this pass)" section claims three things landed already:

1. Binary runs without a Docker daemon present.
2. A loud stderr warning fires before every Binary execution, framed in whole-system terms.
3. `manifest-core::InstallerKind`'s doc comment and `docs/security-model.md`'s threat table both
   document the gap, cross-linked to #12.

Checked against `main` at `d09eecd` (current HEAD, PR #15 merged): **only (1) is true.** PR #13
(`fix/11-binary-collision-guard-docker-free`, merged) makes `preflight_collision_check` skip the
docker-resource check for `Binary` -- confirmed in `activate.rs` step 5 and its own regression
test, `collision_guard_skips_docker_entirely_when_told_to`.

(2) and (3) are **not in the code**: `grep -rn "eprintln\|stderr" crates/installer-engine/src/activate.rs`
finds nothing resembling a pre-execution warning, `InstallerKind`'s doc comment (`manifest.rs`)
discusses the allowlist-vs-static-scan trust-boundary gap but says nothing about Docker absence or
a whole-system warning, and `security-model.md`'s threat table (F.1-F.13 plus three named
residuals) has no row for "Binary has no sandbox at all" or any reference to #12. There is no open
or merged PR and no other branch (`git branch -a`: only `main` and `examples/hello-world-and-catalogue-survey`)
containing this work.

This design proceeds from the **actual** state of the code, and folds the missing warning and doc
updates into its own implementation plan (Milestone 0 below) rather than assuming they exist.
Flagging this discrepancy for the human reviewer to reconcile with whatever the issue's author
intended -- possibly a description of *planned* work phrased as completed, or a pass that was done
locally and not pushed.

## Threat model recap

Same bar as `guardrails.rs`, restated for a Binary rather than a Compose service (`docs/security-model.md`):

| Compose (`guardrails.rs`) | Binary-equivalent |
|---|---|
| F.1: no non-loopback listening port | no listening on any non-loopback interface at all |
| F.2: no privileged ops, no host-namespace sharing | no privilege escalation, no PID/net/mount/UTS namespace sharing with the host |
| F.3: no filesystem access outside the bundle's `work_dir` | no filesystem read/write outside `work_dir`, beyond what's minimally needed to exec |

Compose gets these from static YAML analysis *before* `docker` ever runs. Binary has no static
analysis equivalent (per `InstallerKind`'s doc comment, its whole safety today rests on the
publisher allowlist) -- this design adds a *runtime* enforcement layer instead: wrap the actual
exec in a sandbox that makes F.1-F.3 violations structurally impossible rather than statically
disallowed.

## Interface: `SandboxBackend`

New module `crates/installer-engine/src/sandbox/mod.rs`, with one OS-specific submodule per
backend. The integration point is narrow by design: it rewrites *what command line `process::run_bounded`
executes*, not `process::run_bounded` itself. `process.rs`'s env-scrubbing, `process_group(0)`,
and SIGKILL-on-timeout discipline apply identically to the sandboxed exec as to today's bare one --
this is deliberate defense in depth, not redundant: the outer `run_bounded` scrub protects against
an inherited ambient secret leaking into the sandbox launcher itself; the sandbox's own
`--clearenv`/`--setenv` (bwrap) or profile (sandbox-exec) is the second, independent scrub applied
to what the *sandboxed* process actually sees.

```rust
// crates/installer-engine/src/sandbox/mod.rs

/// One platform's lightweight isolation primitive for a Binary activation. Implementations never
/// spawn or wait on anything themselves -- `wrap_command` only rewrites the command line;
/// `process::run_bounded` still owns spawning, timeout, and output capture, unchanged.
pub trait SandboxBackend {
    /// Short, stable identifier -- goes into `InstallReport` and log lines. Never changes once
    /// shipped; it's part of the operator-facing/report-facing contract, not free-form prose.
    fn name(&self) -> &'static str;

    /// Rewrite `(exe, args)` into a new `(program, args)` pair that runs `exe args...` inside this
    /// backend's sandbox, confined to `work_dir`, with exactly `env` as its environment (no
    /// ambient inheritance beyond what the backend itself unavoidably needs, e.g. bwrap needs
    /// `/usr/bin/bwrap` resolvable via the outer, PATH-only environment `run_bounded` already
    /// grants -- that's the launcher's env, never the sandboxed process's).
    fn wrap_command(
        &self,
        exe: &str,
        args: &[&str],
        work_dir: &Path,
        env: &[(&str, &str)],
    ) -> (String, Vec<String>);

    /// One-line, operator-facing description of what this backend does and does NOT provide,
    /// relative to the F.1-F.3 bar above -- surfaced in the pre-execution warning and in
    /// `InstallReport`. Written once per backend, reviewed by a human (not auto-generated), since
    /// getting the honesty of this line wrong is worse than not sandboxing at all.
    fn isolation_summary(&self) -> &'static str;
}

/// Runtime capability probe -- distinct from "no sandbox backend exists for this OS" (there's
/// always a compiled-in candidate list per OS below); this specifically means "the candidate
/// exists in source but isn't usable on THIS host" (binary not on PATH, `--version` failed,
/// kernel/OS feature disabled). Kept as its own error variant, not folded into `None`, so a
/// caller/warning can tell "we didn't even try" from "we tried and it's broken here" -- the two
/// have different remediation stories for an operator (install a package vs. investigate a kernel
/// config).
pub enum Probe {
    Available(Box<dyn SandboxBackend>),
    Unavailable { candidate: &'static str, reason: String },
}

/// Try every backend this OS has a candidate for, in preference order, return the first
/// `Available`. Linux: `[bwrap]`. macOS: `[sandbox_exec]`. Everything else (including Windows):
/// `[]` -- no candidate at all, not even an `Unavailable` one, since there is no implementation to
/// probe (see "Non-goals").
pub fn select() -> Selection {
    let candidates = platform_candidates();
    let mut unavailable = Vec::new();
    for probe_fn in candidates {
        match probe_fn() {
            Probe::Available(backend) => return Selection::Sandboxed(backend),
            Probe::Unavailable { candidate, reason } => unavailable.push((candidate, reason)),
        }
    }
    Selection::Unsandboxed { tried: unavailable }
}

pub enum Selection {
    Sandboxed(Box<dyn SandboxBackend>),
    /// No candidate for this OS was usable (or none exists at all for this OS). `tried` is empty
    /// on an OS with zero candidates (Windows today); non-empty on Linux/macOS with a real
    /// candidate that failed its probe, so the eventual warning can say WHY, not just THAT.
    Unsandboxed { tried: Vec<(&'static str, String)> },
}
```

`platform_candidates()` is `#[cfg(target_os = "linux")]` / `#[cfg(target_os = "macos")]` /
`#[cfg(not(any(...)))]` returning `&[fn() -> Probe]`, `&[bwrap::probe]`, `&[sandbox_exec::probe]`,
`&[]` respectively -- a compile-time list, not a runtime OS string match, so an unsupported target
never even links code that assumes a Unix-only API it doesn't have.

## Linux backend: `bubblewrap` (`bwrap`)

`crates/installer-engine/src/sandbox/bwrap.rs`.

**Probe:** `Command::new("bwrap").arg("--version").output()`, `Ok(o) if o.status.success()`. Cheap,
side-effect-free, matches this crate's existing `docker_names`-style "shell out and check exit
status" idiom in `activate.rs`. Confirmed present on this operator's own dev host (`cads-lambda`,
Ubuntu 24.04-class kernel): `bwrap --version` → `bubblewrap 0.9.0`, so the assumption that a
Debian/Ubuntu-family host in this fleet already has it is not hypothetical here, though it must
never be *assumed* elsewhere -- always probed, never asserted.

**`wrap_command`** builds:

```
bwrap
  --die-with-parent
  --unshare-net
  --unshare-pid
  --unshare-uts
  --unshare-ipc
  --ro-bind /  /
  --bind <work_dir> <work_dir>
  --chdir <work_dir>
  --clearenv
  --setenv <K1> <V1>  --setenv <K2> <V2> ...   (one pair per `env` entry)
  --
  <exe> <args...>
```

- `--unshare-net` with no `--share-net`: F.1-equivalent by construction -- no network namespace at
  all, stronger than "loopback only" (there is no manifest-declared network-need escape hatch in
  this MVP; see "Deferred" below).
- `--unshare-pid --unshare-uts --unshare-ipc --die-with-parent`, no `--cap-add`/`--cap-drop`
  needed (bwrap's unprivileged mode starts with no capabilities gained): F.2-equivalent. No
  `--unshare-user` flag is passed explicitly -- bwrap uses an unprivileged user namespace
  internally by default when not setuid-root-installed, which is the same "no privilege escalation
  for the installer itself" posture `InstallerKind`'s doc comment already claims for the allowlist
  check; this backend doesn't weaken it.
- `--ro-bind / /` then `--bind <work_dir> <work_dir>`: the executable can read the base OS
  (libraries, `/usr/bin/sh` if it shells out, etc. -- needed for almost any real binary to run at
  all) but can only WRITE inside `work_dir`. F.3-equivalent.
- `--clearenv` + explicit `--setenv` per pair: the sandboxed process's environment is *exactly*
  `env` -- nothing ambient leaks in even if `run_bounded`'s own scrub (which this backend sits
  behind) somehow had a gap.

**Probe depth -- DECIDED (operator, 2026-08-28): real exec probe, not just `--version`.** Some
hardened kernels ship `kernel.unprivileged_userns_clone=0` (Debian has shipped this default in the
past; some enterprise/CIS-hardened images still do), which makes `bwrap` itself fail even when the
binary is installed and on PATH -- a bare `--version` call still succeeds (it doesn't need a user
namespace), but a real sandboxed exec later would fail. The probe now attempts a trivial real
sandboxed exec (`bwrap --unshare-user --unshare-pid true`) to catch this at probe time -- one extra
subprocess per activation, worth it over "probe passed but first real use fails."

**Rejected alternative, reproducing the issue's own reasoning, verified against the CVE
database rather than taken on faith:** `firejail`. Historically shipped setuid-root; the
CVE-2022-31214 (`--force-quiet` argument-injection privilege escalation) class of bug is exactly
the risk profile `bwrap`'s no-setuid, unprivileged-namespace design avoids by construction. Not
re-litigated further here -- the issue's own writeup already made this call correctly.

## macOS backend: `sandbox-exec`

`crates/installer-engine/src/sandbox/sandbox_exec.rs`.

**Probe:** `Command::new("sandbox-exec").arg("-p").arg("(version 1)").arg("/usr/bin/true").output()`,
`Ok(o) if o.status.success()`. `sandbox-exec` ships with the base OS (part of `/usr/bin` on every
macOS release this operator's fleet could plausibly run) -- the probe exists to catch a future OS
release actually removing it (see the risk noted below), not a missing package.

**`wrap_command`** writes a per-activation Seatbelt profile to `<work_dir>/.sandbox-profile.sb`
(inside the bundle's own scratch dir -- never a shared/predictable path, avoiding a TOCTOU profile-
swap risk across concurrent activations) and invokes:

```
sandbox-exec -f <work_dir>/.sandbox-profile.sb -- <exe> <args...>
```

Profile shape (the dynamic pieces -- `<work_dir>` -- are generated per call, not templated from a
static file, since the whole point is confining to *this* activation's own directory):

```scheme
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow file-read*)                          ; read the base OS -- same posture as bwrap's --ro-bind /
(allow file-write* (subpath "<work_dir>"))  ; write only inside work_dir -- F.3-equivalent
(deny network*)                             ; F.1-equivalent
```

Env is passed the normal way (`Command::envs`), since Seatbelt profiles constrain filesystem/
network/Mach-IPC operations, not the process's own environment variables -- `--clearenv`-equivalent
scrubbing is unnecessary here because `run_bounded`'s outer `env_clear()` + explicit `env` already
fully determines what the child sees; there's no ambient-env leak path for `sandbox-exec` to close
that bwrap's `--clearenv` closes for a *different* reason (bwrap re-uses the *launcher's* full
environment by default unless told not to; `Command` never does).

**Honestly weaker than bwrap on one axis:** no PID/UTS namespace equivalent exists in Seatbelt --
the sandboxed process can still see and signal other processes on the host (subject to normal Unix
permission checks, i.e. its own UID). This is a real, named gap relative to F.2's "no host-namespace
sharing" framing, not silently claimed as equivalent. `isolation_summary()` for this backend must
say so explicitly.

**Real risk worth flagging up front, not discovered later:** Apple has deprecated `sandbox-exec`
in favor of the App Sandbox entitlement system (which requires a codesigned, entitled app bundle --
not applicable to an arbitrary fetched executable) and documents zero commitment to keep the CLI
functioning. It still works as of current macOS releases (the same "deprecated but load-bearing"
status many OS-level primitives carry). If a future macOS release removes it outright, there is
**no other lightweight, no-extra-install primitive on macOS** -- the next rung down is a full VM,
which is a different design entirely, not a lightweight fallback. This should be an explicit,
periodically-reverified assumption (e.g. re-probe as part of any macOS CI job this project someday
adds), not a one-time check.

## Windows

Not designed here (see "Non-goals"). For a future pass: Windows Job Objects (process/resource
containment, roughly F.2-adjacent) + a restricted token or AppContainer (filesystem/network
confinement, roughly F.1/F.3-adjacent) is the realistic shape, but it's two separate Win32 API
surfaces glued together rather than one CLI tool like `bwrap`/`sandbox-exec`, and this operator's
fleet has no Windows `ct-agent` host to validate against -- same "unproven claim about an
environment nobody can measure" problem this project already refused to accept for `InstallerKind::K8s`
(see `activate.rs`'s module doc). `select()` returns `Selection::Unsandboxed { tried: vec![] }`
unconditionally on this target; the loud warning (below) still fires.

## Integration into `activate.rs`

Step 9's Binary arm changes from directly running `binary_str` to:

```rust
InstallerKind::Binary => {
    // ... mark_executable, env_pairs, binary_str unchanged ...

    let selection = sandbox::select();
    let (program, wrapped_args, sandbox_name) = match &selection {
        sandbox::Selection::Sandboxed(backend) => {
            let (p, a) = backend.wrap_command(binary_str, &[], &opts.work_dir, &env_refs);
            eprintln!(
                "ct-agent: activating Binary manifest {manifest_id_hex} under {} sandbox -- {}",
                backend.name(), backend.isolation_summary()
            );
            (p, a, Some(backend.name().to_string()))
        }
        sandbox::Selection::Unsandboxed { tried } => {
            eprintln!(
                "ct-agent: WARNING -- no sandbox available for Binary manifest {manifest_id_hex} \
                 (tried: {tried:?}). This executable will run with FULL ACCESS TO THIS ENTIRE \
                 HOST -- not just this install -- including your filesystem, network, and every \
                 other process. This is only as safe as your trust in the publisher \
                 (publisher_pubkey={publisher_hex}). Add `bwrap`/ensure sandbox-exec works, or \
                 set CT_REQUIRE_BINARY_SANDBOX=1 to refuse instead of proceeding unsandboxed."
            );
            (binary_str.to_string(), vec![], None)
        }
    };
    let arg_refs: Vec<&str> = wrapped_args.iter().map(String::as_str).collect();
    let outcome = process::run_bounded(&program, &arg_refs, &opts.work_dir, &env_refs, Duration::from_secs(300));
    // sandbox_name flows into InstallReport::Ok/Failed's new `sandbox: Option<String>` field
    // (both variants), so a caller can tell a bwrap-confined run from an unsandboxed one from
    // the report alone, not just from a log line that might have scrolled away.
    ...
}
```

`InstallReport::Ok` and `::Failed` each gain `sandbox: Option<String>` (backend name, or `None` for
Compose and for an unsandboxed Binary run) -- `report.rs`'s doc comment already states the
philosophy this serves ("never a bare 'failed'... tell a signature rejection from a guardrail
rejection... without re-deriving it from prose"); which isolation tier actually ran is the same
class of fact.

## Fallback policy -- DECIDED (operator, 2026-08-28)

**Warn-and-proceed by default**, with the opt-in `CT_REQUIRE_BINARY_SANDBOX=1` escape hatch (or an
`ActivateOptions::require_binary_sandbox: bool` field, wired the same way `env_file`/other options
already are) available from Milestone 1 onward for an operator who wants fail-closed. Matches #12's
own stated direction for the closely-related docker-absent case and this project's existing
Binary-without-Docker behavior; never blocks a legitimate install just because a host lacks `bwrap`.

## Deferred: manifest-declared policy

Not designed here, named so it isn't silently dropped (mirrors the issue's own "not done in this
pass" framing): a future `binary_sandbox: { allow_network: bool, extra_ro_binds: Vec<String> }`
manifest-core field, signed like every other field (new `signing_bytes` preimage entry -- a
breaking change to the wire format, needing its own versioning story, e.g. how `env_template`'s
`Vec<EnvVarSpec>` is already length-prefixed and could grow a sibling field without reordering
existing ones). Until it exists, the sandbox policy applied is the same fixed, maximally-restrictive
one for every Binary manifest, regardless of what the publisher might legitimately need -- a real
usability gap for, say, a Binary manifest that genuinely needs outbound network (a client for some
API), not just a security question. Worth its own issue once a real manifest needs it.

## Testing / verification plan

Mirrors this crate's own "measure, don't assume" discipline (`docs/security-model.md`,
`dev-workspace/CLAUDE.md`):

1. **Unit tests per backend**, hermetic, no real sandboxing required: `wrap_command`'s output
   (the exact argv it builds) is a pure function of its inputs -- assert the flag list directly,
   the same way `guardrails.rs`'s tests assert `Violation` values without needing a real Docker
   daemon.
2. **Real sandboxed-activation integration test on Linux CI** (`ubuntu-latest` already has `bwrap`
   available via `apt`, needs adding to the workflow): a fixture binary that (a) tries to bind a
   TCP listener on `0.0.0.0` and asserts it fails, (b) tries to write outside `work_dir` and
   asserts it fails, (c) writes inside `work_dir` and asserts it succeeds -- a direct, executable
   proof of the F.1/F.3-equivalent claims above, not just "the flags look right." Lives alongside
   `activate.rs`'s existing `write_binary_fixture`-style tests.
3. **macOS: DECIDED (operator, 2026-08-28) -- add a `macos-latest` CI job.** No such runner exists
   in `.github/workflows` today (same blind spot #11 already found for the docker-daemon-absent
   case), so this job needs adding as part of M2, not left as documented-but-unverified.
4. **Probe-failure-mode test**: hermetically simulate "bwrap not on PATH" the same way
   `collision_guard_skips_docker_entirely_when_told_to` simulates "docker not on PATH" (empty-dir
   `PATH` + restore guard) -- confirms `select()` returns `Unsandboxed` with a populated `tried`
   list, not a panic or a silent `Sandboxed` claim.

## Implementation milestones

**DECIDED (operator, 2026-08-28): M0 ships bundled with M1, not as its own PR first** -- one
review pass covers both the doc/warning gap and the real sandbox work.

- **M0 -- close the gap between #12's claimed and actual state.** Land the pre-execution warning
  and the `security-model.md`/`InstallerKind` doc updates #12 already describes as done, since they
  aren't. Bundled into M1's PR.
- **M1 -- `sandbox` module + Linux `bwrap` backend (real exec probe, not just `--version`) + wiring
  into `activate.rs` step 9 + `InstallReport.sandbox` field**, plus M0's doc/warning fix in the same
  PR. Ships real isolation on the fleet's actual OS (Ubuntu/Debian-family) first.
- **M2 -- macOS `sandbox_exec` backend + a new `macos-latest` CI job** (decided: add real CI
  coverage, not ship as manually-verified-only). Independent of M1's wiring changes (same trait, new impl).
- **M3 -- `CT_REQUIRE_BINARY_SANDBOX` policy flag** (warn-and-proceed is the default; this is the
  opt-in for an operator who wants fail-closed).
- **Deferred, no milestone yet:** manifest-declared sandbox policy (network opt-in), resource
  limits (cgroups), Windows.

## Gaps this design does not resolve, named honestly

- No resource limits (memory/CPU) on either backend -- explicitly out of scope, matches Compose's
  own current gap, not a regression introduced here.
- No manifest-declared policy -- every Binary gets one fixed, maximally-restrictive profile; a
  publisher needing real network access has no path yet.
- macOS's only primitive is a deprecated one with no committed-to replacement if Apple removes it.
- `bwrap`'s unprivileged-userns dependency can silently fail on a hardened kernel in a way the
  cheap `--version` probe won't catch (see the Linux section) -- whether to pay for a real-exec
  probe to close that gap is also left open.
