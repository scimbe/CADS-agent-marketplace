# phototools — a real, signed, Binary-kind test manifest

Packages [`CADS-DEMO-phototools`](https://github.com/scimbe/CADS-DEMO-phototools)
(commit `41f72f8258e6bdb8e9f2f4b3c484e9ea2ac0d963`) — a real `exiftool` + real ImageMagick
batch photo organizer, part of the bunsenbrenner.org demo portfolio — as an
`installer_kind: binary` manifest. First real Binary-kind example in this repo (the two prior
manifests, `test-manifests/minimal-compose/` and `manifests/llm-node/`, are both Compose); read
those first if you haven't — this README only calls out what's different for Binary.

**Fully self-contained: no secrets, no LLM, no network at activation time.** `env_template` is
empty. The upstream repo's own README is explicit that "the deterministic tool orchestration
works with zero LLM/network involvement" — sorting/renaming is driven by real EXIF (read via
`exiftool`), location resolution is a bundled ~20-city gazetteer + offline haversine
nearest-neighbor (no geocoding API), and the optional `--summary` LLM caption step is simply never
invoked here. There is no partial-verification caveat on this one.

## What's here

```
manifest.json    — a real, dev-signed ServiceManifest (ed25519), installer_kind: binary
bundle.tar.gz    — the signed bundle: run.sh + verify.sh + the full phototools source (incl.
                    vendored node_modules/dotenv so npm/network is never needed at activation)
bundle/          — the SAME contents, unpacked, for reading without extracting the tarball
```

`bundle.url` is the relative path `"bundle.tar.gz"` — like the other manifests in this repo, this
only resolves if the process reading it has this directory (`manifests/phototools/`) as its own
working directory (`installer-engine::fetch::fetch_bytes` resolves a non-`http(s)://` URL against
the *process's* CWD, not the manifest.json's own location) — `cd` here first.

## What "Binary" means here, concretely

`bundle.compose_file` is reused (per its own doc comment in `manifest-core::BundleRef`) as the
path to the executable: `"run.sh"`. `installer-engine::activate` (step 9) `chmod +x`'s it and
execs it directly — no shell, no arguments, `cwd` = the unpacked bundle's own `work_dir`, and the
process environment is `env_clear()`'d down to `PATH` plus whatever `env_template` resolved
(nothing, here) — see `process::run_bounded`'s doc comment. `run.sh` therefore:

- never assumes `HOME`, `USER`, or anything besides `PATH` is set;
- `cd`s into `phototools/` (the bundled source tree, sitting right next to it in `work_dir`) and
  runs exactly the upstream repo's own `npm run fixture:organize`, spelled out as its two node
  invocations rather than through `npm` itself — one less thing (npm's own startup/registry
  probing) for a no-network activation to depend on:
  ```
  node fixtures/generate.js
  node bin/phototools.js organize fixtures/.tmp/raw --out fixtures/.tmp/sorted \
    --watermark-text "bunsenbrenner.org . demo" --contact-sheet
  ```
- exits non-zero on either step failing, 0 only once both real before/after directories exist.

Binary skips the Compose-only guardrail scan entirely (`activate.rs` step 7 is gated on
`installer_kind == Compose`) — there's no static-analysis equivalent for an arbitrary executable,
so this manifest's whole safety rests on the publisher trust allowlist, exactly as
`manifest-core::InstallerKind`'s own doc comment describes as Binary's acknowledged
narrower-trust-boundary tradeoff. Nothing here needs it anyway: no privileged access, no ports, no
Docker involvement at all — `installer-engine`'s own preflight collision guard skips the
docker-resource check for Binary specifically because a host with no Docker daemon must still be
able to run one (`CADS-agent-marketplace#11`).

`verify.sh` then runs (bash, scrubbed env — only `CT_MANIFEST_PROJECT_NAME`, no secrets to
`source ./.env` for since there's nothing to load), and does a REAL check, not a stub:

1. the 6 raw fixture photos exist;
2. every `manifest.json` entry's `srcPath`/`destRelPath`/`dateTimeOriginal`/`city` matches
   `phototools/fixtures/expected/manifest.sample.json` — the upstream repo's own hand-checked
   oracle (the same one its `tests/acceptance.organize.test.js` diffs against), reimplemented in
   Python here since this scrubbed shell has no `node_modules` test runner available to it — and
   every expected `destRelPath` file genuinely exists on disk, not just asserted in the manifest;
3. `DateTimeOriginal` on the real destination (post-watermark) files still matches the source,
   proven with `exiftool` directly against the actual files — confirms watermarking's
   `restampExif` step genuinely preserved EXIF, not just that files landed at the right names;
4. `contact-sheet.jpg` is a real image at the deterministic width for 4 columns @ `200x150+6+6`
   (`848px` — pure arithmetic, exact) and a plausible height for 2 rows.

## Verified for real before commit

`cargo run --example dev_activate -p installer-engine` — the exact code path a real
`ct-agent manifest activate` runs — against this exact `manifest.json`/`bundle.tar.gz` pair, from
this directory, real output:

```json
{
  "status": "ok",
  "manifest_id": "85782450f84caddbe5622699669cd98b6fc14f6a2054c29d826af41461013c1d",
  "publisher_pubkey": "87d97b209645c7f7a960ea3f5566b339b4c3f4ded1c4effb7c2f2c10db8619f0",
  "project_name": "phototools-dev-activate-test",
  "compose_up": { "exit_code": 0, "duration_ms": 5312 },
  "verify": { "exit_code": 0, "duration_ms": 703 },
  "captured_stdout": "== phototools: generating the repo's own synthetic fixture photo batch (fixtures/generate.js) ==\nfixtures/generate.js: generated + verified 6 photos in <work_dir>/phototools/fixtures/.tmp/raw\n== phototools: organize (real exiftool sort/rename + real ImageMagick watermark + contact sheet) ==\norganized 6 photo(s) into fixtures/.tmp/sorted (copy)\nwatermarked 6 photo(s): \"bunsenbrenner.org . demo\"\ncontact sheet: fixtures/.tmp/sorted/contact-sheet.jpg\nOK: before/after left at phototools/fixtures/.tmp/{raw,sorted} for verify.sh to check\n"
}
```

(`compose_up` is the field name for both kinds — see `InstallReport`'s own doc comment; here it's
`run.sh`'s own run, not a real `docker compose`.) Before that, `run.sh` and `verify.sh` were each
run standalone with `env -i PATH="$PATH" ...` (i.e. hand-simulating installer-engine's exact
`env_clear()` discipline) to confirm neither silently depends on an ambient env var the real
pipeline would strip. `publisher_pubkey` above is a throwaway dev keypair generated fresh for this
manifest — same convention as the other two manifests in this repo, not tied to any real holder
identity.

Environment this was verified against: Debian, exiftool `13.59`, ImageMagick `6.9.12-98` (IM6,
`identify`/`convert`/`montage`), Node `v24.10.0` — all resolved via the invoking process's own
`PATH` (the one thing `run_bounded` preserves through `env_clear()`), matching what the upstream
repo's own README documents as its tested environment.

## Judgment calls / real gaps

- **`node_modules/dotenv` is vendored into the bundle** (not `npm install`'d at activation time).
  `bin/phototools.js` unconditionally does `require("dotenv").config()`; vendoring it (124KB,
  zero transitive deps) means activation never touches the npm registry — matching this manifest's
  "no network needed" claim literally, not just "usually works offline." A `--summary` flag exists
  upstream and does hit a real LLM; it's simply never passed here, so `dotenv.config()` finding no
  `.env` file is expected and harmless (matches the upstream README's own documented no-key
  behavior: clean no-op, not an error).
- **Only the "happy path" fixture batch is exercised** — same honest gap the upstream repo's own
  README already documents: `undated`/`unknown-location` fallback buckets are unit-tested at the
  `planNames` layer but not exercised through this end-to-end run (every fixture photo has both a
  date and a GPS tag, by the fixture generator's own design). Not something this packaging step
  introduced or could fix without diverging from the upstream fixture.
- **`--move` is never exercised** (this manifest always uses the default copy mode) — copy is the
  safer default for a demo that runs against synthetic, throwaway fixtures anyway.
- **IM7 fallback path is untested here too** — same caveat the upstream README already states
  (`src/util/shell.js` has defensive `magick convert`/`magick montage` fallback code, but no IM7
  host was available to exercise it, on this host or upstream).

## Two ways to react to this, both real

1. **Shape-only**: parse `manifest.json`, validate against `ServiceManifest`
   (`crates/manifest-core/src/manifest.rs`), verify the signature/`expires_at`, check
   `bundle.sha256` against the actual tarball bytes — no `exiftool`/ImageMagick/Node needed.
2. **Full install→verify loop**: if `exiftool` + ImageMagick + Node ≥18 are on your host (no
   Docker needed at all for this one), `cd` into this directory and run the real
   `cargo run --example dev_activate -p installer-engine` with `CT_MANIFEST_URL` pointed at this
   `manifest.json` and `CT_MANIFEST_TRUST_ALLOWLIST` set to the `publisher_pubkey` above.

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
