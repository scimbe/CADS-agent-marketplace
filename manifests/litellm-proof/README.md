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

`heartbeat-proxy/` is a build-context **copy** of the real `heartbeat-proxy/` sources, taken
read-only and unmodified; nothing here references the real path.

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

## Teardown

```sh
docker compose -p <project-name> -f docker-compose.yml down -v
```

`-v` removes this bundle's named volumes. The real stack uses host bind mounts under a different
project, so its data cannot be reached by this command.
