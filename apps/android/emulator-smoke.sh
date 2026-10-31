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
# The first fullscreen launch shows Android's one-time "Viewing full screen" tutorial; mark it seen.
adb shell settings put secure immersive_mode_confirmations confirmed
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

# 1. The app starts in My Daily Idea (the calendar page of the bundled web app), not in the template list.
wx=""; wy=""
for _ in $(seq 1 40); do
  if p=$(find_node "" android.webkit.WebView); then read -r wx wy <<<"$p"; break; fi
  sleep 1
done
[ -n "$wx" ] || { echo "FAIL: no WebView at start" >&2; shot fail-start; dump >&2; adb logcat -d -t 300 >&2; exit 1; }
wait_web 'My Daily Idea' 40                   # the brand on the start page
if find_node "Signature verified" >/dev/null; then echo "FAIL: app started in the template list, not in Duell" >&2; exit 1; fi
shot 0-duell-start
echo "duell: starts in My Daily Idea"

# 2. A challenge App Link opens the game with the challenge. The intent goes to our package, so it
#    does not depend on App Link verification (assetlinks.json) having completed on the runner.
#    The parameters are the gentlest the game allows (slow, wide gap) so that a bot tapping on a
#    fixed beat can pass the first obstacle: period = 2*jump/gravity keeps the bird level.
FRAG=$(python3 -I -c '
import base64,json
c={"v":1,"seed":115,"params":{"gravity":900,"jump":280,"gap":200,"speed":90},"theme":"day","title":"Smoke Duell","emoji":"\U0001F525","score":42,"name":"Emu"}
print("c="+base64.urlsafe_b64encode(json.dumps(c,ensure_ascii=False,separators=(",",":")).encode()).decode().rstrip("="))')
adb shell "am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -p $PKG -d 'https://bunsenbrenner.org/duell#$FRAG'" >/dev/null
wait_web 'Smoke Duell' 20
wait_web 'Emu.*42' 10
shot 0b-duell-challenge
echo "duell: challenge link opened the game with the challenge (title + rival Emu / 42 shown)"

# 3. A tap starts the round and changes the state: the start hint disappears, and after the bird
#    has crashed (one tap, then it falls) the game-over panel with "Again" is on screen. Counting
#    score is covered by the web tests (apps/duell-web), not replayed on the emulator.
SCREEN_H=$(adb shell wm size | tr -d '\r' | grep -oE '[0-9]+x[0-9]+' | tail -1 | cut -dx -f2)
adb shell input tap "$wx" "$wy"
for _ in $(seq 1 10); do webtext | grep -Eq 'Tap\. Fly|Tippen\. Fliegen' || break; sleep 1; done
if webtext | grep -Eq 'Tap\. Fly|Tippen\. Fliegen'; then echo "FAIL: start hint still shown after the tap, round did not start" >&2; webtext >&2; shot fail-tap; exit 1; fi
echo "duell: tap started the round (start hint gone)"
OVER=""
for _ in $(seq 1 30); do
  if p=$(find_node "(^|\\s)(Again|Nochmal)(\\s|\$)"); then
    read -r ax ay <<<"$p"
    if [ "$ay" -gt 0 ] && [ "$ay" -lt "$SCREEN_H" ]; then OVER=1; break; fi
  fi
  sleep 1
done
[ -n "$OVER" ] || { echo "FAIL: no game-over panel after the crash" >&2; webtext >&2; shot fail-over; exit 1; }
wait_web 'Emu.*42' 5   # the result compares with the rival from the link
shot 0c-duell-game-over
echo "duell: round ran to game over ('Again' on screen, rival Emu / 42 still referenced)"

# 4. Other tabs stay: Templates (offline), and Back returns to the game with its state.
read -r x y < <(find_node "(^|\\s)Templates(\\s|\$)")
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
