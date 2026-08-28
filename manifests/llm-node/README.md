# llm-node — a real LLM relay, installable as one signed manifest

Not a test fixture (see `test-manifests/minimal-compose/` for that) — this stands up a real,
working service: litellm-proxy fronting **your own** locally-served Ollama model, virtual-key
auth enforced, ready to be made reachable to other agents on this platform.

## What it does, concretely

One container (`ghcr.io/berriai/litellm:main-latest`), bound to `127.0.0.1:4110` only,
configured (via `bundle/config.yaml`, using litellm's own `os.environ/...` resolution — **not**
docker-compose's `${VAR}` substitution, which never reaches a mounted file) to route one named
model to your Ollama's `ollama_chat/<tag>` API. Every call needs the `LITELLM_MASTER_KEY` you
set — this is not an open relay the moment it starts.

## Before you install

Your Ollama needs to be reachable **from inside a Docker container**, not just from your own
terminal. Ollama's default (`OLLAMA_HOST=127.0.0.1:11434`) is loopback-only — a container can't
reach that even via `host.docker.internal`, since `127.0.0.1` inside a container means the
container itself, not the host. **Verified the hard way while building this**, not assumed:
Set `OLLAMA_HOST=0.0.0.0` (or otherwise ensure Ollama listens on an interface Docker can reach)
before activating this manifest, or `verify.sh` will fail with a real, honest connection error
— not a silent false pass.

## Required env vars (values go in your own local `.env`, never in the manifest — see
`manifest.json`'s `env_template` for the authoritative list/descriptions)

- `LITELLM_MASTER_KEY` — pick your own random string.
- `LLM_NODE_MODEL_NAME` — the public name other agents will call this model by.
- `LLM_NODE_OLLAMA_MODEL_SPEC` — e.g. `ollama_chat/llama3.1:latest` (provider prefix + your
  Ollama tag — see [litellm's Ollama provider docs](https://docs.litellm.ai/docs/providers/ollama)).
- `LLM_NODE_OLLAMA_BASE_URL` (optional) — defaults to `http://host.docker.internal:11434`, which
  works out of the box on Docker Desktop for Mac; override only if your Ollama binds elsewhere.

Port is fixed at `4110`, not configurable — see `bundle/compose.yml`'s own comment for why (the
installer's guardrail scanner can't evaluate compose's `${VAR:-default}` syntax in a port
mapping; found this the hard way too, not guessed).

## Verified for real before commit

`cargo run --example dev_activate -p installer-engine`, the exact code path a real
`ct-agent manifest activate` runs, against this exact `manifest.json`/`bundle.tar.gz` pair:
fetch → sha256 check → guardrail scan → `docker compose up` → `verify.sh` (which itself checks
`/v1/models` lists the configured model AND that a real chat completion round-trips through to a
real Ollama and back — not just "container started"). Real result: `"status": "ok"`, both steps
exit 0, `verify.sh`'s own final line was the model's actual reply.

Two real bugs were found and fixed getting here, both documented inline where they'd bite again:
Ollama's loopback-only default (see "Before you install" above), and the guardrail's `${VAR}`
parsing limit (see `compose.yml`'s port comment).

## What this does NOT do yet — the actual point, still open

Standing up this service is necessary but not sufficient for "other demos can use it." Making it
**reachable over a real Agent-Fabric channel** — so an agent belonging to a different demo can
actually call it — needs real channel authorization wiring (holder keys, which peers get
admitted) on the CADS-Tunnel side, which is a separate, not-yet-designed step. This manifest is
the payload; the channel is the next piece.

## Prerequisite

`ct-agent` itself must already be running on the host before any manifest — this one included —
can be installed. That's a separate, deliberate decision for whoever owns this machine; nothing
here bundles or shortcuts it.
