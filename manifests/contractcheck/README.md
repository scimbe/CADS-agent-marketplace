# contractcheck — a real contract-diff tool, packaged as an installable Binary manifest

A signed `ServiceManifest` for [`CADS-DEMO-contractcheck`](https://github.com/scimbe/CADS-DEMO-contractcheck):
"what actually changed between these two versions of a contract, and does anything in the change
need a human's attention?" The diff is **always tool-computed** (`pdftotext` -> Python `difflib`,
never LLM-eyeballed); an LLM, if configured, only explains a diff it is handed after the fact — it
never sees the raw documents and never decides what changed. See the upstream repo's own README for
the full design rationale and its "proof of grounding" acceptance test.

Packaged as `InstallerKind::Binary` (not Compose): this is a short-lived, run-to-completion CLI —
extract, diff, optionally summarize, write a report, exit — exactly the shape Binary exists for
(see `crates/manifest-core/src/manifest.rs`'s `InstallerKind` doc comment), not a long-running
daemon.

## What's here

```
manifest.json   — a real, dev-signed ServiceManifest (ed25519, see manifest-core::ServiceManifest)
bundle.tar.gz   — the signed bundle (sha256 in manifest.json's bundle.sha256, checked by
                  installer-engine before anything runs): run.sh, verify.sh, src/, fixtures/, vendor/
bundle/         — the SAME files, unpacked, for reading without extracting the tarball
```

`bundle.url` in the manifest is the **relative** path `"bundle.tar.gz"` — like every other manifest
in this repo, this only resolves correctly if the process reading it has this directory
(`manifests/contractcheck/`) as its own working directory (`installer-engine::fetch::fetch_bytes`
resolves a non-`http(s)://` location via `std::fs::read`, against the *process's* CWD, not the
manifest.json's own location — see `test-manifests/minimal-compose/README.md` for the same note).
`cd` here before activating.

## What the bundle actually runs

`bundle.compose_file` is `"run.sh"` — for `Binary`, that field names the executable
`installer-engine` chmod+x's and runs directly (see the field's doc comment: reused from Compose's
"path to the compose file" rather than adding a kind-specific field). `run.sh`:

1. Runs the **real** upstream pipeline (`src/pipeline.py diff`) against the **repo's own committed
   fixture PDFs** (`fixtures/contract_v1.pdf` / `contract_v2.pdf` — real synthetic contracts,
   generated from HTML via headless Chrome by the upstream repo, with exactly one clause changed:
   Clause 4's payment term, "30 days" -> "45 days").
2. `src/extract.py` shells out to the real `pdftotext -layout` (poppler-utils) to get each PDF's
   text, normalizes it, and `src/difftool.py` computes a real `difflib.unified_diff` between the
   two — this is the ground truth, never touched by an LLM.
3. If `LLM_BASE_URL` **and** `LLM_API_KEY` are both set, it runs the full pipeline: the diff is
   also handed to an LLM (`src/summarize.py`) for a plain-language summary + flagged ambiguities,
   and both are written to `report.md` via `src/report.py`.
4. If either is unset, it runs the **exact same pipeline with `--no-llm`** (a flag the upstream CLI
   already ships) — the real tool-computed diff still runs and is written to `report.md`, just with
   no LLM summary section. No network call, no API key needed for this path at all.

`verify.sh` (invoked by `installer-engine` after `run.sh` exits 0) checks `report.md` for real:
the tool-computed diff block must contain the actual removed/added lines for Clause 4 (30 days /
45 days — not just "some diff happened"). If an LLM key was supplied, it additionally isolates the
`## LLM summary` section (not the diff block, which already contains "45" as diff content — grep
would false-positive against that) and checks it independently mentions the real changed value,
the same grounding discipline as the upstream repo's own `tests/test_summarize_grounding.py`. If no
key was supplied, that check is skipped, not silently treated as a pass-by-default.

## Required env vars — and the judgment call behind `required: false`

- `LLM_BASE_URL` — OpenAI-compatible base URL for the LLM summary step.
- `LLM_API_KEY` — API key for the LLM summary step.
- `LLM_MODEL_NAME` — model name for the LLM summary step (optional even when the other two are
  set — `src/summarize.py`'s own `Config.model` already defaults to `local-devstral-small2` if
  unset).

All three are marked `required: false` in `env_template` — **a deliberate judgment call, not an
oversight.** The upstream repo's own CLI already ships a `--no-llm` flag specifically so the
tool-computed diff can be verified/used with zero LLM dependency; `run.sh` mirrors that exact
design rather than forcing the manifest to only ever run the LLM path. Marking the LLM vars
`required: true` would make `installer-engine::activate`'s step 8 (`resolve_env_template`) refuse
to run at all without a key — which would make it impossible for `activate()` itself to ever
exercise or prove the honest degraded mode; you'd have to test that path by hand, outside the
manifest pipeline, and take it on faith that the packaged `run.sh` really does what it claims. With
`required: false`, **both real activation paths were proven end-to-end through the actual
`installer-engine::activate()` code path** (see below) — the full LLM pipeline, and the
key-less diff-only fallback — rather than one being verified and the other merely asserted.

That said: the LLM summary is the demo's actual headline feature ("what changed, in plain
language, and what needs a human's attention"). Without `LLM_BASE_URL`/`LLM_API_KEY` you get a
real, correct, tool-computed diff and nothing more — no summary, no flagged ambiguities. Treat the
LLM key as required for the product this manifest is meant to demonstrate, even though the
manifest schema itself doesn't enforce it.

## Verified for real before commit

`cargo run --example dev_activate -p installer-engine` (the exact code path a real
`ct-agent manifest activate` runs: fetch -> sha256 check -> [no compose guardrail scan for
`Binary`, see below] -> chmod+x + run `run.sh` -> run `verify.sh`), run from this directory against
this exact `manifest.json`/`bundle.tar.gz` pair, **twice**:

**With a real LLM key** (a budget-capped litellm-proxy key routing to `local-devstral-small2`):

```json
{
  "status": "ok",
  "manifest_id": "fd2bd0983825249a6bd6ff54126aec6fbbb87de8337014418e642cd3c6060d48",
  "publisher_pubkey": "77800a1611b6efe32f8c653e23a7d1a737bad44ec143fa739c57e13add968ac4",
  "project_name": "contractcheck-verify-llm",
  "compose_up": { "exit_code": 0, "duration_ms": 2305 },
  "verify": { "exit_code": 0, "duration_ms": 10 },
  "captured_stdout": "... real tool-computed diff (30 days -> 45 days) ... === LLM summary ===\nThe payment term was extended from 30 days to 45 days after the invoice date. ..."
}
```

**Without any LLM key** (`LLM_BASE_URL`/`LLM_API_KEY` both unset), proving the honest degraded
mode is real and not just claimed:

```json
{
  "status": "ok",
  "manifest_id": "fd2bd0983825249a6bd6ff54126aec6fbbb87de8337014418e642cd3c6060d48",
  "publisher_pubkey": "77800a1611b6efe32f8c653e23a7d1a737bad44ec143fa739c57e13add968ac4",
  "project_name": "contractcheck-verify-nollm",
  "compose_up": { "exit_code": 0, "duration_ms": 111 },
  "verify": { "exit_code": 0, "duration_ms": 12 },
  "captured_stdout": "LLM_BASE_URL/LLM_API_KEY not set -- running the tool-computed diff only (--no-llm, no key needed) ... === Tool-computed diff === ... (30 days -> 45 days, no LLM summary section)"
}
```

Both runs' `verify.exit_code: 0` came from the real `verify.sh` logic described above, not a stub
— the no-key run's verify explicitly logged `SKIP: LLM_BASE_URL/LLM_API_KEY not set -- verified
the tool-computed diff only` rather than silently passing an unchecked LLM section.

`run.sh`/`verify.sh` were also sanity-tested standalone first, directly (`env -i PATH=... ./run.sh`
/ `./verify.sh`, mirroring `installer-engine::process::run_bounded`'s `env_clear()` +
PATH-only-plus-explicit-vars discipline) before ever going through `dev_activate` — both the
LLM and no-LLM branches, in both harnesses.

## What's NOT checked here (Binary's narrower trust boundary)

Unlike a Compose manifest, `Binary` gets **no static guardrail scan** — `installer-engine::activate`
step 7 only runs `guardrails::scan_compose` for `InstallerKind::Compose`; there is no equivalent
static-analysis pass for an arbitrary executable (see `InstallerKind`'s own doc comment in
`manifest-core`). This manifest's entire safety rests on the publisher trust allowlist holding —
never add this (or any) `Binary` manifest's `publisher_pubkey` to a trust allowlist you wouldn't
also blindly trust for a Compose bundle from the same publisher.

## Prerequisites on the installing host

- `python3` (3.10+; developed/verified against 3.12) and `pdftotext` (poppler-utils) must already
  be installed on the host — neither is vendored. `pdftotext` in particular is a real, external
  system dependency the upstream repo itself calls out (`apt-get install poppler-utils` on
  Debian/Ubuntu); a `Binary` manifest has no container image to carry it in, unlike Compose.
- `httpx` (the LLM step's only third-party Python dependency) **is** vendored into `bundle/vendor/`
  (`pip install --target=vendor httpx`, ~2.5 MB) and put on `PYTHONPATH` by `run.sh` itself —
  `installer-engine::process::run_bounded` runs the binary with an `env_clear()`'d environment (only
  this manifest's resolved env_template values + `PATH`), so there is no ambient venv/PYTHONPATH to
  rely on even if one existed on the host; vendoring is the only way this works headlessly.

## Manifest ID / bundle hash

- `manifest_id`: `fd2bd0983825249a6bd6ff54126aec6fbbb87de8337014418e642cd3c6060d48`
- `publisher_pubkey`: `77800a1611b6efe32f8c653e23a7d1a737bad44ec143fa739c57e13add968ac4` (a
  throwaway dev keypair generated for this manifest — not tied to any real holder identity)
- `bundle.sha256`: `acb1a5136b4006e8251eb691a5ad3268ba8f1684c09af3a37aa2c25fd388c947`

## Not yet done

- No live tunnel/public subdomain for this demo — out of scope here, same as upstream's own
  README says about its own state ("a public subdomain/tunnel and marketplace manifest are later
  steps in the per-demo flow").
- No CI running the upstream repo's own `pytest` suite as part of this manifest's build — the
  manifest packages a fixed, already-verified snapshot of the upstream repo's `src/`/`fixtures/`;
  it doesn't re-run upstream's test suite itself.
