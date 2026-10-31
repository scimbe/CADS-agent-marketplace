#!/usr/bin/env bash
# End-to-end proof of phone-to-phone channels (docs/adr/0004) on one machine: the real ct-edge and
# ct-control-plane binaries, two peer-demo processes, the real :443 front-door path. No Keycloak:
# the local control plane verifies a token signed by a throwaway RSA key generated here. Nothing
# leaves 127.0.0.1 and every key lives in a temporary directory.
#
#   CT_EDGE_BIN=... CT_CP_BIN=... PEER_DEMO_BIN=... scripts/peer-e2e.sh
set -euo pipefail

: "${CT_EDGE_BIN:?path to ct-edge}" "${CT_CP_BIN:?path to ct-control-plane}" "${PEER_DEMO_BIN:?path to peer-demo}"
T="$(mktemp -d)"; umask 077
EDGE_PID=""; CP_PID=""
stop() { kill ${EDGE_PID:-} ${CP_PID:-} 2>/dev/null || true; }
trap stop EXIT
fail() { echo "FAIL: $*"; echo "--- edge log"; tail -20 "$T/edge.log" || true; echo "--- cp log"; tail -20 "$T/cp.log" || true; exit 1; }
pass() { echo "PASS: $*"; }

port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])'; }
P_CP=$(port); P_FD=$(port); P_EDGE=$(port)
ISS="http://127.0.0.1:$P_CP/test-realm"
ADMIN="$(openssl rand -hex 32)"

# A local issuer: only this control plane instance trusts it.
openssl genrsa -out "$T/issuer.key" 2048 2>/dev/null
openssl rsa -in "$T/issuer.key" -pubout -out "$T/issuer.pub" 2>/dev/null
b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
H=$(printf '{"alg":"RS256","typ":"JWT"}' | b64)
C=$(printf '{"sub":"peer-e2e-inviter","iss":"%s","exp":%s}' "$ISS" "$(( $(date +%s) + 600 ))" | b64)
S=$(printf '%s.%s' "$H" "$C" | openssl dgst -sha256 -sign "$T/issuer.key" | b64)
export PEER_TOKEN="$H.$C.$S"

CT_EDGE_LISTEN="127.0.0.1:$P_EDGE" CT_EDGE_CERT_OUT="$T/edge-ca.der" CT_FRONT_DOOR="127.0.0.1:$P_FD" \
CT_EDGE_CP_URL="http://127.0.0.1:$P_CP" CT_EDGE_ADMIN_TOKEN="$ADMIN" \
  "$CT_EDGE_BIN" >"$T/edge.log" 2>&1 &
EDGE_PID=$!
CT_CONTROL_PLANE_LISTEN="127.0.0.1:$P_CP" CT_CONTROL_PLANE_DB="$T/cp.db" CT_OIDC_ISSUER="$ISS" \
CT_OIDC_PUBKEY_PATH="$T/issuer.pub" CT_CP_EDGE_ADMIN_TOKEN="$ADMIN" CT_CP_EDGE_CERT_PATH="$T/edge-ca.der" \
CT_PORTAL_BASE_URL="http://127.0.0.1:$P_CP" CT_ADMIN_SUPER_EMAIL="e2e@example.invalid" \
  "$CT_CP_BIN" >"$T/cp.log" 2>&1 &
CP_PID=$!

for _ in $(seq 1 100); do
  curl -fs "http://127.0.0.1:$P_CP/healthz" >/dev/null 2>&1 && [ -s "$T/edge-ca.der" ] && break
  sleep 0.1
done
curl -fs "http://127.0.0.1:$P_CP/healthz" >/dev/null || fail "control plane did not start"
[ -s "$T/edge-ca.der" ] || fail "edge did not start"

export PEER_CP="http://127.0.0.1:$P_CP" PEER_FRONT_DOOR="127.0.0.1:$P_FD" PEER_CA_FILE="$T/edge-ca.der"
A_SECRET="klartext-marker-von-A-$(openssl rand -hex 6)"
B_SECRET="klartext-marker-von-B-$(openssl rand -hex 6)"

# 1. Einladen, Annehmen: inviter with a token, invitee without one.
"$PEER_DEMO_BIN" invite "$T/a.json" "$T/link" 600
env -u PEER_TOKEN "$PEER_DEMO_BIN" accept "$T/link" "$T/b.json" | grep -q '^accepted$' || fail "accept without an account"
pass "invite accepted without an account on the invitee side"

# 2. A second tap on the same link fails; a stranger holding the link gets nothing.
out=$(env -u PEER_TOKEN "$PEER_DEMO_BIN" accept "$T/link" "$T/thief.json" || true)
[ "$out" = "error LinkUsed" ] || fail "replay: $out"
[ ! -e "$T/thief.json" ] || fail "replay produced a contact"
pass "invite link works exactly once"

# 3. Two processes exchange real messages through the real edge.
"$PEER_DEMO_BIN" run-invitee "$T/b.json" "$T/tap-b" "$B_SECRET" >"$T/b.out" 2>&1 &
B_PID=$!
sleep 1
"$PEER_DEMO_BIN" run-inviter "$T/a.json" "$T/tap-a" "$A_SECRET" >"$T/a.out" 2>&1 || { cat "$T/a.out" "$T/b.out"; fail "inviter session"; }
wait $B_PID || { cat "$T/a.out" "$T/b.out"; fail "invitee session"; }
sed 's/^/  A: /' "$T/a.out"; sed 's/^/  B: /' "$T/b.out"
grep -qx "got text $A_SECRET" "$T/b.out" || fail "A's message did not arrive at B"
grep -qx "got text $B_SECRET" "$T/a.out" || fail "B's message did not arrive at A"
pass "content arrived in both directions"

[ "$(grep '^code ' "$T/a.out")" = "$(grep '^code ' "$T/b.out")" ] || fail "verification codes differ"
pass "both sides show the same verification code"

# 4. Only ciphertext at the edge: the tap holds every byte the edge handled for each phone.
for f in tap-a tap-b; do
  [ -s "$T/$f" ] || fail "$f is empty"
  # Positive control: the join request is cleartext above TLS, so a tap that truly shows the edge's
  # view must contain it. Without this, an empty or wrong capture would pass the checks below.
  LC_ALL=C grep -qaF "relay-only" "$T/$f" || fail "control: $f does not show the edge's view"
  for needle in "$A_SECRET" "$B_SECRET" "klartext-marker" "Wolken" "idea.today" "contacts.read" "tools/call"; do
    if LC_ALL=C grep -qaF "$needle" "$T/$f"; then fail "plaintext '$needle' visible in $f"; fi
  done
done
pass "edge-side bytes ($(wc -c <"$T/tap-a" | tr -d ' ')+$(wc -c <"$T/tap-b" | tr -d ' ')) hold no plaintext"

# 5. Policy at the far end.
grep -qx 'cap 1 ok=false' "$T/a.out" || fail "unlisted capability not refused"
[ "$(grep -c '^ask user' "$T/b.out")" = 1 ] || fail "the user must be asked exactly once"
grep -q '^cap 2 ok=true data=.*Wolken' "$T/a.out" || fail "approved capability did not arrive"
pass "tool calls ignored, unlisted capability refused, data only after the tap"

# 5b. Rejoin: a new session from the stored contacts, with no new invite and no account.
env -u PEER_TOKEN "$PEER_DEMO_BIN" run-invitee "$T/b.json" "$T/tap-b2" "zweite-sitzung-B" >"$T/b2.out" 2>&1 &
B_PID=$!
sleep 1
env -u PEER_TOKEN "$PEER_DEMO_BIN" run-inviter "$T/a.json" "$T/tap-a2" "zweite-sitzung-A" >"$T/a2.out" 2>&1 || { cat "$T/a2.out" "$T/b2.out"; fail "rejoin inviter"; }
wait $B_PID || { cat "$T/a2.out" "$T/b2.out"; fail "rejoin invitee"; }
grep -qx "got text zweite-sitzung-A" "$T/b2.out" || fail "no delivery after rejoin"
grep -qx "got text zweite-sitzung-B" "$T/a2.out" || fail "no delivery after rejoin"
[ "$(grep '^code ' "$T/a.out")" = "$(grep '^code ' "$T/a2.out")" ] || fail "the code changed across sessions"
pass "rejoin from stored contacts, no new invite, same code"

# 6. An expired link.
"$PEER_DEMO_BIN" invite "$T/x.json" "$T/link-x" 1 >/dev/null
sleep 2
out=$(env -u PEER_TOKEN "$PEER_DEMO_BIN" accept "$T/link-x" "$T/y.json" || true)
[ "$out" = "error LinkExpired" ] || fail "expired: $out"
pass "expired link refused"

# 7. Holding a link is not membership: without the redemption the edge refuses the signed grant.
"$PEER_DEMO_BIN" invite "$T/z.json" "$T/link-z" 600 >/dev/null
python3 - "$T/z.json" "$T/link-z" "$T/forged.json" <<'PY'
import base64, json, sys
z = json.load(open(sys.argv[1]))
raw = open(sys.argv[2]).read().rsplit("#", 1)[1]
slot = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))[1:33].hex()
json.dump(dict(z, inviter=False, holder_seed=slot, grant=z["peer_grant"], operator_seed=None, peer_grant=None), open(sys.argv[3], "w"))
PY
out=$("$PEER_DEMO_BIN" join-once "$T/forged.json" || true)
case "$out" in "error Refused"*) ;; *) fail "stranger: $out";; esac
pass "a phone that skipped the invite cannot join ($out)"

# 8. Trennen: the operator signature alone revokes, without a login.
env -u PEER_TOKEN "$PEER_DEMO_BIN" revoke "$T/a.json" | grep -q '^revoked$' || fail "revoke"
sleep 1
out=$("$PEER_DEMO_BIN" join-once "$T/b.json" || true)
case "$out" in "error Refused"*) ;; *) fail "after Trennen: $out";; esac
pass "after Trennen the edge refuses the peer ($out)"

echo "ALL PASSED"
