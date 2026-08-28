#!/usr/bin/env bash
# Real verification: checks the ACTUAL before/after directory listing run.sh's organize pipeline
# produced against phototools/fixtures/expected/manifest.sample.json -- the upstream repo's own
# hand-checked oracle (the same one tests/acceptance.organize.test.js diffs against) -- confirms
# EXIF genuinely survived watermarking on the real destination files (not just that files exist
# at the right names), and confirms a real contact sheet was built at the deterministic geometry.
#
# installer-engine runs this with a SCRUBBED environment -- only CT_MANIFEST_PROJECT_NAME is
# passed in (see installer-engine's activate.rs step 10 / process::run_bounded's env_clear()).
# This demo needs no other env values (no secrets, no config -- see ../README.md), so there is
# nothing to `source ./.env` for, unlike a manifest with a real env_template. cwd is the unpacked
# bundle's own work_dir (the same directory run.sh ran in), so paths below are relative to that.
set -uo pipefail

ROOT="phototools"
RAW_DIR="$ROOT/fixtures/.tmp/raw"
SORTED_DIR="$ROOT/fixtures/.tmp/sorted"
EXPECTED_JSON="$ROOT/fixtures/expected/manifest.sample.json"
MANIFEST_JSON="$SORTED_DIR/manifest.json"

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. Before: exactly the 6 source fixture files exist.
for f in img1 img2 img3 img4 img5 img6; do
  [ -f "$RAW_DIR/$f.jpg" ] || fail "$RAW_DIR/$f.jpg missing -- fixtures/generate.js did not produce the expected raw batch"
done
raw_count=$(find "$RAW_DIR" -maxdepth 1 -name '*.jpg' | wc -l)
[ "$raw_count" -eq 6 ] || fail "expected exactly 6 raw fixture photos, found $raw_count"

# 2. After: manifest.json and contact-sheet.jpg exist.
[ -f "$MANIFEST_JSON" ] || fail "$MANIFEST_JSON missing -- organize did not run/complete"
[ -f "$SORTED_DIR/contact-sheet.jpg" ] || fail "$SORTED_DIR/contact-sheet.jpg missing"

# 3. Real before/after directory-listing check: every expected destRelPath from the upstream
#    repo's own hand-checked oracle actually exists on disk, and manifest.json's own
#    srcPath/destRelPath/dateTimeOriginal/city entries match that oracle exactly -- the same
#    comparison tests/acceptance.organize.test.js makes, reimplemented here in Python since this
#    scrubbed shell has no node test runner / node_modules available to it.
python3 - "$EXPECTED_JSON" "$MANIFEST_JSON" "$SORTED_DIR" <<'PYEOF'
import json, os, sys

expected_path, manifest_path, sorted_dir = sys.argv[1], sys.argv[2], sys.argv[3]
expected = json.load(open(expected_path))["entries"]
manifest = json.load(open(manifest_path))

if manifest.get("count") != 6:
    print(f"FAIL: manifest.json count = {manifest.get('count')}, expected 6")
    sys.exit(1)

actual_by_src = {e["srcPath"]: e for e in manifest["entries"]}
if len(actual_by_src) != len(expected):
    print(f"FAIL: manifest.json has {len(actual_by_src)} entries, expected {len(expected)}")
    sys.exit(1)

for want in expected:
    got = actual_by_src.get(want["srcPath"])
    if got is None:
        print(f"FAIL: manifest.json has no entry for srcPath {want['srcPath']}")
        sys.exit(1)
    for field in ("destRelPath", "dateTimeOriginal", "city"):
        if got.get(field) != want[field]:
            print(f"FAIL: {want['srcPath']}.{field}: got {got.get(field)!r}, want {want[field]!r}")
            sys.exit(1)
    dest_on_disk = os.path.join(sorted_dir, want["destRelPath"])
    if not os.path.isfile(dest_on_disk):
        print(f"FAIL: expected sorted file missing on disk: {dest_on_disk}")
        sys.exit(1)

applied = manifest.get("watermark", {}).get("appliedTo")
if applied != 6:
    print(f"FAIL: watermark.appliedTo = {applied}, expected 6")
    sys.exit(1)

print(f"before/after oracle check OK: all {len(expected)} entries match, all destRelPath files exist on disk, watermark applied to 6/6")
PYEOF
py_status=$?
[ "$py_status" -eq 0 ] || fail "manifest.json / before-after directory listing did not match the expected oracle (see output above)"

# 4. Real EXIF survival check on the actual destination files (proves watermarking via
#    ImageMagick + exiftool's restampExif genuinely preserved DateTimeOriginal, not just that
#    files exist at the right names).
check_date() {
  local relpath="$1" want_date="$2"
  local full="$SORTED_DIR/$relpath"
  local got_date
  got_date="$(exiftool -s3 -DateTimeOriginal "$full" 2>/dev/null)"
  [ "$got_date" = "$want_date" ] || fail "$relpath: DateTimeOriginal after watermarking = '$got_date', expected '$want_date'"
}
check_date "2025/2025-01-15_berlin/2025-01-15_101500_berlin_001.jpg"   "2025:01:15 10:15:00"
check_date "2025/2025-01-15_berlin/2025-01-15_113000_berlin_002.jpg"   "2025:01:15 11:30:00"
check_date "2025/2025-01-15_hamburg/2025-01-15_090000_hamburg_001.jpg" "2025:01:15 09:00:00"
check_date "2025/2025-06-02_munich/2025-06-02_142000_munich_001.jpg"   "2025:06:02 14:20:00"
check_date "2025/2025-06-02_hamburg/2025-06-02_164500_hamburg_001.jpg" "2025:06:02 16:45:00"
check_date "2025/2025-11-30_munich/2025-11-30_080500_munich_001.jpg"   "2025:11:30 08:05:00"

# 5. Contact sheet is a real image at the deterministic width for 4 columns @ 200x150+6+6 (height
#    includes IM's own label-text line height, so only bound it loosely, same as the upstream
#    repo's own acceptance test does).
identify_out="$(identify -format '%w %h' "$SORTED_DIR/contact-sheet.jpg" 2>/dev/null || magick identify -format '%w %h' "$SORTED_DIR/contact-sheet.jpg" 2>/dev/null)"
width="$(echo "$identify_out" | awk '{print $1}')"
height="$(echo "$identify_out" | awk '{print $2}')"
[ "$width" = "848" ] || fail "contact sheet width = '$width', expected 848 (4 columns at 200x150+6+6)"
[ -n "$height" ] && [ "$height" -ge 300 ] || fail "contact sheet height = '$height', looks too short for 2 rows"

echo "OK: phototools organize pipeline verified for real -- 6/6 photos sorted+renamed to the exact expected before/after paths, EXIF survived watermarking, contact sheet built at ${width}x${height}"
exit 0
