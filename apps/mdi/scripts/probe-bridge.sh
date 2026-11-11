#!/usr/bin/env bash
# Nur lesende Probe der echten Webkonferenz-Bruecke (Realnetz-Pruefung des Live-Rahmens). Keine Zustandsaenderung:
# nur OPTIONS-Preflights und HEAD/GET auf statische Dateien. Zeitgrenze je Anfrage 10 s.
# Aufruf: apps/mdi/scripts/probe-bridge.sh [https://webconference.bunsenbrenner.org]
set -u
WC="${1:-https://webconference.bunsenbrenner.org}"
show() { grep -iE '^(HTTP/|access-control-|content-security-policy|x-frame-options|content-type)' | tr -d '\r' | sed 's/^/    /'; }
pre() {
  echo "== OPTIONS /api/play/open, Origin: $1"
  curl -sS -m 10 -o /dev/null -D - -X OPTIONS "$WC/api/play/open" -H "Origin: $1" \
    -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type" | show
}
pre "null"                                         # opaker Rahmen (sandbox ohne same-origin, file://)
pre "https://demos-34a13a96.bunsenbrenner.org"     # erlaubter App-Ursprung (PLAY_ALLOWED_ORIGINS)
pre "$WC"                                          # Rahmen auf dem Ursprung der Bruecke: gleicher Ursprung, Preflight entfaellt im Browser
echo "== HEAD /pkg/ct_agent_wasm.js";  curl -sS -m 10 -o /dev/null -D - -I "$WC/pkg/ct_agent_wasm.js" | show
echo "== GET /play-frame.html (Kopfzeilen; 404, solange CADS-webconference-demo-PR nicht ausgerollt ist)"
curl -sS -m 10 -o /dev/null -D - "$WC/play-frame.html" | show
