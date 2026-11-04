#!/usr/bin/env bash
# Xcode build phase: copies the Duell web game into the app bundle as duell/index.html, with its parts in duell/parts/
# (rarely used code the page loads on first use, from the bundle: WKWebView may read the whole duell/ folder).
# Uses apps/duell-web/dist/index.html when it exists, else the test placeholder.
set -euo pipefail
SRC="${SRCROOT}/../duell-web/dist/index.html"
[ -f "$SRC" ] || SRC="${SRCROOT}/Duell/placeholder.html"
DST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/duell"
mkdir -p "$DST"
cp "$SRC" "$DST/index.html"
rm -rf "$DST/parts"
PARTS="$(dirname "$SRC")/parts"
if [ -d "$PARTS" ]; then
  cp -R "$PARTS" "$DST/parts"
elif grep -q 'window.DailyParts=' "$SRC"; then
  echo "error: $SRC names parts, but $PARTS is missing" >&2; exit 1
fi
echo "Duell: $SRC -> $DST/index.html (+ parts: $(ls "$DST/parts" 2>/dev/null | wc -l | tr -d ' '))"
