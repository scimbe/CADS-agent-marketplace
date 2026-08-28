#!/usr/bin/env bash
# phototools Binary-kind entrypoint.
#
# installer-engine's process::run_bounded execs this file DIRECTLY (Command::new(this_path), no
# shell, no arguments -- see crates/installer-engine/src/activate.rs step 9) with:
#   - cwd already set to the unpacked bundle's own work_dir (this script's own directory)
#   - env_clear()'d down to PATH plus whatever env_template resolved (nothing here -- this demo
#     needs no env vars/secrets for its core path, see ../README.md and the upstream repo's own
#     README "the deterministic tool orchestration works with zero LLM/network involvement")
# So node/exiftool/convert/montage all have to resolve via that inherited PATH, and this script
# never assumes HOME or anything else is set.
#
# Runs exactly the upstream repo's own proven `npm run fixture:organize` (package.json), spelled
# out as its two constituent node invocations rather than through npm itself -- one less thing
# (npm's own startup/registry-touching behavior) for a scrubbed, no-network activation to depend
# on. No --summary flag is passed, so the optional LLM step never runs and no LITELLM_* var is
# needed at all.
set -uo pipefail

cd phototools || { echo "FAIL: cannot cd into phototools/ next to this script" >&2; exit 1; }

echo "== phototools: generating the repo's own synthetic fixture photo batch (fixtures/generate.js) =="
if ! node fixtures/generate.js; then
  echo "FAIL: fixtures/generate.js failed" >&2
  exit 1
fi

echo "== phototools: organize (real exiftool sort/rename + real ImageMagick watermark + contact sheet) =="
if ! node bin/phototools.js organize fixtures/.tmp/raw --out fixtures/.tmp/sorted \
      --watermark-text "bunsenbrenner.org . demo" --contact-sheet; then
  echo "FAIL: organize exited non-zero" >&2
  exit 1
fi

echo "OK: before/after left at phototools/fixtures/.tmp/{raw,sorted} for verify.sh to check"
exit 0
