#!/usr/bin/env bash
# Xcode build phase: copies the Duell web game into the app bundle as duell/index.html.
# Uses apps/duell-web/dist/index.html when it exists, else the test placeholder.
set -euo pipefail
SRC="${SRCROOT}/../duell-web/dist/index.html"
[ -f "$SRC" ] || SRC="${SRCROOT}/Duell/placeholder.html"
DST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/duell"
mkdir -p "$DST"
cp "$SRC" "$DST/index.html"
echo "Duell: $SRC -> $DST/index.html"
