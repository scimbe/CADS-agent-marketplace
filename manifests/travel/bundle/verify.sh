#!/usr/bin/env bash
# Real verification, two phases -- not just "containers are up":
#
#  Phase 1 (always runs, no LLM needed): queries the bridge's own /api/plan-raw endpoint, which
#  bypasses the LLM entirely (fixed origin/destination coordinates, no geocoding, no chat call) --
#  proves the self-hosted OSRM engine itself is real and correctly serving the bundled Bremen MLD
#  graph. Checked against the exact pinned values from the upstream repo's osrm/REGIONS.md (a
#  live-verified acceptance run against the same graph build): fastest = 29606.9 m / 2041.3 s,
#  avoid_highways = 23678.3 m / 2275.3 s (shorter distance, LONGER duration -- a real routing
#  trade-off, not just two different numbers). Re-confirmed byte-for-byte while building this
#  manifest (`docker compose up` + curl, same graph, same result, deterministic MLD routing).
#
#  Phase 2 (needs LITELLM_BASE_URL/LITELLM_API_KEY -- both `required: true` in manifest.json's
#  env_template, so installer-engine's activate() already refuses to reach this script at all
#  without them, see activate.rs step 8): free text -> LLM intent extraction -> bridge executes
#  the real OSRM query (never the model) -> LLM formats the answer -> bridge mechanically
#  re-verifies the answer's <ROUTE_FACTS> block against the SAME raw route object, via the
#  upstream repo's own bridge/lib/verify.js (reused as-is inside server.lib.js's planAndFormat,
#  not reimplemented here -- this script only reads its `verify` field back over HTTP). A model
#  that invented or mis-copied a number would flip `verify.pass` to false; this script hard-fails
#  if that happens, it does not just check the HTTP call succeeded.
set -uo pipefail

# installer-engine runs verify.sh with a SCRUBBED environment -- only CT_MANIFEST_PROJECT_NAME is
# passed in, never the resolved env_template values (see manifest-core::VerifySpec's doc comment
# and activate.rs step 10). Those values are the SAME .env docker compose itself read via
# --env-file in step 9, written to this script's own working directory (opts.work_dir) in step 8
# -- read it from there instead of assuming it's ambiently in the environment.
if [ ! -f ./.env ]; then
  echo "FAIL: ./.env not found in $(pwd) -- expected installer-engine to have written it here"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source ./.env
set +a

BRIDGE_URL="http://127.0.0.1:8789"  # fixed, matches compose.yml's port mapping -- see its own comment

echo "waiting for $BRIDGE_URL/healthz ..."
healthy=""
for _ in $(seq 1 60); do
  healthy="$(curl -fsS --max-time 2 "$BRIDGE_URL/healthz" 2>/dev/null || true)"
  [ -n "$healthy" ] && break
  sleep 2
done
if [ -z "$healthy" ]; then
  echo "FAIL: $BRIDGE_URL/healthz never responded (bridge and/or osrm-car never came up)"
  exit 1
fi
echo "OK: bridge is healthy: $healthy"

# Pinned Bremen acceptance fixture (osrm/REGIONS.md in the upstream repo): origin near Bremen
# Flughafen, destination near Bremen-Vegesack, profile=driving.
ORIGIN="8.7867,53.0475"
DEST="8.6167,53.1667"

check_raw_route() {
  local preference="$1" expected_dist="$2" expected_dur="$3" tol="$4"
  echo "Phase 1: /api/plan-raw preference=$preference (real OSRM, no LLM involved) ..."
  local body
  body="$(curl -fsS --max-time 10 "$BRIDGE_URL/api/plan-raw?origin=$ORIGIN&destination=$DEST&preference=$preference" 2>/dev/null || true)"
  if [ -z "$body" ]; then
    echo "FAIL: /api/plan-raw?preference=$preference returned no response"
    return 1
  fi
  python3 - "$body" "$expected_dist" "$expected_dur" "$tol" <<'PYEOF'
import json, sys
body, expected_dist, expected_dur, tol = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
try:
    data = json.loads(body)
    route = data["picked_route"]
    dist, dur = route["distance"], route["duration"]
except Exception as e:
    print(f"FAIL: could not parse picked_route from response: {e}. Raw: {body[:300]}")
    sys.exit(1)
if abs(dist - expected_dist) > tol:
    print(f"FAIL: distance {dist} m outside tolerance {tol} of pinned {expected_dist} m")
    sys.exit(1)
if abs(dur - expected_dur) > tol:
    print(f"FAIL: duration {dur} s outside tolerance {tol} of pinned {expected_dur} s")
    sys.exit(1)
print(f"OK: real OSRM result distance={dist} m duration={dur} s (matches pinned fixture within {tol})")
PYEOF
}

check_raw_route "fastest" 29606.9 2041.3 5.0 || exit 1
# avoid_highways (exclude=motorway) is the interesting cross-check: shorter DISTANCE but LONGER
# DURATION than fastest -- a real trade-off produced by the routing engine, not two arbitrary
# numbers, and not reproducible by a model just "estimating" a route.
check_raw_route "avoid_highways" 23678.3 2275.3 5.0 || exit 1

# Phase 2: the actual point of this demo -- LLM formatting with a real, live, mechanical
# anti-hallucination check. LITELLM_API_KEY/LITELLM_BASE_URL are `required: true` in
# manifest.json, so activate() already refused to reach this point without them (activate.rs step
# 8) -- these checks are defense in depth for anyone driving verify.sh directly outside that
# pipeline, not the primary gate.
: "${LITELLM_API_KEY:?LITELLM_API_KEY not set in .env -- required for the chat-formatting step, see manifest.json's env_template}"
: "${LITELLM_BASE_URL:?LITELLM_BASE_URL not set in .env -- required for the chat-formatting step, see manifest.json's env_template}"

echo "Phase 2: free text -> LLM intent -> real OSRM -> LLM format -> verify.js anti-hallucination check ..."
plan_response="$(curl -fsS --max-time 60 -X POST "$BRIDGE_URL/api/plan" \
  -H 'content-type: application/json' \
  -d '{"text":"Wie komme ich am schnellsten von Bremen Hauptbahnhof nach Vegesack?"}' 2>/dev/null || true)"
if [ -z "$plan_response" ]; then
  echo "FAIL: POST /api/plan returned no response"
  exit 1
fi
python3 - "$plan_response" <<'PYEOF'
import json, sys
try:
    data = json.loads(sys.argv[1])
except Exception as e:
    print(f"FAIL: /api/plan response was not valid JSON: {e}. Raw: {sys.argv[1][:300]}")
    sys.exit(1)
if "error" in data:
    print(f"FAIL: /api/plan returned an error (LiteLLM/Nominatim reachability? see README.md): {data['error']}")
    sys.exit(1)
verify = data.get("verify", {})
if not verify.get("pass"):
    print(f"FAIL: bridge's own verify.js anti-hallucination check did NOT pass: {json.dumps(verify)}")
    sys.exit(1)
facts = verify.get("facts", {})
answer = data.get("llm_answer", "")
print(f"OK: verify.js confirmed the LLM's <ROUTE_FACTS> ({facts.get('distance_m')} m / {facts.get('duration_s')} s) exactly matches the real OSRM route, hardFails=0")
print(f"LLM answer:\n{answer}")
PYEOF
[ $? -eq 0 ] || exit 1

echo "OK: travel-demo verified end to end -- real self-hosted OSRM routing (Phase 1, both preferences) plus a real LLM chat-formatting round-trip with a mechanical anti-hallucination check that actually inspected the model's output (Phase 2)."
exit 0
