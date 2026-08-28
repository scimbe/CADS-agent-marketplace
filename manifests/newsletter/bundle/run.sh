#!/usr/bin/env bash
# The Binary installer_kind entrypoint (manifest.json's bundle.compose_file
# points here -- see manifest-core::BundleRef's doc comment: for InstallerKind
# ::Binary that field names the executable, not a compose file).
#
# installer-engine's activate() chmod+x's this file, then runs it directly
# (never via bash -- so the shebang above matters), with the CURRENT DIRECTORY
# already set to the unpacked bundle root (this directory) and the resolved
# env_template values (LITELLM_BASE_URL / LITELLM_API_KEY / optionally
# LITELLM_DEFAULT_MODEL) already present in the process environment -- see
# crates/installer-engine/src/activate.rs step 9. No .env sourcing needed
# here (that's only required in verify.sh, which gets a scrubbed environment).
#
# This is the REAL CADS-DEMO-newsletter CLI, vendored into the bundle
# (src/, templates/, config/report.yaml, requirements-lock.txt) and run
# unmodified: a real Open-Meteo fetch, real matplotlib charts, a real
# facts-only-guarded LLM narrative call, and a real Jinja2 + headless-Chrome
# PDF render. See ../README.md for why this demo has no no-LLM fallback mode
# (it hard-requires LITELLM_BASE_URL/LITELLM_API_KEY -- narrative_guard's
# retry-then-fallback only kicks in AFTER a real LLM call is attempted, it
# does not let you skip the call itself).
set -euo pipefail
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BUNDLE_DIR"

# process::run_bounded() env_clear()s the whole process environment before
# running this script and only re-adds PATH + the resolved env_template
# values (crates/installer-engine/src/process.rs) -- there is no HOME. Give
# ourselves a private, self-contained HOME inside the bundle's own work_dir
# so pip/venv, matplotlib's font cache, and headless Chrome's profile
# directory all land somewhere writable and disposable, never touching
# whatever real home directory the installing user/agent happens to have.
export HOME="$BUNDLE_DIR/.home"
mkdir -p "$HOME"
export MPLCONFIGDIR="$BUNDLE_DIR/.mplcache"
export XDG_CACHE_HOME="$BUNDLE_DIR/.cache"

echo "[run.sh] building a fresh venv from requirements-lock.txt ..."
python3 -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
pip install -q --disable-pip-version-check -r requirements-lock.txt

echo "[run.sh] generating the real weekly briefing (Open-Meteo fetch -> facts -> chart -> guarded LLM narrative -> HTML+PDF) ..."
rm -rf report-output
python3 -m src.generate_report --out report-output --pdf --config config/report.yaml

echo "[run.sh] done: report-output/report.html, report-output/report.pdf, report-output/run-manifest.json"
