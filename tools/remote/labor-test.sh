#!/usr/bin/env bash
# Runs unit + e2e tests of a pushed ref on labor-setup.de in parallel Docker containers.
# Usage: tools/remote/labor-test.sh <ref> [app-dir] [parallel]
#   ref       pushed branch or commit of scimbe/CADS-agent-marketplace (public, cloned without credentials)
#   app-dir   default apps/duell-web
#   parallel  concurrent e2e containers, default 3 (10 parallel strands share 28 cores; each --cpus=2.5 --memory=4g; cap leaves room for temporal/postgres)
# Output: per-file logs in ~/mdi-runner/<run>/logs on the host, summary on stdout.
set -euo pipefail
REF="${1:?ref}"; APP="${2:-apps/mdi}"; PAR="${3:-3}"
# Kurze oder lange SHAs werden abgelehnt (kein stiller Rueckfall auf main): immer den Branch-Namen uebergeben.
if [[ "$REF" =~ ^[0-9a-f]{7,40}$ ]]; then echo "ABBRUCH: SHA statt Branch-Name uebergeben: $REF" >&2; exit 2; fi
HOST="${LABOR_HOST:-ssh.labor-setup.de}"
IMG="mcr.microsoft.com/playwright:v1.56.1-noble"
RUN="$(date -u +%Y%m%d-%H%M%S)-$(echo "$REF" | tr '/' '_' | cut -c1-40)"
ssh -o BatchMode=yes "$HOST" bash -s -- "$REF" "$APP" "$PAR" "$IMG" "$RUN" <<'REMOTE'
set -euo pipefail
REF="$1"; APP="$2"; PAR="$3"; IMG="$4"; RUN="$5"
find "$HOME/mdi-runner" -mindepth 1 -maxdepth 1 -type d -mtime +3 -exec rm -rf {} + 2>/dev/null || true
W="$HOME/mdi-runner/$RUN"; mkdir -p "$W/logs"; cd "$W"
git clone -q --filter=blob:none https://github.com/scimbe/CADS-agent-marketplace.git src
git -C src fetch -q origin "refs/heads/$REF" || { echo "ABBRUCH: Branch $REF nicht gefunden"; exit 2; }
git -C src checkout -q FETCH_HEAD
echo "commit $(git -C src rev-parse --short HEAD)"
docker pull -q "$IMG" >/dev/null
D="docker run --rm --init --cpus=2.5 --memory=4g --ipc=host -u $(id -u):$(id -g) -e HOME=/tmp -e CI=1 -v $W/src:/w -w /w/$APP $IMG"
# install + build once
timeout 900 $D bash -c 'npm ci --no-audit --no-fund >/dev/null && node scripts/build.js >/dev/null' > logs/setup.log 2>&1 || { echo "SETUP FAIL"; tail -30 logs/setup.log; exit 1; }
timeout 900 $D node --test test/*.test.js > logs/unit.log 2>&1 && echo "unit PASS $(grep -hE "^(# |ℹ )pass" logs/unit.log)" || echo "unit FAIL $(grep -h "^# \(pass\|fail\)" logs/unit.log | tr "\n" " ")"
ls src/$APP/test/e2e/*.e2e.js | xargs -n1 basename > e2e.list
cat e2e.list | xargs -P "$PAR" -I{} bash -c "timeout 1800 $D node --require ./test/e2e/lib/nolive.js --test --test-timeout=300000 --test-force-exit test/e2e/{} > logs/{}.log 2>&1 && echo 'PASS {}' || echo 'FAIL {}'" | sort
P=0; F=0; for f in logs/*.e2e.js.log; do p=$(grep -h "^# pass" $f | awk "{print \$3}"); x=$(grep -h "^# fail" $f | awk "{print \$3}"); P=$((P+${p:-0})); F=$((F+${x:-1})); done
echo "e2e gesamt: pass=$P fail=$F"
echo "logs: $W/logs"
REMOTE
