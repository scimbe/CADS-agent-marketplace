#!/usr/bin/env bash
# Real verification, not a stub: curl the service the compose file just brought up and check its
# actual response body -- proves the container is not just "running" (docker's own view) but
# genuinely serving the expected content on the expected port. installer-engine runs this with
# CT_MANIFEST_PROJECT_NAME set (see manifest-core::VerifySpec's doc comment) but this script
# doesn't need it -- the port is fixed (127.0.0.1:8765) since only one instance of this test
# manifest is expected to run at a time.
set -uo pipefail

EXPECTED="hello from CADS-agent-marketplace"
URL="http://127.0.0.1:8765/"

body=""
for _ in $(seq 1 10); do
  body="$(curl -fsS --max-time 2 "$URL" 2>/dev/null || true)"
  [ -n "$body" ] && break
  sleep 1
done

if [ -z "$body" ]; then
  echo "FAIL: no response from $URL after 10 tries (service never came up)"
  exit 1
fi

if [ "$body" != "$EXPECTED" ]; then
  echo "FAIL: response body was '$body', expected '$EXPECTED'"
  exit 1
fi

echo "OK: $URL served the expected body"
exit 0
