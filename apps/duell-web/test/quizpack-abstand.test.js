"use strict";
// G11 Schätzen der freien Karte (Bauplan freie Karte A6): Doc-Form k:'turn', g:'schaetzen', pk mit u (Einheit je Frage).
// Der Absender kennt jede Zahl (z, nie vom Modell), er sendet nur; der Empfänger schätzt. Das Ende zeigt je Frage den
// Abstand mit Einheit und eine Gesamtzeile aus festen Sätzen (Teil quiz), nie eine Prozentangabe.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
const P = require("../src/quizpack.js");
require("../src/quizspiele.js");   // die festen Sätze kommen mit dem Teil quiz (quizspiele.json ui), wie in der Seite
const me = { emoji: "🐙", nick: "M", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const through = (d) => { const r = D.parseRoute("#" + D.docUrl(d).split("#")[1]); assert.equal(r.type, "doc"); return r.doc; };
// raum-schaetzen: since Regal 74 off the shelf (retired), a link and the free card still open it
const idea = D.IDEAS.concat(D.RETIRED).find((i) => i.turn && i.turn.g === "schaetzen");
const card = (pk, seed) => { const d = D.docFromIdea(idea, me, "de"); d.pk = pk; return Tn.fresh(d, seed || 77); };
const RAD = { t: "Meine Radtour", m: "l", q: [["Wie viele km bin ich geradelt?"], ["Wie viele Pausen habe ich gemacht?"], ["Wie viele Höhenmeter waren es?"]], z: [42, 3, 350], u: ["km", "", "m"] };
// Absender sendet (ein Schritt), Empfänger schätzt; alles über echte Links
function spiel(pk, tipps, seed) {
  let d = through(card(P.sanitize(pk), seed));
  const s0 = Tn.state(d);
  assert.equal(s0.prompts.length, 1, "der Absender schätzt nicht, er sendet nur");
  d = through(Tn.play(d, [0], 100));
  d = through(Tn.play(d, tipps, 100));
  assert.ok(Tn.state(d).over);
  return d;
}

test("A6: z=42 und Antwort 39 ergeben '3 km daneben', genau getroffen ohne Zahl, Gesamtzeile aus festen Sätzen", () => {
  const d = spiel(RAD, [39, 3, 400]), r = Tn.result(d, "de"), e = Tn.result(d, "en");
  assert.equal(r.h, "Meine Radtour");
  assert.deepEqual(r.lines, [
    "Ganz nah dran.",
    "Wie viele km bin ich geradelt? (42 km): 3 km daneben",
    "Wie viele Pausen habe ich gemacht? (3): genau getroffen",
    "Wie viele Höhenmeter waren es? (350 m): 50 m daneben"
  ]);
  assert.equal(e.lines[1], "Wie viele km bin ich geradelt? (42 km): 3 km off");
  assert.equal(Tn.result(spiel(RAD, [42, 3, 350]), "de").lines[0], "Alles genau getroffen!");
  assert.equal(Tn.result(spiel(RAD, [20, 3, 350]), "de").lines[0], "Gut geschätzt.");
  assert.equal(Tn.result(spiel(RAD, [0, 0, 0]), "de").lines[0], "Da war noch Luft. Revanche?");
  for (const x of [r, e]) assert.ok(!/%|Prozent|percent|undefined|\{\w+\}/.test(JSON.stringify(x)), JSON.stringify(x));
  // die vier Sätze stehen fest in beiden Sprachen (Teil quiz), kein Modelltext
  for (const l of ["de", "en"]) for (const k of ["pk_t0", "pk_t1", "pk_t2", "pk_t3", "pk_near", "pk_ql", "pk_dn", "pk_d0"]) assert.ok(require("../src/quizspiele.json")[l].ui[k], l + " " + k);
});

test("A6: sanitize verwirft Fragen ohne z oder mit ungültigem z (NaN, > 1e9, keine ganze Zahl)", () => {
  const q4 = RAD.q.concat([["Wie viele Brücken?"]]);
  for (const bad of [NaN, 1e10, 2e9, 4.5, "42", null, undefined, 0, 1, -3, Infinity]) {
    const pk = P.sanitize(Object.assign({}, RAD, { q: q4, z: [42, 3, 350, bad], u: ["km", "", "m", ""] }));
    assert.equal(pk.q.length, 3, String(bad)); assert.deepEqual(pk.z, [42, 3, 350]); assert.deepEqual(pk.u, ["km", "", "m"]);
  }
  // eine ungültige Zahl in der Mitte: Frage, Zahl und Einheit gehen zusammen, die übrigen bleiben in Reihe
  const mid = P.sanitize(Object.assign({}, RAD, { q: q4, z: [42, NaN, 350, 7], u: ["km", "x", "m", "Stück"] }));
  assert.deepEqual(mid.q.map((r) => r[0]), [RAD.q[0][0], RAD.q[2][0], "Wie viele Brücken?"]); assert.deepEqual(mid.z, [42, 350, 7]); assert.deepEqual(mid.u, ["km", "m", "Stück"]);
  // unter drei gültigen Zahlen kein Paket
  assert.equal(P.sanitize(Object.assign({}, RAD, { z: [42, 1e12, 350] })), null);
  // Lernpakete (ohne u): z = 0 heißt "keine Zahlenfrage" und bleibt; ein ungültiges z nimmt die Frage mit
  const LP = { t: "Planeten", m: "l", q: [["Wie viele Planeten?", "8", "9", "7"], ["Größter Planet?", "Jupiter", "Saturn", "Erde"], ["Roter Planet?", "Mars", "Venus", "Pluto"], ["Monde des Mars?", "2", "0", "1"]] };
  assert.deepEqual(P.sanitize(Object.assign({}, LP, { z: [8, 0, 0, 2] })).z, [8, 0, 0, 2]);
  const lp = P.sanitize(Object.assign({}, LP, { z: [8, 0, 0, NaN] }));
  assert.equal(lp.q.length, 3); assert.deepEqual(lp.z, [8, 0, 0]);
  assert.equal(P.sanitize(Object.assign({}, LP, { z: [8, 0, 0, 5] })).q.length, 3, "z passt nicht zur Antwort: Frage geht");
  // Texte durch den Filter: Einheit ≤ 8, Frage ≤ 80, keine Links
  const cut = P.sanitize(Object.assign({}, RAD, { q: [["x".repeat(200)], ["Wo? https://x.de"], RAD.q[1], RAD.q[2]], z: [42, 5, 3, 350], u: ["Kilometerchen", "km", "", "m"] }));
  assert.equal(cut.q[0][0].length, 80); assert.equal(cut.u[0], "Kilomete"); assert.equal(cut.q.length, 3);
  // ein Paket mit Einheiten passt nur auf Schätzen
  const pk = P.sanitize(RAD);
  for (const g of ["abfragen", "luecke", "woerter", "quiz", "typen"]) assert.equal(P.fits(g, pk), false, g);
  assert.equal(P.fits("schaetzen", pk), true);
});

test("A6: ein Link mit 5 Fragen ist ≤ 1200 Zeichen (lange Fragen, Umlaute, 6-stellige Zahlen, nach beiden Zügen)", () => {
  const q = [1, 2, 3, 4, 5].map((i) => ["Wie viele Kilometer über Brücken, Äcker und Hügel bin ich diesen Sommer geradelt? Nr. " + i + " ÄÖÜäöüß"]);
  const pk = P.sanitize({ t: "Meine Radtour durch ganz Süddeutschland!", m: "l", q, z: [999999, 999998, 999997, 999996, 999995], u: ["Kilomete", "Höhenmet", "Äpfelchen", "Stündchen", "Brücken"] });
  assert.equal(pk.q.length, 5); assert.ok(pk.q.every((r) => r[0].length === 80));
  let d = card(pk), len = [D.docUrl(d).length];
  d = through(Tn.play(d, [0], 100)); len.push(D.docUrl(d).length);
  d = Tn.play(d, Tn.state(d).prompts.map((p) => p.maxOf(d)), 100); len.push(D.docUrl(d).length);
  console.log("Linklaengen frisch / gesendet / fertig: " + len.join(" / "));
  for (const n of len) assert.ok(n <= 1200, "Link " + n);
  assert.ok(D.docUrl(d).split("#c=")[1].length <= C.MAX_FRAGMENT - 80);
  assert.deepEqual(D.sanitizeDoc(through(d)).pk, pk, "das Paket kommt unverändert an");
});

test("A6: Snapshot des Ende-Inhalts ohne '%', Blasen-Muster: data-part an Frage und Einheit", () => {
  const d = spiel(RAD, [39, 3, 400]);
  // was turn-ui.js A.PANEL.Move am Ende zeigt: res.h, res.lines, res.note
  const snap = (lang) => { const r = Tn.result(d, lang); return [r.h].concat(r.lines, r.note ? [r.note] : []).join("\n"); };
  assert.equal(snap("de"), "Meine Radtour\nGanz nah dran.\nWie viele km bin ich geradelt? (42 km): 3 km daneben\nWie viele Pausen habe ich gemacht? (3): genau getroffen\nWie viele Höhenmeter waren es? (350 m): 50 m daneben");
  assert.ok(!snap("de").includes("%") && !snap("en").includes("%"));
  // die Schritte des Empfängers: Frage und Einheit als Teile (dp -> data-part in turn-ui.js), der Teil quiz kommt vorher
  let r = through(Tn.play(card(P.sanitize(RAD)), [0], 100));
  const g = Tn.game(r), p = Tn.state(r).prompts;
  assert.equal(g.part, "quiz");
  assert.deepEqual(p.map((x) => [x.w, x.dp, x.unit]), [["slide", "frage", "km"], ["slide", "frage", ""], ["slide", "frage", "m"]]);
  assert.equal(p[0].peek(r), "Wie viele km bin ich geradelt?");
  // turn-ui.js setzt data-part an die Frage (wo der Schritt dp sagt) und an jede Einheit des Reglers
  const ui = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/turn-ui.js"), "utf8");
  assert.match(ui, /if \(p\.dp\) pe\.dataset\.part = p\.dp;/); assert.match(ui, /if \(u\) u\.dataset\.part = "einheit";/);
  // Lernpakete (zwei Spieler) zeigen ebenfalls Abstände statt Prozent
  const LP = { t: "Zahlen", m: "l", q: [["Planeten?", "8"], ["Monde des Mars?", "2"], ["Tage im Jahr?", "365"]], z: [8, 2, 365] };
  let l = card(P.sanitize(LP));
  l = through(Tn.play(l, [7, 2, 300], 100)); l = through(Tn.play(l, [8, 3, 365], 100));
  assert.deepEqual(Tn.result(l, "de").lines, ["Spieler 1: Gut geschätzt.", "Spieler 2: Gut geschätzt.", "Planeten? (8): 1 daneben / genau getroffen", "Monde des Mars? (2): genau getroffen / 1 daneben", "Tage im Jahr? (365): 65 daneben / genau getroffen"]);
});
