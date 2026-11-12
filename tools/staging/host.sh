#!/usr/bin/env bash
# My Daily Idea – Staging on labor-setup.de (Phase F). Runs ON the host; tools/staging/stage.sh copies this folder to
# ~/mdi-staging/tools and calls it. Everything this script creates is named mdi-staging-* (containers, images, volumes,
# network). It never touches any other container, image, volume or network on the host.
#
#   host.sh build            sources from pins.env -> image mdi-staging-wrapper:<wrapper12>-<app12> (+ build record)
#   host.sh up [TAG]         start the staging stack (default: newest build), only on 127.0.0.1:${STAGING_PORT}
#   host.sh down             stop and remove the staging containers (volumes and images stay)
#   host.sh status           what runs, which image, which digests
#   host.sh check            HTTP checks of the served app (page, parts with SRI, headers, APIs)
#   host.sh smoke            browser smoke test (Playwright container, host network -> 127.0.0.1:${STAGING_PORT})
#   host.sh rollback-probe   tag current as :prev, start a new version, roll back, verify; prints the times
#
# Test values only: secrets/staging.env is generated here on first use (random salts, a staging-only Ed25519 deck key,
# a dummy model key that only the model double accepts). No production secret is read or copied.
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)"; R="$(dirname "$T")"          # R = ~/mdi-staging
. "$T/pins.env"
PORT="${STAGING_PORT:-18794}"
NET=mdi-staging-net; WC=mdi-staging-wrapper; GC=mdi-staging-gate; MC=mdi-staging-model
IMG=mdi-staging-wrapper; BASE_IMG=mdi-staging-wrapper-base
ENVF="$R/secrets/staging.env"
UIDGID="$(id -u):$(id -g)"
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { echo "ABBRUCH: $*" >&2; exit 1; }
ms() { date +%s%3N; }

# ---------------------------------------------------------------------------------------------------------------- build
build() {
  local TS B; TS="$(date -u +%Y%m%d-%H%M%S)"; B="$R/builds/$TS"; mkdir -p "$B"; cd "$B"
  export GIT_AUTHOR_DATE="$GIT_FIXED_DATE" GIT_COMMITTER_DATE="$GIT_FIXED_DATE"
  local G=(git -c user.name=Dev -c user.email=dev@reagenzglas.local -c advice.detachedHead=false)
  log "build $B"
  # 1) wrapper: main + PRs in order, refused when a pinned head moved
  "${G[@]}" clone -q "$WRAPPER_REPO" wrapper
  cd wrapper
  [ "$(git rev-parse origin/main)" = "$WRAPPER_MAIN" ] || die "wrapper main ist $(git rev-parse origin/main), gepinnt $WRAPPER_MAIN"
  "${G[@]}" checkout -q -b staging/mdi-w1 "$WRAPPER_MAIN"
  for pr in $WRAPPER_PRS; do
    local n="${pr%%:*}" sha="${pr#*:}"
    git fetch -q origin "refs/pull/$n/head:refs/remotes/pr/$n"
    [ "$(git rev-parse "pr/$n")" = "$sha" ] || die "PR #$n steht auf $(git rev-parse "pr/$n"), gepinnt $sha"
    "${G[@]}" merge -q --no-ff -m "staging: merge PR #$n ($sha)" "pr/$n" >/dev/null || die "Konflikt beim Merge von PR #$n"
    log "  merged #$n ${sha:0:8}"
  done
  # staging patches (gaps that have no PR yet; each one is listed in the protocol with its owner)
  for p in "$T"/patches/*.diff; do
    [ -e "$p" ] || continue
    git apply --index "$p" || die "Patch $(basename "$p") passt nicht"
    "${G[@]}" commit -q -m "staging: $(basename "$p" .diff) (Luecke ohne PR, siehe Protokoll)"
    log "  patch $(basename "$p")"
  done
  cd "$B"
  # 2) app at the pinned commit
  git init -q mp && git -C mp remote add origin "$APP_REPO"
  git -C mp fetch -q --filter=blob:none origin "refs/heads/$APP_BRANCH"
  [ "$(git -C mp rev-parse FETCH_HEAD)" = "$APP_COMMIT" ] || die "$APP_BRANCH steht auf $(git -C mp rev-parse FETCH_HEAD), gepinnt $APP_COMMIT"
  git -C mp -c advice.detachedHead=false checkout -q "$APP_COMMIT"
  local N=(docker run --rm --cpus=4 --memory=4g -u "$UIDGID" -e HOME=/tmp -e npm_config_cache=/tmp/.npm -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 -v "$B:/b" "$NODE_IMAGE")
  log "  app: npm ci + build"
  timeout 900 "${N[@]}" bash -c "cd /b/mp/$APP_DIR && npm ci --no-audit --no-fund >/dev/null && node scripts/build.js" > app-build.log 2>&1 || { tail -20 app-build.log; die "App-Build"; }
  tail -1 app-build.log
  # 3) re-vendor the app code the wrapper checks links and games with onto the same commit, then the wrapper's own tests
  #    (with MDI_SRC the vendor tests also refuse drift against this checkout)
  timeout 300 "${N[@]}" bash -c "cd /b/wrapper && node bin/vendor-mdi.mjs /b/mp/$APP_DIR/src --track $APP_BRANCH && node bin/vendor-mdi-baukasten.mjs /b/mp/$APP_DIR/src" > vendor.log 2>&1 || { cat vendor.log; die "Re-Vendor"; }
  cat vendor.log
  ( cd wrapper && git add -A lib/vendor && { git diff --cached --quiet || "${G[@]}" commit -q -m "staging: re-vendor $APP_DIR @ ${APP_COMMIT:0:12} (vendor-mdi, vendor-mdi-baukasten)"; } )
  log "  wrapper tests"
  timeout 900 "${N[@]}" bash -c "cd /b/wrapper && MDI_SRC=/b/mp/$APP_DIR/src node --test --test-reporter=tap test/*.test.mjs" > wrapper-test.log 2>&1 || true
  grep -E '^# (tests|pass|fail|skipped)' wrapper-test.log | tr '\n' ' '; echo
  grep -E '^not ok|^    not ok' wrapper-test.log | head -20 || true
  local WSHA ASHA TAG; WSHA="$(git -C wrapper rev-parse HEAD)"; ASHA="$APP_COMMIT"; TAG="${WSHA:0:12}-${ASHA:0:12}"
  # 4) wrapper image from the repo's Dockerfile (same recipe as production), then the app dist with parts on top
  log "  docker build $BASE_IMG:${WSHA:0:12}"
  ( cd wrapper && timeout 1800 docker build -q --label "org.mdi.staging.wrapper=$WSHA" -t "$BASE_IMG:${WSHA:0:12}" . ) > docker-base.log 2>&1 || { tail -30 docker-base.log; die "docker build"; }
  mkdir -p ctx && cp -a "mp/$APP_DIR/dist" ctx/dist
  cat > ctx/Dockerfile <<EOF
FROM $BASE_IMG:${WSHA:0:12}
RUN rm -rf /app/apps/duell-web/dist && mkdir -p /app/apps/duell-web/dist
COPY dist/ /app/apps/duell-web/dist/
LABEL org.mdi.staging.wrapper="$WSHA" org.mdi.staging.app="$ASHA" org.mdi.staging.app-branch="$APP_BRANCH" org.mdi.staging.build="$TS"
EOF
  timeout 600 docker build -q -t "$IMG:$TAG" ctx > docker-app.log 2>&1 || { cat docker-app.log; die "docker build app"; }
  # 5) the image must hold exactly the built dist
  local want got
  want="$(cd ctx/dist && find . -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -c1-64)"
  got="$(docker run --rm --entrypoint sh "$IMG:$TAG" -c 'cd /app/apps/duell-web/dist && find . -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -c1-64')"
  [ "$want" = "$got" ] || die "dist im Image weicht ab"
  {
    echo "build=$TS"; echo "tag=$IMG:$TAG"
    echo "wrapper_branch=staging/mdi-w1"; echo "wrapper_head=$WSHA"; echo "wrapper_main=$WRAPPER_MAIN"; echo "wrapper_prs=$WRAPPER_PRS"
    echo "wrapper_log=$(git -C wrapper log --format='%h %s' "$WRAPPER_MAIN..HEAD" --first-parent | tr '\n' '|')"
    echo "app=$APP_BRANCH@$ASHA"
    echo "app_index_sha256=$(sha256sum ctx/dist/index.html | cut -c1-64)"
    echo "app_dist_tree_sha256=$want"
    echo "app_parts=$(ls ctx/dist/parts | wc -l)"
    echo "base_image_id=$(docker image inspect -f '{{.Id}}' "$BASE_IMG:${WSHA:0:12}")"
    echo "image_id=$(docker image inspect -f '{{.Id}}' "$IMG:$TAG")"
    echo "image_size=$(docker image inspect -f '{{.Size}}' "$IMG:$TAG")"
    echo "node_image=$NODE_IMAGE@$(docker image inspect -f '{{index .RepoDigests 0}}' "$NODE_IMAGE" 2>/dev/null | cut -d@ -f2)"
    echo "wrapper_tests=$(grep -E '^# (pass|fail)' wrapper-test.log | tr '\n' ' ')"
  } > build.env
  cp build.env "$R/builds/latest.env"
  cat build.env
}

# ------------------------------------------------------------------------------------------------------------ env, up
mkenv() {
  [ -s "$ENVF" ] && return 0
  mkdir -p "$(dirname "$ENVF")"; chmod 700 "$(dirname "$ENVF")"
  local rnd; rnd() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  local key; key="$(docker run --rm "$NODE_IMAGE" node -e 'const {generateKeyPairSync}=require("crypto");process.stdout.write(generateKeyPairSync("ed25519").privateKey.export({type:"pkcs8",format:"der"}).toString("base64"))')"
  ( umask 077; cat > "$ENVF" <<EOF
# STAGING ONLY – generated $(date -u +%FT%TZ) by host.sh. Test values, never production secrets.
PORT=8790
DEMO_AUTH_MODE=gate
DEMO_GATE_HOST=staging.mdi.invalid
DEMO_GATE_CHECK_URL=http://$GC:8080/gate/check
DEMO_RUNS_PER_HOUR=500
DEMO_AUTH_LOG_SALT=$(rnd)
DUELL_AI_ENABLED=1
DUELL_AI_SALT=$(rnd)
DUELL_AI_STATE_FILE=/var/lib/duell-ai/state.json
DUELL_STAT_SALT=$(rnd)
DUELL_SEAL_SECRET=$(rnd)
DUELL_REPORT_DIR=/var/lib/duell-ai/reports
DUELL_ADMIN_TOKEN=$(rnd)
DUELL_DECK_SALT=$(rnd)
DUELL_DECK_SIGN_KEY=$key
DUELL_IP_SALT=$(rnd)
# free card: Anthropic protocol, but only the model double in the staging network answers; dummy key
DUELL_CARD_PROVIDER=anthropic
DUELL_CARD_MODEL=claude-haiku-5-5
DUELL_ANTHROPIC_BASE_URL=http://$MC:8080
ANTHROPIC_API_KEY=staging-model-double-no-key
DUELL_CARD_BUDGET_USD=1
DUELL_CARD_BUDGET_MONTH_USD=2
DUELL_CARD_BUDGET_FILE=/var/lib/duell-ai/card-budget.json
DUELL_CREATE_FREE=50
# kill switches: game kit (G3) off, AI pictures off
DUELL_BAU_OFF=1
DUELL_BILD_BACKEND=off
SHORT_DATA_DIR=/data/shortlinks
SHORT_BASE=http://127.0.0.1:$PORT
SHORT_PUBLIC_BASE=http://127.0.0.1:$PORT
SHORT_V2_PATH=/duell
DUELL_PROFILE_DIR=/data/duell-profile
DUELL_PROFILE_SALT=$(rnd)
EOF
  )
  log "secrets/staging.env erzeugt (Testwerte)"
}

doubles() {
  local name="$1" file="$2"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --network "$NET" --restart unless-stopped --cpus=0.25 --memory=128m \
    --label org.mdi.staging=1 -u "$UIDGID" -v "$T/doubles:/d:ro" "$NODE_IMAGE" node "/d/$file" >/dev/null
}

start_wrapper() {
  local tag="$1"
  docker run -d --name "$WC" --network "$NET" --restart unless-stopped -p "127.0.0.1:$PORT:8790" --cpus=2 --memory=1536m \
    --label org.mdi.staging=1 --env-file "$ENVF" \
    -v mdi-staging-duell-ai:/var/lib/duell-ai -v mdi-staging-shortlinks:/data/shortlinks -v mdi-staging-profile:/data/duell-profile \
    "$tag" >/dev/null
}
wait_up() {   # -> seconds*1000 until /duell answers 200
  local t0; t0="$(ms)"
  for _ in $(seq 1 120); do
    curl -fs -m 2 -o /dev/null "http://127.0.0.1:$PORT/duell" && { echo $(( $(ms) - t0 )); return 0; }
    sleep 0.25
  done
  return 1
}

up() {
  local tag="${1:-}"
  [ -n "$tag" ] || tag="$(grep '^tag=' "$R/builds/latest.env" | cut -d= -f2)"
  docker image inspect "$tag" >/dev/null 2>&1 || die "Image $tag fehlt"
  mkenv
  docker network inspect "$NET" >/dev/null 2>&1 || docker network create --label org.mdi.staging=1 "$NET" >/dev/null
  doubles "$GC" gate.mjs; doubles "$MC" model.mjs
  for c in "$GC" "$MC"; do   # the wrapper asks the gate on the first request: doubles must listen first
    for _ in $(seq 1 40); do docker logs "$c" 2>&1 | grep -q 'on :8080' && break; sleep 0.25; done
    docker logs "$c" 2>&1 | grep -q 'on :8080' || die "$c startet nicht"
  done
  docker rm -f "$WC" >/dev/null 2>&1 || true
  start_wrapper "$tag"
  local t; t="$(wait_up)" || { docker logs --tail 40 "$WC"; die "wrapper nicht erreichbar"; }
  log "up: $tag nach ${t} ms auf 127.0.0.1:$PORT"
}
down() { for c in "$WC" "$GC" "$MC"; do docker rm -f "$c" >/dev/null 2>&1 || true; done; log "down"; }
status() {
  docker ps -a --filter label=org.mdi.staging=1 --format '{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}'
  docker image ls --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}' | grep '^mdi-staging-' || true
  [ -f "$R/builds/latest.env" ] && cat "$R/builds/latest.env"
}

# ------------------------------------------------------------------------------------------------------------- checks
check() {
  local B="http://127.0.0.1:$PORT" d; d="$(mktemp -d)"; local F=0
  chk() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: '$2' (erwartet '$3')"; F=1; fi; }
  docker cp "$WC:/app/apps/duell-web/dist/build.json" "$d/build.json" >/dev/null
  curl -s -D "$d/h" -o "$d/index.html" "$B/duell"
  chk "/duell 200" "$(head -1 "$d/h" | awk '{print $2}')" 200
  chk "/duell = dist/index.html" "$(sha256sum < "$d/index.html" | cut -c1-64)" "$(docker exec "$WC" sha256sum /app/apps/duell-web/dist/index.html | cut -c1-64)"
  chk "/duell Cache-Control" "$(grep -i '^cache-control:' "$d/h" | tr -d '\r' | cut -d' ' -f2-)" "no-cache"
  # every part of build.json: 200, JS type, immutable cache, and the bytes match the SRI hash of the app
  local n=0 ok=0
  while IFS=' ' read -r file sri; do
    n=$((n+1)); local u="$B/duell/$file"
    curl -s -D "$d/ph" -o "$d/part" "$u"
    local st ct cc got; st="$(head -1 "$d/ph" | awk '{print $2}')"
    ct="$(grep -i '^content-type:' "$d/ph" | tr -d '\r' | cut -d' ' -f2-)"; cc="$(grep -i '^cache-control:' "$d/ph" | tr -d '\r' | cut -d' ' -f2-)"
    got="sha384-$(openssl dgst -sha384 -binary "$d/part" | base64 -w0)"
    if [ "$st" = 200 ] && [ "$ct" = "text/javascript; charset=utf-8" ] && [ "$cc" = "public, max-age=31536000, immutable" ] && { [ "$sri" = "-" ] || [ "$sri" = "$got" ]; }; then ok=$((ok+1)); else echo "  FAIL $file: $st | $ct | $cc | sri $([ "$sri" = "$got" ] && echo ok || echo falsch)"; fi
  done < <(docker run --rm -v "$d:/d:ro" "$NODE_IMAGE" node -e '
    const b=require("/d/build.json"); const out=[];
    for (const c of Object.values(b.cards||{})) out.push(c.file+" "+(c.sri||"-"));
    for (const t of Object.values((b.thumbs||{}).files||{})) out.push(t.file+" "+(t.sri||"-"));
    console.log(out.join("\n"))')
  chk "Teile mit 200 + JS + immutable + SRI ($ok/$n)" "$ok" "$n"
  # SRI hashes in the served page are the ones of build.json
  chk "Seite traegt die SRI der Teile" "$(docker run --rm -v "$d:/d:ro" "$NODE_IMAGE" node -e '
    const b=require("/d/build.json"),h=require("fs").readFileSync("/d/index.html","utf8");
    const s=[...Object.values(b.cards),...Object.values(b.thumbs.files)].map(c=>c.sri); console.log(s.filter(x=>h.includes(x)).length+"/"+s.length)')" "$(docker run --rm -v "$d:/d:ro" "$NODE_IMAGE" node -e 'const b=require("/d/build.json");const n=Object.keys(b.cards).length+Object.keys(b.thumbs.files).length;console.log(n+"/"+n)')"
  chk "unbekannter Teil 404" "$(curl -s -o /dev/null -w '%{http_code}' "$B/duell/parts/card-gibtsnicht.000000000000.js")" 404
  # APIs the app uses (public ones answer without login; account ones say login-required, with the test cookie they work)
  local C="Cookie: ct_gate_session=staging-lea" DEV; DEV="$(head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  api() { local a=(-s -o "$d/r" -w '%{http_code}' -X "$1" -H 'content-type: application/json'); [ -n "${3:-}" ] && a+=(-H "$3"); [ -n "${4:-}" ] && a+=(--data "$4"); curl "${a[@]}" "$B$2"; }
  chk "GET /api/duell/deck/key"            "$(api GET /api/duell/deck/key)" 200
  chk "GET /api/duell/deck"                "$(api GET /api/duell/deck)" 200
  chk "POST /api/duell/ai/status anonym"   "$(api POST /api/duell/ai/status '' "{\"device\":\"$DEV\"}")" 200
  chk "POST /api/duell/ai/status angemeldet" "$(api POST /api/duell/ai/status "$C" "{\"device\":\"$DEV\"}")" 200
  chk "  ... meter.account=true"           "$(grep -o '"account":true' "$d/r" | head -1)" '"account":true'
  chk "POST /api/duell/profile/get anonym" "$(api POST /api/duell/profile/get '' '{"via":"account"}')" 401
  chk "POST /api/duell/profile/get angemeldet" "$(api POST /api/duell/profile/get "$C" '{"via":"account"}')" 200
  chk "POST /api/duell/bild/status"        "$(api POST /api/duell/bild/status "$C" '{}')" 200
  chk "POST /api/s (Form falsch) 400"      "$(api POST /api/s '' '{"f":"x","k":"card","l":"de"}')" 400
  chk "GET /api/duell/deck/status ohne d"  "$(api GET '/api/duell/deck/status?c=abc')" 400
  chk "/auth/me"                           "$(api GET /auth/me "$C")" 200
  chk "  ... authenticated"                "$(grep -o '"authenticated":true' "$d/r")" '"authenticated":true'
  rm -rf "$d"
  echo "check: $([ $F = 0 ] && echo alles PASS || echo FEHLER)"; return $F
}

smoke() {
  local B; B="$(grep '^build=' "$R/builds/latest.env" | cut -d= -f2)"; B="$R/builds/$B"
  mkdir -p "$R/smoke-out"
  timeout 2400 docker run --rm --init --network host --ipc=host --cpus=3 --memory=3g -u "$UIDGID" -e HOME=/tmp \
    -e STAGING_URL="http://127.0.0.1:$PORT" -e STAGING_PATH="${STAGING_PATH:-/duell}" -e OUT=/out \
    -v "$T/smoke:/smoke:ro" -v "$B/mp/$APP_DIR:/app:ro" -v "$R/smoke-out:/out" \
    -w /app "$PW_IMAGE" node /smoke/smoke.mjs
}

# ------------------------------------------------------------------------------------------------------ rollback probe
rollback_probe() {
  local cur prevtag newtag; cur="$(docker inspect -f '{{.Config.Image}}' "$WC")"
  prevtag="$IMG:prev"; newtag="$IMG:probe-new"
  docker tag "$cur" "$prevtag"
  # the "new version": the same image plus a marker file (so the probe can tell the two apart over HTTP)
  local d; d="$(mktemp -d)"; printf 'FROM %s\nRUN echo probe-new > /app/apps/duell-web/dist/version.txt\nLABEL org.mdi.staging.probe=new\n' "$cur" > "$d/Dockerfile"
  docker build -q -t "$newtag" "$d" >/dev/null; rm -rf "$d"
  local sha_prev; sha_prev="$(curl -s "http://127.0.0.1:$PORT/duell" | sha256sum | cut -c1-64)"
  log "rollback-probe: prev=$(docker image inspect -f '{{.Id}}' "$prevtag" | cut -c8-19) new=$(docker image inspect -f '{{.Id}}' "$newtag" | cut -c8-19)"
  # deploy: same steps as production (stop, rename, run new)
  local t0 t1 up1 t2 up2
  t0="$(ms)"
  docker stop "$WC" >/dev/null; docker rename "$WC" "$WC-prev"
  start_wrapper "$newtag"; up1="$(wait_up)"; t1="$(ms)"
  [ "$(docker exec "$WC" cat /app/apps/duell-web/dist/version.txt)" = probe-new ] || die "neue Version laeuft nicht"
  log "  deploy neu: gesamt $((t1-t0)) ms (davon bis /duell 200: $up1 ms)"
  # rollback: exactly the line of the runbook
  t2="$(ms)"
  docker stop "$WC" >/dev/null && docker rm "$WC" >/dev/null && docker rename "$WC-prev" "$WC" && docker start "$WC" >/dev/null
  up2="$(wait_up)"; local t3; t3="$(ms)"
  log "  rollback: gesamt $((t3-t2)) ms (davon bis /duell 200 nach start: $up2 ms)"
  local F=0
  [ "$(docker inspect -f '{{.Config.Image}}' "$WC")" = "$cur" ] && echo "PASS Image wieder $cur" || { echo "FAIL Image"; F=1; }
  docker exec "$WC" test ! -e /app/apps/duell-web/dist/version.txt && echo "PASS Marker der neuen Version fehlt" || { echo "FAIL Marker"; F=1; }
  [ "$(curl -s "http://127.0.0.1:$PORT/duell" | sha256sum | cut -c1-64)" = "$sha_prev" ] && echo "PASS /duell wie vorher" || { echo "FAIL /duell"; F=1; }
  docker image rm "$newtag" >/dev/null
  echo "rollback_ms=$((t3-t2)) deploy_ms=$((t1-t0)) up_after_deploy_ms=$up1 up_after_rollback_ms=$up2"
  return $F
}

case "${1:-}" in
  build) build ;; up) up "${2:-}" ;; down) down ;; status) status ;; check) check ;; smoke) smoke ;;
  rollback-probe) rollback_probe ;; *) sed -n '2,15p' "$0"; exit 2 ;;
esac
