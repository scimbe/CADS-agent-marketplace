#!/usr/bin/env bash
# Binary-kind entrypoint for the contractcheck manifest: runs the real
# CADS-DEMO-contractcheck pipeline (pdftotext -> difflib -> optionally an LLM
# summary) against the repo's own committed fixture PDFs
# (fixtures/contract_v1.pdf / contract_v2.pdf -- Clause 4's payment term
# really changes "30 days" -> "45 days" between them, see
# fixtures/expected_diff_fragment.txt).
#
# installer-engine execs this file directly after chmod+x (no shell wrapper
# of its own -- see installer-engine::activate step 9), in the unpacked
# bundle's own directory, with an env_clear()'d environment carrying ONLY
# this manifest's resolved env_template values plus PATH (installer-engine's
# process.rs::run_bounded). So: no HOME, no PYTHONPATH, nothing ambient --
# everything this script needs it sets up itself, relative to its own
# location.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# httpx (the summarize step's only third-party dependency) is vendored here
# rather than assumed present on the host -- a Binary manifest gets no
# container/image to carry its own runtime, and installer-engine's
# env_clear() means there is no ambient venv/PYTHONPATH to inherit even if
# one existed on the host. python3 itself, and pdftotext (poppler-utils),
# are assumed already installed on the host -- see this manifest's README
# for why those two are NOT vendored (a system tool and the interpreter
# itself, not a pip package).
export PYTHONPATH="$SCRIPT_DIR/vendor"

REPORT="$SCRIPT_DIR/report.md"

if [ -n "${LLM_BASE_URL:-}" ] && [ -n "${LLM_API_KEY:-}" ]; then
  echo "LLM_BASE_URL and LLM_API_KEY are set -- running the real diff + LLM summary pipeline"
  python3 "$SCRIPT_DIR/src/pipeline.py" diff \
    --old "$SCRIPT_DIR/fixtures/contract_v1.pdf" \
    --new "$SCRIPT_DIR/fixtures/contract_v2.pdf" \
    --report "$REPORT"
else
  echo "LLM_BASE_URL/LLM_API_KEY not set -- running the tool-computed diff only (--no-llm, no key needed)"
  python3 "$SCRIPT_DIR/src/pipeline.py" diff \
    --old "$SCRIPT_DIR/fixtures/contract_v1.pdf" \
    --new "$SCRIPT_DIR/fixtures/contract_v2.pdf" \
    --report "$REPORT" \
    --no-llm
fi

echo
echo "=== report.md ==="
cat "$REPORT"
