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
  // Schema erlaubt q bis 7; die Karte bestimmt die Sitzzahl (Review LOW)
  if (!seatOk(card, hi.q) || !Array.isArray(hi.k) || hi.k.length !== playerCount(card)) throw new GameError("eingabe", "Sitz/Commitments");
  const mine = others(card, hi.q), nonce = rand[0];
  const { secrets, commits } = makeSecrets(card, mine, () => rand[1]);
  const merged = hi.k.slice(); for (const s of mine) merged[s] = commits[s];
  return { msg: { t: "join", n: nonce, k: commits }, local: { nonce, secrets, mine, commits: merged, sh: hi.sh, params: hi.p } };
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
  return newSession(card, { params: local.params, seed: finalSeed(st.s, local.nonce), mine: local.mine, secrets: local.secrets, commits: local.commits });
}
