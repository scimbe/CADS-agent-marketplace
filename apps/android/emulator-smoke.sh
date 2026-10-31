#!/usr/bin/env bash
# Drives the installed app on a running emulator/device and checks the OUTPUT, not just that
# something rendered. The app starts in the Duell game (WebView): taps change the page content,
# and a challenge App Link opens the game with the given challenge shown. Then the offline
# screens: the template list shows the natively verified
# signature, the detail screen shows the trust panel, and text typed into the form appears in the
# rendered prompt preview. Sign-in is deliberately not exercised (no credentials are used).
# Usage: emulator-smoke.sh <signed.apk> <screenshot-dir>
set -euo pipefail
APK=${1:?apk}; OUT=${2:?screenshot dir}
PKG=org.bunsenbrenner.cads
mkdir -p "$OUT"
adb install -r "$APK" >/dev/null
adb logcat -c
adb shell pm clear "$PKG" >/dev/null || true
adb shell am start -W -n "$PKG/.MainActivity" >/dev/null

dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml; }

# find <regex> -> prints "x y" of the center of the first node whose text/desc matches
find_node() {
  dump | python3 -I -c '
import re,sys,xml.etree.ElementTree as ET
pat=re.compile(sys.argv[1]); cls=sys.argv[2] if len(sys.argv)>2 else ""
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
  for _ in $(seq 1 "${2:-30}"); do webtext | grep -Eq "$1" && return 0; sleep 1; done
  echo "FAIL: Duell page never showed '$1'" >&2; webtext >&2; dump >&2; adb logcat -d -t 200 >&2; shot fail-duell; exit 1
}
score_of() { webtext | grep -E '^[0-9]+$' | head -1; }

# 1. The app starts in the Duell game, not in the template list.
read -r wx wy < <(for _ in $(seq 1 30); do find_node "" android.webkit.WebView && break; sleep 1; done)
[ -n "${wx:-}" ] || { echo "FAIL: no WebView at start" >&2; dump >&2; exit 1; }
wait_web '^[0-9]+$' 30
if find_node "Signature verified" >/dev/null; then echo "FAIL: app started in the template list, not in Duell" >&2; exit 1; fi
shot 0-duell-start
BEFORE=$(webtext | sort | tr '\n' '|'); S0=$(score_of)
echo "duell: starts in the game (score shown: $S0)"

# 2. The game runs: taps change the page content (score, or game-over buttons in the real game).
for _ in 1 2 3; do adb shell input tap "$wx" "$wy"; sleep 0.4; done
sleep 1
AFTER=$(webtext | sort | tr '\n' '|'); S1=$(score_of)
shot 0b-duell-nach-tipps
if [ "$BEFORE" = "$AFTER" ]; then echo "FAIL: page content unchanged after taps (score $S0 -> $S1)" >&2; webtext >&2; exit 1; fi
echo "duell: taps changed the content (score $S0 -> $S1)"

# 3. A challenge App Link opens the game with the challenge. Intent is sent to our package so it
#    does not depend on App Link verification (assetlinks.json) having completed on the runner.
FRAG=$(python3 -I -c '
import base64,json
c={"v":1,"seed":7,"params":{"gravity":1500,"jump":450,"gap":140,"speed":150},"theme":"night","title":"Smoke Duell","emoji":"\U0001F525","score":42,"name":"Emu"}
print("c="+base64.urlsafe_b64encode(json.dumps(c,ensure_ascii=False,separators=(",",":")).encode()).decode().rstrip("="))')
adb shell "am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -p $PKG -d 'https://bunsenbrenner.org/duell#$FRAG'" >/dev/null
wait_web 'Smoke Duell' 20
wait_web 'Emu.*42|42.*Emu' 10
shot 0c-duell-challenge
echo "duell: challenge link opened the game with the challenge (title + 'Emu' / 42 shown)"

# 4. Other tabs stay: Templates (offline), and Back returns to the game with its state.
read -r x y < <(find_node "(^|[[:space:]])Templates([[:space:]]|$)")
adb shell input tap "$x" "$y"
wait_for "Signature verified" 60
shot 1-vorlagen-liste
echo "list: signature verified shown for the bundled template"

read -r x y < <(find_node "^Open")
adb shell input tap "$x" "$y"
wait_for "Signature verified on this device" 20
shot 2-vorlage-detail-signatur
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
shot 3-formular-vorschau
adb shell input swipe 540 600 540 1700 300; adb shell input swipe 540 600 540 1700 300; adb shell input swipe 540 600 540 1700 300
sleep 1; shot 4-formular-felder

adb shell input keyevent KEYCODE_BACK   # from a template tab, Back returns to the game
wait_web 'Smoke Duell' 10
shot 5-zurueck-im-duell
echo "back: returns from the templates to the game, challenge still shown"

if adb logcat -d | grep -E "FATAL EXCEPTION|UnsatisfiedLinkError" >&2; then echo "FAIL: crash in logcat" >&2; exit 1; fi
echo "smoke OK"
