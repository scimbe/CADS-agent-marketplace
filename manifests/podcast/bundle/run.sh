#!/usr/bin/env bash
# CADS-agent-marketplace InstallerKind::Binary entrypoint for the "podcast" demo.
#
# Runs the REAL upstream pipeline (github.com/scimbe/CADS-DEMO-podcast, src/podcast_producer/)
# unmodified, against the SAME raw test fixtures the upstream repo already ships with
# (tests/fixtures/raw/*.wav) -- no fixtures invented here. Three stages actually run:
#   1. cut_mix.py    -- real ffmpeg: trim, concat, encode episode.mp3 / episode_16k.wav
#   2. transcribe.py -- real whisper.cpp whisper-cli against the real ggml model
#   3. chapters.py   -- real LLM call, chapter timestamps validated in code against the
#                        real whisper.cpp segment boundaries (see chapters.py's own
#                        ChapterValidationError -- a hallucinated timestamp fails the run,
#                        it is never silently kept)
# Stage 4 (announce.py, Piper TTS chapter announcements) is optional upstream and is not
# invoked here -- this manifest's acceptance bar is audio + transcript + chapters, per its
# own README.
#
# installer-engine runs Binary-kind executables via `process::run_bounded`, which calls
# `Command::env_clear()` first: this process gets ONLY `PATH` plus whatever this bundle's
# manifest.json env_template resolved (see installer-engine::activate step 8/9). Nothing else
# is ambiently available -- not $HOME, not a shell profile -- so every path below is either
# bundle-relative (via $BUNDLE_DIR, resolved from $(pwd) since installer-engine invokes this
# script WITH ITS CWD SET TO THE UNPACKED BUNDLE's work_dir) or comes from an explicit,
# manifest-declared env var. See this directory's README.md "Prerequisites" for what must
# already exist on the host before this can succeed -- this script only runs a pipeline, it
# does not install ffmpeg/whisper.cpp/a Python interpreter for you (same posture as every other
# manifest in this repo: e.g. manifests/llm-node/README.md's "ct-agent itself must already be
# running on the host before any manifest -- this one included -- can be installed").
set -euo pipefail

BUNDLE_DIR="$(pwd)"
OUT_DIR="$BUNDLE_DIR/out"

fatal() {
  echo "FATAL: $*" >&2
  exit 1
}

: "${LLM_BASE_URL:?required env var missing -- see manifest.json env_template}"
: "${LLM_API_KEY:?required env var missing -- see manifest.json env_template}"
: "${LLM_MODEL:?required env var missing -- see manifest.json env_template}"
: "${WHISPER_CLI_PATH:?required env var missing -- see manifest.json env_template}"
: "${WHISPER_MODEL_PATH:?required env var missing -- see manifest.json env_template}"
PODCAST_PYTHON_BIN="${PODCAST_PYTHON_BIN:-python3}"

[ -x "$WHISPER_CLI_PATH" ] || fatal "WHISPER_CLI_PATH=$WHISPER_CLI_PATH is not an executable file. Build whisper.cpp first (pinned tag b4938 upstream) -- see this bundle's README.md Prerequisites."
[ -f "$WHISPER_MODEL_PATH" ] || fatal "WHISPER_MODEL_PATH=$WHISPER_MODEL_PATH not found."
command -v ffmpeg >/dev/null 2>&1 || fatal "ffmpeg not found on PATH."
command -v ffprobe >/dev/null 2>&1 || fatal "ffprobe not found on PATH."
command -v "$PODCAST_PYTHON_BIN" >/dev/null 2>&1 || fatal "$PODCAST_PYTHON_BIN not found on PATH."
"$PODCAST_PYTHON_BIN" -c "import openai" 2>/dev/null || fatal "$PODCAST_PYTHON_BIN has no importable 'openai' package (pip install 'openai>=1.0' into whatever interpreter PODCAST_PYTHON_BIN points at)."

export PYTHONPATH="$BUNDLE_DIR/src"
export WHISPER_CLI_PATH WHISPER_MODEL_PATH LLM_BASE_URL LLM_API_KEY LLM_MODEL

echo "=== podcast pipeline: real ffmpeg cut/mix -> real whisper.cpp ASR -> real LLM chapters ===" >&2
echo "bundle dir: $BUNDLE_DIR" >&2
echo "out dir:    $OUT_DIR" >&2

"$PODCAST_PYTHON_BIN" -m podcast_producer.pipeline \
  --tracks \
    "$BUNDLE_DIR/tests/fixtures/raw/track1.wav" \
    "$BUNDLE_DIR/tests/fixtures/raw/stinger.wav" \
    "$BUNDLE_DIR/tests/fixtures/raw/track2.wav" \
    "$BUNDLE_DIR/tests/fixtures/raw/stinger.wav" \
    "$BUNDLE_DIR/tests/fixtures/raw/track3.wav" \
  --out-dir "$OUT_DIR"
