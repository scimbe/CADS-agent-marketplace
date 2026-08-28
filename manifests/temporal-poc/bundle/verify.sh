#!/usr/bin/env bash
# Independent verification for the temporal-poc Binary manifest.
#
# installer-engine runs this AFTER run.sh (binary_run) has already exited 0, in the SAME work_dir
# (same CWD) -- so the real evidence run.sh's invocation of scripts/run_demo.sh wrote to disk is
# sitting right here: evidence/event-history.json (real `temporal workflow show -o json` output),
# poc/.run/attempts.log (one JSON line per activity attempt that actually started, with its real
# OS pid), and poc/.run/output.pdf (the real rendered PDF). This script re-derives PASS/FAIL from
# those files itself -- it does NOT trust binary_run's own exit code as proof the recovery
# actually happened (run_demo.sh's own internal acceptance check already gates its exit code, but
# this step exists to be a genuinely independent second look at the persisted evidence, exactly
# like llm-node/verify.sh doesn't just trust `docker compose up`'s exit code and instead curls the
# service for real -- see this manifest's README).
#
# Unlike compose-kind verify scripts, this one needs no ./.env / CT_MANIFEST_PROJECT_NAME lookup
# at all -- env_template is effectively empty (RENDER_HOLD_SECONDS is the only, optional, entry,
# and it only affects how long the demo runs, not what verify.sh checks), so there is no secret or
# per-install value verify.sh needs. installer-engine still runs it with a scrubbed environment
# (only CT_MANIFEST_PROJECT_NAME set) either way -- this script just doesn't happen to need it.
set -uo pipefail

EVIDENCE_JSON="evidence/event-history.json"
ATTEMPTS_LOG="poc/.run/attempts.log"
OUTPUT_PDF="poc/.run/output.pdf"

for f in "$EVIDENCE_JSON" "$ATTEMPTS_LOG" "$OUTPUT_PDF"; do
  if [ ! -f "$f" ]; then
    echo "FAIL: expected evidence file '$f' not found in $(pwd) -- run.sh should have written it" >&2
    exit 1
  fi
done

echo "checking real evidence for a genuine kill-a-worker recovery ..."
echo "  - $EVIDENCE_JSON : real 'temporal workflow show -o json' output"
echo "  - $ATTEMPTS_LOG  : real OS pids of every activity attempt that actually started"
echo "  - $OUTPUT_PDF    : the real rendered PDF"

# Reuses the exact acceptance logic scripts/run_demo.sh already ran once internally (step 12) --
# re-run here, independently, against the evidence files as they sit on disk right now, not as a
# trusted pass-through of run.sh's own exit code. See scripts/check_acceptance.py's own docstring
# for the six assertions this checks (two distinct OS pids really ran the activity; a real
# ACTIVITY_TASK_STARTED event with attempt>=2; its lastFailure.timeoutFailureInfo.timeoutType is
# genuinely TIMEOUT_TYPE_HEARTBEAT, not a generic error; that event's identity pid matches the
# SECOND attempts.log pid and differs from the first; a terminal
# WORKFLOW_EXECUTION_COMPLETED event exists; the output PDF is real, non-empty, starts with %PDF-).
python3 scripts/check_acceptance.py "$EVIDENCE_JSON" "$ATTEMPTS_LOG" "$OUTPUT_PDF"
CHECK_EXIT=$?

exit "$CHECK_EXIT"
