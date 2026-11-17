// Tisch-Engine ueber den Kartenvertrag: Gleichschritt auf getrennten Geraeten, Verdeckung, Betrugserkennung, Bots.
import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../src/contract/session.js";
import MP from "../src/engines/tisch/mpoker.js";
import { cardFor, due, entropy, playAlone, playDevices, autoChooser } from "./tisch-helpers.js";
import { botMove } from "../src/engines/tisch/bot.js";
import { sha256 } from "../src/contract/sdk.js";
import { cardSvg, cardName, SUITS } from "../src/engines/tisch/deck.js";

const bot = (level) => (card, obs, seat) => botMove(card.engine, obs, seat, { level, seed: "t|" + obs.pub.hand + "|" + seat + "|" + JSON.stringify(obs.pub.r.tricks.length) });

for (const game of ["skat", "doko", "bauernskat"]) {
  test(game + ": getrennte Geraete im Gleichschritt – gleicher Hash, kein fremdes Geheimnis, fremde Karten bleiben verschlossen, Ende geprueft", () => {
    const card = cardFor(game), T = card.engine, n = T.n;
    let sawHand = false;
    const dev = playDevices(game, { tag: "lock|" + game, params: { runden: 2, regeln: [] }, pick: bot(1), check(devs) {
      const pub = devs[0].state.pub;
      devs.forEach((d, s) => {
        for (let o = 0; o < n; o++) if (o !== s && !d.log.some((x) => x.t === "reveal" && x.seat === o)) assert.equal(d.state.priv[o], null, "fremdes Geheimnis auf Geraet " + s);
        const obs = card.observe(d.state, s);
        for (let o = 0; o < n; o++) if (o !== s && !d.log.some((x) => x.t === "reveal" && x.seat === o)) assert.equal(card.observe(d.state, o).mine, null);
        if (T.handOpen(obs, s) && pub.ph === "play" && T.lay.hands[s].length) sawHand = true;
      });
      if (pub.ph === "play" && pub.fin && T.lay.hands.some((h) => h.length)) {
        // jede noch nicht gespielte Position einer Hand: der Schluessel des Besitzers fehlt oeffentlich, sie oeffnet nicht
        for (let o = 0; o < n; o++) for (const p of T.lay.hands[o]) if (pub.op[p] === undefined) {
          const k = pub.keys[p];
          assert.ok(!k || !k[o], "Schluessel des Besitzers oeffentlich");
          if (k && k.filter(Boolean).length === n - 1) assert.equal(MP.open(pub.fin[p], k.filter(Boolean), T.N), -1, "Karte oeffnet ohne Besitzer");
        }
      }
    } });
    const pub = dev[0].state.pub;
    assert.equal(pub.ph, "over"); assert.equal(pub.hist.length, 2);
    assert.equal(pub.cheatSeed, -1);
    assert.deepEqual(pub.last.audit, [], "Pruefung sauber");
    assert.equal(pub.last.cheat, undefined);
    if (T.lay.hands.some((h) => h.length)) assert.ok(sawHand);
    // Bauernskat hat keine Hand: alle spielbaren Karten liegen offen, verdeckt bleibt nur die untere Karte
  });
}

test("Bauernskat: eine verdeckte Karte oeffnet erst nach dem Stich, der die Karte darueber genommen hat (wie Altcode)", () => {
  const card = cardFor("bauernskat"), T = card.engine;
  playAlone("bauernskat", { tag: "flip", params: { runden: 1, regeln: [] }, chooser: autoChooser(), onState(s) {
    const pub = s.state.pub;
    if (pub.ph !== "play" || !pub.r.stacks) return;
    pub.r.stacks.forEach((row, seat) => row.forEach((x, i) => {
      const down = T.lay.stacks[seat][i].down;
      if (x.under) assert.equal(pub.op[down], undefined, "verdeckte Karte zu frueh offen");
    }));
  } });
});

test("Skat: gedrueckte Karten bleiben geheim bis zum Ende und werden dann gegen das Commitment geprueft", () => {
  let pushedSeen = null;
  const card = cardFor("skat");
  const s = playAlone("skat", { tag: "push|3", params: { runden: 1, regeln: [] }, chooser: (c, obs, seat) => {
    const T = c.engine, pub = obs.pub, R = T.R;
    if (pub.r.phase === "bid") { const a = R.actions(pub.r, seat, []).find((x) => x.t === "bid" && x.v === 18); return { input: a && seat === 1 ? T.toInput(obs, seat, a) : { t: "pass", seat } }; }
    if (pub.r.phase === "skat") return { input: { t: "pickup", seat } };
    if (pub.r.phase === "push") {
      const own = T.ownPositions(pub, seat);
      pushedSeen = [own[0], own[11]].map((p) => R.DECK[obs.mine.hand[p]]);
      return { input: { t: "push", seat, c: T.pushCommit(obs.mine.sec.k, own[0], own[11]) } };
    }
    return autoChooser()(c, obs, seat);
  }, onState(s2) {
    const pub = s2.state.pub;
    if (pub.ph === "play" && pub.push) {
      assert.match(pub.push, /^[0-9a-f]{64}$/);
      assert.equal(s2.log.filter((x) => x.t === "push").length, 1);
      assert.deepEqual(Object.keys(s2.log.find((x) => x.t === "push")).sort(), ["c", "seat", "t"], "nur das Commitment ist oeffentlich");
    }
  } });
  const last = s.state.pub.last;
  assert.deepEqual(last.full.pushed, pushedSeen);
  assert.deepEqual(last.audit, []);
  void card;
});

test("Betrug: falscher Rundenschluessel am Ende faellt beim Nachrechnen auf (Sitz wird genannt)", () => {
  const card = cardFor("skat"), n = 3, ent = entropy("cheat");
  const mine = [0, 1, 2].map((s) => S.makeSecrets(card, [s], ent)), commits = mine.map((m, s) => m.commits[s]);
  const seed = sha256("cheat-seed").slice(0, 32);
  let dev = mine.map((m, s) => S.newSession(card, { params: { runden: 1, regeln: [] }, seed, mine: [s], secrets: m.secrets, commits }));
  const pick = autoChooser(); let out = false;
  for (let g = 0; g < 4000; g++) {
    const st = S.status(card, dev[0]); if (st.over || dev[0].state.pub.last) break;
    let input = due(card, dev[st.turn]) || pick(card, card.observe(dev[st.turn].state, st.turn), st.turn).input;
    if (input.t === "seed" && input.seat === 1) input = { ...input, s: sha256("gelogen") };
    if (input.t === "seed" && input.seat === 1) out = true;   // ab hier ist Geraet 1 der Betrueger und spielt nicht mehr mit
    dev = dev.map((d, s) => (s === 1 && out ? d : S.apply(card, d, input)));
  }
  assert.equal(dev[0].state.pub.last.cheat, 1);
  void n;
});

test("Betrug: ein Schluessel, der keine Karte oeffnet, wird abgelehnt (nie still gewertet)", () => {
  const card = cardFor("doko");
  let s = null, cur = null;
  try {
    playAlone("doko", { tag: "badkey", params: { runden: 1, regeln: [] }, chooser: (c, obs, seat) => {
      const r = autoChooser()(c, obs, seat);
      if (r.input.t === "play") { s = { x: cur, input: { ...r.input, key: sha256("falsch") } }; throw new Error("stop"); }
      return r;
    }, onState(x) { cur = x; } });
  } catch (e) { assert.equal(e.message, "stop"); }
  assert.throws(() => S.apply(card, s.x, s.input), (e) => e.code === "zug-ungueltig");
});

test("Rundenschluessel muessen aus dem festgelegten Salz stammen (Aufloesung am Partieende)", () => {
  const card = cardFor("bauernskat");
  const s = playAlone("bauernskat", { tag: "reveal", params: { runden: 1, regeln: [] }, chooser: autoChooser() });
  assert.equal(s.state.pub.cheatSeed, -1);
  assert.deepEqual(s.state.pub.rev, [0, 1]);
  // vor der ersten Aufloesung anhalten: mit dem echten Meisterseed ok, mit einem anderen meldet die Karte den Sitz
  const wire = S.toWire(s), i = wire.m.findIndex((x) => x.t === "reveal");
  const before = S.fromWire(card, { ...wire, m: wire.m.slice(0, i) }, { mine: [] });
  const real = S.fromWire(card, wire, { mine: [] });
  assert.equal(real.state.pub.cheatSeed, -1);
  const forged = card.step({ pub: before.state.pub, priv: [{ m: "0".repeat(32) }, null] }, { t: "reveal", seat: 0 });
  assert.equal(forged.pub.cheatSeed, 0);
});

test("Groessen: Eingaben passen ins Live-Limit (≤ 1000 je Partie) und der Zustand ins Kartenlimit", () => {
  for (const [game, runden] of [["skat", 12], ["doko", 8], ["bauernskat", 10]]) {
    const card = cardFor(game); let max = 0;
    const s = playAlone(game, { tag: "size|" + game, params: { runden, regeln: [] }, chooser: autoChooser(), onState(x) { max = Math.max(max, JSON.stringify(x.state).length); } });
    assert.ok(s.log.length <= 1000, game + ": " + s.log.length + " Eingaben");
    assert.ok(max <= card.manifest.limits.stateBytes, game + ": " + max + " B");
    assert.equal(card.manifest.params.properties.runden.maximum, runden);
  }
});

test("Bot: ISMCTS (Stufe 2) spielt besser als der Auto-Zug des Altcodes (Bauernskat, beide Sitze getauscht)", () => {
  let diff = 0;
  for (let k = 0; k < 6; k++) for (const ism of [0, 1]) {
    const s = playAlone("bauernskat", { tag: "duel|" + k, params: { runden: 1, regeln: [] }, chooser: (c, obs, seat) => (seat === ism ? { input: bot(2)(c, obs, seat) } : autoChooser()(c, obs, seat)) });
    const sc = s.state.pub.score; diff += sc[ism] - sc[1 - ism];
  }
  assert.ok(diff > 0, "Punktdifferenz ISMCTS - Auto: " + diff);
});

test("Bot: jede Stufe liefert in jeder Lage einen legalen Zug (alle drei Spiele, ganze Partien)", () => {
  for (const game of ["skat", "doko", "bauernskat"]) for (const level of [1, 2]) {
    const s = playAlone(game, { tag: "bot|" + game + level, params: { runden: 1, regeln: game === "skat" ? ["kontra"] : [] }, chooser: (c, obs, seat) => ({ input: bot(level)(c, obs, seat) }) });
    assert.equal(S.status(cardFor(game), s).over, true);
    assert.deepEqual(s.state.pub.last.audit, [], game + level);
  }
});

test("Kartendeck: 32 Bilder mit Farbe UND eigener Form je Farbe, Namen fuer Screenreader, Rueckseite ohne Wert", () => {
  const forms = new Set();
  for (const s of "CSHD") for (const r of "AKQJT987") {
    const svg = cardSvg(s + r, { lang: "de" }), json = JSON.stringify(svg);
    assert.equal(svg.tag, "svg"); assert.equal(svg.attrs["aria-hidden"], "true");
    assert.ok(json.includes(SUITS[s].color));
    const path = json.match(/"d":"(M[^"]+)"/); assert.ok(path); forms.add(path[1]);
    assert.ok(cardName(s + r, "de").length > 3 && cardName(s + r, "en").includes(" of "));
  }
  assert.equal(forms.size, 4, "vier unterschiedliche Farbformen");
  assert.equal(cardName("HQ", "de"), "Herz-Dame"); assert.equal(cardName("CJ", "en"), "Jack of Clubs");
  assert.ok(!JSON.stringify(cardSvg(null)).includes("text"));
});

test("accepts: angetippte Karte ({...submit, a:0}) zaehlt als genau dieser Zug; fremde Felder und falsche Karten nicht", () => {
  const card = cardFor("bauernskat");
  let checked = 0;
  playAlone("bauernskat", { tag: "accepts", params: { runden: 1, regeln: [] }, chooser: (c, obs, seat) => {
    const ms = c.moves(obs, seat), play = ms.find((m) => m.t === "play");
    if (play && !checked) {
      assert.equal(card.accepts(obs, seat, { ...play, a: 0 }), true);
      assert.equal(card.accepts(obs, seat, { ...play, a: 1 }), false);
      assert.equal(card.accepts(obs, seat, { ...play, c: "XX" }), false);
      assert.equal(card.accepts(obs, 1 - seat, { ...play, seat: 1 - seat }), false, "nicht am Zug");
      checked++;
      return { input: { ...play, a: 0 } };
    }
    return autoChooser()(c, obs, seat);
  } });
  assert.equal(checked, 1);
});

test("auto: der Auto-Zug (Live-Zeitgeber) ist in jeder Lage ein legaler Zug und entspricht dem Auto-Zug des Altcodes", () => {
  for (const game of ["skat", "doko", "bauernskat"]) {
    const card = cardFor(game); let n = 0;
    playAlone(game, { tag: "auto|" + game, params: { runden: 1, regeln: game === "skat" ? ["ramsch"] : [] }, chooser: (c, obs, seat) => {
      const m = card.auto(obs, seat), legal = c.moves(obs, seat);
      assert.ok(legal.some((x) => JSON.stringify(x) === JSON.stringify(m)), game + ": " + JSON.stringify(m));
      const old = autoChooser()(c, obs, seat).input;
      if (m.t !== "push") assert.deepEqual(m, old, game + ": wie Altcode");
      n++; return { input: m };
    } });
    assert.ok(n > 3);
  }
});

test("Rundenende ohne langen Schritt: geoeffnete Karten pruefen ohne Leiterschritt, der Rest in Pflichtschritten zu hoechstens 12 Positionen; Mischen/Sperren je Eingabe hoechstens 12 Punkte", () => {
  const seen = {};
  for (const [game, regeln] of [["doko", []], ["skat", []], ["bauernskat", []]]) {
    let maxPend = 0, checks = 0, maxPts = 0;
    const s = playAlone(game, { tag: "kurz|" + game, params: { runden: 1, regeln }, chooser: autoChooser(), onState(x) {
      const p = x.state.pub; if (p.pend) maxPend = Math.max(maxPend, p.pend.length);
      const last = x.log[x.log.length - 1];
      if (last && last.t === "check") checks++;
      if (last && (last.t === "mix" || last.t === "lock")) maxPts = Math.max(maxPts, last.d.length);
    } });
    seen[game] = { checks, maxPend };
    assert.ok(maxPts <= 12, game + ": " + maxPts + " Punkte je Eingabe");
    assert.deepEqual(s.state.pub.last.audit, []);
    // eine Pruefeingabe je angefangene 12 nie geoeffnete Positionen
    assert.equal(checks, Math.ceil(maxPend / 12), game);
  }
  assert.equal(seen.doko.checks, 0, "Doppelkopf: alle 48 Karten gespielt, keine Leiterschritte am Ende");
  assert.ok(seen.skat.checks >= 1, "Skat eingepasst: nie geoeffnete Karten in Abschnitten");
});

test("Security L3: Punkte aus dem Netz muessen in der Untergruppe liegen; Schluessel muessen Skalare in (0, L) sein", () => {
  assert.ok(MP.cards(48).every(MP.inGroup), "echte Karten liegen in der Untergruppe");
  // Punkte kleiner Ordnung (libsodium-Sperrliste), Null, nicht kanonisch, Twist-Kurve (u = 2)
  for (const h of ["0".repeat(64), "01".padEnd(64, "0"), "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800",
    "5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157", "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", "02".padEnd(64, "0")]) assert.equal(MP.inGroup(h), false, h);
  assert.equal(MP.isScalar("0".repeat(64)), false); assert.equal(MP.isScalar("f".repeat(64)), false);
  // eine fremde Misch-Eingabe mit einem Punkt kleiner Ordnung wird abgelehnt, ehe jemand damit rechnet
  const card = cardFor("bauernskat"), ent = entropy("l3");
  const mine = [0, 1].map((s) => S.makeSecrets(card, [s], ent)), commits = mine.map((m, s) => m.commits[s]);
  const seed = sha256("l3").slice(0, 32);
  let a = S.newSession(card, { params: { runden: 1, regeln: [] }, seed, mine: [0], secrets: mine[0].secrets, commits });
  let b = S.newSession(card, { params: { runden: 1, regeln: [] }, seed, mine: [1], secrets: mine[1].secrets, commits });   // Sitz 1 mischt als Naechster
  const honest = due(card, a);
  const evil = { ...honest, d: honest.d.map((x, i) => (i === 3 ? "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800" : x)) };
  assert.throws(() => S.apply(card, b, evil), (e) => e.code === "zug-ungueltig" && /Untergruppe/.test(e.message));
  b = S.apply(card, b, honest); a = S.apply(card, a, honest);
  assert.equal(S.pubHash(a), S.pubHash(b));
});

test("Security L2: ein Sitz kann am Stueck hoechstens 64 Leiterschritte ausloesen; ehrliche Partien bleiben darunter", () => {
  // ehrliche Partien aller drei Spiele laufen durch (siehe Golden), hier: der hoechste Lauf je Spiel
  for (const game of ["doko", "skat", "bauernskat"]) {
    let max = 0;
    playAlone(game, { tag: "l2|" + game, params: { runden: 1, regeln: [] }, chooser: autoChooser(), onState(x) { if (x.state.pub.run) max = Math.max(max, x.state.pub.run.cost); } });
    assert.ok(max <= 64 && max >= 12, game + ": " + max);
  }
  // ein Sitz, der nach seinem Mischen weiter Punkte schickt, wird mit Grund abgelehnt
  const card = cardFor("doko"), T = card.engine, all = [0, 1, 2, 3];
  let s = S.newSession(card, { params: { runden: 1, regeln: [] }, seed: sha256("l2").slice(0, 32), mine: all, ...S.makeSecrets(card, all, entropy("l2")) });
  const pub = { ...s.state.pub, run: { seat: 0, cost: 60 } };
  const mv = card.moves(card.observe({ pub, priv: s.state.priv }, 0), 0)[0];
  assert.throws(() => T.step({ pub, priv: s.state.priv }, mv), /zu viele Rechenschritte/);
});
