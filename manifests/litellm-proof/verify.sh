#!/usr/bin/env bash
# Measure this stack's properties rather than trusting them. Every check prints PASS or FAIL and
# contributes to the exit code; the script exits 0 only if all of them passed.
#
# Runs under the installer's scrubbed environment (only PATH plus what the installer sets), so it
# never sees a secret value -- every check below is deliberately one that works without a key.
set -uo pipefail

PROJ="${CT_MANIFEST_PROJECT_NAME:-}"
REAL_STACK="litellm-proxy"   # the live deployment this proof must never touch

fail=0
info() { printf '\n== %s\n' "$1"; }
ok()   { printf 'PASS   %s\n' "$1"; }
bad()  { printf 'FAIL   %s\n' "$1"; fail=1; }

[ -n "$PROJ" ] || { bad "CT_MANIFEST_PROJECT_NAME is not set -- cannot identify this run's containers"; exit 1; }

# A project name that collides with the real deployment would make every check below ambiguous,
# so refuse before running any of them.
case "$PROJ" in
  *"$REAL_STACK"*) bad "project name '$PROJ' contains '$REAL_STACK' -- refusing to verify against the real stack"; exit 1 ;;
esac

# Resolve a service's container via compose's own label, so a project name with a unique suffix
# (e.g. litellm-proof-a1b2c3) still finds it and no name is hardcoded.
container_for() {
  docker ps --filter "name=${PROJ}" --filter "label=com.docker.compose.service=$1" \
            --format '{{.Names}}' 2>/dev/null | head -1
}
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@"; }

# litellm has a real, non-trivial startup cost (prisma migration + engine download/setup, seen
# taking ~35s in practice) that `docker compose up -d` returning does not wait for -- `up -d`
# only proves the container STARTED, never that the app inside is ready to serve HTTP. Polling
# with a bounded budget is the honest middle ground between a flaky single-shot check (measures
# nothing but timing luck) and an unbounded wait (measures nothing at all if litellm is actually
# broken). 60s budget, 2s interval; each attempt's last code is what a failure reports.
wait_for_code() {
  url="$1"; want_pattern="$2"; budget=60; interval=2; elapsed=0; last="000"
  while [ "$elapsed" -lt "$budget" ]; do
    last="$(code "$url")"
    case "$last" in
      $want_pattern) printf '%s' "$last"; return 0 ;;
    esac
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done
  printf '%s' "$last"
  return 1
}

info "all four services of project '$PROJ' are running"
for svc in db redis litellm heartbeat; do
  c="$(container_for "$svc")"
  if [ -n "$c" ]; then ok "$svc -> $c"; else bad "$svc -> no running container"; fi
done

info "stateful services report healthy (docker's own healthcheck, not a guess)"
for svc in db redis; do
  c="$(container_for "$svc")"
  if [ -z "$c" ]; then bad "$svc health: no container"; continue; fi
  h="$(docker inspect --format '{{.State.Health.Status}}' "$c" 2>/dev/null)"
  [ "$h" = "healthy" ] && ok "$svc health: $h" || bad "$svc health: ${h:-<none>} (expected healthy)"
done

info "every published port of this project is bound to loopback only"
ports="$(docker ps --filter "name=${PROJ}" --format '{{.Ports}}' 2>/dev/null)"
if printf '%s' "$ports" | grep -q '0\.0\.0\.0:'; then
  bad "world-exposed port found: $(printf '%s' "$ports" | grep -oE '0\.0\.0\.0:[0-9]+' | tr '\n' ' ')"
elif printf '%s' "$ports" | grep -q '127\.0\.0\.1:'; then
  ok "loopback-only: $(printf '%s' "$ports" | grep -oE '127\.0\.0\.1:[0-9]+' | tr '\n' ' ')"
else
  bad "no published port found at all (expected the heartbeat and litellm ports on 127.0.0.1)"
fi

# Host ports are read back from docker rather than hardcoded, so this stays correct if the
# published ports in docker-compose.yml ever change.
hb_addr="$(docker port "$(container_for heartbeat)" 8080 2>/dev/null | head -1)"
ll_addr="$(docker port "$(container_for litellm)" 4000 2>/dev/null | head -1)"

info "litellm answers its own unauthenticated liveliness endpoint (polled, real startup takes ~30-40s: prisma migration + engine setup)"
if [ -z "$ll_addr" ]; then
  bad "litellm: no published host port"
else
  c="$(wait_for_code "http://${ll_addr}/health/liveliness" "200")"
  [ "$c" = "200" ] && ok "litellm /health/liveliness -> $c" || bad "litellm /health/liveliness -> $c (expected 200, waited up to 60s)"
fi

info "litellm's auth boundary holds: a keyless call to a protected route is rejected"
if [ -z "$ll_addr" ]; then
  bad "litellm: no published host port"
else
  c="$(wait_for_code "http://${ll_addr}/v1/models" "401|403")"
  case "$c" in
    401|403) ok "litellm /v1/models without a key -> $c" ;;
    *)       bad "litellm /v1/models without a key -> $c (expected 401/403, waited up to 60s)" ;;
  esac
fi

info "heartbeat-proxy relays to litellm over the project's internal network"
# heartbeat-proxy has no health path of its own -- it is a catch-all reverse proxy (see
# heartbeat-proxy/app.py: dispatch() sends everything but streaming POST /v1/messages through
# proxy_passthrough). So a 200 here is end-to-end evidence: the relay hop works AND litellm is up
# behind it. A 502/000 would mean the internal network or the upstream name never resolved.
if [ -z "$hb_addr" ]; then
  bad "heartbeat: no published host port"
else
  c="$(wait_for_code "http://${hb_addr}/health/liveliness" "200")"
  [ "$c" = "200" ] && ok "heartbeat -> litellm /health/liveliness -> $c" || bad "heartbeat -> litellm /health/liveliness -> $c (expected 200, waited up to 60s)"
fi

info "collision guard: no container of this run carries the real deployment's name"
hits="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -F "$REAL_STACK" | grep -F "$PROJ" || true)"
[ -z "$hits" ] && ok "no container matches both '$PROJ' and '$REAL_STACK'" \
  || bad "container name overlaps the real deployment: $hits"

info "result"
[ "$fail" -eq 0 ] && ok "all checks passed" || bad "one or more checks failed"
exit "$fail"
