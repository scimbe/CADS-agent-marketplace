# Which existing CADS demos can ship as manifests

Measured, not assumed. Every row below is a real, unmodified compose file from its own repository,
copied into a bundle, signed, and published to a local registry — the verdict is what the registry
returned. Method and date at the bottom.

This exists because "add more applications to the marketplace" turned out to have a precise,
checkable answer, and the answer is currently **none of the existing demos**.

## Results

| Demo | Verdict | Blocker |
|---|---|---|
| `CADS-a2a-demo` | flagged | `${A2A_CERT_DIR:?…}:/certs:ro` |
| `CADS-webconference-demo` | flagged | `${WEBCONFERENCE_CERT_DIR:?…}:/certs:ro` |
| `CADS-auction-demo` | flagged | `${AUCTION_CERT_DIR:?…}:/certs:ro` |
| `CADS-cookbook-demo` | flagged | `${COOKBOOK_CERT_DIR:?…}:/certs:ro` **and** `build.context: ${CT_TUNNEL_SRC:-../CADS-Tunnel}` |
| `CADS-flappy-demo` | flagged | `${FLAPPY_CERT_DIR:?…}:/certs:ro` **and** `build.context: ${CT_TUNNEL_SRC:-../CADS-Tunnel}` |
| `manifests/hello-world` | **clean** | — |
| `manifests/litellm-proof` | clean | — (Phase 1 proof) |

## The one blocker, five times

All five demos carry the same line, near-verbatim:

```yaml
volumes:
  - ${<DEMO>_CERT_DIR:?set <DEMO>_CERT_DIR=<dir with fullchain.pem+privkey.pem from the operator>}:/certs:ro
```

A host directory, chosen at activation time, mounted into the container. That is precisely what
`F.3` exists to prevent, and since #14 was fixed the scanner says so instead of silently passing it.

The uniformity is the useful part: this is one convention propagated by copy, not five independent
designs. One decision about how a marketplace-published service receives TLS material would unblock
all five at once.

**There is currently no worked example of the compliant alternative** anywhere in these demos — so
whichever way it is resolved has to be designed, not copied. That decision is the operator's; this
document only records the measurement.

Two shapes that would each make a demo compliant, listed to frame the question rather than to
answer it:

- **Certificates as bundle content or env-injected material** rather than a mounted host directory,
  so nothing outside the bundle is read.
- **A recorded, visible exception** — the registry already stores and displays a guardrail verdict
  rather than refusing a flagged manifest, so "flagged, accepted deliberately, here is why" is
  expressible today. It should be a deliberate act, not a default.

## The second blocker, twice

`cookbook` and `flappy` additionally build from `${CT_TUNNEL_SRC:-../CADS-Tunnel}` — a path outside
the bundle, caught as `F.3-build-context-not-local`. A bundle has to be self-contained; a build
context pointing at a sibling checkout of another repository cannot be vetted at scan time and
cannot be reproduced by whoever activates the manifest.

Note that this violation was already caught *before* #14 was fixed, while the cert-dir mount on the
same two files was not — the same `${VAR}` syntax, failing closed in `check_build` and open in
`check_volumes`. That inconsistency was the bug.

## A caution about what you scan

`compose.a2a-demo.selfservice.override.yml` scans `clean`, and that verdict is meaningless: it is a
Compose **override fragment** with zero `image:` entries, whose services inherit everything from the
base file. Scanning it measures almost nothing.

Always scan the base stack a manifest would actually activate. A clean verdict on a fragment is not
evidence about the application.

## Writing a bundle that passes

Three details are load-bearing, and all three are easier to copy than to rediscover. They are
visible in `manifests/litellm-proof` and in the `hello-world` bundle:

- **No `name:` and no `container_name:`.** The compose project name is supplied at runtime by the
  installer, which may append a unique suffix. A pinned name collides between two installs and does
  not match the installer's own `--filter name=<project>` lookups.
- **Bind published ports to `127.0.0.1`.** A bare `"4201:8080"` publishes on every interface and is
  rejected as `F.1-non-loopback-port`. Loopback here is a check, not a style preference.
- **Make `verify.sh` measure rather than assert.** Resolve the container through compose's own
  service label so a project-name suffix still finds it; read the host port back from `docker port`
  instead of hardcoding it; poll with a bounded budget. A single-shot `curl` measures timing luck,
  not readiness.

And one that only shows up once you try to test locally: `ct-agent manifest activate` refuses plain
HTTP by design, so exercising activation without standing up TLS means `file://` paths rather than a
loopback HTTP registry.

## Method

Each compose file was copied unmodified into a bundle alongside a placeholder `verify.sh`, packed,
hashed, signed with a throwaway holder key via `cargo run --example dev_sign`, and published to a
locally-run `registry` with `POST /manifests`. The verdict is the registry's own
`guardrail_verdict`, produced by the same `scan_compose` the installer uses at activation time.

Run on 2026-08-27, macOS 15 / arm64, against `main` at `d09eecd` (i.e. after the #14 fix in PR#15).
Re-running it after any guardrail change is the point of writing it down.
