#!/usr/bin/env bash
# Real verification, not a stub: checks that run.sh's pipeline actually produced real audio +
# a real transcript + real, grounded chapter markers -- not just that the process exited 0.
#
# installer-engine runs verify.sh with a SCRUBBED environment: only CT_MANIFEST_PROJECT_NAME is
# set (see installer-engine::activate step 10's comment, and the same lesson documented in
# ../../manifests/llm-node/bundle/verify.sh and ../../test-manifests/minimal-compose/README.md).
# This script needs no secret env vars at all -- it only inspects files run.sh already wrote to
# ./out, and PATH (ffmpeg/ffprobe) is the one thing run_bounded always preserves -- so unlike
# llm-node's verify.sh, there is no ./.env to source here.
#
# Deliberately avoids depending on python3 being on PATH: run.sh's own env_template lets an
# operator point PODCAST_PYTHON_BIN at an interpreter that ISN'T on PATH (e.g. an unactivated
# venv), and that env var is exactly the kind of value installer-engine scrubs before running
# this script -- so JSON content below is checked with grep/wc, not a JSON parser.
set -uo pipefail

OUT_DIR="./out"
FAIL=0

fail() {
  echo "FAIL: $*"
  FAIL=1
}

# --- 1. real produced audio -------------------------------------------------
MP3="$OUT_DIR/episode.mp3"
if [ ! -f "$MP3" ]; then
  fail "$MP3 was not produced"
else
  size="$(stat -c%s "$MP3" 2>/dev/null || stat -f%z "$MP3" 2>/dev/null || echo 0)"
  if [ "$size" -lt 10000 ]; then
    fail "$MP3 suspiciously small ($size bytes) -- likely empty/fabricated"
  fi
  if command -v ffprobe >/dev/null 2>&1; then
    duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MP3" 2>/dev/null || echo 0)"
    awk -v d="$duration" 'BEGIN { exit !(d > 0) }' || fail "$MP3 has zero/invalid duration (ffprobe reported '$duration')"
  else
    fail "ffprobe not found on PATH -- cannot verify $MP3 is real playable audio"
  fi
fi

MASTER="$OUT_DIR/episode_master.wav"
[ -f "$MASTER" ] && [ -s "$MASTER" ] || fail "$MASTER missing or empty"

# --- 2. real transcript ------------------------------------------------------
SRT="$OUT_DIR/transcript.srt"
TJSON="$OUT_DIR/transcript.json"
[ -f "$SRT" ] && [ -s "$SRT" ] || fail "$SRT missing or empty"
[ -f "$TJSON" ] && [ -s "$TJSON" ] || fail "$TJSON missing or empty"

# --- 3. transcript is real ASR output, not the documented mock fallback -----
# pipeline.py only ever writes this literal marker text into transcript output when
# --allow-mock-transcript was used (see src/podcast_producer/transcribe.py's MOCK_PREFIX) --
# run.sh never passes that flag, so seeing it here would mean real ASR did NOT run.
if [ -f "$SRT" ] && grep -q "MOCK TRANSCRIPT" "$SRT"; then
  fail "$SRT contains the mock-transcript marker -- real whisper.cpp ASR did not run"
fi

# Fuzzy keyword check against the same fixtures this pipeline was run on -- mirrors upstream's
# own tests/test_acceptance.py::test_transcript_contains_expected_keywords_unless_mock (source:
# CADS-DEMO-podcast tests/fixtures/expected/keywords.json, copied into this bundle at
# tests/fixtures/expected/keywords.json). Tolerates 1 miss per track (small model + synthesized
# speech), same tolerance upstream's own pytest uses.
check_keywords() {
  local track="$1"; shift
  local words=("$@")
  local found=0
  for w in "${words[@]}"; do
    if grep -qi -- "$w" "$SRT"; then
      found=$((found + 1))
    fi
  done
  if [ "$found" -lt $((${#words[@]} - 1)) ]; then
    fail "track $track: only matched $found/${#words[@]} expected keywords (${words[*]}) in $SRT"
  else
    echo "OK: track $track matched $found/${#words[@]} expected keywords"
  fi
}

if [ -f "$SRT" ]; then
  check_keywords track1 "zero trust" "tunnel" "port"
  check_keywords track2 "marketplace" "manifest" "install"
  check_keywords track3 "sort arena" "sorting" "algorithm"
fi

# --- 4. real, grounded chapter markers ---------------------------------------
CHAPTERS="$OUT_DIR/chapters.json"
if [ ! -f "$CHAPTERS" ]; then
  fail "$CHAPTERS was not produced"
else
  [ -s "$CHAPTERS" ] || fail "$CHAPTERS is empty"

  if grep -q '"generated_from_mock_transcript": *true' "$CHAPTERS"; then
    fail "$CHAPTERS is flagged generated_from_mock_transcript=true -- chapters were not grounded in real ASR"
  fi

  n_chapters="$(grep -c '"start_ms"' "$CHAPTERS")"
  if [ "$n_chapters" -lt 2 ]; then
    fail "$CHAPTERS has only $n_chapters chapter(s), expected >=2 for a 3-segment episode"
  else
    echo "OK: $CHAPTERS has $n_chapters chapters"
  fi

  # chapters.py (see chapters.py's own ChapterValidationError) already refuses to write this file
  # at all if any chapter title were empty or any start_ms weren't grounded in a real whisper.cpp
  # segment boundary within its 2s snap tolerance -- so this file existing with >=2 chapters is
  # itself evidence the code-level validator upstream already ran and passed. The two greps above
  # are this script's own independent re-check of the two failure modes most likely to silently
  # regress (an empty/placeholder run, or a mock-transcript run slipping through).
  if grep -qE '"title": *""' "$CHAPTERS"; then
    fail "$CHAPTERS contains an empty chapter title"
  fi
fi

SUMMARY="$OUT_DIR/pipeline_summary.json"
[ -f "$SUMMARY" ] && [ -s "$SUMMARY" ] || fail "$SUMMARY missing or empty"

if [ "$FAIL" -ne 0 ]; then
  echo "FAIL: one or more checks above failed"
  exit 1
fi

echo "OK: real episode audio + real whisper.cpp transcript + real, grounded chapter markers all present in $OUT_DIR"
exit 0
