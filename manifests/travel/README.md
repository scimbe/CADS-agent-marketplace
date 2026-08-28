# travel — real OSRM routing, LLM only formats, packaged as one signed manifest

Not a test fixture (see `test-manifests/minimal-compose/`) and not a bare relay (see
`manifests/llm-node/`) — this packages a real, already-built demo from the bunsenbrenner.org demo
portfolio: [`CADS-DEMO-travel`](https://github.com/scimbe/CADS-DEMO-travel), whose entire point is
proving an LLM does **not** invent routes or travel times. A self-hosted
[OSRM](https://project-osrm.org/) engine computes the real route on real OpenStreetMap data; the
LLM only ever formats that engine's already-computed output into prose, and its formatted answer
is mechanically re-checked against the same raw numbers.

## What's here

```
manifest.json   — a real, dev-signed ServiceManifest (ed25519), env_template, verify spec
bundle.tar.gz   — the signed bundle: compose.yml + verify.sh + osrm/ + bridge/ (sha256 in
                  manifest.json's bundle.sha256, checked by installer-engine before anything runs)
bundle/         — the SAME contents, unpacked, for reading without extracting the tarball
```

`bundle.url` in the manifest is the **relative** path `"bundle.tar.gz"` — this only resolves
correctly if the process reading it has this directory (`manifests/travel/`) as its own working
directory (`installer_engine::fetch::fetch_bytes` reads a non-`http(s)://` location via
`std::fs::read`, resolved against the *process's* CWD, not the manifest.json's own location — the
same real property `test-manifests/minimal-compose/README.md` and `manifests/llm-node/README.md`
both already document, hit again here for the same reason).

## What's bundled vs. what upstream builds locally

Upstream's `osrm/build-graph.sh` produces the MLD routing graph (`bremen-latest.osrm*`) **outside**
the `osrm-car` image, from a downloaded OpenStreetMap extract, as a separate one-time step before
`docker compose up` ever runs. A signed manifest's `docker compose up` **is** the entire install
step — `installer-engine::activate()` has no separate data-prep phase between guardrail scan and
`compose up` — so that graph has to already exist inside this bundle's own bytes, not be
fetched/built at install time. `bundle/osrm/data/` therefore ships the actual pre-built MLD graph
(`bremen-latest.osrm*`, ~40 MB, everything `osrm-routed --algorithm mld` needs to serve), built for
real from the pinned Geofabrik extract during this manifest's own preparation (see osrm/REGIONS.md
in the upstream repo for the exact pin: md5 `0061299ee69f4bce070ea86e416ddc93`) and re-confirmed
deterministic: re-querying against it reproduces upstream's own live-verified acceptance numbers
exactly (see "Verified for real" below). The raw `.osm.pbf` itself is **not** bundled — only the
derived `.osrm*` files `osrm-routed` actually reads at runtime.

## Two adaptations from upstream's `compose.travel-demo.yml`, both load-bearing

Adapting an existing compose file into a manifest bundle is not a copy — see
`bundle/compose.yml`'s own header comment for the full reasoning; summarized:

1. **Only `osrm-car` + `bridge`, no `travel-demo-origin` (Caddy).** Upstream's own README already
   documents this exact two-service subset as the "local dev / acceptance check" entrypoint
   (`docker compose -f compose.travel-demo.yml up -d osrm-car bridge`). The Caddy origin needs real
   TLS certs and is explicitly flagged upstream as untested through a real browser — out of scope
   for what a manifest needs to prove.
2. **No external network, `bridge` gets a fixed loopback port.** Upstream gives `bridge` no `ports:`
   mapping at all — reachable only via Caddy, over a pre-existing operator-managed docker network
   (`networks: default: name: ... external: true`). A manifest bundle has neither of those: it's
   unpacked into an isolated `work_dir` and brought up standalone by `installer-engine`, so it needs
   its own self-contained network (compose's own default, scoped to `-p <project_name>`) and a way
   for `verify.sh` to reach the service directly — `127.0.0.1:8789:8789`, a **fixed literal**, not
   env-templated. The guardrail scanner (`installer-engine/src/guardrails.rs`) does a naive 3-part
   string split on `host_ip:host_port:container_port`; an env-substitution expression inside that
   string breaks the split and gets rejected as not-provably-loopback (the exact bug
   `manifests/llm-node/README.md` documents hitting first — confirmed it applies here too before
   ever running the scanner for real, not rediscovered the hard way a second time).

`osrm-car` itself, and `bridge`'s environment/build/healthcheck, are otherwise unchanged from
upstream.

## Required env var — an LLM key, no way around it

- `LITELLM_BASE_URL` (required) — a LiteLLM-compatible `/v1` base URL.
- `LITELLM_API_KEY` (required) — its key.
- `LITELLM_DEFAULT_MODEL` (optional, defaults to `local-devstral-small2`).

This demo's whole point is the LLM chat-formatting step and the mechanical check on its output —
there is no offline/no-LLM fallback for that half, so both are `required: true` in
`manifest.json`'s `env_template`. Because they're required, `installer-engine::activate()`'s step 8
(`resolve_env_template`) refuses to proceed to `compose up` at all without them — a missing key
fails **before** anything runs, not partway through.

**What's verifiable without an LLM key**: `bridge`'s `GET /api/plan-raw?origin=...&destination=...
&preference=...` endpoint bypasses the LLM (and Nominatim geocoding) entirely — fixed coordinates
straight to the self-hosted OSRM engine, real routing, no model involved. `verify.sh`'s Phase 1
exercises exactly this, unconditionally, for two preferences (`fastest` and `avoid_highways`) —
this is real proof the routing engine itself works, independent of any LLM key being configured.
Only Phase 2 (the actual anti-hallucination proof: LLM formats, `verify.js` mechanically checks the
answer) needs the key, and — per the required-var behavior above — it never even gets a chance to
run without one; the whole `activate()` call is rejected first.

## Verified for real, both phases, before this commit

`cargo run --example dev_activate -p installer-engine` (a pre-built
`target/debug/examples/dev_activate` was used directly), the exact code path a real
`ct-agent manifest activate` runs — fetch → sha256 check → guardrail scan → `docker compose up` →
`verify.sh` — against this exact `manifest.json`/`bundle.tar.gz` pair, with a real, budget-capped
LiteLLM key (`local-devstral-small2`). Real result:

```json
{
  "status": "ok",
  "manifest_id": "87b41f6ad4dc15e8f3092558baae699263d6d5da5e7667c299842996e373d61c",
  "publisher_pubkey": "eef0a6bef8771dd38e67302dcefb786f7b480ddd5d14249adc55efb0341250eb",
  "project_name": "travel-manifest-verify-3538185",
  "compose_up": { "exit_code": 0, "duration_ms": 7276 },
  "verify": { "exit_code": 0, "duration_ms": 8634 },
  "captured_stdout": null
}
```

(`captured_stdout` is always `null` for Compose-kind manifests — only Binary captures stdout in the
report — so `verify.sh`'s own printed proof isn't in this JSON. It was re-run by hand, same work
dir, same running containers, before tearing anything down, and its real output was:)

```
waiting for http://127.0.0.1:8789/healthz ...
OK: bridge is healthy: {...}
Phase 1: /api/plan-raw preference=fastest (real OSRM, no LLM involved) ...
OK: real OSRM result distance=29606.9 m duration=2041.3 s (matches pinned fixture within 5.0)
Phase 1: /api/plan-raw preference=avoid_highways (real OSRM, no LLM involved) ...
OK: real OSRM result distance=23678.3 m duration=2275.3 s (matches pinned fixture within 5.0)
Phase 2: free text -> LLM intent -> real OSRM -> LLM format -> verify.js anti-hallucination check ...
OK: verify.js confirmed the LLM's <ROUTE_FACTS> (24431 m / 1603 s) exactly matches the real OSRM route, hardFails=0
LLM answer:
<ROUTE_FACTS>{"distance_m":24431,"duration_s":1603}</ROUTE_FACTS>
Die Route von Bremen Hauptbahnhof nach Vegesack ist 24431 Meter lang und dauert 1603 Sekunden. Diese
Route wurde als die schnellste berechnet, da sie keine Umwege oder Umleitungen enthält, die die
Reisezeit verlängern würden. Sie nutzt die effizientesten Straßenverbindungen, um die kürzeste
Fahrzeit zu gewährleisten.
OK: travel-demo verified end to end -- real self-hosted OSRM routing (Phase 1, both preferences)
plus a real LLM chat-formatting round-trip with a mechanical anti-hallucination check that actually
inspected the model's output (Phase 2).
```

The `29606.9 m / 2041.3 s` (fastest) and `23678.3 m / 2275.3 s` (avoid_highways) figures are exact
matches to upstream's own pinned, live-verified acceptance fixture (`osrm/REGIONS.md`) — the same
graph, queried through this exact bundled deployment, reproduces the same real routing result byte
for byte, which is the whole point of shipping the pre-built graph rather than trusting a rebuild to
match. The `avoid_highways` numbers show the real trade-off the demo is built to demonstrate:
shorter *distance*, longer *duration* — a genuine routing engine decision, not two arbitrary
numbers. The Phase 2 answer's `<ROUTE_FACTS>` block, LLM prose, and `verify.js`'s `pass: true`
verdict are all real output from a real model call, not fabricated for this README.

Docker resources (containers, images, network, work_dir) from this run were torn down
(`docker compose down -v` + `docker rmi`) after capturing the above — nothing was left running.

## Reusing `verify.js`, not duplicating it

`verify.sh` does not reimplement the `<ROUTE_FACTS>` check. `bridge/server.lib.js`'s
`planAndFormat` already calls the upstream repo's own `bridge/lib/verify.js` (bundled verbatim at
`bundle/bridge/lib/verify.js`) server-side and returns the result as the `verify` field of
`POST /api/plan`'s JSON response — `verify.sh`'s Phase 2 just reads that field back over HTTP and
hard-fails if `verify.pass` is not `true`. The mechanical anti-hallucination logic lives in exactly
one place, the same place upstream's own test suite (`bridge/test/verify.test.js`) exercises it.

## Guardrail scan — what would have tripped it, and what didn't need fixing

Upstream's compose file already had good discipline (`osrm-car` publishes no host port at all;
no `privileged`/host-namespace/capability flags anywhere; every bind mount is bundle-relative).
The only two guardrail-relevant changes were the ones described above (dropping the external
network, adding `bridge`'s fixed-literal loopback port) — both already covered. `docker compose
up --build` in the real `dev_activate` run above is itself proof the guardrail scan passed (a
violation is a hard `Rejected` before `compose up` ever gets called — see
`installer-engine::activate`'s step 7).

## Judgment calls / real gaps, disclosed rather than hidden

- **`avoid_tolls`, `shortest_distance`, `fastest_alternative` are not separately exercised by
  `verify.sh`** — same as upstream's own disclosed scope (`avoid_tolls` uses the identical
  `exclude=` mechanism as `avoid_highways`, and the Bremen extract has no toll roads to exercise it
  against differently; the two `alternatives=true` preferences are mechanism-verified upstream by
  `bridge/test/osrmClient.test.js` against the same live engine, not re-proven here). `verify.sh`
  checks the two preferences that demonstrate the real, load-bearing property: a genuine routing
  trade-off, and the full anti-hallucination round-trip.
- **Geocoding (Phase 2) depends on a live call to the public Nominatim instance** from inside the
  `bridge` container (bounded to the Bremen bbox, rate-limited to 1 req/s, matching upstream's own
  policy discipline in `bridge/lib/geocode.js`) — an external dependency this manifest doesn't
  control uptime for. Phase 1 has none of this dependency (fixed coordinates, no geocoding), which
  is exactly why it's unconditional while Phase 2 is the one gated on the LLM key being real.
  Should Nominatim ever be unreachable, `verify.sh`'s Phase 2 fails loudly (bridge returns an
  `error` field, checked explicitly) rather than silently passing.
- **`osrm/data/`'s ~40 MB in this bundle is a real, deliberate size trade-off**: bundling a
  pre-built graph (rather than fetching/building it at install time, which upstream's own compose
  file documents no mechanism for within a single `docker compose up`) is what makes this manifest
  self-contained and deterministic, at the cost of a heavier `bundle.tar.gz`/`bundle/` than
  `test-manifests/minimal-compose/` or `manifests/llm-node/`. Both `bundle.tar.gz` (~18 MB,
  gzip-compressed) and the unpacked `bundle/` directory ship it, matching this repo's own existing
  dual-copy convention — no attempt was made to shrink the graph further (e.g. a smaller sub-region)
  since the whole point is reproducing upstream's own pinned, documented acceptance numbers exactly.
- **Not deployed anywhere public.** Same as upstream: `travel.bunsenbrenner.org` needs operator
  confirmation before any tunnel/edge route exists for it — this manifest packages the demo for
  local/manifest-pipeline installation, it does not itself provision anything outward-facing.

## Prerequisite

`ct-agent` itself (or, for local testing, just Docker) must already be present on the installing
host — nothing here bundles or shortcuts that, same as every other manifest in this repo.
