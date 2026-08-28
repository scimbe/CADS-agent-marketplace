#!/usr/bin/env bash
# Real verification, not a stub: re-runs CADS-DEMO-newsletter's OWN
# acceptance-bar checker (scripts/verify_sample.py, vendored verbatim) against
# the report-output/ directory run.sh just produced. That script:
#   - checks run-manifest.json's source_url really points at
#     https://api.open-meteo.com/v1/forecast (not a canned string) and its
#     raw_response_sha256 looks like a real sha256 digest
#   - re-runs narrative_guard.check_narrative() against the committed
#     narrative + frozen facts (independent of whatever generate_report.py
#     itself concluded -- catches drift/edits, not just trusts generation time)
#   - confirms report.html contains that guarded narrative verbatim
#   - confirms report.pdf starts with %PDF- AND that `pdftotext` finds the
#     start of the real narrative in its text layer (proves a real selectable
#     text PDF, not a flattened image)
#   - confirms both chart PNGs' plotted-data JSON matches facts.days exactly
# See CADS-DEMO-newsletter/scripts/verify_sample.py for the implementation.
#
# installer-engine runs this with a SCRUBBED environment (only
# CT_MANIFEST_PROJECT_NAME set, see crates/installer-engine/src/activate.rs
# step 10 / process.rs's env_clear()) -- irrelevant here, everything this
# script checks is already committed to disk by run.sh's real run, and
# narrative_guard.py has zero third-party dependencies (stdlib re/dataclasses
# only), so plain system `python3` is enough -- no venv activation needed.
set -uo pipefail
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BUNDLE_DIR"

if [ ! -d report-output ]; then
  echo "FAIL: report-output/ not found in $(pwd) -- run.sh must run (and succeed) before verify.sh"
  exit 1
fi

if python3 scripts/verify_sample.py report-output; then
  echo "OK: real Open-Meteo-sourced report, guarded LLM narrative, and PDF text layer all verified"
  exit 0
else
  echo "FAIL: acceptance-bar checker reported failures (see output above)"
  exit 1
fi
