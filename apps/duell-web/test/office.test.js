"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const Tn = require("../src/turns.js");
const O = require("../src/office.js");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const start = (g) => ({ g, seed: 7, q: "", f: "star" });
const run = (g, moves) => moves.reduce((d, m) => d && Tn.play(d, m, 0), start(g));

test("Office: die vier Karten haengen in der gemeinsamen Spieltabelle, Texte in beiden Sprachen", () => {
  for (const g of O.CARDS) assert.ok(Tn.GAMES[g] && Tn.IDS.includes(g), g);
  const de = require("../src/office.json").de, en = require("../src/office.json").en;
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
});
test("Umfrage: Stimmen zaehlen, Gleichstand nennen, derselbe Name stimmt nicht zweimal ab", () => {
  const d = run("umfrage", [["Ana", "Wo essen wir?", ["Pizza", "Sushi", "", ""], [1]], ["Ben", [0]]]);
  assert.deepEqual(O.pollCount(Tn.moves(d)), [1, 1]);
  assert.equal(O.face(d, "de")[1], "Gleichstand: Pizza · Sushi");
  assert.equal(Tn.play(d, ["ANA", [0]], 0), null);
  assert.equal(Tn.play(d, ["Cem", [2]], 0), null, "nur vorhandene Antworten");
  assert.equal(O.face(Tn.play(d, ["Cem", [0]], 0), "en")[1], "Ahead: Pizza");
  assert.equal(run("umfrage", [["Ana", "Frage?", ["Nur eine", "", "", ""], [0]]]), null, "mindestens zwei Antworten");
});
test("Aufgaben: jede nur einmal, Karte endet, wenn alle vergeben sind", () => {
  const d = run("aufgaben", [["Sommerfest", ["Grill", "Musik", "Deko", "", ""]], ["Ben", [1]], ["Cem", [0]]]);
  assert.deepEqual(O.owners(Tn.moves(d)), ["Cem", "Ben", ""]);
  assert.equal(Tn.state(d).over, false);
  assert.equal(Tn.play(d, ["Dag", [1]], 0), null, "nur offene Aufgaben");
  const end = Tn.play(d, ["Dag", [0]], 0);
  assert.equal(Tn.state(end).over, true);
  assert.deepEqual(Tn.result(end, "de").lines, ["Grill → Cem", "Musik → Ben", "Deko → Dag"]);
});
test("Feedback ohne Namen: Mittelwert, leerer Kommentar erlaubt, Note nur 1 bis 5", () => {
  const d = run("feedback", [["Workshop"], [4, ["Gut erklärt"]], [5, [""]]]);
  assert.deepEqual(O.face(d, "de"), ["Workshop", "Ø 4,5 von 5 · 2 Rückmeldungen", "Ohne Namen"]);
  assert.equal(Tn.play(d, [6, [""]], 0), null);
  assert.ok(!JSON.stringify(Tn.moves(d)).includes("Ana"));
});
test("Agenda: Punkte mit Namen, doppelter Punkt wird abgelehnt, Karte bietet den Call an", () => {
  const d = run("agenda", [["Weekly", ["Zahlen", "", ""], "Ana"], ["Ben", "Urlaub"]]);
  assert.deepEqual(O.face(d, "de"), ["Weekly", "1. Zahlen (Ana)", "2. Urlaub (Ben)"]);
  assert.equal(Tn.play(d, ["Cem", "zahlen"], 0), null);
  assert.equal(Tn.GAMES.agenda.call, true);
});
test("Linkgroesse: jede Karte voll belegt mit laengsten Eingaben bleibt unter den Grenzen von turns.js und Link", () => {
  const n = (i) => "Name" + "abcdefghijkl".slice(i) + "xyzxyzxyzxyz".slice(0, i);
  const full = {
    umfrage: [[n(0), "x".repeat(60), ["a", "b", "c", "d"].map((c) => c.repeat(24)), [0]]].concat([...Array(9)].map((_, i) => [n(i + 1), [i % 4]])),
    feedback: [["t".repeat(60)]].concat([...Array(6)].map(() => [3, ["ü".repeat(30)]])),
    aufgaben: [["w".repeat(40), ["a", "b", "c", "d", "e"].map((c) => c.repeat(24))]].concat([...Array(5)].map((_, i) => [n(i), [0]])),
    agenda: [["t".repeat(40), ["a", "b", "c"].map((c) => c.repeat(30)), n(0)]].concat([...Array(6)].map((_, i) => [n(i + 1), "x".repeat(29) + "abcdef"[i]]))
  };
  for (const g of Object.keys(full)) {
    const d = run(g, full[g]);
    assert.ok(d && Tn.state(d).over, g + " laeuft bis zum Ende");
    const me = { emoji: "🐙", nick: "Martina", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
    const doc = Object.assign(D.docFromIdea(D.IDEAS.find((i) => i.kind === "turn"), me, "de"), { g, q: d.q, seed: d.seed });
    const frag = D.docUrl(doc).split("#c=")[1];
    assert.ok(frag.length + 60 <= C.MAX_FRAGMENT, g + ": " + frag.length + " Zeichen, Platz fuer die Firmenfarbe fehlt");
    assert.equal(D.parseRoute("#c=" + frag).doc.q, d.q, g + ": der Link traegt alle Eintraege");
  }
});
test("Flavor-Build: eigener Katalog, Texte, Farben und Pfad; ohne Flag bleibt dist/index.html die Jugend-App", () => {
  const root = path.join(__dirname, "..");
  execFileSync(process.execPath, [path.join(root, "scripts/build.js"), "--flavor", "business"]);
  const html = fs.readFileSync(path.join(root, "dist/business/index.html"), "utf8");
  assert.ok(!/\/\*@[A-Z]+@\*\//.test(html), "Platzhalter uebrig");
  assert.match(html, /<title>Daily Business<\/title>/);
  assert.match(html, /window\.DailyFlavor=\{"id":"business"/);
  assert.match(html, /"id":"biz-umfrage-lunch"/);
  assert.ok(!html.includes('"id":"spiel-lava"'), "kein Jugend-Katalog");
  assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/);
  const ideas = JSON.parse(fs.readFileSync(path.join(root, "src/flavors/business/ideas.json"), "utf8")).ideas;
  const games = new Set(ideas.map((i) => i.turn.g).filter((g) => Tn.GAMES[g]));
  assert.ok(games.size >= 4 && ideas.filter((i) => Tn.GAMES[i.turn.g]).length >= 5, "mindestens fuenf Karten laufen");
  assert.throws(() => execFileSync(process.execPath, [path.join(root, "scripts/build.js"), "--flavor", "nichtda"], { stdio: "pipe" }));
  execFileSync(process.execPath, [path.join(root, "scripts/build.js")]);
  const kid = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
  assert.ok(!kid.includes("window.DailyFlavor=") && !kid.includes("Daily Business"));
});
