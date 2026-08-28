# newsletter — a real, signed `Binary` manifest for CADS-DEMO-newsletter

Packages an already-built, already-verified demo from the bunsenbrenner.org demo portfolio
(source: [`CADS-DEMO-newsletter`](https://github.com/scimbe/CADS-DEMO-newsletter)) as an installable
`installer_kind: binary` manifest. The demo turns a real, live weather API into a business-audience
weekly briefing: a real chart, a real HTML/PDF document, and a facts-only-guarded LLM narrative — see
the source repo's own README for the full design (the "LLM doesn't invent data" contract, enforced by
`src/narrative_guard.py`, not just prompted for).

**First `Binary`-kind manifest in this repo** — the two existing reference manifests
(`test-manifests/minimal-compose/`, `manifests/llm-node/`) are both `installer_kind: compose`. See
"What's different about Binary" below for what that changes.

## What's here

```
manifest.json    — a real, dev-signed ServiceManifest (ed25519, ct's actual signing discipline —
                    see manifest-core::ServiceManifest::signing_bytes for the canonical preimage)
bundle.tar.gz     — the signed bundle: run.sh (the "binary") + verify.sh + the vendored newsletter
                    source (src/, templates/, config/report.yaml, requirements-lock.txt,
                    scripts/verify_sample.py) — sha256 in manifest.json's bundle.sha256, checked by
                    installer-engine before anything runs
bundle/           — the SAME files, unpacked, for reading without extracting the tarball
```

`bundle.url` in the manifest is the **relative** path `"bundle.tar.gz"` — exactly like
`test-manifests/minimal-compose/`, this only resolves correctly if the process reading it has this
directory (`manifests/newsletter/`) as its own working directory
(`installer-engine::fetch::fetch_bytes` resolves a non-`http(s)://` `bundle.url` against the
**process's** CWD, not the manifest.json's own location) — `cd` here first.

## The service itself

`bundle.compose_file` is `"run.sh"` — for `InstallerKind::Binary` that field names the executable
`installer-engine` chmod+x's and runs directly (not through `bash`; see `manifest.json`'s own field
and `manifest-core::BundleRef`'s doc comment). `run.sh`:

1. builds a fresh venv from the bundle's own pinned `requirements-lock.txt` (no vendored venv —
   see "Known limitations" below for why),
2. runs the vendored `src/generate_report.py` unmodified: a real Open-Meteo fetch for Hamburg,
   deterministic fact computation, real `matplotlib` charts, a real litellm-proxy call to
   `local-devstral-small2` for the narrative (guarded — see the source repo's README for the
   retry-then-deterministic-fallback policy), and a real Jinja2 + headless-Chrome PDF render,
3. writes `report-output/{report.html,report.pdf,run-manifest.json,chart-*.png,chart-*.json}`.

`verify.sh` re-runs the vendored `scripts/verify_sample.py` (CADS-DEMO-newsletter's own
acceptance-bar checker, copied in verbatim) against `report-output/`: confirms
`run-manifest.json`'s `source_url` really points at `api.open-meteo.com`, re-verifies the narrative
against the frozen facts independently of what `generate_report.py` itself concluded, confirms
`report.html` contains that narrative verbatim, confirms `report.pdf` starts with `%PDF-` and that
`pdftotext` finds the real narrative text in the PDF's text layer (not a flattened image), and
confirms both chart PNGs' plotted-data JSON matches the fetched facts exactly. This is a real check
of real, freshly-fetched content — not a fixed string, not a stub.

## Required env vars (values go in your own local env, never in the manifest — see
`manifest.json`'s `env_template` for the authoritative list/descriptions)

- `LITELLM_BASE_URL` (required) — your litellm-proxy's OpenAI-compatible base URL, e.g.
  `http://127.0.0.1:4001/v1`.
- `LITELLM_API_KEY` (required) — a scoped litellm-proxy virtual key authorized for the model.
- `LITELLM_DEFAULT_MODEL` (optional) — defaults to `local-devstral-small2` from
  `config/report.yaml` if unset.

**No no-LLM fallback mode exists for this demo, and that was checked, not assumed.**
`src/generate_report.py` raises immediately if `LITELLM_BASE_URL`/`LITELLM_API_KEY` aren't set —
there is no flag to skip the call. The pipeline *does* have a deterministic, non-LLM fallback
(`src/llm_narrative.py::_deterministic_fallback`), but it only engages **after** a real LLM call has
been attempted twice and failed the facts-only guard — it is a resilience path for a flaky/wrong
model reply, not a way to run this manifest without credentials. A working, budget-capped
`local-devstral-small2` key was used for every real verification run below.

## Verified for real before commit

**v0.1.1 (current, post-fix)**: after the two bugs described below were fixed, `dev_activate` was
run 3 times fresh against the updated `manifest.json`/`bundle.tar.gz` (new `manifest_id`,
`publisher_pubkey`, and `bundle.sha256` — the fix changed the bundle contents, so it's a new
signature, not an edit to the old one). All 3 real, independent runs: `"status": "ok"`,
`compose_up.exit_code: 0`, `verify.exit_code: 0` — the identical invocation that produced 0/3
passes before the fix (see "Known limitations" below for the full story).

**v0.1.0 (original, superseded)**: `cargo run --example dev_activate -p installer-engine`, the
exact code path a real `ct-agent manifest activate` runs, against the original `manifest.json`/
`bundle.tar.gz` pair, with a real litellm-proxy key exported as `LITELLM_BASE_URL`/`LITELLM_API_KEY`
in the shell (picked up via `resolve_env_template`'s process-env fallback — no
`CT_MANIFEST_ENV_FILE` needed for this run). Real output (note: `manifest_id`/`publisher_pubkey`
below are the *old*, no-longer-current values — kept verbatim as a historical record, don't use
them to look up the current manifest):

```json
{
  "status": "ok",
  "manifest_id": "c549cced146a02f17bc25e1f8028081b5c98df305cb2a41cf467c49d2de9dbfc",
  "publisher_pubkey": "6360e5f22827633b55a60ae79773db8f6638327ed67ae2b31afa5fc17884949a",
  "project_name": "newsletter-manifest-test-1787953467",
  "compose_up": { "exit_code": 0, "duration_ms": 32917 },
  "verify": { "exit_code": 0, "duration_ms": 111 },
  "captured_stdout": "[run.sh] building a fresh venv from requirements-lock.txt ...\n[run.sh] generating the real weekly briefing (Open-Meteo fetch -> facts -> chart -> guarded LLM narrative -> HTML+PDF) ...\n{\n  \"run_id\": \"20260828-234453\",\n  \"llm_used\": true,\n  \"llm_fallback_used\": false,\n  \"pdf_written\": true,\n  \"out_dir\": \"report-output\"\n}\n[run.sh] done: report-output/report.html, report-output/report.pdf, report-output/run-manifest.json\n"
}
```

(`compose_up` is the field name `InstallReport::Ok` uses for both installer kinds' primary-artifact
step — for `Binary` it's really `binary_run`, i.e. `run.sh` itself; see `activate.rs`.)

The actual `report-output/` this run produced (inspected directly in `CT_MANIFEST_WORK_DIR`, not just
trusted from `verify.sh`'s exit code) contained a real fetched 7-day Hamburg forecast
(`run-manifest.json.source_url` = `https://api.open-meteo.com/v1/forecast?latitude=53.5511&...`,
`days[0]` = `{"date": "2026-08-28", "tmax": 23.7, "tmin": 17.3, "precip_mm": 10.8, ...}`), a real
LLM-written narrative grounded in those numbers (`llm_used: true`, `llm_fallback_used: false`:
*"This week in Hamburg, temperatures will range from a high of 23.7°C on August 28th to a low of
12.6°C on September 2nd, with total precipitation of 25.7 mm..."*), and a real `report.pdf`
(`%PDF-1.4`, `pdftotext` recovers that same narrative from its text layer).

## What's real vs. what you're checking

Verified by the publisher (this session) before commit — re-run these yourself, don't trust this
file's claims:

- The full `installer-engine::activate()` pipeline (fetch → sha256 check → allowlist check →
  chmod+x → run `run.sh` bounded to 300s → run `verify.sh` bounded to 60s, exact code path a real
  `ct-agent manifest activate` runs) really produces a real fetched-and-narrated weather briefing PDF
  and a passing `verify.sh` — see the JSON above.
- The signature is real (ed25519 over the canonical preimage,
  `manifest-core::ServiceManifest::signing_bytes`) — this is a throwaway test keypair
  (`publisher_pubkey` in `manifest.json`), not tied to any real holder identity.

## Two ways to react to this, both real

1. **Shape-only**: parse `manifest.json`, validate its field set against the authoritative
   `ServiceManifest` struct (`crates/manifest-core/src/manifest.rs`), verify the signature and
   `expires_at`, check `bundle.sha256` against the actual tarball bytes — all without needing to
   run anything.
2. **Full install→verify loop**: `cd` into this directory, export `LITELLM_BASE_URL` /
   `LITELLM_API_KEY` (and optionally `LITELLM_DEFAULT_MODEL`) either via `CT_MANIFEST_ENV_FILE` or
   directly in the shell, and run `cargo run --example dev_activate -p installer-engine` from the
   parent repo with `CT_MANIFEST_URL` pointed at this `manifest.json` and
   `CT_MANIFEST_TRUST_ALLOWLIST` set to the `publisher_pubkey` above — same function, same
   semantics either way.

## What's different about `Binary` (learned building this, not guessed)

- No static guardrail scan runs for `Binary` — `guardrails::scan_compose` is `Compose`-only.
  `activate()`'s own doc comment is explicit that `Binary`'s entire safety rests on the publisher
  trust allowlist; there's no equivalent static check for an arbitrary executable. Expected, not a
  gap in this manifest.
- `run.sh` gets the resolved `env_template` values **directly in its process environment** (not
  just written to `.env` — both happen, from the *same* resolution, see `activate.rs` step 8-9).
  `verify.sh`, in contrast, gets the same scrubbed environment Compose's verify step gets (only
  `CT_MANIFEST_PROJECT_NAME`) — this manifest's `verify.sh` doesn't need any of the LLM secrets
  itself (it only re-checks files `run.sh` already wrote to disk), so no `.env` sourcing was needed
  there, unlike `manifests/llm-node/bundle/verify.sh`.
- `process::run_bounded()` clears the **entire** process environment (`env_clear()`) before running
  either step, re-adding only `PATH` — there is no `HOME`. `run.sh` sets its own private
  `HOME`/`MPLCONFIGDIR`/`XDG_CACHE_HOME` inside the bundle's own work_dir before doing anything else,
  so pip/venv, matplotlib's font cache, and headless Chrome's profile directory never touch whatever
  real home directory the installing host happens to have.
- The hard 300s timeout on the `Binary` run step (whole process group killed after, same as
  `docker compose up`) is real and was budgeted for: a cold venv build + pip install from
  `requirements-lock.txt` measured ~19-33s on this host, well inside the limit even before the
  fetch/LLM/PDF steps.

## Known limitations / honest gaps

- **No vendored venv — `run.sh` needs network access to PyPI at install time**, in addition to the
  two live calls (Open-Meteo + litellm-proxy) the demo already needs. A self-contained venv baked
  into the bundle was considered and rejected: it would have inflated `bundle.tar.gz` from ~16KB to
  tens of MB of matplotlib/numpy/Pillow wheels for a git-committed test fixture, which doesn't match
  this repo's existing bundle sizes (`test-manifests/minimal-compose` is ~1KB, `manifests/llm-node`
  ~3KB). A cold `pip install` from the pinned lock file measured ~19s on this host with a warm pip
  cache; a completely cold host with no pip cache would be slower but still well inside the 300s
  hard timeout based on the package list's size (no CI or clean-machine measurement was taken for
  this specific point, so treat "well inside" as an informed estimate, not a measured guarantee on
  an arbitrary host).
- **FIXED (v0.1.1), was a real, blocking, reproduced bug**: an independent verifier ran the full
  `dev_activate` install→verify loop 3 times against v0.1.0 and got **0/3 passes** — this was not
  the "uncommon path" the original v0.1.0 note here claimed, it was the dominant outcome against
  `local-devstral-small2` at this demo's configured temperature. Root cause, fixed upstream in
  `CADS-DEMO-newsletter` (commit `b1959e0`) and re-vendored into this bundle: (1)
  `narrative_guard`'s number regex read the hyphens in an LLM-written ISO date (e.g. `2026-08-28`)
  as minus signs, producing spurious negative tokens that are essentially never in `facts` —
  fixed with a negative lookbehind so a hyphen preceded by another digit is never read as a sign,
  plus the year added to the structural allowlist. (2) `verify_sample.py`'s HTML check was a plain
  substring match against the raw narrative, but Jinja2 autoescapes the rendered HTML — fixed by
  unescaping the HTML before comparing. Re-verified for real: 3/3 fresh `dev_activate` runs pass
  cleanly (`status: ok`, both steps exit 0) after the fix, using the identical invocation that
  produced 0/3 before it. `bundle.tar.gz`/`manifest.json` in this directory already reflect the fix
  (new sha256, new signature, `version: 0.1.1`) — this note is kept as a record of what was found
  and fixed, not a currently-open gap.
- **`K8s` is out of scope** — schema-only in `manifest-core`, `installer-engine::activate` refuses it
  before any executor code path; irrelevant to this manifest (`installer_kind: binary`) but noted for
  completeness since the schema allows it.
- **The litellm virtual key used to verify this is shared and budget-capped** ($5 / 7 days, scoped to
  `local-devstral-small2` only, per the operator's demo-portfolio build round) — a future
  re-verification could hit that budget and see the LLM call fail, which `generate_report.py` treats
  identically to a guard failure (straight to the deterministic fallback, `llm_fallback_used: true`)
  — see the gap above for what that then does to `verify.sh`.
