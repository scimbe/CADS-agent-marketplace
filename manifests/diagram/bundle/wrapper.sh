#!/usr/bin/env bash
# diagram-cli wrapper -- the InstallerKind::Binary entrypoint for the "diagram" marketplace
# manifest (source: https://github.com/scimbe/CADS-DEMO-diagram).
#
# installer-engine runs this file DIRECTLY (not via `bash script.sh` -- see
# crates/installer-engine/src/activate.rs step 9 / process::run_bounded), chmod +x'd, in the
# unpacked bundle's own work_dir, with an env_clear()'d process: only this manifest's resolved
# env_template values (LITELLM_BASE_URL / LITELLM_API_KEY / LITELLM_DEFAULT_MODEL) plus PATH are
# present -- no HOME, no npm config, no shell rc files, nothing ambient. See this bundle's own
# README for why each step below is written the way it is.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

echo "diagram-cli wrapper: installing npm dependencies (mermaid renderer, no bundled Chromium download) ..."
export PUPPETEER_SKIP_DOWNLOAD=true
if ! npm ci --omit=dev --no-audit --no-fund >npm-install.log 2>&1; then
  echo "FAIL: npm ci failed -- last 40 lines of npm-install.log:" >&2
  tail -n 40 npm-install.log >&2
  exit 1
fi

echo "diagram-cli wrapper: locating a system Chrome/Chromium for puppeteer ..."
if [ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ]; then
  for candidate in google-chrome-stable google-chrome chromium-browser chromium; do
    found="$(command -v "$candidate" 2>/dev/null || true)"
    if [ -n "$found" ]; then
      export PUPPETEER_EXECUTABLE_PATH="$found"
      break
    fi
  done
fi
if [ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ]; then
  echo "FAIL: no system Chrome/Chromium found on PATH (checked google-chrome-stable, google-chrome," >&2
  echo "chromium-browser, chromium) and PUPPETEER_EXECUTABLE_PATH was not set. Install one, or set" >&2
  echo "PUPPETEER_EXECUTABLE_PATH via this manifest's env_template before activating." >&2
  exit 1
fi
echo "Using Chrome at: $PUPPETEER_EXECUTABLE_PATH"

echo "diagram-cli wrapper: generating the fixed acceptance-bar test diagram ..."
node bin/diagram.js generate \
  --description "A flowchart: user logs in, then sees the dashboard." \
  --engine mermaid \
  --out diagram.png \
  --max-attempts 3 \
  --attempts-log attempts.json
exit_code=$?

echo "diagram-cli wrapper: generate exited $exit_code"
exit $exit_code
