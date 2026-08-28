# temporal-poc — a real Binary-kind manifest wrapping the kill-a-worker demo

Packages [`CADS-DEMO-temporal-poc`](https://github.com/scimbe/CADS-DEMO-temporal-poc)'s self-contained
proof-of-concept as a real, signed, installable manifest: stand up a local Temporal dev server, run a
markdown→PDF workflow, `SIGKILL` its worker mid-activity, and prove — from real `temporal workflow show`
output, not a simulation — that a second worker process automatically picks up and completes the retry.

**Not a demo of a persistent service** (see "What this is, honestly" below) — this is the marketplace's
first `installer_kind: binary` manifest actually exercised end-to-end.

## What's here

```
manifest.json    — a real, dev-signed ServiceManifest (ed25519), installer_kind: binary
bundle.tar.gz    — the signed bundle: run.sh + verify.sh + poc/ + scripts/ (sha256 in manifest.json's
                    bundle.sha256, checked by installer-engine before anything runs)
bundle/          — the SAME files, unpacked, for reading without extracting the tarball
```

`bundle.url` in the manifest is the **relative** path `"bundle.tar.gz"` — this only resolves correctly
if the process reading it has this directory (`manifests/temporal-poc/`) as its own working directory
(`installer-engine::fetch::fetch_bytes` reads anything not `http(s)://` via `std::fs::read`, resolved
against the *process's* CWD, not the manifest.json's own location — the same real gotcha documented in
`test-manifests/minimal-compose/README.md`). `cd` here first.

## The judgment call this manifest exists to answer

The brief for this manifest asked explicitly: does a demo that stands up its own Temporal dev server as
a sub-step cleanly fit `InstallerKind::Binary`'s short-lived-process model, or is that a bad fit worth
saying so about? **Measured, not guessed** — real timed runs on this host (`cads-lambda`), both directly
and through the actual `installer-engine::activate()` pipeline:

- Fresh venv + `pip install` of the three PyPI packages (`temporalio`, `Markdown`, `xhtml2pdf`): **~13s**.
- The full kill-a-worker demo (`temporal server start-dev` → namespace → worker A → workflow → SIGKILL →
  heartbeat-timeout wait → worker B → completion → evidence capture → acceptance check → cleanup):
  **~26-44s** across several runs.
- Total `binary_run` step through the real installer: **44.5s** (see below) — comfortably inside the
  300s hard timeout, with no docker daemon, no Postgres, no Elasticsearch, no external service besides
  PyPI (for the one-time-per-run `pip install`) and the pre-installed Temporal CLI.

**Verdict: this fits Binary reasonably well** — it is exactly the "run once, produce output, exit" shape
Binary is for, and standing up `temporal server start-dev` (single-process, sqlite-backed, no external
deps) is fast, not the heavy multi-service stack the brief was worried it might be. Two genuine caveats
below are worth reading before trusting this on a different host, though.

## What this is, honestly (the "not a service" caveat)

Every other manifest in this repo (`test-manifests/minimal-compose`, `manifests/llm-node`) installs
something that's still *running* and reachable after `activate()` returns — a container other agents can
call. This manifest installs nothing persistent: `run.sh` starts a Temporal dev server, runs the demo,
and tears the server down itself (`trap cleanup EXIT` — freeing ports 7233/8233) before it ever exits.
What's left behind in `work_dir` is evidence files, not a running service. That's a correct, deliberate
use of Binary ("a short-lived, run-to-completion tool" per this crate's own `InstallerKind` doc), but if
"install a manifest" is implicitly read as "stand up a service," this is not that — it's closer to "run a
signed, verifiable test/proof job." Worth being explicit about since it's a first for this repo.

## Two host prerequisites this manifest does NOT install (by design)

Mirrors `manifests/llm-node`'s own "ct-agent itself must already be running on the host... nothing here
bundles or shortcuts it" — same reasoning, two different prerequisites:

- **`python3` (3.10+, with the stdlib `venv` module).** `run.sh` fails closed with a clear message if
  missing, before touching anything else.
- **The real Temporal CLI (`temporal`) already on `PATH`.** Install (no sudo): `curl -sSf
  https://temporal.download/cli.sh | sh` then add `$HOME/.temporalio/bin` to `PATH`. **Not bundled or
  auto-downloaded by `run.sh`** — the CLI binary is itself ~140MB and platform-specific; shipping or
  fetching that on every activation is a materially heavier thing than "run once, produce output, exit,"
  and would turn the manifest's own bundle from a few KB of scripts (matching the other two manifests'
  bundle sizes) into something closer to a container image, defeating the point of a lightweight Binary
  manifest. Documenting it as a prerequisite (like Docker for Compose, like Ollama for llm-node) keeps
  the bundle itself honest about what it actually does versus what the host needs to already provide.

`run.sh` checks both explicitly at the top and exits 1 with a clear message if either is missing — this
is real, not aspirational: see the `binary_run` failure path in `installer-engine::activate` (step 9),
which surfaces exactly that stderr in the `InstallReport::Failed.detail` field.

## What `run.sh` (the Binary entrypoint) actually does

1. `export HOME="$(pwd)"` — installer-engine's `process::run_bounded` runs Binary-kind processes with an
   **`env_clear()`'d environment**: only `PATH` and this manifest's resolved `env_template` values are
   passed through, nothing ambient (no `$HOME`, no `$USER`, nothing). Without this, `$HOME` expands to
   empty string and `scripts/run_demo.sh`'s own `PATH="$PATH:$HOME/.temporalio/bin"` line silently
   becomes a bogus absolute path (`/.temporalio/bin`) — caught by testing with a genuinely scrubbed
   environment (`env -i`), not assumed.
2. Preflight-checks `python3` and `temporal` are on `PATH` (see above).
3. Creates a **fresh** venv in `work_dir/.venv` and `pip install -r poc/requirements.txt` — built fresh
   on every activation, in the exact directory it will be used, specifically to avoid the well-known
   Python venv relocation problem (a venv's `bin/pip`/`bin/activate` hardcode their build-time absolute
   path) that a *pre-built, shipped* venv would hit the moment `work_dir` differs from the packaging
   host. This is the direct analogue of Compose's `docker compose up --build` pulling a fresh image over
   the network at activation time, not embedding one in the bundle.
4. Runs `scripts/run_demo.sh` (byte-identical to the upstream repo's own proven script — see its own
   real, verified output in `CADS-DEMO-temporal-poc/README.md`) and exits with its exit code.

`scripts/run_demo.sh`'s `REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"` still resolves
correctly here because the bundle preserves the upstream repo's own relative layout
(`scripts/run_demo.sh` alongside `poc/`) — installer-engine's `opts.work_dir` becomes `REPO_ROOT`, not
because of any change to the script itself.

## What `verify.sh` actually checks

Runs **after** `run.sh` already exited 0, in the **same** `work_dir` (same CWD) — so the real evidence
`run.sh`'s invocation of `scripts/run_demo.sh` wrote to disk (`evidence/event-history.json`,
`poc/.run/attempts.log`, `poc/.run/output.pdf`) is right there. `verify.sh` does **not** just trust
`run.sh`'s own exit code — it independently re-parses that real evidence via
`scripts/check_acceptance.py` (the same script the upstream repo already uses and proves in its own
README), which asserts, from the real `temporal workflow show -o json` output plus the activity's own
OS-pid attempts log:

1. Two distinct OS pids really ran the activity (a killed worker + a surviving one).
2. A real `EVENT_TYPE_ACTIVITY_TASK_STARTED` event exists with `attempt >= 2`.
3. That event's `lastFailure.timeoutFailureInfo.timeoutType == "TIMEOUT_TYPE_HEARTBEAT"` — the retry was
   genuinely caused by the killed worker going silent, not a generic app error.
4. That event's `identity` pid matches the attempts log's *second* pid, and differs from the first —
   ties the Temporal-side evidence back to the real OS-level `SIGKILL`.
5. A terminal `EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED` event exists.
6. The output PDF is real: exists, starts with `%PDF-`, non-zero size.

No `./.env`/`CT_MANIFEST_PROJECT_NAME` lookup is needed — `env_template` has no required entries (see
below), so there's no secret or per-install value `verify.sh` needs beyond the evidence files themselves.

## `env_template`

Empty of anything required. One **optional** knob:

- `RENDER_HOLD_SECONDS` — seconds the demo's activity holds (heartbeating) before completing each
  attempt. Default `8` (`scripts/run_demo.sh`'s own default) if unset. Lower it to speed the demo up;
  it must stay comfortably above `heartbeat_timeout` (5s, hardcoded in `poc/workflows.py`) for the
  kill-and-recover mechanism to have time to trigger before the activity would've finished anyway.

No LLM is used or needed — confirmed against the upstream repo's own README, which is explicit that this
build round's shared litellm-proxy key was deliberately not used (nothing in the reference workflow calls
an LLM). Nothing here touches `/home/becke/dev-workspace-scratch/demo-portfolio-llm.env`.

## Verified for real before commit

`cargo build --example dev_sign -p manifest-core` then `cargo build --example dev_activate -p
installer-engine`, then the **real** `installer-engine::activate()` pipeline — fetch → sha256 check →
(guardrail scan skipped for Binary, see `manifest-core::InstallerKind`'s own doc comment on why) →
`run.sh` (bounded, 300s cap) → `verify.sh` (bounded, 30s cap) — run against this exact
`manifest.json`/`bundle.tar.gz` pair, from this directory, with `PATH` including the pre-installed
Temporal CLI. Real result:

```json
{
  "status": "ok",
  "manifest_id": "a654c3ade979c4a09c76bde51e0fe5c1e16df2d27f73f9e4362037cafc105e8b",
  "publisher_pubkey": "8e39643ed119772d4ae2efe75c583561edd2f93fd40a2d902954231556f4503a",
  "project_name": "temporal-poc-verify-1787953334",
  "compose_up": { "exit_code": 0, "duration_ms": 44499 },
  "verify": { "exit_code": 0, "duration_ms": 51 },
  "captured_stdout": "... PASS: attempt 2 recovered on pid 3505653 after heartbeat timeout from pid 3502142; 2458-byte PDF written; workflow completed. ..."
}
```

(`captured_stdout` truncated above for readability — the full run.sh output, including the real
`pendingActivities` JSON showing `attempt: 2`/`TIMEOUT_TYPE_HEARTBEAT`/`lastWorkerIdentity` mid-recovery,
is in this manifest's commit history / can be reproduced by re-running the command below.)

The `work_dir`'s `evidence/event-history.json` from that exact run has the same 11-event shape the
upstream repo's own README documents (event 6 = `ACTIVITY_TASK_STARTED` at `attempt=2` carrying the
heartbeat-timeout `lastFailure`) — checked directly, not assumed from the JSON `status: ok` alone. Ports
7233/8233 confirmed free and no `temporal`/`worker.py` processes left running after the run — `run.sh`'s
own `trap cleanup EXIT` (inherited unmodified from `scripts/run_demo.sh`) did its job.

### Reproduce this yourself

```bash
cd manifests/temporal-poc   # bundle.url is relative; this must be the CWD
PUBKEY=$(python3 -c "import json; print(json.load(open('manifest.json'))['publisher_pubkey'])")
WORKDIR=$(mktemp -d)
CT_MANIFEST_URL="$(pwd)/manifest.json" \
CT_MANIFEST_TRUST_ALLOWLIST="$PUBKEY" \
CT_MANIFEST_PROJECT_NAME="temporal-poc-repro-$(date +%s)" \
CT_MANIFEST_WORK_DIR="$WORKDIR" \
CT_MANIFEST_NOW=$(date +%s) \
PATH="$PATH:$HOME/.temporalio/bin" \
../../target/debug/examples/dev_activate
rm -rf "$WORKDIR"   # no docker resources to tear down for Binary kind -- just the scratch dir
```

## What would be needed instead, if this judgment call had gone the other way

For the record (the brief asked for this explicitly even though the verdict above is "fits"): if the
Temporal dev server had turned out to need real time/resources beyond a quick verify — e.g. if this
demo needed the *production* topology `docs/ARCHITECTURE.md` in the upstream repo describes (Temporal
Server + Postgres, no Elasticsearch, centrally hosted at `temporal.bunsenbrenner.org`, one namespace per
tenant, workers on customer infrastructure connecting outbound-only) rather than a single-process
`start-dev` — the right shape would **not** be a Binary manifest at all. It would be closer to a Compose
manifest for the *server* half (Temporal Server + Postgres, guardrail-scanned, `127.0.0.1`-bound,
long-running) with workers installed as a *separate* manifest (or a generic `TemplateWorkflow`
interpreter, per the upstream architecture doc §6) that connects to it — i.e., "install a service," not
"run a proof job." That's real future work the upstream repo's own README already flags as
designed-but-not-built; this manifest deliberately packages only the mechanism proof, not that.

## Prerequisite

Same category of prerequisite as `manifests/llm-node`'s `ct-agent` requirement, just for a different
tool: `python3` and the Temporal CLI must already be on the installing host, on `PATH`, before this
manifest is activated. Nothing here bundles or shortcuts either.

## Static-scan gap (Binary kind) — disclosed, not this manifest's defect

`installer-engine`'s static guardrail scan (`guardrails.rs`, F.1/F.2/F.3 — loopback-only ports, no
privileged/host-namespace flags, no docker-socket mounts) runs **only for `InstallerKind::Compose`**
today. `InstallerKind::Binary` (what this manifest uses) gets none of that — `activate.rs`'s Binary
arm runs the bundle's executable directly, with no static check and (as of this writing, on `main`)
no sandbox either. This is a known, already-designed-for gap (`docs/design/sandbox-fallback.md`,
marketplace PR#20 — bwrap-based runtime sandboxing, currently unmerged) — not something specific to
this manifest, but worth disclosing here rather than only in that PR: **trust for a Binary manifest
rests entirely on the publisher allowlist, not on any static or runtime containment, until PR#20
lands.** Unlike the other Binary manifests in this batch, this one is not a pure no-listen CLI:
`scripts/run_demo.sh` step 1 runs `temporal server start-dev --port 7233 --ui-port 8233` with no
`--ip` pin, starting two listeners for the run's duration — the Temporal frontend (7233) and its
**unauthenticated** web UI (8233) — bound to whatever Temporal's dev-server default resolves to.
The demo itself only ever dials `127.0.0.1:7233`, so as invoked here it is loopback-only in
practice, not exposed — but that is an unpinned default, not a guardrail-enforced guarantee, and
Binary-kind gets no guardrail check of any kind (see above). **Do not run this on a host with a
public IP by adding `--ip 0.0.0.0`, or by any change that widens the dev-server's bind** — that
would put both listeners, especially the unauth UI, directly on the network. PR#20's sandbox is
the tracked containment for exactly this class of gap; until it lands, this manifest is a live
example of the risk PR#20 exists to close, not just a hypothetical one.
