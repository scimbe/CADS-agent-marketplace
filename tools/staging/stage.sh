#!/usr/bin/env bash
# My Daily Idea – Staging (Phase F), local driver. Copies tools/staging to labor-setup.de (~/mdi-staging/tools) and runs
# host.sh there. Staging host is ONLY ssh.labor-setup.de (not labor-setup.com, not ssh-united, not core).
#
#   tools/staging/stage.sh build | up [TAG] | down | status | check | smoke | rollback-probe
#   tools/staging/stage.sh tunnel          # ssh -L 18794:127.0.0.1:18794 -> http://127.0.0.1:18794/duell
set -euo pipefail
HOST="${STAGING_HOST:-ssh.labor-setup.de}"
case "$HOST" in ssh.labor-setup.de|labor-setup.de) ;; *) echo "ABBRUCH: Staging nur auf labor-setup.de, nicht $HOST" >&2; exit 2 ;; esac
PORT="${STAGING_PORT:-18794}"
D="$(cd "$(dirname "$0")" && pwd)"
if [ "${1:-}" = tunnel ]; then
  echo "Staging: http://127.0.0.1:$PORT/duell  (Ctrl-C beendet den Tunnel)"
  exec ssh -N -o ExitOnForwardFailure=yes -L "$PORT:127.0.0.1:$PORT" "$HOST"
fi
ssh -o BatchMode=yes "$HOST" 'mkdir -p ~/mdi-staging/tools'
# the folder is replaced as a whole: what is not in git here does not run there
COPYFILE_DISABLE=1 tar --no-xattrs -C "$D" -cf - --exclude=.DS_Store . | ssh -o BatchMode=yes "$HOST" 'rm -rf ~/mdi-staging/tools.new && mkdir ~/mdi-staging/tools.new && tar -C ~/mdi-staging/tools.new -xf - && rm -rf ~/mdi-staging/tools && mv ~/mdi-staging/tools.new ~/mdi-staging/tools'
exec ssh -o BatchMode=yes "$HOST" "STAGING_PORT=$PORT STAGING_PATH=${STAGING_PATH:-/duell} bash ~/mdi-staging/tools/host.sh $*"
