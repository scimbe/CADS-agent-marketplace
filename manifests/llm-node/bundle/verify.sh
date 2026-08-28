#!/usr/bin/env bash
# Real verification: not just "container is up" -- checks the proxy actually lists the
# configured model AND that a real chat completion round-trips through to the local Ollama and
# back. A container that's running but can't reach Ollama (wrong LLM_NODE_OLLAMA_BASE_URL, model
# not pulled, etc.) must fail this, not pass it.
set -uo pipefail

# installer-engine runs verify.sh with a SCRUBBED environment -- only CT_MANIFEST_PROJECT_NAME,
# never the resolved secret/config values (see activate.rs step 10's own comment on why). Those
# values are the SAME .env docker compose itself reads via --env-file, written to this script's
# own working directory (opts.work_dir) in step 8 -- so read it from there instead of assuming
# it's in the environment already.
if [ ! -f ./.env ]; then
  echo "FAIL: ./.env not found in $(pwd) -- expected installer-engine to have written it here"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source ./.env
set +a

BASE_URL="http://127.0.0.1:4110"  # fixed, matches compose.yml's port mapping -- see its own comment
MASTER_KEY="${LITELLM_MASTER_KEY:?LITELLM_MASTER_KEY not set in .env}"
MODEL_NAME="${LLM_NODE_MODEL_NAME:?LLM_NODE_MODEL_NAME not set in .env}"

echo "waiting for $BASE_URL/health/readiness ..."
ready=""
for _ in $(seq 1 30); do
  ready="$(curl -fsS --max-time 2 -H "Authorization: Bearer $MASTER_KEY" "$BASE_URL/health/readiness" 2>/dev/null || true)"
  [ -n "$ready" ] && break
  sleep 2
done
if [ -z "$ready" ]; then
  echo "FAIL: $BASE_URL never became ready"
  exit 1
fi

echo "checking /v1/models lists $MODEL_NAME ..."
models="$(curl -fsS --max-time 5 -H "Authorization: Bearer $MASTER_KEY" "$BASE_URL/v1/models" 2>/dev/null || true)"
if ! printf '%s' "$models" | grep -q "\"$MODEL_NAME\""; then
  echo "FAIL: /v1/models did not list '$MODEL_NAME'. Got: $models"
  exit 1
fi

echo "checking a real chat completion round-trips through to Ollama ..."
# max_tokens is deliberately generous (not a tight "ok" check): a reasoning-style model spends
# tokens on its own chain-of-thought (returned separately as `reasoning_content`) before it
# emits any `content` at all -- measured directly against a real reasoning model during this
# manifest's own verification, where max_tokens=10 cut the response off mid-thought with empty
# content and finish_reason=length, a false failure of a genuinely working relay.
completion="$(curl -fsS --max-time 90 -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL_NAME\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly one word: ok\"}],\"max_tokens\":200}" \
  "$BASE_URL/v1/chat/completions" 2>/dev/null || true)"
content="$(printf '%s' "$completion" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d["choices"][0]["message"]["content"])
except Exception as e:
    print("PARSE_ERROR:", e, file=sys.stderr)
    sys.exit(1)' 2>/dev/null)"
if [ -z "$content" ]; then
  echo "FAIL: chat completion did not return usable content. Raw response: $completion"
  exit 1
fi

echo "OK: $BASE_URL is a real, working LLM relay for '$MODEL_NAME' (model reply: '$content')"
exit 0
