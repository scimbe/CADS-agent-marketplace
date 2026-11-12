// Portiert aus dem Altbaum (Tag pre-legacy-removal): test/turns.test.js und test/geschenke.test.js, nur die Faelle der
// Z1-Karten, Erwartungen unveraendert. Tn ist ein schmaler Ersatz fuer das alte turns.js ueber den neuen Vertragskarten:
// play() spielt einen ganzen Zug Prompt fuer Prompt ueber accepts/step (null, sobald eine Antwort abgelehnt wird),
// through() spielt das Eingabe-Log von vorn nach (wie fromWire beim Empfang eines Links). Was zu anderen Straengen
// gehoert (Z2-Spiele, Business-Flavor, KI-Siegel, Kalender-Rotation), ist an Ort und Stelle als Kommentar vermerkt.
import test from "node:test";
import assert from "node:assert/strict";
import { rng } from "../src/contract/sdk.js";
import { okAnswer } from "../src/engines/zug/check.js";
import * as SP from "../src/engines/zug/spiele.js";
import * as M from "../src/engines/zug/merge.js";
import * as G2 from "../src/engines/zug/geld.js";
import * as G from "../src/engines/zug/geschenke.js";
import { clean, mulberry32 } from "../src/engines/zug/alt.js";
import GJSON from "../src/engines/zug/geschenke.json" with { type: "json" };

const MAX_FRAGMENT = 4000; // ADR 0001 f
const IDS = ["zug-sammeln", "zug-termin", "zug-einkauf", "zug-wichteln", "zug-reihum", "zug-einig", "zug-wunschzettel", "geschenk-finder", "karte-danke", "zug-umschlag", "zug-kapsel", "zug-gutschein", "raum-sorry"];
const CARD = {};
for (const id of IDS) CARD[id] = (await import("../src/cards/" + id + "/card.js")).default;
const WHERE = { sammeln: ["zug-sammeln"], termin: ["zug-termin"], einkauf: ["zug-einkauf"], wichteln: ["zug-wichteln"], einig: ["zug-einig", "einig"], rangliste: ["zug-einig", "rangliste"], wunsch: ["zug-wunschzettel"], geschenk: ["geschenk-finder"], kapsel: ["zug-kapsel", "kapsel"], post: ["zug-kapsel", "post"], sorry: ["raum-sorry", "sorry"] };
const Q = { clean };
function fresh(g, seed) {
  const [id, v] = WHERE[g], card = CARD[id], p = {};
  for (const [k, x] of Object.entries(card.manifest.params.properties)) p[k] = structuredClone(x.default);
  if (v) p.spiel = v;
  const st = card.init({ rng: rng("alt|" + g), params: p, players: card.manifest.players.max });
  st.pub.seed = seed >>> 0;
  return { g, card, st, log: [], seed: seed >>> 0, init: structuredClone(st) };
}
function apply(d, x) {
  const seat = d.card.status(d.st).turn;
  if (seat < 0 || x.seat !== seat || !d.card.accepts(d.card.observe(d.st, seat), seat, x)) return null;
  return { ...d, st: d.card.step(d.st, x), log: d.log.concat([x]) };
}
const Tn = {
  ...SP, ...M, split: G2.split, parseCents: G2.parseCents, moneyLine: (c, k, lang) => G2.moneyLine(SP.T(lang), c, k, lang),
  play(d, answers, today) {
    if (!d || d.card.status(d.st).over) return null;
    const n = d.card.prompts(d.st.pub).length;
    if (!Array.isArray(answers) || answers.length !== n) return null;
    for (const a of answers) { d = apply(d, d.card.answer(d.st.pub, d.card.status(d.st).turn, a, today + 20000)); if (!d) return null; }
    return d;
  },
  state(d) { const s = d.card.status(d.st); return { moves: d.st.pub.m, turn: d.st.pub.m.length, over: s.over }; },
  moves(d) { return d.st.pub.m; },
  result(d, lang) { return d.card.result(d.st.pub, lang); },
  face(d, lang) { return d.card.face(d.st.pub, lang); },
  gate(d, today) { return d.card.gateLeft(d.st.pub, today + 20000); },
  close(d) { return apply(d, { t: "close", seat: d.card.status(d.st).turn }); }
};
/** Empfang eines Links: das Log von vorn nachspielen und gegen den Stand des Absenders pruefen. */
function through(d) {
  let r = { ...d, st: structuredClone(d.init), log: [] };
  for (const x of d.log) { r = apply(r, x); assert.ok(r, "Link spielt nach"); }
  assert.deepEqual(r.st.pub, d.st.pub);
  return r;
}
/** Von Hand gebauter Link: die Antworten von Zug 1 so, wie sie im Link stuenden; was nicht passt, faellt vorher weg. */
function forge(g, seed, answers) { const d = fresh(g, seed); return Tn.play(d, answers, 0) || d; }
function wire(d) { return { c: d.card.manifest.id, v: d.card.manifest.version, p: d.st.pub.p, s: "0123456789abcdef0123456789abcdef", k: new Array(d.card.manifest.players.max).fill(null), m: d.card.manifest.link && d.card.manifest.link.snap ? d.card.compact(d.log) : d.log }; }
function linkText(d) { return Buffer.from(JSON.stringify(wire(d))).toString("base64url"); }
function linkLen(d) { return "#v2.challenge.".length + linkText(d).length; }
const D = { };
const run = (g, seed, moves) => moves.reduce((d, m) => d && Tn.play(d, m, 0), fresh(g, seed));
const S = (v) => JSON.stringify(v);
const edit = (name, face, adds, marks) => ({ name, face, adds: adds.map((a) => Tn.shopParse(a)), marks: marks || {} });
const shopList = (d) => Tn.moves(d)[0][0];
const rowsOf = (v) => Object.fromEntries(Tn.shopRows(v).map((r) => [r.label, { b: r.bought.map((p) => p[0]), c: r.bring.map((p) => p[0]) }]));

test("Freier Text nur durch den Filter: Kontaktdaten und Woerter vom Feld gehen nicht", () => {
  // (Zeilen zu "wort" gehoeren zu Strang Z2)
  assert.equal(Tn.play(fresh("einig", 1), [["Treff am Bahnhof", "b", "c", "d", "e"], [0, 1, 2, 3, 4]], 0), null);
  assert.equal(Tn.play(fresh("einig", 1), [["aa", "aa", "c", "d", "e"], [0, 1, 2, 3, 4]], 0), null);
});
test("Rechnet richtig: Einigung nimmt den besten schlechtesten Platz, Deal platzt unter der Grenze", () => {
  let d = Tn.play(fresh("einig", 3), [["Aa", "Bb", "Cc", "Dd", "Ee"], [0, 1, 2, 3, 4]], 0); d = Tn.play(d, [[4, 3, 2, 1, 0]], 0);
  assert.match(Tn.result(d, "de").h, /Cc/);
  // (Zeilen zu "deal" gehoeren zu Strang Z2)
});
test("Kapsel oeffnet erst am Tag, Vorhersage steht nicht im Klartext im Link", () => {
  const d = through(Tn.play(fresh("kapsel", 5), [[2], 7], 1000));
  assert.equal(Tn.gate(d, 1000), 7); assert.equal(Tn.gate(d, 1006), 1); assert.equal(Tn.gate(d, 1007), 0);
  assert.equal(Tn.state(d).turn, 1); assert.ok(!linkText(d).includes("[[2"), "nicht im Klartext");
});
test("Raum-Blaetter: Streichen laesst genau einen Vorschlag, Sorry bleibt Text ohne Absender", () => {
  // (Zeilen zu "streichen" gehoeren zu Strang Z2)
  let d = Tn.play(fresh("sorry", 1), [[0], [1], [2]], 0); const r = Tn.result(d, "de"); assert.equal(r.copy, r.lines[0]); assert.ok(!/daily/i.test(r.copy));
});
test("Wichteln: niemand zieht sich selbst, jeder Name kommt genau einmal vor", () => {
  for (let seed = 1; seed < 200; seed++) for (const n of [3, 4, 12]) {
    const names = Array.from({ length: 12 }, (x, i) => i < n ? "N" + String.fromCharCode(97 + i) : "");
    const d = Tn.play(fresh("wichteln", seed), [names], 0), m = Tn.moves(d), p = Tn.GAMES.wichteln.turns[1][1], got = [];
    for (let i = 0; i < n; i++) { const o = p.list(d, m, [[i]])[0]; assert.notEqual(o, names[i]); got.push(o); }
    assert.equal(new Set(got).size, n);
  }
  assert.equal(Tn.play(fresh("wichteln", 1), [["Ana", "Ben", "", "", "", "", "", "", "", "", "", ""]], 0), null);
  assert.equal(Tn.play(fresh("wichteln", 1), [["Ana", "ana", "Cem", "", "", "", "", "", "", "", "", ""]], 0), null);
});
test("Geld einsammeln: nur der PayPal.me-Name reist, Betrag in Cent, Link geht nur zu paypal.me", () => {
  const d = through(Tn.play(fresh("sammeln", 1), ["maxmuster", "Pizza-Abend", 1, 700], 0)), m = Tn.moves(d), pay = Tn.GAMES.sammeln.turns[1][0];
  assert.equal(pay.link(d, m), "https://paypal.me/maxmuster/7EUR");
  assert.deepEqual(Tn.face(d, "de"), ["Pizza-Abend: 7 € pro Person an paypal.me/maxmuster", "Link öffnen und mit PayPal zahlen"]);
  assert.equal(Tn.face(fresh("sammeln", 1), "de"), null);
  assert.equal(Tn.state(d).turn, 1); assert.ok(Tn.GAMES.sammeln.stay, "derselbe Link fuer alle, niemand meldet zurueck, wer gezahlt hat");
  assert.ok(Tn.result(Tn.play(d, [0], 0), "de").note.includes("nur an Leute, die du kennst"));
  for (const bad of ["max muster", "max/../evil", "max?x=1", "max#a", "maxmuster.de", "a".repeat(21), "", "<b>", "max@paypal", "müller"]) assert.equal(Tn.play(fresh("sammeln", 1), [bad, "Pizza", 1, 500], 0), null, bad);
  for (const c of [0, 99, 5001, -500, 2.5, 1e9, "500"]) assert.equal(Tn.play(fresh("sammeln", 1), ["max", "Pizza", 1, c], 0), null, String(c));
  for (const k of [0, 21, 1.5, "2"]) assert.equal(Tn.play(fresh("sammeln", 1), ["max", "Pizza", k, 500], 0), null, String(k));
  assert.ok(Tn.play(fresh("sammeln", 1), ["Max2024", "Pizza", 1, 5000], 0)); assert.ok(Tn.play(fresh("sammeln", 1), ["M", "Pizza", 1, 100], 0));
  assert.ok(Tn.play(fresh("sammeln", 1), ["M", "Pizza", 20, 100000], 0), "50 Euro je Person bei 20 Personen");
  assert.equal(Tn.play(fresh("sammeln", 1), ["M", "Pizza", 20, 100001], 0), null);
  assert.equal(Tn.play(fresh("sammeln", 1), ["max", "Treff am Bahnhof", 1, 500], 0), null);
  // A link built by hand with a foreign name or a huge amount is dropped before anything is shown.
  const forged = forge("sammeln", 9, ["evil.com/x", "Pizza", 1, 500]);
  assert.equal(Tn.moves(forged).length, 0); assert.equal(pay.link(forged, Tn.moves(forged)), "");
  const big = forge("sammeln", 9, ["max", "Pizza", 1, 500000]);
  assert.equal(Tn.moves(big).length, 0);
  assert.deepEqual(CARD["zug-sammeln"].manifest.on, ["12-02"], "Kalendertag (Rotation selbst: Strang H)");
});
test("Geld einsammeln: Cent-Betraege und Aufteilen auf N Personen, Rest sichtbar, alte Links (ganze Euro) gehen weiter", () => {
  assert.deepEqual([Tn.parseCents("37,50"), Tn.parseCents("37.5"), Tn.parseCents("7 €"), Tn.parseCents("0,05"), Tn.parseCents("1.234,50"), Tn.parseCents("-3"), Tn.parseCents("")], [3750, 3750, 700, 5, null, null, null]);
  const d = through(Tn.play(fresh("sammeln", 1), ["maxmuster", "Pizza-Abend", 4, 3750], 0)), m = Tn.moves(d), pay = Tn.GAMES.sammeln.turns[1][0];
  assert.equal(pay.link(d, m), "https://paypal.me/maxmuster/9.37EUR", "Punkt als Dezimalzeichen, zwei Stellen");
  assert.deepEqual(Tn.split(3750, 4), { c: 3750, k: 4, e: 937, r: 2 });
  assert.deepEqual(Tn.face(d, "de"), ["Pizza-Abend: 9,37 € pro Person an paypal.me/maxmuster", "37,50 € geteilt durch 4 · Rest 2 ct übernimmt, wer sammelt", "Link öffnen und mit PayPal zahlen"]);
  assert.equal(Tn.face(d, "en")[0], "Pizza-Abend: €9.37 per person to paypal.me/maxmuster", "Englisch: Euro vor dem Betrag");
  assert.equal(pay.share(m, "de"), "9,37 €"); assert.equal(pay.share(m, "en"), "€9.37"); assert.equal(pay.more(m, "de"), Tn.face(d, "de")[1]);
  assert.equal(pay.link(Tn.play(fresh("sammeln", 1), ["max", "Pizza", 3, 3000], 0), [["max", "Pizza", 3, 3000]]), "https://paypal.me/max/10EUR");
  assert.equal(Tn.moneyLine(3000, 3, "de"), "30 € geteilt durch 3 · 10 € pro Person", "geht es auf, steht kein Rest da");
  // fair: everyone pays the same whole cents, the rest is under one cent per person and stays with the collector
  for (let c = 100; c <= 2000; c += 7) for (let k = 1; k <= 20; k++) { const x = Tn.split(c, k); if (x.e < 1) continue; assert.equal(x.e * k + x.r, c); assert.ok(x.r >= 0 && x.r < k); }
  // Altlinks ([Name, Zweck, Euro]) entfallen: das Linkformat v2 oeffnet keine Altlinks (02-spec/02-links.md).
});
test("Geld einsammeln: Obergrenze nur per Build-Flavor, ohne Flavor bleibt es bei 1 bis 50 Euro je Person", () => {
  // alt: globalThis.DailyFlavor.eur beim Bauen; neu: die Grenze ist ein Parameter von moneyOk, Standard EUR = [1, 50]
  const ok = (c, eur) => G2.moneyOk(c, 1, eur);
  assert.deepEqual(G2.EUR, [1, 50]);
  assert.equal(ok(5000), true); assert.equal(ok(5001), false); assert.equal(ok(99), false);
  assert.equal(ok(50000, [1, 500]), true); assert.equal(ok(50001, [1, 500]), false);
  assert.equal(Tn.play(fresh("sammeln", 1), ["max", "Pizza", 1, 5001], 0), null, "ein Link kann die Grenze nicht anheben");
});
test("Termin finden: Termine nur angetippt, bester Termin gewinnt, Gleichstand ehrlich, Grenzen halten", () => {
  const d = fresh("termin", 5), day = 20760, de = (x) => Tn.result(x, "de");
  const one = Tn.play(d, [["Mia", [day * 10 + 6, (day + 1) * 10 + 6, (day + 2) * 10 + 0]]], 0);
  assert.equal(Tn.face(d, "de"), null);
  assert.deepEqual(Tn.face(one, "de"), ["Zur Wahl: Di 3.11., 18 Uhr · Mi 4.11., 18 Uhr · Do 5.11., 10 Uhr", "Abgestimmt: 1", "Tipp, wann du kannst."]);
  const two = Tn.play(through(one), [["Ben", [2, 0, 1]]], 0), three = Tn.play(through(two), [["Lea", [1, 0, 2]]], 0);
  assert.equal(Tn.face(three, "de")[0], "Alle können: Mi 4.11., 18 Uhr");
  assert.equal(Tn.face(Tn.play(two, [["Lea", [0, 2, 2]]], 0), "de")[0], "Gleichauf: Di 3.11., 18 Uhr · Mi 4.11., 18 Uhr");
  assert.equal(Tn.face(Tn.play(two, [["Lea", [1, 2, 2]]], 0), "de")[0], "Die meisten können: Mi 4.11., 18 Uhr");
  assert.match(Tn.face(one, "en")[0], /^To choose from: Tue 11\/3, 6 pm · Wed 11\/4, 6 pm · Thu 11\/5, 10 am$/);
  // dates are taps: no text, 2 to 5, in order, only the offered hours
  for (const bad of [["Fr 18 Uhr", "Sa 14 Uhr"], [day * 10], [1, 2, 3, 4, 5, 6].map((i) => (day + i) * 10), [day * 10 + 1, day * 10], [day * 10 + 9, day * 10 + 19]]) assert.equal(Tn.play(d, [["Mia", bad]], 0), null, JSON.stringify(bad));
  // names go through the filter and count once, every date gets one of three answers
  for (const n of ["", "Treff 18 Uhr", "mia", "M i a", "!!", "abcdefghijklm"]) assert.equal(Tn.play(one, [[n, [0, 0, 0]]], 0), null, n);
  assert.equal(Tn.play(d, [["Treff am Bahnhof", [day * 10, day * 10 + 1]]], 0), null);
  for (const v of [[0, 0], [0, 0, 3], [0, 0, -1], [0, 0, 0, 0]]) assert.equal(Tn.play(one, [["Ben", v]], 0), null, JSON.stringify(v));
  // ten people at most, then the card is done; long names still fit into the link
  let x = Tn.play(d, [["Mia", [1, 2, 3, 4, 5].map((i) => (day + i) * 10 + 8)]], 0);
  for (let i = 0; i < 9; i++) x = through(Tn.play(x, [["Ääääääääää" + "BCDEFGHIJ"[i], [i % 3, 0, 1, 2, 1]]], 0));
  assert.equal(Tn.state(x).over, true); assert.equal(Tn.play(x, [["Zoe", [0, 0, 0, 0, 0]]], 0), null);
  assert.ok(linkLen(x) <= MAX_FRAGMENT, "Linklaenge " + linkLen(x));
  assert.equal(de(x).h, "Alle können: Do 5.11., 20 Uhr"); assert.match(de(x).lines.at(-1), /^Können: Mia, Ä[ä]{9}B, Ä[ä]{9}C \+7$/);
  // im Kalender an seinem Tag (Rotation: Strang H); 11-09 kam mit der eingeklappten Gruppen-Konferenz (plan-09)
  assert.deepEqual(CARD["zug-termin"].manifest.on, ["11-09", "12-04"]); assert.equal(CARD["zug-termin"].manifest.legacy["plan-09"], "termin");
});
test("Rangliste nennt den groessten Streit", () => {
  let d = Tn.play(fresh("rangliste", 0), [[0, 1, 2, 3, 4, 5, 6, 7]], 0); d = Tn.play(d, [[7, 1, 2, 3, 4, 5, 6, 0]], 0);
  const r = Tn.result(d, "de"); assert.match(r.lines[2], /Pausenbrot/); assert.equal(r.h, "56 Prozent einig");
});
test("Post an mich: oeffnet erst am gewaehlten Tag", () => {
  const d = Tn.play(fresh("post", 1), [["Mathe", "Gitarre", "Toast"], 30], 100);
  assert.equal(Tn.gate(d, 100), 30); assert.equal(Tn.gate(d, 130), 0);
  assert.equal(Tn.result(Tn.play(d, [[0], [1], [0]], 130), "de").h, "2 von 3 Vorhersagen stimmten");
});
test("Einkaufszettel: Eingabe mit Menge, nur gefilterter Text, Grenzen fuer kurze Links", () => {
  assert.deepEqual(["2× Milch", "2x Milch", "2 Milch", "2*Milch"].map(Tn.shopParse), Array(4).fill({ text: "Milch", qty: 2 }));
  assert.deepEqual(Tn.shopParse("10 Eier"), { text: "Eier", qty: 10 }); assert.deepEqual(Tn.shopParse("1,5 kg Mehl"), { text: "1,5 kg Mehl", qty: 1 });
  assert.deepEqual(Tn.shopParse("0 Milch"), { text: "0 Milch", qty: 1 }); assert.equal(Tn.shopParse("123 Milch").qty, 1);
  for (const bad of ["", "   ", "!!!", "\u0000\u0007", "<>"]) assert.equal(Tn.shopParse(bad), null, JSON.stringify(bad));
  const tag = Tn.shopParse("<img src=x onerror=alert(1)>Käse"); assert.ok(tag && !/[<>]/.test(tag.text), tag && tag.text);
  assert.equal(Tn.shopParse("Mil\u0000ch\u001b").text, "Mil ch"); assert.equal(Tn.shopParse("x".repeat(80)).text.length, Tn.SHOP.text);
  // a list from a link has to be one the screen could have built
  const ok = [[["Ana", 0]], [["Milch", 0, 2, [[0, 5]]]]];
  assert.ok(Tn.shopOk(ok));
  for (const bad of [
    [[], []], [[["Ana", 0]], [["Milch", 0, 2, [[1, 5]]]]], [[], [["Mil\u0007ch", 0, 1, []]]], [[], [["<b>", 0, 1, []]]], [[], [["Milch", 0, 0, []]]],
    [[], [["Milch", 0, 100, []]]], [[], [["Milch", 0, 1, []], ["milch!", 1, 1, []]]], [[["Ana", 0], ["ana", 1]], [["Milch", 0, 1, [[0, 5]]]]],
    [[["Ana", 12]], [["Milch", 0, 1, [[0, 5]]]]], [[["Ana", 0]], [["Milch", 0, 1, [[0, 5], [0, 4]]]]], [[["Ana", 0]], [["Milch", 0, 1, [[0, 0]]]]],
    [[], Array.from({ length: 21 }, (x, i) => ["S" + i, i, 1, []])], [[], [["Milch", 0, 1, []]], 1], [[["Treff 18 Uhr am Bahnhof", 0]], [["Milch", 0, 1, [[0, 5]]]]]
  ]) assert.equal(Tn.shopOk(bad), false, S(bad));
  // forged links with such a list are dropped before anything is shown
  const forged = forge("einkauf", 4, [[[], [["<script>", 0, 1, []]]]]);
  assert.equal(Tn.moves(forged).length, 0); assert.equal(Tn.state(forged).turn, 0);
  // the fullest list still fits a link that opens again
  const long = (i) => "Ää" + String(i).padStart(2, "0") + "x".repeat(Tn.SHOP.text - 4);
  let full = Tn.shopApply(null, { name: "", adds: Array.from({ length: 30 }, (x, i) => ({ text: long(i), qty: 99 })) });
  for (const n of ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh", "Ii", "Jj"]) full = Tn.shopApply(full, { name: n + "ääääääää", face: 11, marks: Object.fromEntries(Tn.shopRows(full).map((r) => [r.key, 1])) });
  assert.ok(Tn.shopOk(full)); assert.ok(full[1].length <= Tn.SHOP.items && full[0].length <= Tn.SHOP.people, S(full).length);
  const d = through(Tn.play(fresh("einkauf", 4294967295), [full], 0));
  assert.deepEqual(shopList(d), full); assert.ok(linkLen(d) <= MAX_FRAGMENT, "Linklaenge " + linkLen(d));
  // (KI-Siegel ki/h im Link: Strang K, freie Karte und KI-Arten)
});
test("Einkaufszettel: Antworten werden zusammengefuehrt, egal in welcher Reihenfolge sie ankommen", () => {
  // Mia writes four things and shares the link
  const a = Tn.shopApply(null, edit("", 0, ["2× Milch", "Brot", "Käse", "6 Äpfel"]));
  const d = through(Tn.play(fresh("einkauf", 77), [a], 0));
  assert.equal(Tn.state(d).turn, 1); assert.deepEqual(Tn.face(d, "de"), ["4 Sachen · 0 gekauft · 0 bringt jemand mit"]);
  // Ben and Lea answer the same link at the same time
  const ben = Tn.shopApply(shopList(d), edit("Ben", 3, ["Chips", "3 Milch"], { brot: 1, kase: 2 }));
  const lea = Tn.shopApply(shopList(d), edit("Lea", 2, ["Saft", "Chips"], { kase: 2, apfel: 1 }));
  const one = Tn.shopMerge(Tn.shopMerge(a, ben), lea), two = Tn.shopMerge(Tn.shopMerge(a, lea), ben);
  assert.equal(S(one), S(two), "Reihenfolge egal"); assert.equal(S(Tn.shopMerge(one, ben)), S(one), "dieselbe Antwort zweimal aendert nichts");
  assert.deepEqual(rowsOf(one), {
    "3× Milch": { b: [], c: [] }, Brot: { b: [], c: ["Ben"] }, "Käse": { b: ["Ben", "Lea"], c: [] }, "6× Äpfel": { b: [], c: ["Lea"] },
    Chips: { b: [], c: [] }, Saft: { b: [], c: [] }
  }, "beide Neuen da, Chips nur einmal, groessere Menge gewinnt, beide haben Kaese gekauft");
  // the reply link carries only the list as it is now: the link stays one move long
  const back = through(Tn.play(d, [ben], 0)); assert.equal(Tn.moves(back).length, 1);
  // Ben takes his "I'll bring it" back: the later version wins against the copy Lea still has
  const ben2 = Tn.shopApply(one, edit("Ben", 3, [], { brot: 0 }));
  assert.deepEqual(rowsOf(Tn.shopMerge(Tn.shopMerge(one, lea), ben2)).Brot, { b: [], c: [] });
  assert.deepEqual(rowsOf(Tn.shopMerge(ben2, ben)).Brot, { b: [], c: [] }, "ein alter Link holt das Mitbringen nicht zurueck");
  // the same name on two phones at once: the stronger state wins on both phones
  const p1 = Tn.shopApply(one, edit("Ben", 3, [], { saft: 1 })), p2 = Tn.shopApply(one, edit("ben", 3, [], { saft: 2 }));
  assert.equal(S(Tn.shopMerge(p1, p2)), S(Tn.shopMerge(p2, p1))); assert.deepEqual(rowsOf(Tn.shopMerge(p1, p2)).Saft, { b: ["Ben"], c: [] });
  // tapping back to what came in is no change at all
  assert.equal(S(Tn.shopApply(one, edit("Ben", 3, [], { kase: 2, brot: 1 }))), S(one));
  // everything bought: the list is done and the result names who bought what
  let all = one; for (const r of Tn.shopRows(one)) all = Tn.shopApply(all, edit("Mia", 0, [], { [r.key]: 2 }));
  const done = through(Tn.play(d, [all], 0));
  assert.equal(Tn.state(done).over, true); assert.equal(Tn.result(done, "de").h, "Alles eingekauft!");
  assert.equal(Tn.result(done, "de").lines[2], "Käse: Ben, Lea, Mia"); assert.equal(Tn.result(done, "en").h, "All bought!");
});
test("Einkaufszettel: Zusammenfuehren ist kommutativ, assoziativ und idempotent (Zufallsfaelle)", () => {
  const r = mulberry32(20261104), pick = (l) => l[Math.floor(r() * l.length)];
  const words = ["Milch", "Brot", "Käse", "Äpfel", "Chips", "Saft", "Eier", "Nudeln", "Reis", "Tee", "Kekse", "Gurke"], who = ["Ana", "Ben", "Cem", "Dag", "Eva"];
  const step = (v) => {
    const keys = v ? Tn.shopRows(v).map((x) => x.key) : [], marks = {};
    for (let i = 0; i < 3 && keys.length; i++) marks[pick(keys)] = Math.floor(r() * 3);
    return Tn.shopApply(v, { name: pick(who), face: Math.floor(r() * 12), adds: Array.from({ length: Math.floor(r() * 3) }, () => ({ text: pick(words), qty: 1 + Math.floor(r() * 4) })), marks });
  };
  for (let n = 0; n < 200; n++) {
    let base = step(null); while (!base[1].length) base = step(null);
    const x = step(step(base)), y = step(base), z = step(step(step(base)));
    assert.equal(S(Tn.shopMerge(x, y)), S(Tn.shopMerge(y, x)), "kommutativ");
    assert.equal(S(Tn.shopMerge(Tn.shopMerge(x, y), z)), S(Tn.shopMerge(x, Tn.shopMerge(y, z))), "assoziativ");
    assert.equal(S(Tn.shopMerge(x, x)), S(x), "idempotent");
    const m = Tn.shopMerge(Tn.shopMerge(x, y), z);
    assert.ok(Tn.shopOk(m), S(m));
    for (const v of [x, y, z]) for (const k of Tn.shopRows(v).map((q) => q.key)) assert.ok(Tn.shopRows(m).some((q) => q.key === k), "nichts geht verloren: " + k);
  }
});
test("Einkaufszettel: Obergrenzen schneiden nach fester Regel, nie zufaellig", () => {
  const fill = (n, name) => Tn.shopApply(null, { name: "", adds: Array.from({ length: n }, (x, i) => ({ text: name + i, qty: 1 })) });
  const a = fill(15, "A"), b = fill(15, "B"), m = Tn.shopMerge(a, b);
  assert.equal(m[1].length, Tn.SHOP.items); assert.equal(S(m), S(Tn.shopMerge(b, a)));
  assert.deepEqual(m[1].slice(0, 2).map((x) => x[0]), ["A0", "B0"], "nach Platz in der Liste, dann nach Text");
  // a full list takes no more: the new item is the one that does not fit
  assert.equal(Tn.shopApply(fill(20, "C"), edit("", 0, ["Brot"]))[1].some((x) => x[0] === "Brot"), false);
  // nine people mark the same thing: only eight names fit into a link, by a fixed order
  let v = fill(1, "D"); for (const n of ["Ii", "Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh"]) v = Tn.shopApply(v, { name: n, face: 0, marks: { d0: 1 } });
  assert.equal(v[0].length, Tn.SHOP.people); assert.ok(Tn.shopOk(v)); assert.ok(!v[0].some((p) => p[0] === "Ii"));
});
test("Wunschzettel: endet nie dadurch, dass alles vergeben ist, nur durch Schliessen; danach geht kein Zug mehr", () => {
  let d = fresh("wunsch", 7);
  assert.equal(Tn.close(d), null, "leerer Zettel schliesst nicht");
  d = through(Tn.play(d, [[[], [["Rad", 0, 1, []], ["Buch", 1, 1, []]]]], 100));
  const all = through(Tn.play(d, [[[["Ana", 0], ["Ben", 1]], [["Rad", 0, 1, [[0, 1]]], ["Buch", 1, 1, [[1, 1]]]]]], 100));
  assert.equal(Tn.state(all).over, false, "alles vergeben, Zettel bleibt offen");
  assert.equal(Tn.result(all, "de"), null);
  assert.deepEqual(Tn.face(all, "de"), Tn.face(d, "de"), "Blatt sieht gleich aus mit 0 und allen Reservierungen");
  // still open: a giver lets go again
  const back = Tn.play(all, [[[["Ana", 0], ["Ben", 1]], [["Rad", 0, 1, [[0, 3]]], ["Buch", 1, 1, [[1, 1]]]]]], 100);
  assert.ok(back && !Tn.shopRows(Tn.moves(back)[0][0], Tn.WISH)[0].bring.length, "Freigeben geht weiter");
  // (eigener Link o: 1: offen, s. o.)
  const shut = through(Tn.close(all));
  assert.equal(shut.st.pub.o, 2); assert.equal(Tn.state(shut).over, true);
  assert.equal(Tn.result(shut, "de").h, "Wunschzettel geschlossen");
  assert.deepEqual(Tn.result(shut, "de").lines, ["Rad", "Buch"], "nur die Wünsche, kein Name");
  assert.deepEqual(Tn.result(through(Tn.close(d)), "de"), Tn.result(shut, "de"), "geschlossen sieht gleich aus mit 0 und allen Reservierungen");
  assert.equal(Tn.play(shut, [[[], [["Rad", 0, 1, []]]]], 100), null, "nach dem Schliessen kein Zug");
  assert.equal(Tn.close(shut), null);
});
test("Geschenkideen ohne KI: fünf im Budget, passende zuerst, Reihenfolge nur aus dem Seed", () => {
  const W = Object.keys(G.WHO), L = Tn.GIFT.likes;
  for (const lang of ["de", "en"]) for (const who of W) for (const euro of [5, 10, 15, 20, 30, 50]) for (let a = 0; a < L.length; a += 3) {
    const ask = { who, euro, likes: [L[a], L[(a + 5) % L.length]] }, got = G.ideas(1234, ask, lang);
    assert.equal(got.length, 5, [lang, who, euro].join());
    assert.equal(new Set(got).size, 5);
    for (const t of got) {
      const x = G.LIST.find((i) => G.text(i, lang) === t);
      assert.ok(x && x[1] <= euro && x[3].includes(G.WHO[who]), t + " " + who + " " + euro);
    }
    const fits = G.LIST.filter((x) => x[1] <= euro && x[3].includes(G.WHO[who]) && ask.likes.some((l) => x[2].split(" ").includes(l)));
    const hit = got.filter((t) => fits.some((x) => G.text(x, lang) === t)).length;
    assert.equal(hit, Math.min(5, fits.length), "passende Ideen zuerst: " + [who, euro, ask.likes].join());
    assert.deepEqual(G.ideas(1234, ask, lang), got, "gleicher Seed, gleiche Ideen");
  }
  const ask = { who: "kollege", euro: 20, likes: ["tee", "spiel"] }, orders = new Set();
  for (let s = 0; s < 30; s++) orders.add(G.ideas(s, ask, "de").join());
  assert.ok(orders.size > 3, "der Seed mischt");
  const P = GJSON;
  for (const x of G.LIST) {
    assert.equal(x.length, 4, "[Taste, Euro, Vorlieben, für wen], die Wörter stehen in geschenke.json");
    for (const lang of ["de", "en"]) { const t = P[lang]["gi_" + x[0]]; assert.ok(t, lang + " gi_" + x[0]); assert.equal(Q.clean(t, G.MAX), t, "passt in den Link: " + t); assert.ok(G.ok(t), "kein Ausschlusswort: " + t); }
    assert.ok([5, 10, 15, 20, 30, 50].includes(x[1]), x[0]);
    for (const l of x[2].split(" ")) assert.ok(L.includes(l), x[0] + " " + l);
    assert.match(x[3], /^[ktaob]+$/, x[0]);
  }
  assert.equal(new Set(G.LIST.map((x) => x[0])).size, G.LIST.length);
  for (const lang of ["de", "en"]) assert.equal(new Set(G.LIST.map((x) => G.text(x, lang))).size, G.LIST.length, lang + ": jede Idee nur einmal");
  assert.deepEqual(Object.keys(P.de).filter((k) => k.startsWith("gi_")).sort(), G.LIST.map((x) => "gi_" + x[0]).sort(), "keine Ideentexte ohne Eintrag in der Liste");
});
test("KI-Art liste: nur saubere, neue, harmlose Texte, höchstens fünf; Alkohol, Rauchen, Glücksspiel, Diät und Intimes fallen weg, Wetterstation bleibt", () => {
  const opt = { posten: [{ n: "Teesorten-Set" }, { n: "Rotwein" }, { n: "Teesorten-Set" }, { n: "Diät-Ratgeber" }, { n: "Sukkulente im Topf" }, { n: "<b>Kerze</b>" },
    { n: "Gin-Tasting" }, { n: "Notizbuch A5" }, { n: "Puzzle" }, { n: "Kalender" }, { n: "Kartenspiel" }, { n: "x".repeat(60) }] };
  const got = G.fromAi(opt, "de");
  assert.equal(got.length, 5);
  assert.deepEqual(got.slice(0, 2), ["Teesorten-Set", "Sukkulente im Topf"], "doppelt fällt weg, Reihenfolge bleibt");
  for (const t of got) { assert.ok(!/wein|diät|gin|[<>]/i.test(t), t); assert.equal(Q.clean(t, 40), t); }
  // the stop words hit words, not parts of harmless ones (Wetterstation, paperweight, origin, team spirit)
  for (const t of ["Wetterstation", "Paperweight", "Origami-Set", "Origin-Puzzle", "Team spirit mug", "Essex tea"]) assert.ok(G.ok(t), "harmlos: " + t);
  for (const t of ["Sportwetten-Gutschein", "Wette", "Spirits sampler", "Weight loss book", "Sexy socks", "Gin Tonic"]) assert.ok(!G.ok(t), "fällt weg: " + t);
  assert.deepEqual(G.fromAi(null, "de"), []); assert.deepEqual(G.fromAi({ posten: [{ n: "Bier" }, { n: "Lingerie" }] }, "en"), []);
  // one rule, word by word: harmless words that only look like an excluded one stay, German compounds of a drink go
  for (const t of ["Wetterstation", "Weather station", "Video game", "Paperweight", "Egg whisk", "Ginger tea", "Drum sticks", "Insektenhotel", "Sparschwein", "Tee-Probierset", "Origami-Papier",
    "Badesalz", "Massageball"]) assert.ok(G.ok(t), "bleibt: " + t);
  for (const t of ["Rotwein", "Glühwein", "Sekt", "Freibier", "Whisky-Gläser", "Gin-Tasting", "Red wine", "Craft beer", "Zigarren", "Sportwette", "Wetten, dass", "Lottoschein", "Casino-Gutschein",
    "Diät-Ratgeber", "Kalorienzähler", "Diet book", "Parfüm", "Deo", "Lingerie", "Erotik-Kalender"]) assert.equal(G.ok(t), false, "fällt weg: " + t);
  assert.deepEqual(G.fromAi({ posten: [{ n: "Wetterstation" }, { n: "Glühwein" }, { n: "Insektenhotel" }] }, "de"), ["Wetterstation", "Insektenhotel"]);
});
test("Geschenk in drei Fragen über Links: zweite Stimme, Ergebnis in de/en, weiter zu „Geld einsammeln“; kaputte Antworten fallen", () => {
  const five = G.ideas(5, { who: "oma", euro: 30, likes: ["lesen", "pflanze"] }, "de");
  const d = run("geschenk", 5, [[[4], [2], [2, 1], [five, 3]]]);
  assert.ok(d);
  assert.deepEqual(Tn.face(d, "de"), ["Vorschlag: " + five[3], "bis 30 €"]);
  const same = Tn.play(d, [[3]], 0), other = Tn.play(d, [[0]], 0);
  assert.equal(Tn.result(same, "de").h, "Einig: " + five[3]);
  assert.deepEqual(Tn.result(other, "de").lines, ["Erste Wahl: " + five[3], "Zweite Stimme: " + five[0], "bis 30 €"]);
  assert.equal(Tn.result(other, "en").h, "Two favourites"); assert.equal(Tn.result(other, "en").lines[2], "up to €30");
  assert.ok(CARD[Tn.result(same, "de").open.i], "die Folgekarte gibt es");
  const ideas = Tn.GAMES.geschenk.turns[0][3];
  for (const bad of [[five.concat(["Noch eins"]), 0], [["A", "a"], 0], [["Kerze"], 1], [["x".repeat(41)], 0], [["<script>"], 0], [[], 0], ["Kerze", 0]])
    assert.equal(okAnswer(ideas, bad), false, JSON.stringify(bad));
  assert.equal(okAnswer(ideas, [["Kerze", "Tee"], 1]), true);
  assert.equal(run("geschenk", 5, [[[7], [2], [2, 1], [five, 3]]]), null, "nur vorhandene Personen");
  assert.equal(run("geschenk", 5, [[[1], [2], [2, 2], [five, 3]]]), null, "zwei verschiedene Vorlieben");
  // (Business-Variante wichtelidee: Flavor business, 12-paritaet §1d, nicht Z1)
});
test("Wunschzettel: der eigene Link trägt nur Wünsche, der Familienlink verdeckt, wer schenkt; das Bild nennt niemanden", () => {
  const W = Tn.WISH, list = [[], [["Hörbuch", 0, 1, []], ["Fahrradlicht", 1, 1, []], ["Puzzle", 2, 1, []]]];
  const b0 = run("wunsch", 11, [[list]]);
  assert.ok(b0);
  const mom = Tn.shopApply(Tn.moves(b0)[0][0], { name: "Mama", face: 0, adds: [], marks: { [Tn.shopKey("Hörbuch")]: 1 } }, W);
  const b1 = Tn.play(b0, [mom], 0);
  assert.deepEqual(Tn.shopRows(Tn.moves(b1)[0][0], W).map((r) => r.bring.map((p) => p[0]).join()), ["Mama", "", ""]);
  // Ihr eigener Link (o: 1, nur Wuensche) ist im Neubau noch offen; die Liste ohne Marken liefert wishBare weiter:
  const v = Tn.wishBare(Tn.moves(b1)[0][0]);
  assert.deepEqual(v[0], []); assert.ok(v[1].every((it) => it[3].length === 0)); assert.ok(!JSON.stringify(v).includes("Mama"), "kein Name ohne Marken");
  const fromOwn = Tn.play(b1, [Tn.shopApply(v, { name: "", face: 0, adds: [{ text: "Schal", qty: 1 }], marks: {} }, W)], 0);
  const merged = Tn.shopMerge(Tn.moves(fromOwn)[0][0], Tn.moves(b1)[0][0], W);
  assert.deepEqual(Tn.shopRows(merged, W).map((r) => r.label + ":" + r.bring.length), ["Hörbuch:1", "Fahrradlicht:0", "Puzzle:0", "Schal:0"]);
  // face and result never name a giver
  for (const lang of ["de", "en"]) {
    const f = Tn.face(b1, lang).join(" "); assert.ok(!f.includes("Mama")); assert.match(f, /^3 (Wünsche|wishes)$/);
  }
  const all = Tn.shopApply(Tn.moves(b1)[0][0], { name: "Oma", face: 1, adds: [], marks: { [Tn.shopKey("Fahrradlicht")]: 1, [Tn.shopKey("Puzzle")]: 1 } }, W);
  const full = Tn.play(b1, [all], 0);
  assert.equal(Tn.state(full).over, false, "alles vergeben beendet den Zettel nicht (das würde es ihr verraten)");
  const done = Tn.close(full);
  assert.equal(Tn.state(done).over, true, "erst ihr Schließen");
  assert.ok(!/Mama|Oma/.test(JSON.stringify(Tn.result(done, "de"))));
  assert.equal(Tn.face(run("wunsch", 1, [[[[], [["Rad", 0, 1, []]]]]]), "de")[0], "1 Wunsch");
  // a count or a second item with the same text is no wish
  assert.equal(run("wunsch", 1, [[[[], [["Rad", 0, 2, []]]]]]), null);
  assert.equal(run("wunsch", 1, [[[[], [["Rad", 0, 1, []], ["rad", 1, 1, []]]]]]), null);
});
