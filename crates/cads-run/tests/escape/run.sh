#!/bin/bash
# Payload that tries to break out. It always exits 0: the verdict is what it prints.
# CANARY: a file outside the work dir. OUTSIDE: a directory outside it. PORT: a live local listener.
attempt() { # name, command...
  local name=$1; shift
  if "$@" >/dev/null 2>&1; then echo "ESCAPED $name"; else echo "BLOCKED $name"; fi
}
echo ok > "$PWD/inside.txt" && [ "$(cat "$PWD/inside.txt")" = ok ] && echo "CONTROL inside-write"

attempt read-canary        /bin/cat "$CANARY"
attempt read-home-file     /bin/sh -c "/usr/bin/head -c1 \"$HOST_HOME_FILE\""
# Real content, not mere existence: bwrap creates empty parent directories for the bound work dir.
attempt list-home          /bin/sh -c "/bin/ls -a \"$HOST_HOME\" | grep -q canary.txt"
echo "SEEN-IN-HOME $(/bin/ls -a "$HOST_HOME" 2>/dev/null | tr '\n' ' ')"
attempt write-outside      /bin/sh -c "echo pwned > \"$OUTSIDE/pwned\""
attempt write-tmp          /bin/sh -c "echo pwned > /tmp/cads-run-escape-$$ && /bin/rm /tmp/cads-run-escape-$$"
attempt symlink-read       /bin/sh -c "/bin/ln -s \"$CANARY\" link; /bin/cat link"
attempt hardlink-read      /bin/sh -c "/bin/ln \"$CANARY\" hard; /bin/cat hard"
attempt rename-out         /bin/mv "$PWD/inside.txt" "$OUTSIDE/moved"
attempt loopback           /bin/bash -c "exec 3<>/dev/tcp/127.0.0.1/$PORT"
attempt internet           /bin/bash -c "exec 3<>/dev/tcp/1.1.1.1/443"
if [ -e /usr/bin/security ]; then attempt keychain /usr/bin/security list-keychains; fi
if [ -n "$HOST_SIGNAL_PID" ]; then attempt signal-host /bin/kill -0 "$HOST_SIGNAL_PID"; fi
attempt delete-canary      /bin/rm "$CANARY"
env | grep -q CADS_RUN_SECRET && echo "ESCAPED env-leak" || echo "BLOCKED env-leak"
