# ADR-0004: Phone-to-phone channels with one tap to invite and one tap to accept

## Status

Proposed. The core and its end-to-end proof exist (`crates/mobile-core/src/peer`, feature `peer`,
`scripts/peer-e2e.sh`). No app has a UI for it, nothing runs against production, and the open
decisions at the end are the owner's.

File references name `scimbe/CADS-Tunnel` as `Tunnel:`, `scimbe/ct-agent` as `ct-agent:` and
`scimbe/CADS-a2a-demo` as `a2a:`.

## Context: what the code does today

**How a channel comes to be.** `channel_id_for_link(operator, holder_a, holder_b)`
(`Tunnel:crates/common/src/channel.rs:50`) derives the id. `POST /me/channels` binds it to the
operator public key under the verified OIDC subject, `POST /me/channels/:c/members` adds a holder
with its attested Noise key (`Tunnel:crates/control-plane/src/service.rs:983`,`:3487`). The operator
signs a `ChannelGrant` per member (`channel.rs:235`). Nordwind runs exactly this sequence
(`a2a:nordwind/scripts/nordwind-provision.sh`).

**Who may create one.** Only a bearer of a verified subject or portal session
(`subject_of_channel`, `service.rs`). Per-account cap `max_channels`, default 100. There is no
anonymous registration; ADR-0022 of CADS-Tunnel moved the hosted default to real Keycloak accounts.

**Who may join one: no account needed.** `POST /channel/invite/challenge` and `/redeem`
(`service.rs:4347`) are public and proof-gated: an operator-signed `SignedChannelInvitation`, the
invitee's signature, the attested Noise key. Single use is recorded by the control plane, expiry is
signed. That is the finding this design rests on. Revoking a grant needs no session either: the
operator signature alone suffices (`POST /channel/:c/grant-revoke`, `service.rs:3853`).

**Identity and keys.** Holder keys (ed25519) and Noise keys (X25519) are client-generated. The
operator key is agent-held; the control plane stores only public keys (ADR-0020, "Key custody").
The edge admits on grant signature, membership lookup at the control plane, a fresh possession
challenge and the revocation list (`Tunnel:crates/edge/src/channel_authorize.rs`,
`grant_revocation.rs`).

**What is end to end.** Noise_IK between the two members (`Tunnel:crates/common/src/a2a.rs`). The
edge relays ciphertext. It does see the metadata: channel id, holder keys, IP addresses, timing and
sizes. The control plane knows channel owner and members. Noise_IK's static keys are not forward
secret against their own compromise (`noise.rs`).

**Transports on a phone.** Direct QUIC ports need UDP and inbound reachability, which CGNAT and a
short-lived app do not offer. Mixed pairs never meet, because QUIC and `:443` run separate pairers
(ADR-0020 §4a, `ct-agent:docs/channel.md` "Pairing reality"); this is why `NW_FRONT_DOOR_ONLY=1` is
mandatory for Nordwind. The `:443` front door and the WebSocket listener share one pairer, are
outbound only and need no open port. A phone therefore speaks **front door only and stays
relay-only**.

**Background limits.** Pairing is a rendezvous: both members must be connected at the same moment
(park lease 30 s, re-park after that, `ct-agent:docs/channel.md`). There is no store and forward and
no delivery acknowledgement. Android and iOS stop a background app's sockets within minutes at best,
and neither repository has a push path. So a session lives while both apps are in the foreground.

**Does ct-agent run in the app?** The binary does not and should not: `ct-agent:native/Cargo.toml`
carries libp2p, QUIC, ACME, the installer and the harness, and ADR-0002's "ct-agent core on Android"
was never built. What is needed is smaller and already separate: `ct-common` holds the normative
join protocol (`channel_wire`, stream-generic) and Noise. `mobile-core` depends on it directly, and
it compiles for wasm32 too, so a web client can follow.

## Decision

### The contract

Inviter taps "Einladen" and gets a link or QR code. Recipient taps "Annehmen". Both have a channel
with no further step. "Trennen" works at any time. No phone numbers, no address book, no search, no
way to find strangers.

### The slot key

The link fragment carries a fresh **slot** key. It serves as the invitation's invitee identity, as
the holder of a grant the inviter signed in advance, and as the attester of the Noise key the
recipient generates at acceptance. Consequences:

- **The recipient needs no account and the inviter need not be online** at acceptance, with no
  control-plane change.
- **The control plane cannot substitute keys.** The fragment never reaches a server, and the
  inviter's holder and Noise key come from the link, so the recipient pins them directly. In the
  other direction the inviter checks the attestation by the slot key. A swapped key fails before any
  Noise message (`verified_peer_key`).
- **The link is a capability** and the first redeemer wins. The real recipient then sees "already
  used", and the verification code would differ. Both are visible, neither is silent.
- **Keys are fresh per contact**, so the edge cannot link one phone's contacts by key. The control
  plane still sees the inviter's account behind each channel.

The inviter knows the slot secret. That only lets it impersonate the recipient towards itself.

Remaining weakness: a leaked link also leaks the slot's holder key after use. A holder of it cannot
complete Noise, since the Noise key is pinned, but it can occupy the rendezvous. The fix is a rotation
to a recipient-chosen holder key inside the first session.

The link is 392 characters (273 bytes of payload), which fits a QR code of about version 14 at
level L. Lifetime is 10 minutes by default, 15 at most, the bound of the existing claim invites.

### Verification and blocking

Both sides show the same eight-digit code derived from channel id and both Noise keys, stretched by
2^16 hash rounds. It is optional. It defeats a swapped link, except for an attacker who grinds keys
in advance (about 2^42 hashes), so handing over the QR code in person remains the strong path.
"Blockieren" is "Trennen" plus a local entry: the keys are deleted, and there is nothing left to find
this phone by.

### Trennen

- Inviter: operator-signed grant revocation. Needs no login. Measured: the edge refuses with
  `grant-revoked`.
- Recipient: `bye` while connected, then the keys are deleted. Effective at once, since nothing can
  reach a phone that no longer joins. The inviter only learns of it through `bye`; a holder-signed
  leave route closes that gap and is proposed separately in CADS-Tunnel.

### What may cross a channel

`policy.rs` makes this a matter of data shape. The envelope has five variants: text, app message for
an allow-listed namespace, capability request, capability result, bye. Unknown fields are refused, so
a request cannot smuggle arguments. There is no variant naming a tool or command. A listed
capability only produces a question to the user; `Policy::approve`, called after a tap, is the only
path by which capability data becomes an envelope. Unlisted capabilities get an automatic refusal
without bothering the user.

## Alternatives considered

- **Claim invites** (`POST /me/channels/:c/claim-invites`): need a portal session on the recipient
  and the recipient's keys before the link exists. Wrong order for a QR code.
- **Grant by deposit** (`/me/channels/:c/grants/:holder`): pickup needs a portal session.
- **Mint the grant after redemption**: needs the inviter online at the same moment, and a pickup
  route. The pre-signed grant needs neither.
- **The whole ct-agent in the app**: see above. It also could not keep a port or a process alive.
- **WebRTC data channels**: hide nothing from a TURN relay's cost, and add ICE for short texts.
  The call feature uses the channel for signalling only.

## Abuse and youth protection (technical assessment, not legal advice)

Holding up: no discovery of any kind, invitation only, a contact exists only after two taps, blocking
is unilateral and final, links die after one use or 10 minutes, no account data of the recipient.

Not solved by this design:

- **Moderation cannot see content.** That is the point of end-to-end encryption, and for 14-to-24
  users it needs a decision. The technical offer is a report that the reporter's own app forwards in
  plaintext; it is not built.
- **Links escape.** A link posted in a group goes to the fastest tapper. The screen before "Annehmen"
  must therefore say that the sender is unverified, and a QR code in person is the preferred path.
- **Free-text is the risk surface.** A channel limited to structured app messages at first (ideas,
  duels, no free text, no media) removes most grooming and image-abuse paths. Text is on in the
  prototype so that delivery can be proven, not because the product needs it.
- **Identity of the recipient is unknown by construction**, including its age.

Age limits, parental consent, reporting duties and retention need legal review; none was done here.

## Load and cost (estimates)

One text message costs roughly 200 bytes on the wire; the e2e run used 1263 bytes per phone for join
and six messages (measured). With 1000 daily users, three minutes of foreground time each and 50
messages: about 2 parked or paired connections on average, about 20 at peak (assumed factor 10), and
10 MB of relay traffic a day. That is far below the edge's default 4096 channel-broker connections.

The load that matters is not the bytes:

- Each park is a TLS handshake plus one control-plane authorize round trip, every 30 s per
  foreground phone. At the peak above: about 40 authorize calls a minute. Cached refusals cover
  retry storms (`channel_authorize.rs`), a success is looked up fresh.
- Each contact is a row at the control plane and counts against `max_channels`. An invite never
  accepted stays until deleted, so the app must delete expired ones.
- Calls and media are not in this estimate. Relaying them is the real cost and a separate design.

Limits, with what exists marked:

| Where | Limit | State |
|---|---|---|
| Inbound messages per session | 120 a minute, 32 KiB each, 8 open requests | built, `policy.rs` |
| Refused joins per IP | penalty window | exists, `state.rs` `JoinRefusalPenalty` |
| Channels per account | 100 | exists |
| `/channel/invite/challenge` per IP | 20 a minute | exists, off unless `CT_CP_UNAUTH_WRITE_PER_MIN` is set |
| `/channel/invite/redeem` per IP | 20 a minute | missing, proof-gated but unmetered |
| Invites per account | 10 an hour | missing, control-plane change |
| Re-park cadence | only in the foreground, backoff after 5 minutes alone | app, not built |

`UNAUTH_WRITE_PATHS` (`Tunnel:crates/control-plane/src/service.rs:6551`) is the throttle for public
writes. It is off by default, and the production value was not checked here.

## Consequences

Both phones must be open at once. "Agent channels" in the sense of an agent acting while its owner is
away do not exist on a phone without a wake-up path. Real asynchronous delivery needs push and a
ciphertext mailbox, both new services with their own metadata.

`mobile-core` gains a `ct-common` dependency behind the feature `peer`. The default build is
unchanged. `ct-common` pulls `quinn` on native targets although this path never dials QUIC; an
optional feature in `ct-common` could shed it.

The local e2e path uses the bare `ct-edge-channel` ALPN, so parks expire on the 30 s lease. The `-ka`
ALPN with its keepalive ticks is worth adopting before real networks, where a silent idle
connection may be cut.

## To verify before moving to Accepted

- On real devices and carrier networks: the front door from behind CGNAT, and session survival across
  a network change. Nothing here ran on a phone. The e2e proof is two processes on loopback.
- `:443` reachability of the channel ALPN on the production edge. Deliberately not probed.
- That a `cads-mobile` access token passes `/me/channels` on the production verifier (Tunnel PR #882
  is open, `CT_OIDC_ACCESS_AUD` must not exclude it).
- The link handler: the page at `bunsenbrenner.org/p` and the App Link entries do not exist yet.

## Open decisions

1. Does the inviter need an account? Today yes, for one call (`POST /me/channels`). The alternative
   is a device-bound owner, which reverses CADS-Tunnel ADR-0022 for this route and needs its own
   abuse limits.
2. Free text or structured messages only for the youth audience.
3. Push and mailbox: stay "both online", or build asynchronous delivery.
4. Reporting path for end-to-end encrypted content.
