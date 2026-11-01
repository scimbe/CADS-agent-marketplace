#!/usr/bin/env bash
# Drives the installed app on a running emulator/device and checks the OUTPUT, not just that
# something rendered. The app starts in My Daily Idea (the calendar page of the bundled web app) and
# fills the whole screen: no tab bar, templates and installations sit behind the page's quiet "More".
# Checked here: the brand on start, More -> Templates (natively verified signature, trust panel, typed
# input in the rendered prompt) and More -> installations; a challenge App Link (c=) opens the game with
# the challenge; an invite App Link (i=) opens that day's idea, finishing it and tapping Share opens the
# system share sheet, Save writes a PNG into MediaStore whose content is read back; a voice idea with the
# microphone refused stays usable (silly voice) and the sound is saved as a WAV that is read back; the photo
# button opens the system chooser and Back leaves the page usable. Sign-in is deliberately not exercised.
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
focus() { adb shell dumpsys window | tr -d '\r' | grep -m1 mCurrentFocus || true; }
wait_focus() { # regex, tries
  for _ in $(seq 1 "${2:-15}"); do focus | grep -Eq "$1" && return 0; sleep 1; done
  echo "focus: $(focus)" >&2; fail "window with focus matching '$1' never appeared" focus
}
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
score_of() { webtext | grep -E '^[0-9]+$' | head -1; }

# 1. The app starts in My Daily Idea (the calendar page of the bundled web app), not in the template
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

# 2. "More" (quiet button in the page) opens the native extras. Templates first.
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

# 3. A challenge App Link opens the game with the challenge. The intent goes to our package, so it
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
shot 7-duell-challenge
echo "link c=: challenge link opened the game with the challenge (title + rival Emu / 42 shown)"

# A tap starts the round and changes the state: the start hint disappears, and after the bird
# has crashed (one tap, then it falls) the game-over panel with "Again" is on screen.
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
shot 8-duell-game-over
echo "duell: round ran to game over ('Again' on screen, rival Emu / 42 still referenced)"

# media_check <images|audio> <png|wav>: the newest my-daily-idea* file in MediaStore sits in the app's
# folder, has content, and starts with the magic number of its type. Prints the size.
media_check() {
  local coll=$1 kind=$2 row id
  for _ in $(seq 1 15); do
    row=$(adb shell "content query --uri content://media/external/$coll/media --projection _id:_size:_display_name:relative_path --where \"_display_name LIKE 'my-daily-idea%'\" --sort '_id DESC'" | tr -d '\r' | grep '^Row' | head -1 || true)
    [ -n "$row" ] && break
    sleep 1
  done
  [ -n "$row" ] || fail "no my-daily-idea file in MediaStore ($coll)" "media-$coll"
  echo "  $row"
  id=$(sed -n 's/.*_id=\([0-9][0-9]*\).*/\1/p' <<<"$row")
  grep -q "relative_path=.*My Daily Idea" <<<"$row" || fail "file is not in the My Daily Idea folder: $row" "media-$coll"
  adb exec-out "content read --uri content://media/external/$coll/media/$id" | python3 -I -c '
import sys
d=sys.stdin.buffer.read(); kind=sys.argv[1]
if kind=="png": ok=d[:8]==b"\x89PNG\r\n\x1a\n" and len(d)>5000
else: ok=d[:4]==b"RIFF" and d[8:12]==b"WAVE" and len(d)>5000
print("  read back %d bytes, %s header %s" % (len(d), kind, "ok" if ok else "WRONG"))
sys.exit(0 if ok else 1)' "$kind" || fail "content of the saved $kind is wrong" "media-$coll"
}

# open_idea <id>: App Link with an invite (i=); the page shows that day's idea. Then "make it yours".
open_idea() {
  adb shell "am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -p $PKG -d 'https://bunsenbrenner.org/duell#i=$1'" >/dev/null
  wait_web "$2" 20
  tap_web "^(Make it yours|Mach's zu deinem)\\s*\$" 10   # the button, not the invite note that contains the same words
}

# 4. Invite link (i=): a card idea. Add a sticker, finish, Share opens the system share sheet, Save writes
#    a PNG that is read back.
open_idea quiz-chaos 'chaos|Chaos|CHAOS'
echo "link i=: invite opened that day's idea"
tap_web '(^|\s)(Stickers|Sticker)(\s|$)' 10
STICKER=$(dump | python3 -I -c '
import re,sys,xml.etree.ElementTree as ET
r=ET.fromstring(sys.stdin.read()); h=int(re.match(r"\[\d+,\d+\]\[\d+,(\d+)\]",r.find(".//node").get("bounds")).group(1))
for n in r.iter("node"):
    t=(n.get("text") or n.get("content-desc") or "").strip()
    m=re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",n.get("bounds"))
    a,b,c,d=map(int,m.groups())
    if 0<len(t)<=3 and ord(t[0])>0x2000 and b>h*0.5 and n.get("class") in ("android.widget.Button","android.view.View"):
        print((a+c)//2,(b+d)//2); sys.exit(0)
sys.exit(1)') || fail "no sticker button found" sticker
read -r sx sy <<<"$STICKER"; adb shell input tap "$sx" "$sy"
tap_web '(^|\s)(Done|Fertig)(\s|$)' 10
wait_web '(^|\s)(Share|Teilen)(\s|$)' 15
shot 9-ergebnis
tap_node '(^|\s)(Share|Teilen)(\s|$)'
wait_focus 'intentresolver|ChooserActivity|ResolverActivity' 15
shot 10-share-sheet
echo "share: result sharing opened the system share sheet ($(focus | grep -oE '[A-Za-z0-9_.]+/[A-Za-z0-9_.]+' | head -1))"
adb shell input keyevent KEYCODE_BACK
wait_focus 'org.bunsenbrenner.cads' 10
wait_web '(^|\s)(Save|Speichern)(\s|$)' 10
tap_node '(^|\s)(Save|Speichern)(\s|$)'
for _ in $(seq 1 10); do adb shell "content query --uri content://media/external/images/media --projection _id --where \"_display_name LIKE 'my-daily-idea%'\"" | grep -q '^Row' && break; sleep 1; done
media_check images png
shot 11-gespeichert
echo "save: PNG written to Pictures/My Daily Idea and read back"

# 5. Voice idea: refuse the microphone -> the page stays usable with the silly voice; the sound is saved as WAV.
open_idea stimme-monster 'Stimme|Voice|Hamster|Monster|Mouse|Maus|Robo'
tap_web '(Record|Aufnehmen)' 10
wait_focus 'permissioncontroller|GrantPermissionsActivity' 15
shot 12-mikro-abfrage
tap_node "Don.t allow|Nicht zulassen|Deny"
wait_focus 'org.bunsenbrenner.cads' 10
wait_web 'No mic here|Kein Mikro' 10
if adb shell dumpsys package "$PKG" | grep -E 'android.permission.RECORD_AUDIO.*granted=true' >/dev/null; then fail "microphone was granted although refused" mic; fi
shot 13-mikro-abgelehnt
echo "mic: asked only after the tap; refused -> toast points to the silly voice, permission not granted"
tap_web '(Silly voice|Quatschstimme)' 10
tap_web '(^|\s)Echo(\s|$)' 10
tap_web '(^|\s)(Done|Fertig)(\s|$)' 10
wait_web '(^|\s)(Save|Speichern)(\s|$)' 15
tap_node '(^|\s)(Save|Speichern)(\s|$)'
for _ in $(seq 1 10); do adb shell "content query --uri content://media/external/audio/media --projection _id --where \"_display_name LIKE 'my-daily-idea%'\"" | grep -q '^Row' && break; sleep 1; done
media_check audio wav
echo "save: WAV written to Music/My Daily Idea and read back"

# 6. Photo: the button opens the system chooser (the camera only as one of its entries); Back cancels and the page works on.
open_idea foto-boss 'Boss|Endgegner'
tap_web '(Pick a photo|Foto wählen)' 10
wait_focus 'intentresolver|ChooserActivity|ResolverActivity|documentsui|providers.media|photopicker|GetContentActivity' 15
shot 14-foto-auswahl
echo "photo: button opened the system chooser ($(focus | grep -oE '[A-Za-z0-9_.]+/[A-Za-z0-9_.]+' | head -1))"
adb shell input keyevent KEYCODE_BACK
wait_focus 'org.bunsenbrenner.cads' 10
wait_web '(Pick a photo|Foto wählen)' 10
if adb shell dumpsys package "$PKG" | grep -E 'android.permission.(CAMERA|READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE).*granted=true' >/dev/null; then fail "camera or media permission granted without a request" photo; fi
shot 15-foto-abgebrochen
echo "photo: cancelled chooser leaves the page usable, no camera or media permission involved"

if adb logcat -d | grep -E "FATAL EXCEPTION|UnsatisfiedLinkError" >&2; then echo "FAIL: crash in logcat" >&2; exit 1; fi
echo "smoke OK"
