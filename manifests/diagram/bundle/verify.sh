#!/usr/bin/env bash
# Real verification: not just "wrapper.sh exited 0" -- confirms it actually produced a genuine,
# non-trivial, correctly-formatted rendered image, not a placeholder or a 0-byte/truncated file.
#
# installer-engine runs this with a SCRUBBED environment -- only CT_MANIFEST_PROJECT_NAME, never
# the resolved LITELLM_* values (see crates/installer-engine/src/activate.rs step 10's own
# comment). This script doesn't need them: everything it checks (diagram.png) is a file wrapper.sh
# already wrote to this same work_dir by the time installer-engine gets here, so unlike
# manifests/llm-node's verify.sh (which curls a live service and needs its master key), this one
# never needs to `source ./.env`.
set -uo pipefail

IMG="diagram.png"
MIN_BYTES=512   # a real mermaid render of even a trivial flowchart is several KB; this floor
                # catches an empty/truncated/placeholder file, not a legitimately-tiny real one.

if [ ! -f "$IMG" ]; then
  echo "FAIL: $IMG does not exist in $(pwd) -- wrapper.sh did not produce a rendered image"
  exit 1
fi

size="$(stat -c%s "$IMG" 2>/dev/null || stat -f%z "$IMG" 2>/dev/null || true)"
if [ -z "$size" ] || [ "$size" -lt "$MIN_BYTES" ]; then
  echo "FAIL: $IMG is '${size:-unreadable}' bytes, below the $MIN_BYTES-byte floor for a real render"
  exit 1
fi

# PNG magic number: 89 50 4E 47 0D 0A 1A 0A -- the same 8-byte check diagram-cli's own
# src/util/pngCheck.js uses, reimplemented here in plain bash since verify.sh must stand on its
# own (no node dependency, no reliance on the app's own code being trustworthy).
magic="$(head -c 8 "$IMG" | od -An -tx1 | tr -d ' \n')"
expected="89504e470d0a1a0a"
if [ "$magic" != "$expected" ]; then
  echo "FAIL: $IMG's first 8 bytes are '$magic', expected the PNG magic number '$expected' -- not a real PNG"
  exit 1
fi

# Cross-check against diagram-cli's own attempts.json transcript, if present: a genuine success
# says so explicitly, so this catches the case where the image on disk is stale (left over from a
# previous run) even though generate itself reported failure.
if [ -f attempts.json ] && ! grep -q '"success": true' attempts.json; then
  echo "FAIL: attempts.json exists but does not report success:true -- $IMG may be a stale/leftover file"
  exit 1
fi

echo "OK: $IMG is a real PNG ($size bytes, correct magic number) -- diagram-cli's LLM-plus-real-renderer render-validate-retry loop produced a genuine rendered image"
exit 0
