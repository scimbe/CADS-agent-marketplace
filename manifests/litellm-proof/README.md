# litellm-proof bundle

Proof infrastructure for the manifest installer — **not** a LiteLLM deployment anyone should use.

It reproduces the *structure* of the real four-service LiteLLM stack (`litellm` + `db` + `redis` +
a custom `heartbeat` reverse proxy) so an install can be driven end to end: fetch bundle, guardrail
scan, `docker compose up`, run `verify.sh`, tear down. There is no real model routing, no real key,
and no tunnel wiring. Contents of this directory are what gets tarred and referenced by a signed
manifest's `bundle.url` / `bundle.sha256` / `bundle.compose_file`.

## Isolation from the real deployment

The live stack at `/home/becke/git/litellm-proxy` (`litellm-proxy`, `litellm-proxy-db-1`,
`litellm-proxy-redis-1`, `litellm-proxy-heartbeat-1`, serving `llm-34a13a96.bunsenbrenner.org`) is
untouched by this bundle. Every namespace is disjoint:

| | real stack | this bundle |
|---|---|---|
| compose project | `litellm-proxy` (implicit) | supplied at runtime via `-p`, e.g. `litellm-proof` |
| containers | `litellm-proxy`, `litellm-proxy-db-1`, … | `<project>-litellm-1`, `<project>-db-1`, `<project>-redis-1`, `<project>-heartbeat-1` |
| network | `litellm-internal` + external `litellm_shared` | `litellm-proof-internal` only (no external network) |
| state | host bind mounts `./postgres_data`, `./redis_data` | named volumes `litellm-proof-pgdata`, `litellm-proof-redisdata` |
| host ports | `127.0.0.1:4001`, `127.0.0.1:4003` | `127.0.0.1:4101` (heartbeat), `127.0.0.1:4103` (litellm) |
| database | `litellm_db` | `litellm_proof_db` |

No `container_name:` is pinned in `docker-compose.yml`. Compose derives `<project>-<service>-1`
instead, which keeps names unique per install (the installer may append a suffix to the project
name) and keeps them matchable by `docker ps --filter name=<project>` — a hardcoded name would
break both. The compose file also carries no top-level `name:`, so the project name comes solely
from `docker compose -p`.

`heartbeat-proxy/` started as a build-context copy of the real `heartbeat-proxy/` sources and
now diverges from them in one respect: it is a standard-library-only rewrite of the same
behaviour (see [Hardening](#hardening)). Nothing here references the real path.

## Required env (`.env`, supplied by the installer)

| var | used for |
|---|---|
| `LITELLM_MASTER_KEY` | litellm master key + admin UI password |
| `REDIS_PASSWORD` | `redis-server --requirepass`, redis healthcheck, litellm's `REDIS_PASSWORD` |
| `POSTGRES_PASSWORD` | postgres superuser password and litellm's `DATABASE_URL` |

Any value works — nothing authenticates against a real service. `verify.sh` never receives these
(the installer scrubs the environment), so every check it makes works without a key.

## Verification

`verify.sh` reads `CT_MANIFEST_PROJECT_NAME` from its environment and measures: all four containers
running, `db`/`redis` reporting `healthy`, every published port bound to `127.0.0.1` and none to
`0.0.0.0`, litellm's `/health/liveliness` returning 200, a keyless `/v1/models` returning 401/403,
the heartbeat proxy relaying to litellm over the internal network, and a collision guard asserting
no container of this run carries the real deployment's name. Exit code 0 only if every check passed.

## Hardening

`docker-compose.yml` passes the installer's strict guardrail scan
(`crates/installer-engine/src/guardrails.rs`, scimbe/ct-agent#183 phase 1) unchanged, and a
unit test there (`shipped_litellm_proof_manifest_passes_the_strict_scan`) scans this exact file,
so weakening it fails `cargo test` rather than an install.

**Every service is read-only, capability-less, privilege-locked and bounded** (`read_only: true`,
`cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `pids_limit`, `mem_limit`; rule
F.16). A manifest-installed service runs code the operator did not write; these settings put a
ceiling on what a compromised or misbehaving container can do to the host regardless of what is
inside the image. `db` and `redis` additionally start as the image's own unprivileged account
(`70:70`, `999:1000`) instead of relying on the entrypoint's root-then-drop dance, which needs
capabilities that are no longer granted. `litellm` stays at the image's default uid with all
capabilities dropped; see the comment in the compose file before changing that.

**Every image is pinned by digest** (rule F.15). A tag such as `main-latest` or `16-alpine` is
mutable; a digest is not, so the bytes that run are the bytes the manifest was signed against.
To refresh, resolve the tag and replace the `@sha256:` suffix:

```sh
docker buildx imagetools inspect ghcr.io/berriai/litellm:main-latest
docker buildx imagetools inspect postgres:16-alpine
docker buildx imagetools inspect redis:7-alpine
docker buildx imagetools inspect python:3.12-slim     # heartbeat-proxy/Dockerfile FROM line
```

**The sidecar is standard-library only.** A `build:` must declare `network: none` (rule F.8):
`RUN` steps execute inside the Docker daemon, outside anything ct-agent can sandbox, so the one
thing the compose file can take away from them is the network. That rules out `pip install`, so
`heartbeat-proxy/app.py` is written against Python 3.12's standard library alone
(`http.server`, `http.client`, `threading`) and its Dockerfile copies one file onto the pinned
base image. Behaviour is unchanged: catch-all relay, streaming `POST /v1/messages` with a
synthesized `message_start` and periodic `ping` events, the `local-*` GPU gate.

**tmpfs mounts are the writable scratch a read-only rootfs still needs.** They are RAM-backed,
per container, discarded on restart, and sized because their pages count against the
container's `mem_limit`:

| service | tmpfs | why |
|---|---|---|
| `db` | `/var/run/postgresql`, `/tmp` | unix socket + lock file (the healthcheck's `pg_isready` connects there); initdb/server temp files |
| `redis` | `/tmp` | nothing persistent; `/data` (RDB dump) is the named volume |
| `litellm` | `/tmp` | interpreter and prisma temp files; **assumption** that nothing else is written at startup, see the compose comment for what to add if a real `docker compose up` proves otherwise |
| `heartbeat` | `/tmp` | interpreter temp fallback only; the sidecar writes no files |

Persistent state (`litellm-proof-pgdata`, `litellm-proof-redisdata`) stays on named volumes,
which are unaffected by `read_only`.

## Teardown

```sh
docker compose -p <project-name> -f docker-compose.yml down -v
```

`-v` removes this bundle's named volumes. The real stack uses host bind mounts under a different
project, so its data cannot be reached by this command.
