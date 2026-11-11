#!/usr/bin/env bash
# Drives the installed app on a running emulator/device and checks the OUTPUT, not just that
# something rendered. The app starts in the bundled page, which is the neutral placeholder
# (apps/native-placeholder) until the new client gets its native host (slice D1b); it fills the whole
# screen: no tab bar, templates and installations sit behind the page's "Mehr".
# Checked here: the brand on start, More -> Templates (natively verified signature, trust panel, typed
# input in the rendered prompt) and More -> installations, and that an invite App Link (i=) reaches the
# page. Sign-in is deliberately not exercised.
# Usage: emulator-smoke.sh <signed.apk> <screenshot-dir>
set -euo pipefail
APK=${1:?apk}; OUT=${2:?screenshot dir}
PKG=org.bunsenbrenner.cads
mkdir -p "$OUT"
adb install -r "$APK" >/dev/null
adb logcat -c
adb shell pm clear "$PKG" >/dev/null || true
# The first fullscreen launch shows Android's one-time "Viewing full screen" tutorial; mark it seen.
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell am start -W -n "$PKG/.MainActivity" >/dev/null

dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml; }

# find <regex> -> prints "x y" of the center of the first node whose text/desc matches
find_node() {
  dump | python3 -I -c '
import re,sys,xml.etree.ElementTree as ET
pat=re.compile(sys.argv[1],re.I); cls=sys.argv[2] if len(sys.argv)>2 else ""
for n in ET.fromstring(sys.stdin.read()).iter("node"):
    s=(n.get("text") or "")+" "+(n.get("content-desc") or "")
    if pat.search(s) and (not cls or n.get("class")==cls):
        m=re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",n.get("bounds"))
        a,b,c,d=map(int,m.groups()); print((a+c)//2,(b+d)//2); sys.exit(0)
sys.exit(1)' "$@"
}
wait_for() { # regex, tries
  for _ in $(seq 1 "${2:-30}"); do find_node "$1" >/dev/null && return 0; sleep 1; done
  echo "FAIL: '$1' never appeared" >&2; dump >&2; adb logcat -d -t 200 >&2; exit 1
}
shot() { adb exec-out screencap -p > "$OUT/$1.png"; echo "screenshot $1.png"; }
fail() { echo "FAIL: $1" >&2; webtext >&2 || true; shot "fail-${2:-x}"; adb logcat -d -t 200 >&2; exit 1; }
tap_node() { # regex [class] -> taps the centre of the first matching node
  local p; p=$(find_node "$@") || fail "no node matching '$1' to tap" tap
  read -r tx ty <<<"$p"; adb shell input tap "$tx" "$ty"
}
tap_web() { # regex, tries: wait until the page shows it, then tap it
  wait_web "$1" "${2:-20}"; tap_node "$1"
}

# webtext -> every text/description inside the Duell WebView, one per line (empty if no WebView)
webtext() {
  dump | python3 -I -c '
import sys,xml.etree.ElementTree as ET
for w in ET.fromstring(sys.stdin.read()).iter("node"):
    if w.get("class")=="android.webkit.WebView":
        for n in w.iter("node"):
            t=(n.get("text") or n.get("content-desc") or "").strip()
            if t and n is not w: print(t)
        break'
}
wait_web() { # regex, tries: the WebView must show matching text
  for _ in $(seq 1 "${2:-30}"); do webtext | grep -Eiq "$1" && return 0; sleep 1; done
  echo "FAIL: Duell page never showed '$1'" >&2; webtext >&2; dump >&2; adb logcat -d -t 200 >&2; shot fail-duell; exit 1
}

# 1. The app starts in the bundled page (brand My Daily Idea), not in the template
#    list, and nothing like a tab bar is on screen.
wx=""; wy=""
for _ in $(seq 1 40); do
  if p=$(find_node "" android.webkit.WebView); then read -r wx wy <<<"$p"; break; fi
  sleep 1
done
[ -n "$wx" ] || { echo "FAIL: no WebView at start" >&2; shot fail-start; dump >&2; adb logcat -d -t 300 >&2; exit 1; }
wait_web 'My Daily Idea' 40                   # the brand on the start page
if find_node "Signature verified" >/dev/null; then echo "FAIL: app started in the template list, not in My Daily Idea" >&2; exit 1; fi
if find_node "^(Templates|Vorlagen|My installations|Meine Installationen)\$" >/dev/null; then echo "FAIL: a tab bar entry is on screen" >&2; dump >&2; shot fail-tabbar; exit 1; fi
shot 0-start
echo "start: My Daily Idea fills the screen, no tab bar"

# 2. "More" (button in the page) opens the native extras. Templates first.
tap_web '(^|\s)(More|Mehr)(\s|$)' 20
wait_for "(^|\\s)(Templates|Vorlagen)(\\s|\$)" 15
shot 1-mehr
echo "more: menu with templates and installations"
tap_node "(^|\\s)(Templates|Vorlagen)(\\s|\$)"
wait_for "Signature verified" 60
shot 2-vorlagen-liste
echo "list: signature verified shown for the bundled template"

read -r x y < <(find_node "^Open")
adb shell input tap "$x" "$y"
wait_for "Signature verified on this device" 20
shot 3-vorlage-detail-signatur
echo "detail: trust panel shows on-device signature verification"

# Form: type into the first text field, then the preview must contain the typed text.
read -r x y < <(find_node "" android.widget.EditText)
adb shell input tap "$x" "$y"
sleep 1
adb shell input text "Quartalszahlen%sQ3"
sleep 1
adb shell input keyevent KEYCODE_BACK   # closes the keyboard
sleep 1
for _ in 1 2 3; do adb shell input swipe 540 1700 540 600 300; done
sleep 1
if dump | python3 -I -c '
import sys,xml.etree.ElementTree as ET
ok=any(n.get("text","").startswith("Du erstellst") and "Quartalszahlen Q3" in n.get("text","") for n in ET.fromstring(sys.stdin.read()).iter("node"))
sys.exit(0 if ok else 1)'; then echo "form: typed input appears in the rendered preview"
else echo "FAIL: preview does not contain the typed input" >&2; dump >&2; shot fail-preview; exit 1; fi
shot 4-formular-vorschau
adb shell input swipe 540 600 540 1700 300; adb shell input swipe 540 600 540 1700 300; adb shell input swipe 540 600 540 1700 300
sleep 1; shot 5-formular-felder

# Back leaves the extras and returns to the page.
adb shell input keyevent KEYCODE_BACK   # template detail's own back is the top button; system Back returns to the page
wait_web 'My Daily Idea' 15
echo "back: returns from the templates to My Daily Idea"

# Installations are behind the same More (signed out: the sign-in hint, no credentials used).
tap_web '(^|\s)(More|Mehr)(\s|$)' 15
tap_node "(^|\\s)(My installations|Meine Installationen)(\\s|\$)"
wait_for "Sign in" 20
shot 6-installationen
adb shell input keyevent KEYCODE_BACK
wait_web 'My Daily Idea' 15
echo "installations: reachable through More, back returns to the page"

# 3. An invite App Link (i=) reaches the page. The intent goes to our package, so it does not depend on
#    App Link verification (assetlinks.json) having completed on the runner.
adb shell "am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -p $PKG -d 'https://bunsenbrenner.org/duell#i=quiz-chaos'" >/dev/null
wait_web 'quiz-chaos' 20
shot 7-link
echo "link i=: the App Link fragment reached the page"

# The UiAutomation thread belongs to the screen dump tool of this script, not to the app.
if adb logcat -d | grep -E "FATAL EXCEPTION|UnsatisfiedLinkError" | grep -v "FATAL EXCEPTION: UiAutomation" >&2; then echo "FAIL: crash in logcat" >&2; exit 1; fi
echo "smoke OK"
