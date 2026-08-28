#!/usr/bin/env bash
# Real verification, not a stub: checks that run.sh actually produced a
# report.md containing the REAL, tool-computed diff of the actual changed
# clause (Clause 4's payment term, "30 days" -> "45 days" -- see
# fixtures/expected_diff_fragment.txt) -- and, only when an LLM key was
# supplied, that the LLM summary section is genuinely grounded in that same
# real value rather than generic contract boilerplate.
#
# installer-engine runs this with a SCRUBBED environment -- only
# CT_MANIFEST_PROJECT_NAME is passed in, never the resolved LLM_BASE_URL/
# LLM_API_KEY values (see manifest-core::VerifySpec's doc comment /
# installer-engine::activate step 10). Those live in ./.env, written to this
# script's own working directory by installer-engine in step 8 -- so read it
# from there instead of assuming it's ambient.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f ./.env ]; then
  set -a
  # shellcheck disable=SC1091
  source ./.env
  set +a
fi

REPORT="$SCRIPT_DIR/report.md"

if [ ! -f "$REPORT" ]; then
  echo "FAIL: $REPORT not found -- expected the binary_run step (run.sh) to have written it"
  exit 1
fi

# The tool-computed diff must ALWAYS be present and correct, LLM or not --
# this is the part of the demo that is never LLM-eyeballed (see the repo's
# own README, "the diff is always tool-computed, never LLM-eyeballed").
if ! grep -qF -- '-Each invoice is due and payable within 30 days of the invoice date.' "$REPORT"; then
  echo "FAIL: report.md is missing the expected removed line (Clause 4, 30 days)"
  exit 1
fi
if ! grep -qF -- '+Each invoice is due and payable within 45 days of the invoice date.' "$REPORT"; then
  echo "FAIL: report.md is missing the expected added line (Clause 4, 45 days)"
  exit 1
fi
echo "OK: report.md's tool-computed diff shows Clause 4's payment term really changed 30 -> 45 days"

if [ -n "${LLM_BASE_URL:-}" ] && [ -n "${LLM_API_KEY:-}" ]; then
  # An LLM key was supplied, so run.sh should have produced a real LLM
  # summary too -- isolate just the "## LLM summary" section (NOT the diff
  # block above it, which already contains "45" as part of the diff itself)
  # and check that section actually mentions the real changed value. This is
  # the same grounding discipline as the repo's own
  # tests/test_summarize_grounding.py: a summary that ignores the diff it
  # was handed and free-associates about contracts in general would not
  # reliably mention "45" here.
  summary_section="$(awk '/^## LLM summary/{flag=1; next} /^## Flagged ambiguities/{flag=0} flag' "$REPORT")"
  if [ -z "$summary_section" ]; then
    echo "FAIL: LLM_BASE_URL/LLM_API_KEY were set but report.md has no non-empty '## LLM summary' section"
    exit 1
  fi
  if ! printf '%s' "$summary_section" | grep -q '45'; then
    echo "FAIL: LLM summary section does not mention '45' -- looks ungrounded in the real diff. Got: $summary_section"
    exit 1
  fi
  echo "OK: LLM summary section is present and grounded (mentions the real changed value, 45 days): $summary_section"
else
  echo "SKIP: LLM_BASE_URL/LLM_API_KEY not set -- verified the tool-computed diff only, no LLM summary was requested"
fi

exit 0
