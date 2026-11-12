// Bots fuer den Tisch. Stufe 1 = der Auto-Zug des Altcodes (Regeln auto(): passen, Handspiel in der laengsten Farbe,
// immer die schwaechste erlaubte Karte). Stufe 2/3 = Reizen und Ansagen nach einfachen Kartenregeln, Kartenspiel per
// ISMCTS (Single-Observer, Cowling/Powley/Whitehouse 2012) auf Regelebene: verdeckte Karten werden aus der Sicht des
// Sitzes ausgelost (Determinisierung, mit erkannten Fehlfarben), die Krypto-Schritte des Gebens spielen keine Rolle.
// Gleiche Struktur wie src/bot/ismcts.js, aber mit Belohnung je Partei (Alleinspieler/Gegenspieler, Re/Kontra).
// Zufall nur aus dem Seed: gleicher Seed => gleicher Zug.
import { rng as mkRng, canon, logD } from "../../contract/sdk.js";

export const ITER = { 1: 0, 2: 250, 3: 900 };
const C = 0.7;

// ---------- Sicht -> bekannte Karten ----------
function playedCards(r) { const out = []; for (const t of r.tricks.concat(r.trick ? [r.trick] : [])) for (const x of t.cards) out.push(x); return out; }
function countBy(list) { const m = {}; for (const c of list) m[c] = (m[c] || 0) + 1; return m; }
function minus(pool, take) { const m = countBy(take), out = []; for (const c of pool) { if (m[c]) m[c]--; else out.push(c); } return out; }
function follows(T, r, c) {
  if (T.game === "doko") return T.R.isTrump(r.kind, c) ? "T" : c[0];
  return T.R.suitOf(r.contract ? r.contract.game : "G", c);
}
// Fehlfarben: wer nicht bedient hat, hat die Farbe nicht mehr
function voids(T, r) {
  const v = []; for (let s = 0; s < T.n; s++) v.push({});
  for (const t of r.tricks.concat(r.trick ? [r.trick] : [])) {
    if (!t.cards.length) continue;
    const led = follows(T, r, t.cards[0].card);
    for (const x of t.cards.slice(1)) if (follows(T, r, x.card) !== led) v[x.seat][led] = true;
  }
  return v;
}

/** Eine Welt mit vollen Haenden passend zur Sicht von seat. Rueckgabe { r, hands, skat, downs } */
function sample(T, obs, seat, mine, rand) {
  const R = T.R, r = obs.pub.r, n = T.n, played = playedCards(r);
  if (T.game === "bauernskat") {
    // offen liegt alles Spielbare; verdeckt sind nur die unteren Karten
    const seen = [];
    r.stacks.forEach((row) => row.forEach((x) => { if (x.top) seen.push(x.top); }));
    const pool = rand.shuffle(minus(R.DECK, seen.concat(played.map((x) => x.card))));
    let k = 0; const downs = r.stacks.map((row) => row.map((x) => (x.under ? pool[k++] : null)));
    return { r, downs };
  }
  const my = T.myCards(obs, seat);
  const counts = [];
  for (let s = 0; s < n; s++) counts.push(R.HAND - played.filter((x) => x.seat === s).length);
  const d = r.declarer;
  if (T.game === "skat" && r.pickedUp && d >= 0) counts[d] += 0; // gedrueckt: Hand hat wieder 10
  const known = my.concat(played.map((x) => x.card));
  if (r.open) for (const c of r.open) if (!known.includes(c) && seat !== d) known.push(c);
  let mineDown = [];
  if (T.game === "skat" && seat === d && r.pickedUp && mine.pushed) mineDown = mine.pushed.map((p) => R.DECK[mine.hand[p]]);
  const pool0 = minus(R.DECK, known.concat(mineDown));
  const vd = voids(T, r);
  for (let tries = 0; tries < 40; tries++) {
    const pool = rand.shuffle(pool0), hands = [];
    let k = 0, ok = true;
    for (let s = 0; s < n; s++) {
      if (s === seat) { hands.push(my.slice()); continue; }
      let h;
      if (r.open && s === d && seat !== d) h = r.open.filter((c) => !played.some((x) => x.card === c));
      else { h = []; while (h.length < counts[s]) h.push(pool[k++]); }
      if (tries < 39 && h.some((c) => vd[s][follows(T, r, c)])) ok = false;
      hands.push(h);
    }
    if (!ok) continue;
    const rest = pool.slice(k);
    return { r, hands, skat: mineDown.length ? mineDown : rest.slice(0, 2) };
  }
  return null;
}

// ---------- Simulation auf Regelebene ----------
function simMoves(T, w) {
  const R = T.R, r = w.r, s = R.turn(r);
  if (s < 0) return [];
  const hand = T.game === "bauernskat" ? R.tops(r, s) : w.hands[s];
  return R.actions(r, s, hand).filter((a) => a.t === "play" && a.seat === s);
}
function simStep(T, w, a) {
  const R = T.R, x = R.apply(w.r, a);
  if (!x.ok) return null;
  let r = x.state;
  if (T.game === "bauernskat") {
    const downs = w.downs.map((row) => row.slice());
    for (const f of R.reveals(r)) { const y = R.apply(r, { t: "turn", seat: f.seat, i: f.i, card: downs[f.seat][f.i] }); if (y.ok) { r = y.state; downs[f.seat][f.i] = null; } }
    return { r, downs };
  }
  const hands = w.hands.slice(); hands[a.seat] = hands[a.seat].slice(); hands[a.seat].splice(hands[a.seat].indexOf(a.card), 1);
  return { r, hands, skat: w.skat };
}
// Belohnung je Sitz in [0,1]: Sieg der eigenen Partei zaehlt, die Augen geben Feinheit
function rewardOf(T, w, seat) {
  const R = T.R, r = w.r, eyes = (cards) => cards.reduce((a, c) => a + R.EYES[c[1]], 0);
  const team = new Array(T.n).fill(0), e = new Array(T.n).fill(0);
  for (const t of r.tricks) e[t.winner] += eyes(t.cards.map((x) => x.card));
  if (T.game === "doko") {
    let re;
    if (r.kind === "normal") re = w.hands.map((h, s) => h.includes("CQ") || playedCards(r).some((x) => x.seat === s && x.card === "CQ"));
    else re = team.map((_, s) => s === r.soloist || s === r.partner);
    const reEyes = e.reduce((a, x, s) => a + (re[s] ? x : 0), 0), mineRe = re[seat];
    const my = mineRe ? reEyes : 240 - reEyes, need = mineRe ? 121 : 120;
    return (my >= need ? 0.6 : 0) + 0.4 * my / 240;
  }
  const total = 120, d = r.declarer;
  if (r.contract && r.contract.ramsch) return 1 - e[seat] / total;
  if (r.contract && r.contract.game === "N") { const lost = r.tricks.some((t) => t.winner === d); return (seat === d) === !lost ? 1 : 0; }
  let de = e[d]; if (T.game === "skat") de += eyes(w.skat || []);
  const my = seat === d ? de : total - de, won = seat === d ? de >= 61 : de < 61;
  return (won ? 0.6 : 0) + 0.4 * my / total;
}

function ismcts(T, obs, seat, mine, legal, iterations, seed) {
  const r0 = mkRng("tisch-bot|" + seed), key = (a) => a.card;
  const root = { visits: 0, avail: 0, wins: 0, kids: new Map(), move: null, who: -1 };
  for (let it = 0; it < iterations; it++) {
    let w = sample(T, obs, seat, mine, r0);
    if (!w) break;
    let node = root; const path = [root];
    for (let depth = 0; depth < 64; depth++) {
      if (T.R.done(w.r)) break;
      const ms = simMoves(T, w); if (!ms.length) break;
      const who = T.R.turn(w.r);
      for (const m of ms) { const c = node.kids.get(key(m)); if (c) c.avail++; }
      const untried = ms.filter((m) => !node.kids.has(key(m)));
      if (untried.length) {
        const m = untried[r0.int(untried.length)], child = { visits: 0, avail: 1, wins: 0, kids: new Map(), move: m, who };
        node.kids.set(key(m), child); w = simStep(T, w, m) || w; path.push(child); node = child; break;
      }
      let best = null, bv = -1;
      for (const m of ms) { const c = node.kids.get(key(m)); const v = c.wins / c.visits + C * Math.sqrt(logD(c.avail) / c.visits); if (v > bv) { bv = v; best = c; } }
      w = simStep(T, w, best.move) || w; path.push(best); node = best;
    }
    for (let d = 0; d < 64 && !T.R.done(w.r); d++) { const ms = simMoves(T, w); if (!ms.length) break; const nx = simStep(T, w, ms[r0.int(ms.length)]); if (!nx) break; w = nx; }
    for (const p of path) { p.visits++; if (p.who >= 0) p.wins += rewardOf(T, w, p.who); }
  }
  let best = legal[0], bv = -1;
  for (const a of legal) { const c = root.kids.get(key(a)); const v = c ? c.visits : 0; if (v > bv) { bv = v; best = a; } }
  return best;
}

// ---------- Kartenregeln fuer Reizen und Ansagen ----------
const JACKS = ["CJ", "SJ", "HJ", "DJ"];
function skatGame(Sk, cards) {
  // beste Ansage aus den eigenen Karten: Grand mit Buben und Assen, sonst die Farbe mit den meisten Truempfen
  const jacks = cards.filter((c) => c[1] === "J").length, aces = cards.filter((c) => c[1] === "A").length;
  const tens = cards.filter((c) => c[1] === "T" && cards.includes(c[0] + "A")).length;
  let best = null;
  for (const g of ["C", "S", "H", "D"]) {
    const tr = cards.filter((c) => Sk.isTrump(g, c)).length, side = aces - (cards.includes(g + "A") ? 1 : 0);
    const strength = tr * 2 + jacks + side * 1.5 + tens;
    if (!best || strength > best.strength) best = { game: g, strength, trumps: tr };
  }
  const grand = { game: "G", strength: jacks * 3 + aces * 2 + tens * 1.5, trumps: jacks };
  if (jacks >= 3 && aces >= 2 || jacks >= 2 && aces >= 3 && tens >= 2) best = grand;
  const ok = best.game === "G" ? true : best.trumps >= 5 || (best.trumps >= 4 && jacks >= 2 && aces >= 1);
  const tp = Sk.tops(best.game, cards), value = Sk.BASE[best.game] * (tp.n + 1);
  return { ...best, ok, value };
}
function skatPush(Sk, cards) {
  let best = null;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const keep = cards.filter((_, k) => k !== i && k !== j), g = skatGame(Sk, keep), pushed = [cards[i], cards[j]];
    if (pushed.some((c) => c[1] === "J" || Sk.isTrump(g.game, c))) continue;
    const suits = ["C", "S", "H", "D"].filter((s) => s !== g.game && !keep.some((c) => c[0] === s && c[1] !== "J")).length;
    const loose = keep.filter((c) => c[1] === "T" && !keep.includes(c[0] + "A") && !Sk.isTrump(g.game, c)).length;
    const v = g.strength * 2 + suits * 3 + Sk.eyes(pushed) * 0.3 - loose * 2;
    if (!best || v > best.v) best = { v, pushed };
  }
  return best ? best.pushed : cards.slice(0, 2);
}

/** Zug fuer seat. Rueckgabe: eine Eingabe aus T.moves(obs, seat). */
export function botMove(T, obs, seat, { level = 2, seed = "" } = {}) {
  const legal = T.moves(obs, seat);
  if (legal.length <= 1) return legal[0] || null;
  const pub = obs.pub, mine = obs.mine, R = T.R;
  if (pub.ph === "next") return legal.find((m) => m.t === "next");
  const r = pub.r, cards = T.myCards(obs, seat), auto = R.auto(r, seat, cards);
  const pick = (a) => { if (!a) return null; const m = a.t === "push" ? null : T.toInput(obs, seat, a); return m && legal.find((x) => canon(x) === canon(m)); };
  const pushFor = (pair) => legal.find((m) => m.t === "push" && m.c === T.pushCommit(mine.sec.k, ...pair));
  if (level <= 1 || !ITER[level]) {
    if (r.phase === "push") {
      const pos = pair(T, obs, seat, auto.cards);
      return (pos && pushFor(pos)) || legal[0];
    }
    return pick(auto) || legal[0];
  }
  const acts = R.actions(r, seat, cards).filter((a) => a.seat === seat);
  if (T.game === "skat") {
    if (r.phase === "bid") {
      const g = skatGame(R, cards), max = g.ok ? g.value : 0;
      const bid = acts.find((a) => a.t === "bid"), hold = acts.find((a) => a.t === "hold");
      if (hold) return pick(r.bid.v <= max ? hold : { t: "pass", seat });
      if (bid && bid.v <= max) return pick(bid);
      return pick({ t: "pass", seat });
    }
    if (r.phase === "skat") {
      const g = skatGame(R, cards);
      if (g.ok && g.trumps >= 7 && g.value >= r.bid.v) return pick({ t: "declare", seat, game: g.game, hand: true, schneider: false, schwarz: false, ouvert: false });
      return pick({ t: "pickup", seat });
    }
    if (r.phase === "push") { const pos = pair(T, obs, seat, skatPush(R, cards)); return (pos && pushFor(pos)) || legal[0]; }
    if (r.phase === "declare") {
      const g = skatGame(R, cards), ops = acts.filter((a) => a.t === "declare" && !a.ouvert && a.game !== "N");
      const fit = ops.filter((a) => a.game === g.game);
      // ueberreizt waere verloren: dann die Ansage mit dem hoechsten Grundwert, die den Reizwert noch deckt
      const val = (a) => R.BASE[a.game] * (R.tops(a.game, cards).n + 1);
      const ok = (fit.length && val(fit[0]) >= r.bid.v) ? fit[0] : ops.filter((a) => val(a) >= r.bid.v).sort((a, b) => val(b) - val(a))[0] || fit[0] || ops[0];
      return pick(ok) || legal[0];
    }
  }
  if (T.game === "doko") {
    if (r.phase === "vorbehalt") {
      const q = cards.filter((c) => c[1] === "Q").length, j = cards.filter((c) => c[1] === "J").length;
      return pick({ t: "vorbehalt", seat, v: q >= 6 || j >= 6 ? "vorbehalt" : "gesund" });
    }
    if (r.phase === "abfrage") {
      const q = cards.filter((c) => c[1] === "Q").length;
      return pick({ t: "vorbehalt", seat, v: q >= 6 ? "damen" : "buben" }) || pick(auto) || legal[0];
    }
  }
  if (T.game === "bauernskat" && r.phase === "declare") return pick(auto) || legal[0];
  // Ansagen (Re/Kontra/Absagen) nur mit klar starkem Blatt, sonst nicht
  const call = acts.find((a) => a.t === "call" && a.a === a.p);
  if (call && T.game === "doko") {
    const strong = cards.filter((c) => R.isTrump(r.kind, c)).length >= 8 && cards.filter((c) => c === "HT" || c === "CQ").length >= 2;
    if (strong) return pick(call);
  }
  const plays = acts.filter((a) => a.t === "play");
  if (!plays.length) return pick(auto) || legal[0];
  if (plays.length === 1) return pick(plays[0]);
  const best = ismcts(T, obs, seat, mine, plays, ITER[level], seed);
  return pick(best) || pick(auto) || legal[0];
}
// Kartencodes -> Positionen der eigenen Hand (fuer das Druecken)
function pair(T, obs, seat, codes) {
  const pub = obs.pub, mine = obs.mine, own = T.ownPositions(pub, seat), used = [];
  for (const c of codes) { const p = own.find((q) => !used.includes(q) && T.R.DECK[mine.hand[q]] === c); if (p === undefined) return null; used.push(p); }
  return used.sort((a, b) => own.indexOf(a) - own.indexOf(b));
}
