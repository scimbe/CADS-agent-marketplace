// Partiebeginn zwischen zwei Geraeten (Bot = lokaler Partner, Live = Partner im Raum), kartenunabhaengig.
// Drei Nachrichten, damit niemand seine eigene verdeckte Austeilung "auswuerfeln" kann (Blum 1983, Coin flipping):
//   A -> B  hello { Karte, Parameter, Sitz q von A, sh = SHA-256(seedA), Commitments von A }
//   B -> A  join  { Nonce n, Commitments von B }        (B hat sich festgelegt, ohne seedA zu kennen)
//   A -> B  start { seedA }                               (A war schon vor n an seedA gebunden)
//   seed = SHA-256(seedA | n)[0..32]  – beide rechnen dieselbe Partie aus.
import { sha256 } from "./sdk.js";
import { makeSecrets, newSession, playerCount, GameError } from "./session.js";

export function finalSeed(seedA, nonce) { return sha256(seedA + "|" + nonce).slice(0, 32); }
function others(card, q) { const out = []; for (let s = 0; s < playerCount(card); s++) if (s !== q) out.push(s); return out; }

function seatOk(card, q) { return Number.isInteger(q) && q >= 0 && q < playerCount(card); }
export function hello(card, params, q, rand) {
  if (!seatOk(card, q)) throw new GameError("eingabe", "Sitz " + q);
  const seedA = rand[0];
  const { secrets, commits } = makeSecrets(card, [q], () => rand[1]);
  const msg = { t: "hello", c: card.manifest.id, v: card.manifest.version, p: params, q, sh: sha256(seedA), k: commits };
  return { msg, local: { seedA, secrets, mine: [q], commits } };
}

export function join(card, hi, rand) {
  if (hi.c !== card.manifest.id || hi.v !== card.manifest.version) throw new GameError("version");
  // Schema erlaubt q bis 9; die Karte bestimmt die Sitzzahl (Review LOW)
  if (!seatOk(card, hi.q) || !Array.isArray(hi.k) || hi.k.length !== playerCount(card)) throw new GameError("eingabe", "Sitz/Commitments");
  // Gruppe (ADR 0001 f, Stufe 2): der Gastgeber nennt den Sitz dieses Gastes (g); zu zweit alle anderen Sitze
  if (hi.g !== undefined && (!seatOk(card, hi.g) || hi.g === hi.q)) throw new GameError("eingabe", "Gastsitz");
  const mine = hi.g !== undefined ? [hi.g] : others(card, hi.q), nonce = rand[0];
  const { secrets, commits } = makeSecrets(card, mine, () => rand[1]);
  const merged = hi.k.slice(); for (const s of mine) merged[s] = commits[s];
  return { msg: { t: "join", n: nonce, k: commits }, local: { nonce, secrets, mine, commits: merged, sh: hi.sh, params: hi.p, group: hi.g !== undefined, hostSeat: hi.q } };
}

export function start(card, params, local, jn) {
  if (!Array.isArray(jn.k) || jn.k.length !== playerCount(card)) throw new GameError("eingabe", "Commitments");
  const commits = local.commits.slice();
  for (let s = 0; s < commits.length; s++) if (!local.mine.includes(s)) commits[s] = jn.k[s] === undefined ? null : jn.k[s];
  const session = newSession(card, { params, seed: finalSeed(local.seedA, jn.n), mine: local.mine, secrets: local.secrets, commits });
  return { msg: { t: "start", s: local.seedA }, session };
}

export function begin(card, local, st) {
  if (sha256(st.s) !== local.sh) throw new GameError("betrug", "seedA passt nicht zu hello");
  if (local.group) return beginGroup(card, local, st);
  return newSession(card, { params: local.params, seed: finalSeed(st.s, local.nonce), mine: local.mine, secrets: local.secrets, commits: local.commits });
}

// ---------- Gruppe mit 3 bis 10 Sitzen (ADR 0001 f, Stufe 2) ----------
// Stern um den Gastgeber (ein Kanal je Gast, wie Altcode table.js inviteAll). Gleiche Bindung wie zu zweit:
//   Gastgeber -> jeder Gast  hello { …, q, sh = SHA-256(seedA), k, g = Sitz des Gastes }
//   Gast -> Gastgeber        join  { n, k }                 (jeder Gast legt sich fest, ohne seedA zu kennen)
//   Gastgeber -> alle Gaeste start { s = seedA, j = [{q, n}] nach Sitz, k = alle Commitments }
//   seed = SHA-256(seedA | n(q1) | n(q2) | …)[0..32] in Sitzreihenfolge – niemand kann die Austeilung waehlen.
export function groupSeed(seedA, nonces) { return sha256([seedA, ...nonces].join("|")).slice(0, 32); }

/** hello je Gastsitz; local haelt seedA, eigene Salze und die erwarteten Gaeste. */
export function helloGroup(card, params, q, rand) {
  const r = hello(card, params, q, rand), guests = others(card, q);
  return { msgs: guests.map((g) => ({ to: g, msg: { ...r.msg, g } })), local: { ...r.local, guests, joins: {} } };
}
/** join eines Gastes verbuchen; sind alle da, entsteht die Partie und die start-Nachricht fuer alle. */
export function joinGroup(card, params, local, fromSeat, jn) {
  if (!local.guests.includes(fromSeat)) throw new GameError("eingabe", "unbekannter Gast");
  if (local.joins[fromSeat]) throw new GameError("abweichung", "zweites join");
  if (!Array.isArray(jn.k) || jn.k.length !== playerCount(card)) throw new GameError("eingabe", "Commitments");
  const joins = { ...local.joins, [fromSeat]: jn }, next = { ...local, joins };
  if (Object.keys(joins).length < local.guests.length) return { local: next, done: false };
  const commits = local.commits.slice();
  for (const g of local.guests) commits[g] = joins[g].k[g] === undefined ? null : joins[g].k[g];
  const j = local.guests.map((g) => ({ q: g, n: joins[g].n }));
  const seed = groupSeed(local.seedA, j.map((x) => x.n));
  const session = newSession(card, { params, seed, mine: local.mine, secrets: local.secrets, commits });
  return { local: next, done: true, session, msg: { t: "start", s: local.seedA, j, k: commits } };
}
function beginGroup(card, local, st) {
  if (!Array.isArray(st.j) || !Array.isArray(st.k) || st.k.length !== playerCount(card)) throw new GameError("eingabe", "start");
  const me = local.mine[0], mineJ = st.j.find((x) => x.q === me);
  if (!mineJ || mineJ.n !== local.nonce) throw new GameError("betrug", "eigene Nonce fehlt im start");
  const order = st.j.map((x) => x.q);
  for (let i = 1; i < order.length; i++) if (order[i] <= order[i - 1]) throw new GameError("eingabe", "Reihenfolge");
  // Review L9: jeder Gastsitz genau einmal, gueltige Sitze, der Gastgeber nicht unter den Gaesten
  const want = others(card, local.hostSeat);
  if (order.length !== want.length || order.some((q, i) => q !== want[i] || !seatOk(card, q))) throw new GameError("eingabe", "Gaeste unvollstaendig");
  if (st.k[me] !== local.commits[me]) throw new GameError("betrug", "eigenes Commitment veraendert");
  const commits = st.k.slice();
  return newSession(card, { params: local.params, seed: groupSeed(st.s, st.j.map((x) => x.n)), mine: local.mine, secrets: local.secrets, commits });
}
