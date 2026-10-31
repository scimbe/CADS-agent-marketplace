#!/usr/bin/env bash
# Runs the DEBUG build in the iOS simulator and records, per flow, a screenshot and (for scripted flows)
# the JSON the app writes (what the page showed, what arrived natively). The simulator has no tap
# injection, so scripted flows drive the page through its DOM via `-DuellScenario`; the bridge from
# there on (page -> WKScriptMessage -> native -> share sheet / file picker) is the real one.
# Checks on the recorded output: check-scenarios.py.
# Usage: simulator-smoke.sh <udid> <path to CadsMarketplace.app> <out-dir>
set -euo pipefail
UDID=${1:?udid}; APPDIR=${2:?app}; OUT=${3:?out dir}
APP=org.bunsenbrenner.cads
mkdir -p "$OUT"
xcrun simctl install "$UDID" "$APPDIR"
data() { xcrun simctl get_app_container "$UDID" "$APP" data; }

# run <name> <scripted yes|""> <launch args...>
run() {
  local name=$1 scripted=$2; shift 2
  local rep; rep="$(data)/Documents/duell-scenario.json"; rm -f "$rep"
  xcrun simctl launch "$UDID" "$APP" -UIMockInstallations "$@" >/dev/null
  if [ -n "$scripted" ]; then
    # cold WebKit start on a fresh simulator can take a while: wait for the scenario to finish
    for _ in $(seq 1 90); do grep -q '"done":true' "$rep" 2>/dev/null && break; sleep 1; done
    if ! grep -q '"done":true' "$rep" 2>/dev/null; then
      echo "FAIL: flow $name did not finish" >&2; [ -f "$rep" ] && cat "$rep" >&2
      xcrun simctl io "$UDID" screenshot "$OUT/fail-$name.png" || true
      echo "--- app log (last 5 min) ---" >&2
      xcrun simctl spawn "$UDID" log show --last 5m --style compact --predicate 'process == "CadsMarketplace" OR senderImagePath CONTAINS "CadsMarketplace"' 2>&1 | tail -80 >&2 || true
      echo "--- crash reports ---" >&2
      for f in "$HOME"/Library/Logs/DiagnosticReports/CadsMarketplace*; do [ -f "$f" ] && { echo "$f"; head -c 6000 "$f"; } >&2; done
      exit 1
    fi
    sleep 3   # let a presented share sheet / file picker settle before the screenshot
    cp "$rep" "$OUT/$name.json"
  else
    sleep 8
  fi
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png"
  echo "flow $name done"
  xcrun simctl terminate "$UDID" "$APP"
}

CH=$(node -e "const C=require('./../duell-web/src/core.js');process.stdout.write(C.encodeState({v:1,name:'Mira-Test',score:7}))")

run 01-start yes -DuellScenario probe
run 02-start-zweiter-lauf yes -DuellScenario probe        # localStorage must survive the restart
run 03-mehr yes -DuellScenario more                        # the page's quiet "more" opens the native sheet
run 04-vorlagen "" -UITab 1
run 05-installationen "" -UITab 2
run 06-vorlage-detail "" -UITab 3
run 07-link-i yes -DuellChallenge "i=quiz-chaos" -DuellScenario probe
run 08-link-c yes -DuellChallenge "c=$CH" -DuellScenario probe
run 09-ergebnis-teilen yes -DuellScenario share
run 10-nach-teilen-aufgeraeumt yes -DuellScenario probe    # the file left by the share run is swept at start
run 11-ergebnis-speichern yes -DuellScenario save
run 12-mikro-abgelehnt yes -DuellScenario mic -DuellMicDeny
