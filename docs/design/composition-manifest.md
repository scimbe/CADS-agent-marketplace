# Design: a composition manifest for multi-agent topologies

## Status

Proposed (design only — CADS-Tunnel#107/#175 revival, composition/manifest-side workstream).
Not implemented. No `manifest-core`, `installer-engine`, or `registry` change has landed for this.
This document does not touch any of those crates' actual code or schema.

## Scope

How the marketplace/manifest side describes "install N agents and wire M A2A edges between them as
one unit." Explicitly **not** in scope: any backbone-side change to `CADS-Tunnel`'s control-plane
authorization, hostname routing, or `topology.rs` itself — those are core's territory and, where
this design needs something from them that doesn't exist today, it says so and stops rather than
inventing it.

## Foundation: what already exists, read directly from source

**Single-agent manifest** (`crates/manifest-core/src/manifest.rs`, ADR-0001). `ServiceManifest` is
a holder-signed, domain-separated (`cads-service-manifest-v1`), injective-preimage document:
`publisher_pubkey` (the signing ed25519 holder key), a publisher-chosen `manifest_id`, `name`,
`version`, an `installer_kind` (`Compose` | `Binary` | `K8s`, only the first two have real
executors), a `bundle: BundleRef` (`url` + `sha256` + `compose_file` — content-addressed, not
embedded), `env_template` (names only, never values), a `verify: VerifySpec`, and validity window.
`is_valid(now)` checks signature + expiry only — trust is a *separate*, explicit publisher-allowlist
check in `installer-engine`, deliberately never folded into `is_valid` (ADR-0001's whole point).

**Registry** (`crates/registry/src/lib.rs`, Phase 3). A running service: `POST /manifests`
(multipart, write-token-gated, re-verifies + guardrail-scans at publish time) and, load-bearing for
this design, **`GET /manifests/:manifest_id`** — an unauthenticated read that returns the raw,
already-signed manifest JSON, keyed by `manifest_id` alone.

**Topology Editor** (`CADS-Tunnel`, `crates/control-plane/src/topology.rs` + `storage.rs`, and
`CADS-Tunnel-docs/_explanation/topology-editor.md`). The real, shipped multi-agent primitive this
design has to build on:

- A `Topology { id, owner, net_uuid }` is an OIDC-authenticated human's container.
  `POST /me/topologies/:id/agents {"agent": "<holder-key-hex>"}` assigns **one agent, by its own
  32-byte holder key** — the exact same identity Agent-Fabric channels already use, no separate
  node-id mapping. **Exclusive membership**: an agent belongs to at most one topology at a time
  (`AgentAssignment`, `topology.rs`'s own module doc calls this "the one constraint with no prior
  art in the repo"); assigning an already-assigned agent is a `409`.
- `POST`/`DELETE /me/topologies/:id/edges {"a", "b"}` — an undirected edge between two node ids
  (`storage.rs` `add_edge`/`edges`/`remove_edge`, `topology_edges` table).
- `PUT /me/topologies/:id/operator {"operator_pubkey", "proof"}` — proof-of-possession-gated
  operator binding. **Only after this does a drawn edge do anything live**:
  `storage.rs::topology_authorizes` / `::authorized_channels` fold every edge through
  `channel_id_for_link` and the channel-admission gate consults this **additively**, alongside
  ordinary channel membership. Remove the edge, the authorization is gone — no separate
  per-channel bookkeeping. An unbound topology authorizes nothing.
- This whole surface is **OIDC-bearer authenticated** (`/me/*`), i.e. a logged-in human's session —
  not an agent-key-signed request. That matters below.

**A2A is genuinely two-party** (`CADS-Tunnel/crates/common/src/a2a.rs`,
`crates/common/src/upgrade.rs`). `a2a_initiate`/`a2a_respond_verified` run one `Noise_IK` session
between exactly two pinned holder keys over a relay-admitted channel. `UpgradeMsg`
(`TAG_OFFER`/`TAG_READY`/`TAG_ABORT`, `upgrade.rs`) upgrades that *specific pair's* transport from
relay to a direct path — it is not a routing layer and never touches a third party. Confirmed in
`ct-agent`'s own caller, `native/src/channel_run/connectivity.rs::run_channel_session_upgradable`:
whether an upgrade is even *attempted* is decided per-process by whether the caller passed a
`direct_listener`/`own_direct_endpoint` (a **local network-capability fact**, resolved by how
`ct-agent channel` was invoked) — there is no signed, manifest-level, or topology-level flag
anywhere in the code that forces or forbids the attempt. **An N-agent, M-edge topology is exactly M
independent pairwise channels; there is no multi-hop relay through a third agent.** This is restated
in the honesty-constraint section below because it drives a concrete schema choice, not just prose.

## Schema shape

A new type, `CompositionManifest`, in the same crate and style as `ServiceManifest` — new domain
separator (`cads-composition-manifest-v1`, never reused), same `Preimage` discipline, same
`publisher_pubkey`/`sign_new`/`is_valid` shape. It does not replace or modify `ServiceManifest`.

```rust
/// Which two declared nodes an edge connects, plus a local hint for whether the ct-agent
/// processes behind them should attempt the relay→direct upgrade (`ct_common::upgrade`) once
/// their channel is admitted. **This is advisory, not enforced by anything cryptographic or
/// server-side** -- see "Honesty constraint" below: today, whether an upgrade is attempted is a
/// per-process fact of whether that agent's own `ct-agent channel` invocation was given a dialable
/// direct endpoint, not something a manifest, topology, or channel can force. `AttemptDirect` here
/// means "the installer SHOULD configure both sides with a direct listener if their environment
/// allows it," nothing stronger.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeUpgradeHint {
    RelayOnly,
    AttemptDirect,
}

/// One declared A2A edge between two of this composition's sub-manifests, by their **index** into
/// `sub_manifests` -- see "Why symbolic indices, not real holder keys" below.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompositionEdge {
    pub a: u32,
    pub b: u32,
    pub upgrade_hint: EdgeUpgradeHint,
}

/// A content-addressed reference to one sub-manifest, resolved at install time via the registry's
/// `GET /manifests/:manifest_id`. Pins the EXACT signed bytes without embedding them (mirroring
/// `BundleRef`'s own url+sha256 pattern) -- see "Signing" below for why `signature` is the pin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubManifestRef {
    #[serde(with = "crate::hex::b32")]
    pub publisher_pubkey: [u8; 32],
    #[serde(with = "crate::hex::b32")]
    pub manifest_id: [u8; 32],
    /// The referenced `ServiceManifest`'s OWN signature. Not re-verified here -- committing to it
    /// is what makes tampering with the fetched manifest detectable; see "Signing".
    #[serde(with = "crate::hex::b64")]
    pub signature: [u8; 64],
    /// Registry base URL to fetch this sub-manifest from at install time -- same
    /// "content hash pins correctness, URL is just where to look" split as `BundleRef.url`.
    pub registry_url: String,
}

pub struct CompositionManifest {
    #[serde(with = "crate::hex::b32")]
    pub publisher_pubkey: [u8; 32],
    #[serde(with = "crate::hex::b32")]
    pub composition_id: [u8; 32],
    pub name: String,
    pub version: String,
    /// Ordered; an edge's `a`/`b` are indices into this Vec. Order is part of the signed
    /// preimage, so an installer cannot reorder sub-manifests to make an edge mean something else.
    pub sub_manifests: Vec<SubManifestRef>,
    pub edges: Vec<CompositionEdge>,
    pub issued_at: u64,
    pub expires_at: u64,
    #[serde(with = "crate::hex::b64")]
    pub signature: [u8; 64],
}
```

### Why symbolic indices, not real holder keys, in `edges`

This is the central design fork, and it falls directly out of reading `topology.rs`'s own module
doc: **a topology node id IS the deployed agent's own holder key**, and that key is generated (or
otherwise comes to exist) by the running `ct-agent` process *at provisioning time*, on the
installing user's own infrastructure. The marketplace publisher who authors a composition manifest
has no way to know, in advance, what holder key the installer's freshly-spun-up agent instances will
end up using — those keys don't exist yet when the manifest is signed. (Contrast this with a human
manually drawing an edge in the Topology Editor today: both endpoints are already-provisioned agents
with real keys the human already knows.)

So a composition manifest can only describe the *shape* of the wiring (`sub_manifests[0]` talks to
`sub_manifests[1]`), never the real endpoints. Resolving symbolic → real is necessarily an
install-time step — see "Install flow" below.

### Why `SubManifestRef` pins by `signature`, not a separate hash

`ServiceManifest.signature` is already a commitment to the *entire* signed content (ADR-0001's
`signing_bytes` covers every field). Under EdDSA, an attacker cannot produce a second, different
manifest body that verifies against the same `(publisher_pubkey, manifest_id, signature)` triple
without an actual second private key or a broken signature scheme — so referencing that triple pins
the sub-manifest's exact bytes exactly as effectively as a fresh SHA-256 over its serialized form
would, without inventing a second hashing/serialization-canonicalization scheme this crate doesn't
already have (`ServiceManifest` has no defined canonical JSON form; `BundleRef.sha256` hashes raw
tarball bytes, a genuinely different problem). This also means verification never needs to
re-derive or trust a hash function choice — it just re-checks `is_valid()` on whatever was fetched
and compares the triple.

## Signing

`CompositionManifest::signing_bytes` (same `Preimage` builder, vendored, as `ServiceManifest`):
domain, `publisher_pubkey`, `composition_id`, `name`, `version`, then `u32` count of
`sub_manifests` followed by each ref's `publisher_pubkey ‖ manifest_id ‖ signature ‖ var_bytes(registry_url)`,
then `u32` count of `edges` followed by each edge's `u32(a) ‖ u32(b) ‖ tag(upgrade_hint)`, then
`issued_at`/`expires_at`. Exactly `ServiceManifest`'s discipline: field order is part of the signed
meaning, variable-length fields length-prefixed, nothing new invented.

**Two independent signatures, two independent questions, deliberately not merged** (mirrors
ADR-0001's "issuance vs. trust" separation, one level up):

1. `composition.is_valid(now)` answers: *is this exact list of sub-manifest references and this
   exact edge list what the composition's publisher actually signed, and is it still current?*
   Tampering with either the ref list (swap a sub-manifest, reorder them, add/remove an edge, flip
   an edge's endpoints or upgrade hint) breaks this signature — it covers all of it.
2. For each `SubManifestRef`, fetching `GET {registry_url}/manifests/{manifest_id_hex}` and
   checking `(fetched.publisher_pubkey, fetched.manifest_id, fetched.signature) ==
   (ref.publisher_pubkey, ref.manifest_id, ref.signature)` **and** `fetched.is_valid(now)` answers a
   *separate* question: *is the specific sub-manifest this composition pins still itself a
   validly-signed, unexpired manifest?* A composition's own signature being valid says nothing
   about whether its pinned sub-manifests are still current — a sub-manifest can expire on its own
   schedule without the composition being re-signed, and that MUST surface as "this composition is
   stale," not be silently ignored.

Neither check alone is sufficient, same as `ServiceManifest.is_valid` alone was never sufficient
grounds to run `docker compose up` — `installer-engine` (or whatever activates a composition) needs
composition-signature validity, per-sub-manifest-ref-match, per-sub-manifest own validity, AND the
existing separate publisher-allowlist trust check, applied to **every** `publisher_pubkey` involved
(the composition's own, and each distinct sub-manifest publisher — see open questions on whether a
composition may reference sub-manifests from publishers other than itself).

**Updating one sub-manifest** (a new version of one agent in the pipeline) requires re-signing the
*whole* composition with the new `SubManifestRef` — there is no partial-update path, by design:
the composition's signature is exactly the thing that makes "this specific set of N agents wired
this specific way" a single auditable, tamper-evident unit. That is the point, not a gap.

## Honesty constraint

Every artifact this design produces — the schema's own doc comments (above), and any UI/CLI output
`installer-engine` or a future marketplace dashboard renders for a composition — MUST describe
`edges` as **M independent pairwise A2A channels**, never as "a mesh," "routing," or "the topology
delivers a message from A to C via B." Concretely:

- No field or generated text implies multi-hop delivery. If a real use case wants A to reach C
  through B, that is an **application-level** relay the agent at B's own logic would have to
  implement over its own two direct A↔B and B↔C channels — completely outside what this manifest
  format (or the backbone A2A primitive it wires) provides today.
- The `upgrade_hint` field is named `_hint`, not `_policy` or `_mode`, precisely because — per the
  `connectivity.rs` reading above — nothing in the current stack lets a manifest, topology, or
  channel *force* the relay→direct upgrade; it can only ask the installer to *try* to give both
  sides a dialable direct endpoint if their deployment target (e.g. a real public host, vs. a NATed
  container) allows one. Any generated docs/UI must say "the installer will attempt X" not
  "this edge runs in X mode," since the latter overclaims a guarantee the backbone doesn't make.

## Install flow

For a composition manifest, in order:

1. **Verify.** `composition.is_valid(now)`, resolve and verify each `SubManifestRef` per "Signing"
   above, and run the existing publisher-allowlist trust check against every distinct
   `publisher_pubkey` present (composition's own + each sub-manifest's).
2. **Install each sub-manifest**, unchanged from today's single-agent flow — `installer-engine`'s
   existing per-`InstallerKind` logic (Compose/Binary), one activation per `sub_manifests[i]`. This
   is pure reuse; nothing about composition changes how ONE agent gets installed.
3. **Resolve symbolic → real.** Each successful activation's *own running `ct-agent` process*
   determines its real holder key (however that already happens today per-instance — this design
   doesn't change that). The installer must capture, per index `i`, the real 32-byte holder key
   that came up for `sub_manifests[i]`. This is new bookkeeping `installer-engine` doesn't have
   today (single-agent activation has no reason to remember "which holder key resulted"), but it's
   local, orchestration-only state — no new signed field, no wire-format change.
4. **Materialize the topology**, by orchestrating the *existing* `/me/topologies/*` REST surface,
   nothing new: `POST /me/topologies` once, `POST /me/topologies/:id/agents` once per resolved
   holder key, `POST /me/topologies/:id/edges` once per `CompositionEdge` (translating symbolic
   `a`/`b` indices to the real keys from step 3), then `PUT /me/topologies/:id/operator` to bind it
   so the edges actually authorize channel admission (per `topology_authorizes`) rather than sitting
   inert. This is the "right integration point" the task asked for: **no new backbone primitive is
   needed for the wiring itself** — it's a sequence of calls against what already ships.
5. Apply `upgrade_hint`s by configuring each installed agent's own launch (direct listener present
   or not) where the target environment allows it — advisory only, per the honesty constraint.

**Failure handling — DECIDED (operator, 2026-08-28): full rollback.** If any step from 2 onward
fails partway (a sub-manifest fails to install, or step 4's topology materialization itself fails
after all sub-manifests succeeded), every sub-manifest activation that DID succeed in this
composition-install attempt must be torn down — never leave a partial installation standing. This
means each per-`InstallerKind` activation this design reuses in step 2 must be reversible (an
uninstall/deactivate path `installer-engine` may not fully have today for every kind — worth
confirming during implementation, not assumed here), and the orchestrator owns calling that
teardown, in reverse order, the moment any later step fails.

### The gap this flow cannot paper over: who authenticates step 4

`/me/topologies/*` is OIDC-bearer, i.e. it authenticates a **logged-in human**, not an agent's
holder key. `installer-engine`'s existing model is explicitly **not** an interactive, logged-in
flow — manifests are activated locally with out-of-band secrets, no browser session in the loop.
Step 4 as written above needs *some* credential to call those endpoints on the installing user's
behalf, and nothing in `installer-engine` today holds one. Two honest options, neither designed
further here because both are genuinely backbone/auth questions:

- The install flow becomes interactive at this one step — prompt the operator to complete an OIDC
  login (or reuse an existing local session/token if `ct-agent` or the marketplace CLI already
  caches one somewhere) before it can call `/me/topologies/*`. Achievable with existing primitives,
  but changes today's "no login in the loop" install story for any composition manifest.
- Core adds an agent-key-authenticated variant of (at least) the topology-mutation endpoints, so an
  already-provisioned agent (or the marketplace installer acting with the operator's holder key
  directly) can wire itself into a topology without a human OIDC round-trip. **This would be a new
  backbone primitive** — flagged below, not designed here.

This is the single most load-bearing open question in this whole document; see "Open questions."

## What's achievable without core vs. what needs a new backbone primitive

**Achievable purely by orchestrating what already ships** (no core work needed):
- The `CompositionManifest` schema itself, its signing/verification (new crate-local type, same
  `Preimage` discipline).
- Per-sub-manifest install via existing `InstallerKind` executors.
- Topology/edge/operator-bind materialization via the existing `/me/topologies/*` REST surface,
  called in sequence by the installer — **provided** the installer already holds (or the operator
  supplies interactively) a valid OIDC bearer token for that surface.
- The relay-only vs. attempt-direct *hint*, since it only ever configures local process launch
  flags the installer already controls.

**Needs a new backbone-side primitive** (core's territory, proposal only, not designed here):
- Any non-interactive way for `installer-engine` to authenticate topology-mutation calls without a
  human OIDC session in the loop (the step-4 gap above) — e.g. an agent-key-signed variant of
  `POST /me/topologies/:id/agents`/`edges`/`operator`, analogous to how `ServiceManifest`/
  `SignedTask` already let a holder key stand in for a login elsewhere in this ecosystem.
- Anything resembling real multi-hop A2A delivery (explicitly out of scope for this design and,
  per the honesty constraint, not something this manifest format should imply exists).
- A registry endpoint to fetch a composition manifest itself (today's registry only knows
  `ServiceManifest`) — arguably marketplace-side, not backbone, but noted here since it's a
  prerequisite for `manifest activate --from-registry`-style composition installs to work the same
  way single-agent installs already do. Small, additive, same shape as existing `/manifests` routes.

## Worked example (prose, not a literal manifest)

A 3-agent demo pipeline: `ingest` (Compose, pulls from an external feed into a local queue),
`transform` (Compose, the actual model/processing step), and `publish` (Binary, pushes results
somewhere). The composition manifest would declare `sub_manifests = [ingest_ref, transform_ref,
publish_ref]` and `edges = [(0,1, RelayOnly), (1,2, AttemptDirect)]` — ingest talks to transform
over a relay-only channel (low-bandwidth control messages, no need to optimize the path), transform
talks to publish with a direct-upgrade hint (higher-volume result payloads, worth trying to avoid
the relay hop if both sides can manage a direct endpoint). Installing this one manifest would: spin
up all three services locally (or across whatever hosts the operator's `installer-engine` targets),
capture the three resulting holder keys, create one topology, assign all three agents into it, add
exactly those two edges, bind an operator key, and (network permitting) configure `transform` and
`publish`'s launches with direct listeners. What it explicitly would **not** do: let `ingest` push a
message that ends up at `publish` without transform's own code relaying it — there is no edge
`(0,2)`, and even if there were, it would be a third independent pairwise channel, not a route
through node 1.

## Decisions (operator, 2026-08-28)

1. **Step-4 authentication gap** — escalated directly to core (the only item here that's genuinely
   their call, not the operator's); awaiting their reply, not re-decided here.
2. **Cross-publisher compositions — ALLOWED.** The operator's condition was "needs security via
   version/checksum or similar" — already satisfied structurally: `SubManifestRef` doesn't pin a
   checksum, it pins the referenced manifest's own EdDSA **signature**, which is a full-content
   cryptographic commitment strictly stronger than a hash (nobody can produce a different manifest
   body that verifies against the same `(publisher_pubkey, manifest_id, signature)` triple without
   the actual private key). A composition bundling three other publishers' manifests is exactly as
   tamper-evident as one bundling only its own author's — the schema needed no change, only this
   note making the guarantee explicit rather than implicit.
3. **Partial-install-failure semantics — FULL ROLLBACK.** If sub-manifest 2 of 3 fails to install,
   tear down the ones that already succeeded (0 and 1) rather than leaving a partial topology
   installed. This is now a real requirement on `installer-engine`'s install-flow orchestration (see
   "Install flow" above) — each successful per-sub-manifest activation must be reversible, and the
   orchestrator must call that teardown on any later step's failure, including a failure in step 4
   (topology materialization) after all sub-manifests installed successfully.
4. **`upgrade_hint`'s honesty framing** — no operator input needed here; stands as documented
   (advisory hint, not enforceable policy, per the direct `connectivity.rs` reading above). A future
   reviewer closer to core's roadmap can revisit if a real per-channel policy flag lands.
5. **Composition versioning — EXACT-PIN STAYS for Phase 1.** Updating one sub-manifest requires
   re-signing/re-publishing the whole composition; no "latest"/version-range mode. Deliberate
   simplicity/tamper-evidence tradeoff, consistent with `BundleRef`'s own exact-`sha256` pin.
   Revisit only if a real update-ergonomics need surfaces later.
