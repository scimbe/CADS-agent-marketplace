#!/usr/bin/env bash
# Messung A10 auf ssh-united: Wegwerf-Aufbau mit derselben Netztrennung wie im Release (deploy/fk2-p34), alles mit Praefix
# a10-. Fasst demos-wrapper, die Tunnel, 8794/8795 und ~/mdi-* nicht an; kein Port wird veroeffentlicht.
#   ./a10-lauf.sh aufbau | lauf <LAEUFE> [NUR] | abbau
set -euo pipefail
W="$HOME/a10-fk2"
IMG="mdi-bau:a10"
NETZ="172.31.252.0/28"
SECCOMP_URL="https://raw.githubusercontent.com/microsoft/playwright/v1.56.1/utils/docker/seccomp_profile.json"
SECCOMP_SHA="cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849"
case "${1:-}" in
aufbau)
  mkdir -p "$W/out" "$W/secrets"
  git clone -q --depth 1 -b feat/fk2-p34 https://github.com/scimbe/CADS-agent-marketplace.git "$W/app"
  git clone -q --depth 1 -b feat/fk2-p34 https://github.com/scimbe/CADS-DEMO-wrapper.git "$W/wrapper"
  echo "app $(git -C "$W/app" rev-parse --short HEAD) wrapper $(git -C "$W/wrapper" rev-parse --short HEAD)"
  curl -fsSL --proto '=https' "$SECCOMP_URL" -o "$W/seccomp.json"
  echo "$SECCOMP_SHA  $W/seccomp.json" | sha256sum -c -
  head -c 32 /dev/urandom | base64 | tr -d '/+=' > "$W/secrets/a10.token"; chmod 644 "$W/secrets/a10.token"
  docker build -q -f "$W/app/apps/mdi/bau/Dockerfile" -t "$IMG" "$W/app/apps/mdi"
  docker network create --internal --subnet "$NETZ" a10-intern
  docker network create --internal a10-pruef
  docker network create a10-egress
  docker network create a10-p1
  ;;
lauf)
  LAEUFE="${2:-3}"; NUR="${3:-}"
  KEY="$HOME/demos-wrapper-secrets/anthropic.key"
  # Pruef-Dienst: Chromium mit Sandbox, ohne Geheimnisse, nur internes Netz
  # Chromium-Sandbox braucht im Begrenzungs-Set nur SYS_CHROOT (pwuser hat keine wirksamen Rechte); --cap-drop ALL allein bricht sie
  docker run -d --name a10-pruef --network a10-pruef --security-opt "seccomp=$W/seccomp.json" --security-opt no-new-privileges --cap-drop ALL --cap-add SYS_CHROOT \
    --pids-limit 512 --memory 1536m --cpus 1.25 --shm-size 512m --read-only --tmpfs /tmp:size=512m \
    -e MDI_CHROMIUM_SANDBOX=1 -e PRUEF_PORT=8796 "$IMG" node bau/pruef-dienst.mjs
  # Egress-Proxy: einziger Ausgang der Worker
  docker run -d --name a10-egress --network a10-egress --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 128m --cpus 0.25 \
    -e EGRESS_ALLOW=api.anthropic.com:443 -e EGRESS_PORT=3128 "$IMG" node bau/egress-proxy.mjs
  docker network connect --alias a10-egress a10-intern a10-egress
  # Wrapper-Teil (P1 + Warteschlange) wie der Produktions-Wrapper: eigener Ausgang fuer P1, interner Listener im Bau-Netz
  docker run -d --name a10-wrapper -u "$(id -u):$(id -g)" --network a10-p1 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 0.4 --tmpfs /tmp:size=64m \
    -v "$W/wrapper:/wrapper:ro" -v "$W/a10:/a10:ro" -v "$W/a10/eingabe-wuensche-p3.jsonl:/eingabe/eingabe-wuensche-p3.jsonl:ro" -v "$W/out:/out" \
    -v "$KEY:/run/secrets/anthropic.key:ro" -v "$W/secrets/a10.token:/run/secrets/a10.token:ro" \
    -e A10_LAEUFE="$LAEUFE" -e A10_NUR="$NUR" -e A10_PARALLEL=3 -e A10_P1_USD=0.4 -e A10_NETZ="$NETZ" "$IMG" node /a10/a10-wrapper.mjs
  docker network connect --alias a10-wrapper a10-intern a10-wrapper
  # drei Worker: nur interne Netze, Ausgang nur ueber den Proxy, Tagesgrenze je Worker 1,15 $ (zusammen mit P1 hoechstens 3,85 $)
  for n in 1 2 3; do
    mkdir -p "$W/out/bau-$n"
    docker run -d --name "a10-bau-$n" -u "$(id -u):$(id -g)" --network a10-intern --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --memory 384m --cpus 0.2 --tmpfs /tmp:size=64m \
      -v "$W/out/bau-$n:/var/lib/mdi-bau" -v "$KEY:/run/secrets/anthropic.key:ro" -v "$W/secrets/a10.token:/run/secrets/a10.token:ro" \
      -e MDI_BAU_QUEUE_URL=http://a10-wrapper:8791 -e MDI_BAU_PRUEF_URL=http://a10-pruef:8796 -e HTTPS_PROXY=http://a10-egress:3128 \
      -e MDI_BAU_TOKEN_FILE=/run/secrets/a10.token -e MDI_ANTHROPIC_KEY_FILE=/run/secrets/anthropic.key -e MDI_BAU_STATE_DIR=/var/lib/mdi-bau \
      -e MDI_BAU_TAGESGRENZE_USD=1.15 -e MDI_BAU_POLL_MS=3000 "$IMG"
    docker network connect a10-pruef "a10-bau-$n"
  done
  # Netztrennung belegen: ohne Proxy kein Ausgang, mit Proxy nur api.anthropic.com
  docker exec a10-bau-1 node -e "fetch('https://example.org/',{signal:AbortSignal.timeout(5000)}).then(()=>console.log('direkt: OFFEN'),()=>console.log('direkt: zu'))" || true
  docker exec a10-pruef node -e "fetch('https://example.org/',{signal:AbortSignal.timeout(5000)}).then(()=>console.log('pruef: OFFEN'),()=>console.log('pruef: zu'))" || true
  docker exec a10-bau-1 node --input-type=module -e "import { tunnel } from '/app/bau/proxy-fetch.mjs'; tunnel('http://a10-egress:3128','example.org',443).then(()=>console.log('proxy example.org: OFFEN'),(e)=>console.log('proxy example.org: '+e.message))" || true
  docker exec a10-pruef sh -c 'test -e /run/secrets/anthropic.key && echo "pruef: KEY SICHTBAR" || echo "pruef: kein Key"' || true
  ;;
abbau)
  for c in a10-wrapper a10-bau-1 a10-bau-2 a10-bau-3 a10-pruef a10-egress; do docker logs "$c" > "$W/out/log-$c.txt" 2>&1 || true; done
  docker rm -f a10-wrapper a10-bau-1 a10-bau-2 a10-bau-3 a10-pruef a10-egress 2>/dev/null || true
  docker network rm a10-intern a10-pruef a10-egress a10-p1 2>/dev/null || true
  ;;
*) echo "aufbau | lauf <laeufe> [nur] | abbau"; exit 2;;
esac
