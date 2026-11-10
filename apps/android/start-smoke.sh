#!/usr/bin/env bash
# Quick start check for the device matrix (mobile.yml android-devices): the full flows run in emulator-smoke.sh on one
# phone; here every other device shape and Android version only has to start the app, show the page (not a blank or broken
# WebView) and leave cleanly with Back. It also records what varies between devices: Android version, WebView provider and
# version, screen size and density, so the CI log shows what the page met.
# Usage: start-smoke.sh <signed.apk> <screenshot-dir> <name>
set -euo pipefail
APK=${1:?apk}; OUT=${2:?screenshot dir}; NAME=${3:?name}
PKG=org.bunsenbrenner.cads
mkdir -p "$OUT"
shot() { adb exec-out screencap -p > "$OUT/$NAME-$1.png"; echo "screenshot $NAME-$1.png"; }
fail() { echo "FAIL [$NAME]: $1" >&2; shot fail || true; adb logcat -d -t 300 >&2 || true; exit 1; }

echo "device [$NAME]: android $(adb shell getprop ro.build.version.release | tr -d '\r') (sdk $(adb shell getprop ro.build.version.sdk | tr -d '\r')), $(adb shell wm size | tr -d '\r' | tail -1), $(adb shell wm density | tr -d '\r' | tail -1)"
adb wait-for-device; adb shell 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 1; done'
echo "webview [$NAME]: $(adb shell dumpsys webviewupdate | tr -d '\r' | grep -m1 -E 'Current WebView package' || echo unknown)"

adb install -r "$APK" >/dev/null || fail "install refused (ABI or minSdk?)"
adb logcat -c || true   # API 26 images refuse to clear the main log
adb shell settings put secure immersive_mode_confirmations confirmed || true
adb shell am start -W -n "$PKG/.MainActivity" >/dev/null || fail "activity did not start"

texts() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb exec-out cat /sdcard/ui.xml | python3 -I -c '
import sys,xml.etree.ElementTree as ET
try: r=ET.fromstring(sys.stdin.read())
except Exception: sys.exit(0)
web=[w for w in r.iter("node") if w.get("class")=="android.webkit.WebView"]
print("WEBVIEW" if web else "NOWEBVIEW")
for w in web:
    for n in w.iter("node"):
        t=(n.get("text") or n.get("content-desc") or "").strip()
        if t: print(t)'
}
ok=""
for _ in $(seq 1 60); do
  t=$(texts)
  if grep -qi "my daily idea" <<<"$t" && grep -Eqi "^(play|spielen|more|mehr)$" <<<"$t"; then ok=1; break; fi
  sleep 1
done
[ -n "$ok" ] || { echo "$t" | head -40 >&2; fail "the page did not render its start screen (brand and buttons)"; }
echo "page [$NAME]: start screen rendered ($(grep -c . <<<"$t") text nodes)"
shot start

if adb logcat -d | grep -E "FATAL EXCEPTION|UnsatisfiedLinkError|Uncaught (SyntaxError|TypeError|ReferenceError)" | grep -v "FATAL EXCEPTION: UiAutomation" >&2; then fail "crash or script error (old WebView?) in logcat"; fi

adb shell input keyevent KEYCODE_BACK
sleep 2
if adb shell dumpsys window | tr -d '\r' | grep -m1 mCurrentFocus | grep -q "$PKG/"; then
  # Back may first go back inside the page; a second Back must leave
  adb shell input keyevent KEYCODE_BACK; sleep 2
  adb shell dumpsys window | tr -d '\r' | grep -m1 mCurrentFocus | grep -q "$PKG/" && fail "Back does not leave the app"
fi
if adb logcat -d | grep -E "FATAL EXCEPTION" | grep -v UiAutomation >&2; then fail "crash on leaving"; fi
echo "start smoke OK [$NAME]"
