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
terminal — this was verified the hard way while building this manifest (on a native Linux
Docker host, a container genuinely cannot reach a host service bound to `127.0.0.1`, even via
`host.docker.internal`; `127.0.0.1` inside a container means the container itself). If
`verify.sh` fails with a connection error rather than a false pass, this is almost certainly why.

**Do NOT blanket-set `OLLAMA_HOST=0.0.0.0` to fix this — real security finding, not a
nitpick** (caught in independent review before this ever shipped): Ollama's native API on
`:11434` has **no auth of its own**. litellm's master-key check only guards this manifest's own
`:4110`. Binding Ollama to `0.0.0.0` exposes the unauthenticated `:11434` API on **every
interface**, including your physical LAN — on a laptop that roams networks (café, conference,
shared office wifi), that's a real, unauthenticated door into your models for anyone on the same
network, completely bypassing this manifest's own virtual-key layer.

What to do instead, by platform — refined after review from both a Mac-side tester and the
platform operator:
- **Docker Desktop for macOS**: containerizing Ollama itself isn't the fix here — it would lose
  Metal GPU access, so fronting the host's own Ollama is the right shape. But on Docker Desktop
  for Mac there is genuinely no way to bind Ollama to only the VM's internal gateway interface
  from the macOS side (confirmed, not assumed) — so `OLLAMA_HOST=0.0.0.0` is the real
  requirement here, **and it MUST be paired with a host firewall rule**, not left bare: block
  inbound `:11434` on your physical interfaces (`en0` etc. — a `pf` rule, or at minimum the
  macOS Application Firewall set to block incoming for the `ollama` binary) while still allowing
  the Docker Desktop VM gateway through. Reachable to the container, closed to the LAN. Verify
  the rule actually blocks — `curl http://<your-lan-ip>:11434/api/tags` from a second device on
  the same network should fail — don't assume the rule is correct just because you wrote it.
- **Native Linux Docker**: bind Ollama specifically to the Docker bridge/host-gateway address
  (`docker network inspect bridge` to find it — typically `172.17.0.1`), not `0.0.0.0` — reachable
  from containers, not from your LAN; this platform doesn't share Mac's GPU-passthrough
  constraint, so the tighter bind is straightforwardly available.

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
