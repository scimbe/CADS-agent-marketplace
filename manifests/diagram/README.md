# diagram — Diagram-from-Description, packaged as InstallerKind::Binary

Real, working service from source: [scimbe/CADS-DEMO-diagram](https://github.com/scimbe/CADS-DEMO-diagram)
(tracking issue [CADS-agent-marketplace#25](https://github.com/scimbe/CADS-agent-marketplace/issues/25)).
An LLM (`local-devstral-small2` via the shared litellm-proxy) writes Mermaid diagram DSL; a real,
deterministic renderer (`mmdc`, from `@mermaid-js/mermaid-cli`) actually draws it; the core feature —
a genuine render-validate-retry loop that feeds the renderer's own syntax error back to the LLM on
failure — is exercised for real by this manifest's `wrapper.sh`, not simulated.

This is the third manifest in this repo (after `test-manifests/minimal-compose/` and
`manifests/llm-node/`, both `Compose`) and the first real `Binary` one — read those two first if
you haven't; several of the hard lessons below build directly on what they document.

## What's here

```
manifest.json    — a real, dev-signed ServiceManifest (ed25519), installer_kind: binary
bundle.tar.gz    — the signed bundle: diagram-cli's own source (bin/, src/, config/,
                   package.json/package-lock.json) + wrapper.sh + verify.sh
bundle/          — the SAME contents, unpacked, for reading without extracting the tarball
```

`bundle.url` is the **relative** path `"bundle.tar.gz"` — exactly like both existing manifests, this
only resolves if the process reading it has `manifests/diagram/` as its own CWD (see
`installer-engine::fetch::fetch_bytes`); `cd` here first.

## What `bundle.compose_file` points at, for Binary

For `InstallerKind::Binary`, `bundle.compose_file` (the field name is reused from Compose — see
`manifest-core::BundleRef`'s doc comment) is the path *inside the unpacked bundle* to the executable
`installer-engine` chmod+x's and runs directly (not through a shell — see
`crates/installer-engine/src/activate.rs` step 9). Here that's `wrapper.sh`.

## What `wrapper.sh` actually does

`activate()`'s `process::run_bounded` for Binary passes the executable **only** this manifest's
resolved `env_template` values (`LITELLM_*`, `PUPPETEER_EXECUTABLE_PATH`) plus `PATH` —
`Command::env_clear()` first, same discipline as Compose's `docker compose up` (see `process.rs`'s
doc comment). No `HOME`, no npm config, no shell rc files, nothing ambient. `wrapper.sh`:

1. `npm ci --omit=dev` — installs diagram-cli's own dependencies (real, unpacked, from the committed
   `package-lock.json` for reproducibility). Confirmed empirically (this manifest's own verification
   run, see below) that `npm ci` works fine in an `env_clear()`'d process with no `HOME` set — Node's
   `os.homedir()` falls back to the passwd database by UID when `$HOME` is absent, and npm's cache
   resolution rides on that.
2. Locates a system Chrome/Chromium (checks `PUPPETEER_EXECUTABLE_PATH` first, then
   `google-chrome-stable` / `google-chrome` / `chromium-browser` / `chromium` on `PATH`) and exports
   `PUPPETEER_EXECUTABLE_PATH` for step 3 — see "Judgment call: no bundled Chromium" below for why.
3. Runs the real CLI: `node bin/diagram.js generate --description "A flowchart: user logs in, then
   sees the dashboard." --engine mermaid --out diagram.png --max-attempts 3 --attempts-log
   attempts.json` — one fixed test description, chosen from the upstream README's own usage example
   (simple enough to reliably succeed in one LLM round-trip, keeping the whole run comfortably inside
   the 300s Binary timeout).

`verify.sh` then runs (scrubbed env — only `CT_MANIFEST_PROJECT_NAME`, per `activate.rs` step 10) and
checks, for real: `diagram.png` exists, is at least 512 bytes (catches an empty/placeholder file), and
its first 8 bytes are the exact PNG magic number (`89 50 4E 47 0D 0A 1A 0A` — the same check
diagram-cli's own `src/util/pngCheck.js` uses, reimplemented in plain bash so `verify.sh` doesn't
depend on Node). It also cross-checks `attempts.json` for `"success": true` if present, so a stale
leftover `diagram.png` from an earlier failed run can't produce a false pass.

## Judgment call: no bundled Chromium, `npm ci` runs at activate time

`@mermaid-js/mermaid-cli` pulls the full `puppeteer` package (not `puppeteer-core`), which normally
downloads its own Chromium on `npm install`. Two real, measured constraints ruled that out for this
bundle:

- A freshly-downloaded Chrome build's own binary is **259 MB as a single file** (measured on this
  host, `linux-141.0.7390.76/chrome-linux64/chrome`) — over GitHub's 100 MB hard per-file limit, so it
  cannot be `git push`ed at all without LFS (not set up in this repo, no precedent for it here).
- Even ignoring that hard limit, `node_modules` for diagram-cli's dependency tree (mermaid's renderer,
  its ELK/zenuml/fontawesome/katex asset packs, puppeteer-core) is **475 MB unpacked** with zero
  browser included — committing that (doubled again by this repo's bundle/-plus-tarball convention)
  would be a wildly disproportionate git footprint next to the two existing manifests (both under
  20 KB).

So this bundle ships **source only** (`bundle.tar.gz` is 35 KB) and `wrapper.sh` does the
install-and-locate-a-browser work at `binary_run` time instead — the same shape as Compose's own
`docker compose up` fetching its image over the network at activate time, just via npm instead of a
registry pull. `PUPPETEER_SKIP_DOWNLOAD=true` is set before `npm ci` so Puppeteer never attempts its
own Chromium download; `PUPPETEER_EXECUTABLE_PATH` (set from a detected system browser, or
supplied via this manifest's own optional `env_template` entry) makes it use that instead.

**The real tradeoff, stated plainly**: activating this manifest needs network access to the npm
registry (not just the LLM endpoint) and a system Chrome/Chromium already present on the host — a
real, narrower prerequisite than Compose manifests carry, acknowledged rather than hidden. It was
verified end-to-end (below) on this host, which has both a warm npm cache and `google-chrome-stable`
installed; a colder host would take longer for `npm ci` (untested in this session — see "What's
honestly unverified" below) but should still fit inside the 300s budget on ordinary registry
bandwidth, since the installed tree is small relative to what `npm` routinely fetches.

## Required env var: the LLM key

`diagram-cli`'s `src/llm/llmClient.js` fails closed if any of `LITELLM_BASE_URL` / `LITELLM_API_KEY`
/ `LITELLM_DEFAULT_MODEL` are missing — all three are `required: true` in `env_template`. This
manifest was verified against the real shared litellm-proxy (`local-devstral-small2`), using a
budget-capped key supplied out-of-band for this build round — **never** put a real key value in the
manifest itself (`env_template` carries names only, per `manifest-core`'s module doc); supply it via
your own local env file or process env at activate time, the same as `manifests/llm-node/` does for
`LITELLM_MASTER_KEY`.

`PUPPETEER_EXECUTABLE_PATH` is the one *optional* entry — leave it unset to let `wrapper.sh`
auto-detect a system browser, or set it explicitly if your host's browser isn't one of the four
binary names `wrapper.sh` checks.

## Verified for real before commit

`cargo run --example dev_activate -p installer-engine`, the exact code path a real
`ct-agent manifest activate` runs, against this exact `manifest.json`/`bundle.tar.gz` pair, from this
directory (`manifests/diagram/`), with the real litellm-proxy key set as `LITELLM_*` env vars and
`CT_MANIFEST_TRUST_ALLOWLIST` set to this manifest's own `publisher_pubkey`:

```json
{
  "status": "ok",
  "manifest_id": "e01d0c18ffa1654b2ea07da06a9d4addd2bb571fd015c9657244971dcb23fa57",
  "publisher_pubkey": "6a854c2f9572d4e16001f3c7015e01e774f02a6a22c263bef59810236cc75a6d",
  "project_name": "diagram-manifest-verify-1787953334",
  "compose_up": { "exit_code": 0, "duration_ms": 9418 },
  "verify": { "exit_code": 0, "duration_ms": 7 },
  "captured_stdout": "diagram-cli wrapper: installing npm dependencies (mermaid renderer, no bundled Chromium download) ...\ndiagram-cli wrapper: locating a system Chrome/Chromium for puppeteer ...\nUsing Chrome at: /usr/bin/google-chrome-stable\ndiagram-cli wrapper: generating the fixed acceptance-bar test diagram ...\nGenerating a mermaid diagram (max 3 attempt(s))...\n  attempt 1 [initial]: OK -> diagram.png\nWrote attempt transcript to attempts.json\nSuccess after 1 attempt(s): diagram.png\ndiagram-cli wrapper: generate exited 0\n"
}
```

`compose_up` (the field name `InstallReport` reuses for "the primary artifact's own run" regardless
of kind — see `report.rs`'s doc comment) is `wrapper.sh`'s run here: `npm ci` + browser detection +
one real LLM call + one real `mmdc` render, **9.4 real seconds**, well inside the 300s Binary timeout.
The resulting `diagram.png` in the run's `work_dir` was independently confirmed: real PNG magic bytes,
4855 bytes, `attempts.json` shows `"success": true` after exactly 1 attempt. Same shape of proof the
other two manifests in this repo carry (`"status": "ok"`, both steps exit 0), same command, same
crate.

`publisher_pubkey`: **`6a854c2f9572d4e16001f3c7015e01e774f02a6a22c263bef59810236cc75a6d`**

Like the other two manifests, this is a throwaway dev keypair (`CT_MANIFEST_HOLDER_KEY`,
freshly generated, never reused, discarded after signing) — not tied to any real holder identity.

## What's honestly unverified / open

- **Cold-cache timing.** The 9.4s `npm ci` above ran with a warm local npm cache (this host had
  already `npm install`ed the same `package-lock.json` earlier in the same session) and a
  browser already resolvable via `google-chrome-stable`. A genuinely cold host (empty `~/.npm`,
  first-ever activation) would take longer for `npm ci` — not measured in this session. If it's slow
  enough to approach the 300s cap on a given host, that's this bundle's real, documented risk, not a
  silently-assumed non-issue.
- **Graphviz path.** Same known limitation as upstream: `src/render/graphvizRenderer.js` exists and
  follows the same adapter contract as the Mermaid renderer, but `dot` isn't installed on this build
  host, so it's untested here too — `wrapper.sh` only exercises `--engine mermaid` (the engine the
  acceptance bar / upstream's own `fixtures/broken-flow/` proof targets).
- **The fixed test description deliberately does NOT reproduce upstream's `fixtures/broken-flow/`
  multi-attempt recovery.** That fixture's description is specifically engineered to trigger a real
  first-pass parse error (its own text contains literal Mermaid delimiters); this manifest instead
  uses upstream's simpler one-line usage example, which succeeded in a single attempt both times it
  was run in this session — chosen deliberately for a fast, timeout-safe, repeatable Binary
  activation rather than to re-demonstrate the retry loop itself (that's proven in the source repo's
  own committed `fixtures/broken-flow/attempts.log.json`, not re-proven here). The retry loop's own
  code path (`src/engine/retryLoop.js`) is still real and unmodified in this bundle; a description
  likely to trigger a real syntax error would exercise it identically, just slower and less
  deterministically inside a 300s activation budget.

## Reproduce

```bash
git clone https://github.com/scimbe/CADS-agent-marketplace.git
cd CADS-agent-marketplace
git checkout manifests/diagram
cargo build --example dev_activate -p installer-engine

cd manifests/diagram
CT_MANIFEST_URL="$(pwd)/manifest.json" \
CT_MANIFEST_TRUST_ALLOWLIST="6a854c2f9572d4e16001f3c7015e01e774f02a6a22c263bef59810236cc75a6d" \
CT_MANIFEST_PROJECT_NAME="diagram-test-$(date +%s)" \
CT_MANIFEST_WORK_DIR="$(mktemp -d)" \
CT_MANIFEST_NOW="$(date +%s)" \
LITELLM_BASE_URL="<your litellm-proxy base URL>" \
LITELLM_API_KEY="<your litellm-proxy API key>" \
LITELLM_DEFAULT_MODEL="<your model name>" \
../../target/debug/examples/dev_activate
```

(Or point `CT_MANIFEST_URL` / run `dev_activate` from wherever you've built it — the only hard
requirement is that your CWD is `manifests/diagram/` itself, per the relative-`bundle.url` note
above.)

## Static-scan gap (Binary kind) — disclosed, not this manifest's defect

`installer-engine`'s static guardrail scan (`guardrails.rs`, F.1/F.2/F.3 — loopback-only ports, no
privileged/host-namespace flags, no docker-socket mounts) runs **only for `InstallerKind::Compose`**
today. `InstallerKind::Binary` (what this manifest uses) gets none of that — `activate.rs`'s Binary
arm runs the bundle's executable directly, with no static check and (as of this writing, on `main`)
no sandbox either. This is a known, already-designed-for gap (`docs/design/sandbox-fallback.md`,
marketplace PR#20 — bwrap-based runtime sandboxing, currently unmerged) — not something specific to
this manifest, but worth disclosing here rather than only in that PR: **trust for a Binary manifest
rests entirely on the publisher allowlist, not on any static or runtime containment, until PR#20
lands.** This specific manifest's `run.sh`/entrypoint does not bind any network port (see "What it
does" above), so the network-exposure scenario PR#20 is chiefly about does not apply here today —
but the general absence of sandboxing does, same as every other Binary manifest.
