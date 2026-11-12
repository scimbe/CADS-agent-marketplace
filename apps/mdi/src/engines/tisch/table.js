// Engine E6 „Tisch": ein Kartenspiel (Skat, Doppelkopf, Bauernskat) als Karte nach dem Kartenvertrag.
// Regeln: skat.js / doko.js / bauernskat.js (Portierungen, unveraendert). Geben: mpoker.js (SRA auf Curve25519), wie im
// Altcode table.js, aber ohne Tisch-Netz: alles Oeffentliche ist eine Eingabe im Log, alles Geheime liegt in priv[sitz].
//
// Verdeckte Information (KONZEPT §3.1, Commit-Reveal des Hosts):
//   priv[s] = deal(rng(salt_s|seed)) = { m: Meisterseed, sec: Schluessel der laufenden Runde, ... } – nur auf dem Geraet
//   von Sitz s. Runde h nutzt handseed = SHA-256(m|"hand"|h); sec = MP.secrets(N, rng(handseed)).
//   1. mix:  Sitz 0..n-1 mischt und verschliesst das Deck (bis 24 Punkte je Eingabe, Feld d).
//   2. lock: Sitz 0..n-1 tauscht seinen Schluessel gegen einen je Position.
//   3. Schluessel: Fuer jede Position einer fremden Hand gibt jeder Sitz seinen Positionsschluessel oeffentlich frei.
//      Oeffnen braucht ALLE n Schluessel; der Besitzer haelt seinen zurueck, also kann nur er seine Karten lesen.
//      Oeffentliche Karten (Bauernskat-Stapel, offenes Spiel) bekommen die Schluessel aller Sitze.
//   4. Spielen: {play, pos, key} legt den letzten Schluessel offen, jeder rechnet die Karte nach.
//   5. Rundenende: jeder legt seinen handseed offen, jedes Geraet rechnet Mischen und Sperren nach (Hashes), deckt alle
//      Haende auf und prueft jede Karte (Regeln audit()). Am Partieende legt die Host-Aufloesung das Salz offen; die Karte
//      prueft, dass jeder handseed aus dem festgelegten Meisterseed stammt.
// Pflichtschritte ohne Entscheidung meldet status() mit auto:true; der Host fuehrt sie fuer eigene Sitze selbst aus.
// Ansagen ausser der Reihe (Kontra, Re, Doppelkopf-Ansagen) gibt es hier nur am eigenen Zug: der Vertrag kennt genau
// einen Sitz am Zug. Die Fristen der Regeln haengen nur an den eigenen Karten und gelten unveraendert.
import MP from "./mpoker.js";
import { rng as mkRng, sha256, canon } from "../../contract/sdk.js";

export const CH = 24;                        // Schluessel je Eingabe (Huelle: kanonisch hoechstens 2048 Byte, ADR 0001 f)
export const CHP = 12;                       // Punkte je Misch-/Sperr-Eingabe: je Punkt ein Leiterschritt (~2 ms), Schritt bleibt kurz
export const CHK = 12;                       // Positionen je Pruefschritt am Rundenende (je Position ein Leiterschritt)
const HEX64 = /^[0-9a-f]{64}$/, HEXD = "0123456789abcdef";

export function handSeed(m, h) { return sha256(m + "|hand|" + h); }
export function secretsFor(N, m, h) { return MP.secrets(N, mkRng(handSeed(m, h))); }
// Hash der Schluessel, mit denen eine Karte offen gelegt wurde (spart am Ende den Leiterschritt fuer diese Position)
function keyHash(ks) { return sha256(ks.join("|")).slice(0, 16); }
function deckHash(d) { return sha256(d.join("")).slice(0, 32); }
function pushCommit(k, a, b) { return sha256("mdi-push|" + k + "|" + a + "|" + b); }
function range(n) { const o = []; for (let i = 0; i < n; i++) o.push(i); return o; }
function clone(o) { return o === null || o === undefined ? null : JSON.parse(JSON.stringify(o)); }
function bad(msg) { throw new Error("ungueltig: " + msg); }

/**
 * @param R     Regelmodul (Skat, Doko, Bauernskat)
 * @param game  "skat" | "doko" | "bauernskat"
 */
export function makeTable(R, game) {
  const n = R.SEATS, N = R.DECK.length, lay = R.layout(), hasHands = lay.hands.some((h) => h.length > 0);
  const stacks = !!lay.stacks, skat = lay.skat && lay.skat.length ? lay.skat : null;

  // ---------- Positionen ----------
  function ownPositions(pub, seat) {
    const out = lay.hands[seat].slice();
    if (skat && pub.r && pub.r.declarer === seat && pub.r.pickedUp) out.push(...skat);
    return out;
  }
  // Wer welche Schluessel noch freigeben muss: [{pos, seats, open}] (open = Karte wird fuer alle aufgedeckt)
  function needs(pub) {
    if (!pub.fin || pub.ph !== "play") return [];
    const out = [], r = pub.r;
    if (hasHands) for (let t = 0; t < n; t++) for (const p of lay.hands[t]) if (pub.op[p] === undefined) out.push({ pos: p, seats: range(n).filter((s) => s !== t), open: false });
    if (skat && r.pickedUp) for (const p of skat) if (pub.op[p] === undefined) out.push({ pos: p, seats: range(n).filter((s) => s !== r.declarer), open: false });
    if (stacks) for (const x of R.reveals(r)) out.push({ pos: lay.stacks[x.seat][x.i][x.kind], seats: range(n), open: true, rev: x });
    return out;
  }
  function keyTask(pub) {
    const nd = needs(pub);
    for (let s = 0; s < n; s++) {
      const list = nd.filter((x) => x.seats.includes(s) && !(pub.keys[x.pos] && pub.keys[x.pos][s])).map((x) => x.pos).sort((a, b) => a - b);
      if (list.length) return { seat: s, list };
    }
    return null;
  }
  function keysOf(pub, pos) { const k = pub.keys[pos]; return k && k.every((x) => !!x) ? k : null; }

  // ---------- Wer ist dran ----------
  function protoTurn(pub) {
    if (pub.ph === "mix") return { seat: pub.h1.length, auto: true };
    if (pub.ph === "lock") return { seat: pub.h2.length, auto: true };
    if (pub.ph === "play") {
      const kt = keyTask(pub);
      if (kt) return { seat: kt.seat, auto: true };
      if (pub.r.phase === "show") return { seat: pub.r.declarer, auto: true };
      if (R.done(pub.r)) return null;
      return { seat: R.turn(pub.r), auto: false };
    }
    if (pub.ph === "seed") return { seat: pub.seeds.length, auto: true };
    if (pub.ph === "check") return { seat: pub.r.dealer, auto: true };
    if (pub.ph === "next") return { seat: pub.ready.length, auto: false };
    if (pub.ph === "reveal") return { seat: pub.rev.length, auto: false, reveal: true };
    return null;
  }

  // ---------- eigene Karten (nur auf dem eigenen Geraet) ----------
  function myCards(pub, seat, mine) {
    if (!mine) return [];
    if (stacks) return R.tops(pub.r, seat);
    const out = [];
    for (const p of ownPositions(pub, seat)) {
      const id = mine.hand[p];
      if (id === undefined || id < 0 || pub.op[p] !== undefined || (mine.pushed && mine.pushed.includes(p))) continue;
      out.push(R.DECK[id]);
    }
    return out;
  }
  function posOf(pub, seat, mine, code) {
    for (const p of ownPositions(pub, seat)) if (mine.hand[p] !== undefined && R.DECK[mine.hand[p]] === code && pub.op[p] === undefined && !(mine.pushed && mine.pushed.includes(p))) return p;
    return -1;
  }
  function handOpen(pub, seat, mine) { return !hasHands || (!!mine && ownPositions(pub, seat).every((p) => mine.hand[p] !== undefined)); }

  // eigene Ausgabe beim Mischen/Sperren (wird im eigenen priv zwischengespeichert)
  // nur das naechste Stueck (CHP Punkte); im eigenen priv vorbereitet, damit moves() und die Pruefung nichts doppelt rechnen
  function outKey(pub) { return pub.ph + ":" + pub.hand + ":" + (pub.ph === "mix" ? pub.h1.length : pub.h2.length) + ":" + pub.buf.length; }
  function outFor(pub, seat, mine) {
    if (mine.out && mine.outKey === outKey(pub)) return mine.out;
    const from = pub.buf.length, to = Math.min(N, from + CHP);
    if (pub.ph === "mix") return MP.shuffleAt(seat === 0 ? MP.cards(N) : pub.deck, mine.sec, from, to);
    return MP.lockAt(pub.deck, mine.sec, from, to);
  }
  function chunkMove(t, seat, items) { return { t, seat, d: items.slice() }; }
  function chunkItems(input) { return Array.isArray(input.d) ? input.d : []; }

  // Regelaktion -> Eingabe (Eingaben haben hoechstens 6 Felder; declare packt die Schalter in eine Zahl)
  function toInput(pub, seat, mine, a) {
    if (a.t === "play") {
      if (stacks) return { t: "play", seat, c: a.card };
      const p = posOf(pub, seat, mine, a.card);
      return p < 0 ? null : { t: "play", seat, pos: p, key: mine.sec.ki[p] };
    }
    if (a.t === "declare") return { t: "declare", seat, g: a.game, f: (a.hand ? 1 : 0) | (a.schneider ? 2 : 0) | (a.schwarz ? 4 : 0) | (a.ouvert ? 8 : 0) };
    if (a.t === "bid" || a.t === "vorbehalt") return a.t === "bid" ? { t: "bid", seat, v: a.v } : { t: "vorbehalt", seat, v: a.v };
    if (a.t === "call") return { t: "call", seat, p: a.p, a: a.a };
    if (["hold", "pass", "pickup", "kontra", "re"].includes(a.t)) return { t: a.t, seat };
    return null;
  }
  function toAction(input) {
    const a = { t: input.t, seat: input.seat };
    if (input.t === "declare") { if (!Number.isInteger(input.f) || input.f < 0 || input.f > 15) bad("declare"); Object.assign(a, { game: input.g, hand: !!(input.f & 1), schneider: !!(input.f & 2), schwarz: !!(input.f & 4), ouvert: !!(input.f & 8) }); }
    if (input.t === "bid" || input.t === "vorbehalt") a.v = input.v;
    if (input.t === "call") { a.p = input.p; a.a = input.a; }
    return a;
  }

  function moves(obs, seat) {
    const pub = obs.pub, mine = obs.mine, pt = protoTurn(pub);
    if (!pt || pt.seat !== seat || !mine) return [];
    if (pt.reveal) return [{ t: "reveal", seat }];
    if (pub.ph === "mix" || pub.ph === "lock") {
      return [chunkMove(pub.ph, seat, outFor(pub, seat, mine))];
    }
    if (pub.ph === "seed") return [{ t: "seed", seat, s: handSeed(mine.m, pub.hand) }];
    if (pub.ph === "check") return [{ t: "check", seat }];
    if (pub.ph === "next") return [{ t: "next", seat }, { t: "end", seat }];
    if (pub.ph !== "play") return [];
    const kt = keyTask(pub);
    if (kt) return [chunkMove("key", seat, kt.list.slice(0, CH).map((p) => mine.sec.ki[p]))];
    if (pub.r.phase === "show") {
      const done = Object.keys(pub.show).map(Number);
      const left = ownPositions(pub, seat).filter((p) => !(mine.pushed || []).includes(p) && !done.includes(p)).sort((a, b) => a - b).slice(0, 2);
      const m = { t: "show", seat };
      left.forEach((p, i) => { m["p" + i] = p; m["k" + i] = mine.sec.ki[p]; });
      return [m];
    }
    if (!handOpen(pub, seat, mine) || mine.bad) return [];
    const cards = myCards(pub, seat, mine), out = [];
    if (pub.r.phase === "push" && skat) {
      const own = ownPositions(pub, seat);
      for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) out.push({ t: "push", seat, c: pushCommit(mine.sec.k, own[i], own[j]) });
      return out;
    }
    for (const a of R.actions(pub.r, seat, cards)) {
      if (a.seat !== seat || a.t === "show" || a.t === "push") continue;
      const m = toInput(pub, seat, mine, a);
      if (m && !out.some((x) => canon(x) === canon(m))) out.push(m);
    }
    return out;
  }

  // ---------- neue Runde ----------
  function freshHand(pub) {
    Object.assign(pub, { ph: "mix", h1: [], h2: [], buf: [], deck: null, fin: null, keys: {}, op: {}, kh: {}, show: {}, push: null, seeds: [], ready: [],
      r: R.start({ dealer: pub.hand % n, rules: pub.rules }) });
  }
  function freshMine(pub, mine) {
    return { m: mine.m, sec: secretsFor(N, mine.m, pub.hand), hand: {}, pushed: null, out: null, outKey: null, bad: false };
  }

  // nach jedem Schritt: eigene Karten oeffnen, eigene Ausgabe vorbereiten, oeffentliche Karten aufdecken
  function settle(pub, priv) {
    for (let moved = true; moved;) {
      moved = false;
      if (pub.ph === "play" && stacks) {
        for (const x of needs(pub)) {
          if (!x.open) continue;
          const k = keysOf(pub, x.pos); if (!k) continue;
          const id = MP.open(pub.fin[x.pos], k, N);
          if (id < 0) bad("Schluessel oeffnet keine Karte");
          const r = R.apply(pub.r, { t: "turn", seat: x.rev.seat, i: x.rev.i, card: R.DECK[id] });
          if (!r.ok) bad("aufdecken " + r.err);
          pub.r = r.state; pub.op[x.pos] = id; pub.kh[x.pos] = keyHash(k); delete pub.keys[x.pos]; moved = true;
          break;
        }
      }
      if (pub.ph === "play" && R.done(pub.r) && !keyTask(pub)) { pub.ph = "seed"; moved = true; }
    }
    for (let s = 0; s < n; s++) {
      const mine = priv[s]; if (!mine) continue;
      if ((pub.ph === "mix" && pub.h1.length === s) || (pub.ph === "lock" && pub.h2.length === s)) {
        const key = outKey(pub);
        if (mine.outKey !== key) { const out = outFor(pub, s, { ...mine, out: null }); priv[s] = { ...mine, out, outKey: key }; }
      }
      if (pub.fin && hasHands) {
        let hand = null;
        for (const p of ownPositions(pub, s)) {
          if (priv[s].hand[p] !== undefined) continue;
          const k = pub.keys[p]; if (!k && pub.op[p] === undefined) continue;
          const all = range(n).map((q) => (q === s ? priv[s].sec.ki[p] : k && k[q]));
          if (pub.op[p] !== undefined) { hand = hand || { ...priv[s].hand }; hand[p] = pub.op[p]; continue; }
          if (!all.every((x) => !!x)) continue;
          hand = hand || { ...priv[s].hand }; hand[p] = MP.open(pub.fin[p], all, N);
          if (hand[p] < 0) priv[s] = { ...priv[s], bad: true };
        }
        if (hand) priv[s] = { ...priv[s], hand };
      }
    }
  }

  // ---------- Rundenende: alles nachrechnen, in kurzen Schritten ----------
  // Mischen multipliziert jede Karte mit k, Sperren mit k^-1 * k_i: an Position i liegt am Ende (id_i + 1) * Produkt(k_i) * G.
  // Offen gelegte Positionen sind ohne Leiterschritt belegt (aufgedeckte k_i == die Schluessel, mit denen sie geoeffnet
  // wurden, und gleiche id). Nur nie geoeffnete Positionen kosten je einen Leiterschritt; sie laufen in Pflichtschritten
  // „check“ zu je CHK Positionen. Bei jeder Abweichung wird das ganze Geben wie im Altcode nachgespielt, um den Sitz zu finden.
  function secsOf(pub) { return pub.seeds.map((s) => MP.secrets(N, mkRng(s))); }
  function startCheck(pub) {
    const secs = secsOf(pub);
    for (let s = 0; s < n; s++) if (!MP.validSecrets(secs[s], N)) return endHand(pub, { cheat: s });
    const ids = MP.composed(secs, N), pend = [];
    for (let p = 0; p < N; p++) {
      if (pub.kh[p] === undefined) { pend.push(p); continue; }
      if (pub.kh[p] !== keyHash(secs.map((x) => x.ki[p])) || pub.op[p] !== ids[p]) return endHand(pub, { cheat: replay(pub, secs) });
    }
    if (!pend.length) return endHand(pub, { ids, secs });
    pub.ph = "check"; pub.pend = pend;
  }
  function stepCheck(pub) {
    const secs = secsOf(pub), ids = MP.composed(secs, N), now = pub.pend.slice(0, CHK);
    for (const p of now) if (MP.pointFor(ids[p], secs.map((x) => x.ki[p])) !== pub.fin[p]) return endHand(pub, { cheat: replay(pub, secs) });
    pub.pend = pub.pend.slice(CHK);
    if (!pub.pend.length) endHand(pub, { ids, secs });
  }
  function replay(pub, secs) {
    let deck = MP.cards(N);
    for (let s = 0; s < n; s++) { deck = MP.shuffle(deck, secs[s]); if (deckHash(deck) !== pub.h1[s]) return s; }
    for (let s = 0; s < n; s++) { deck = MP.lock(deck, secs[s]); if (deckHash(deck) !== pub.h2[s]) return s; }
    return -1;
  }
  function endHand(pub, { cheat, ids, secs }) {
    const res = { hand: pub.hand, dealer: pub.r.dealer, state: pub.r, flags: [] };
    if (cheat !== undefined) res.cheat = cheat;
    else fillResult(pub, res, ids, secs);
    score(pub, res);
    pub.allSeeds.push(pub.seeds.slice());
    pub.last = res; pub.hist.push(res.result ? (game === "skat" ? res.result.list : res.result.points) : range(n).map(() => 0));
    delete pub.pend;
    pub.ph = pub.hand + 1 >= pub.runden ? "reveal" : "next";
  }
  function fillResult(pub, out, ids, secs) {
    // jede oeffentlich gewordene Karte muss die echte sein
    for (const p of Object.keys(pub.op)) if (ids[p] !== pub.op[p]) out.flags.push({ seat: -1, why: "karte" });
    const C = (p) => R.DECK[ids[p]], full = { hands: lay.hands.map((ps) => ps.map(C)) };
    if (stacks) full.stacks = lay.stacks.map((row) => row.map((x) => ({ up: C(x.up), down: C(x.down) })));
    if (skat) {
      full.skat = skat.map(C);
      const r = pub.r, d = r.declarer;
      if (d >= 0 && r.pickedUp) {
        const own = lay.hands[d].concat(skat); let pair = null;
        if (pub.push) for (let i = 0; i < own.length && !pair; i++) for (let j = i + 1; j < own.length; j++) if (pushCommit(secs[d].k, own[i], own[j]) === pub.push) { pair = [own[i], own[j]]; break; }
        if (!pair) out.flags.push({ seat: d, why: "pushed" });
        full.pushed = pair ? pair.map(C) : [];
      }
    }
    out.full = full;
    out.audit = R.audit(pub.r, full).concat(out.flags);
    if (!out.audit.length) out.result = R.result(pub.r, full);
    return out;
  }
  function score(pub, res) {
    if (!res.result) return;
    const pts = game === "skat" ? res.result.list : res.result.points;
    pub.score = pub.score.map((x, s) => x + (pts[s] || 0));
  }

  function step(state, input) {
    const pub = clone(state.pub), priv = state.priv.slice();
    const pt = protoTurn(pub);
    if (!pt) bad("Partie vorbei");
    if (input.seat !== pt.seat) bad("nicht am Zug");
    const seat = input.seat;
    if (input.t === "reveal") {
      if (!pt.reveal) bad("reveal");
      const mine = priv[seat];
      if (!mine || typeof mine.m !== "string") bad("reveal ohne Geheimnis");
      // jeder offengelegte handseed muss aus dem festgelegten Meisterseed stammen
      if (pub.allSeeds.some((row, h) => row[seat] !== handSeed(mine.m, h))) pub.cheatSeed = seat;
      pub.rev.push(seat);
      if (pub.rev.length === n) pub.ph = "over";
      return { pub, priv };
    }
    if (pub.ph === "mix" || pub.ph === "lock") {
      if (input.t !== pub.ph) bad(pub.ph);
      const it = chunkItems(input), want = Math.min(CHP, N - pub.buf.length);
      if (it.length !== want || !it.every((x) => HEX64.test(x))) bad("Punkte");
      pub.buf.push(...it);
      if (pub.buf.length === N) {
        const h = deckHash(pub.buf);
        if (pub.ph === "mix") pub.h1.push(h); else pub.h2.push(h);
        pub.deck = pub.buf; pub.buf = [];
        if (pub.ph === "mix" && pub.h1.length === n) pub.ph = "lock";
        else if (pub.ph === "lock" && pub.h2.length === n) { pub.fin = pub.deck; pub.deck = null; pub.ph = "play"; }
      }
    } else if (pub.ph === "seed") {
      if (input.t !== "seed" || typeof input.s !== "string" || !HEX64.test(input.s)) bad("seed");
      pub.seeds.push(input.s);
      if (pub.seeds.length === n) startCheck(pub);
    } else if (pub.ph === "check") {
      if (input.t !== "check") bad("check");
      stepCheck(pub);
    } else if (pub.ph === "next") {
      if (input.t === "end") { pub.ph = "reveal"; return { pub, priv }; }
      if (input.t !== "next") bad("next");
      pub.ready.push(seat);
      if (pub.ready.length === n) {
        pub.hand++; freshHand(pub);
        for (let s = 0; s < n; s++) if (priv[s]) priv[s] = freshMine(pub, priv[s]);
      }
    } else if (pub.ph === "play") {
      const kt = keyTask(pub);
      if (kt) {
        if (input.t !== "key") bad("key");
        const it = chunkItems(input), list = kt.list.slice(0, CH);
        if (it.length !== list.length || !it.every((x) => HEX64.test(x))) bad("Schluessel");
        list.forEach((p, i) => { const k = pub.keys[p] || range(n).map(() => null); k[seat] = it[i]; pub.keys[p] = k; });
      } else if (pub.r.phase === "show") {
        if (input.t !== "show") bad("show");
        const own = ownPositions(pub, seat), pairs = [[input.p0, input.k0], [input.p1, input.k1]].filter((x) => x[0] !== undefined);
        if (!pairs.length) bad("show leer");
        for (const [p, k] of pairs) {
          if (!own.includes(p) || pub.show[p] !== undefined || !HEX64.test(k)) bad("show Position");
          const ks = (pub.keys[p] || range(n).map(() => null)).slice(); ks[seat] = k;
          const id = MP.open(pub.fin[p], ks, N); if (id < 0) bad("show Schluessel");
          pub.show[p] = id;
        }
        if (Object.keys(pub.show).length === R.HAND) {
          const cards = Object.keys(pub.show).map(Number).sort((a, b) => a - b).map((p) => R.DECK[pub.show[p]]);
          const r = R.apply(pub.r, { t: "show", seat, cards }); if (!r.ok) bad("show " + r.err);
          pub.r = r.state;
        }
      } else {
        let a;
        if (input.t === "play" && !stacks) {
          const p = input.pos;
          if (!Number.isInteger(p) || !ownPositions(pub, seat).includes(p) || pub.op[p] !== undefined || !HEX64.test(input.key)) bad("Position");
          const ks = (pub.keys[p] || []).slice(); ks[seat] = input.key;
          if (ks.length !== n || !ks.every((x) => !!x)) bad("Schluessel fehlen");
          const id = MP.open(pub.fin[p], ks, N); if (id < 0) bad("Schluessel oeffnet keine Karte");
          a = { t: "play", seat, card: R.DECK[id] };
          pub.op[p] = id; pub.kh[p] = keyHash(ks); delete pub.keys[p];
        } else if (input.t === "play") a = { t: "play", seat, card: input.c };
        else if (input.t === "push") {
          if (typeof input.c !== "string" || !HEX64.test(input.c)) bad("push");
          a = { t: "push", seat }; pub.push = input.c;
          const mine = priv[seat];
          if (mine) {
            const own = ownPositions(pub, seat); let pair = null;
            for (let i = 0; i < own.length && !pair; i++) for (let j = i + 1; j < own.length; j++) if (pushCommit(mine.sec.k, own[i], own[j]) === input.c) { pair = [own[i], own[j]]; break; }
            priv[seat] = { ...mine, pushed: pair };
          }
        } else a = toAction(input);
        const r = R.apply(pub.r, a);
        if (!r.ok) bad(a.t + " " + r.err);
        pub.r = r.state;
      }
    } else bad("Phase " + pub.ph);
    settle(pub, priv);
    return { pub, priv };
  }

  function status(state) {
    const pub = state.pub, pt = protoTurn(pub), over = pub.ph === "over";
    let winner = -1;
    if (over) { const top = Math.max(...pub.score); const w = pub.score.filter((x) => x === top); winner = w.length === 1 ? pub.score.indexOf(top) : -1; }
    return { over, turn: pt ? pt.seat : -1, reveal: !!(pt && pt.reveal), auto: !!(pt && pt.auto), score: pub.score.slice(), winner, cheat: pub.cheatSeed !== undefined && pub.cheatSeed >= 0 };
  }

  return {
    n, N, lay, game, R,
    init({ params }) {
      const rules = R.rules(params.regeln || []);
      const pub = { g: game, hand: 0, runden: params.runden, rules, score: range(n).map(() => 0), hist: [], last: null, allSeeds: [], rev: [], cheatSeed: -1 };
      freshHand(pub);
      return { pub, priv: range(n).map(() => null) };
    },
    deal({ rng, pub }) {
      const m = range(16).map(() => HEXD[rng.int(16)] + HEXD[rng.int(16)]).join("");
      return { m, sec: secretsFor(N, m, pub.hand), hand: {}, pushed: null, out: null, outKey: null, bad: false };
    },
    step, status, moves,
    observe(state, seat) { return { pub: state.pub, mine: state.priv[seat] || null }; },
    // Eine angetippte Karte (Widget pcard) kommt als {...submit, a: 0}; sonst muss die Eingabe genau ein Zug sein
    accepts(obs, seat, input) {
      const x = input && input.t === "play" && input.a === 0 ? (({ a, ...rest }) => rest)(input) : input;
      return moves(obs, seat).some((m) => canon(m) === canon(x));
    },
    // fuer Ansicht und Bot
    myCards: (obs, seat) => myCards(obs.pub, seat, obs.mine),
    handOpen: (obs, seat) => handOpen(obs.pub, seat, obs.mine),
    toAction, toInput: (obs, seat, a) => toInput(obs.pub, seat, obs.mine, a), protoTurn, pushCommit, ownPositions
  };
}
