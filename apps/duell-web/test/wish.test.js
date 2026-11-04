"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const W = require("../src/wish.js");
const me = { emoji: "🐙", nick: "M", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"]];
const rand = () => 0.5;
const of = (k) => D.docFromIdea(D.IDEAS.find((i) => i.kind === k), me, "de");

test("Anfrage: nur Typ, Wunsch, Grundidee und Texte; kein Bild, keine Sticker, keine Spur", () => {
  const d = of("photo"), r = W.request(d, "lustiger", "Idee");
  assert.deepEqual(Object.keys(r).sort(), ["idea", "now", "type", "wish"]);
  assert.deepEqual(Object.keys(r.now).sort(), ["bpm", "st", "x", "y"]);
  assert.deepEqual(Object.keys(W.request(of("game"), "x").now), ["title"]);
});
test("Anwenden: nur Felder des Typs wirken, Ergebnis ist bereinigt, Original bleibt unberuehrt", () => {
  const d = of("card"), before = JSON.stringify(d);
  const n = W.apply(d, { x: "Neu", st: "neon", palette: 0, stickers: ["🐸"], gravity: 2000, bpm: 150, y: "weg" }, PAIRS, rand);
  assert.equal(n.x, "Neu"); assert.equal(n.st, "neon"); assert.deepEqual(n.col, PAIRS[0]); assert.equal(n.sk.length, 1);
  assert.equal(n.y, undefined); assert.equal(n.bpm, undefined); assert.equal(n.g, undefined);
  assert.equal(JSON.stringify(d), before);
  const g = W.apply(of("game"), { gravity: 99999, theme: "lava", emoji: "🚀", title: "Lava", x: "weg" }, PAIRS, rand);
  assert.equal(g.g.params.gravity, 2600, "Bereinigung klemmt auch ohne Server"); assert.equal(g.g.theme, "lava"); assert.equal(g.x, undefined);
  const s = W.apply(of("sound"), { bpm: 150, k: "x-x-x-x-x-x-x-x-", palette: 0 }, PAIRS, rand);
  assert.equal(s.bpm, 150); assert.equal(s.p.k, "x-x-x-x-x-x-x-x-");
  assert.equal(W.apply(d, { st: "kaputt" }, PAIRS, rand).st, "druck", "unbekannter Stil faellt zurueck");
});
test("Ohne KI: nur das Flugspiel erkennt einen Satz mit festen Regeln, sonst gibt es keinen Ersatz, der wie eine KI-Antwort aussieht", () => {
  const g = of("game"), n = W.apply(g, W.local(g, "viel schwerer und schnell", "de", () => 1), PAIRS, rand);
  assert.ok(D.changedAreas(g, n).includes("regeln"));
  for (const k of ["card", "photo", "sound", "duel", "quest", "turn"]) assert.equal(W.local(of(k), "mach es gruseliger", "de", () => 0), null, k);
});
test("Wuerfel: jede Art mit Look aendert sichtbar etwas, ohne Netz; gleicher Seed, gleicher Wurf", () => {
  for (const k of W.DICE) {
    const d = of(k), a = W.dice(d, "seed|1", PAIRS), n = W.apply(d, a, PAIRS, rand);
    assert.ok(D.changedAreas(d, n).length, k);
    assert.deepEqual(W.dice(d, "seed|1", PAIRS), a, k + ": deterministisch aus dem Seed");
  }
  const d = of("card"), rolls = new Set([1, 2, 3, 4, 5, 6].map((i) => JSON.stringify(W.dice(d, "plan-09|" + i, PAIRS))));
  assert.ok(rolls.size >= 4, "verschiedene Wuerfe sehen verschieden aus");
  assert.equal(require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/wish.js"), "utf8").includes("Math.random"), false, "Zufall nur aus dem Seed");
});
test("Wetter: Wunsch kann die Zahlen nie aendern, kaputte Werte fallen weg, Text bleibt daneben frei", () => {
  const w = { p: "Hamburg", d: "2026-11-02", hi: 12, lo: 7, rn: 40, c: 61 }, d = D.sanitizeDoc({ k: "card", x: "Hallo", col: ["#ffd400", "#ff3b1d"], w });
  assert.deepEqual(d.w, w);
  const n = W.apply(d, { x: "Neu", w: { hi: 99 }, hi: 99, lo: 99, rn: 99 }, PAIRS, rand);
  assert.deepEqual(n.w, w); assert.equal(n.x, "Neu");
  assert.equal(D.sanitizeDoc({ k: "card", w: { p: "x", d: "kaputt", hi: 1, lo: 1 } }).w, undefined);
  assert.equal(D.sanitizeDoc({ k: "card", w: { p: "fuck", d: "2026-11-02", hi: 1, lo: 1 } }).w, undefined);
  assert.equal(D.sanitizeDoc({ k: "card", w: { p: "x", d: "2026-11-02", hi: "viel", lo: 1 } }).w, undefined);
  assert.equal(D.changedAreas(D.sanitizeDoc({ k: "card" }), d).includes("text"), true);
});
test("Grenze: KI-Wunsch nur wo die KI echte Arbeit macht, Kosmetik wuerfelt lokal; Raetsel eines Kanals gehen nicht an den Server", () => {
  assert.deepEqual([...W.KINDS].sort(), ["duel", "game", "quest", "sound"]);
  for (const k of ["card", "photo", "turn"]) assert.ok(!W.KINDS.includes(k) && W.DICE.includes(k), k + ": kein KI-Umfaerben");
  assert.deepEqual([...new Set([...W.KINDS, ...W.DICE])].sort(), D.KINDS.filter((k) => k !== "table" && k !== "arcade").sort());   // a card table and arcade have no editor
  const q = Object.assign(of("quest"), { q0: "Geheimfrage", h0: "abc", c: ["Z2VoZWlt"] }), r = JSON.stringify(W.request(q, "x", ""));
  assert.ok(!/Geheimfrage|Z2VoZWlt/.test(r));
});
test("Wunsch Spiel: Hintergrund, Spieler, Hindernisse, Boden und Farben aendern sich, Regeln bleiben im Rahmen", () => {
  const g = of("game"), look = { a: "#060A2A", b: "#2a1a5e", d: "stars", e: ["🪐", "🌟", "👽", "🚀"], p: "#9aa7c7", q: "#4d5878", f: "emoji", o: "🌵", g: "#1a1a33", h: "#7a6cff", m: "✨", x: "weg", f2: 1 };
  const n = W.apply(g, { look, emoji: "🛸", gravity: 2000 }, PAIRS, rand);
  assert.equal(n.g.look.a, "#060a2a"); assert.equal(n.g.look.e.length, 3); assert.equal(n.g.look.o, "🌵"); assert.equal(n.g.look.x, undefined);
  assert.equal(n.g.emoji, "🛸"); assert.ok(D.changedAreas(g, n).includes("welt"));
  assert.equal(W.apply(n, { look: { a: "#111111" } }, PAIRS, rand).g.look.m, "✨", "ein zweiter Wunsch baut auf dem ersten auf");
  const url = D.docUrl(n); assert.deepEqual(D.parseRoute("#" + url.split("#")[1]).doc.g.look, n.g.look, "die Gestaltung reist im Link mit");
});
test("Wunsch Spiel: Hindernis in Himmelsfarbe bleibt sichtbar, kaputte Werte fallen weg", () => {
  const C = require("../src/core.js");
  assert.equal(C.sanitizeLook({ a: "#101010", b: "#101010", p: "#121212" }).p, "#f2f2f2");
  assert.equal(C.sanitizeLook({ a: "#ffffff", p: "#fefefe" }).p, "#1f1f2e");
  assert.equal(C.sanitizeLook({ a: "red", d: "feuer", e: "x", f: "emoji" }), null);
});
test("Wunsch ohne Modell: Spiel bekommt trotzdem eine ganze Welt", () => {
  const g = of("game"), n = W.apply(g, W.local(g, "Unter Wasser", "de", () => 0), PAIRS, rand);
  assert.equal(n.g.look.d, "bubbles"); assert.equal(n.g.emoji, "🐠");
});
test("Wunsch: freie Farben auf Karte, Foto und Sound", () => {
  assert.deepEqual(W.apply(of("card"), { colors: ["#112233", "#445566"] }, PAIRS, rand).col, ["#112233", "#445566"]);
});
test("Wunsch: Duell und Kanal aendern vier Bereiche, Raetsel bleiben unberuehrt und gehen nie mit", () => {
  const du = of("duel"), n = W.apply(du, { t: "Piratenduell", s: "Arrr", ae: "🦜", be: "🏴", bn: "Käpt'n", colors: ["#112233", "#445566"] }, PAIRS, rand);
  assert.equal(n.t, "Piratenduell"); assert.equal(n.a.e, "🦜"); assert.equal(n.b.e, "🏴"); assert.deepEqual(n.col, ["#112233", "#445566"]);
  const q = of("quest"), m = W.apply(q, { t: "Schatz", s: "Grab", e: "🗺️", colors: ["#112233", "#445566"], q0: "fremd", c: [] }, PAIRS, rand);
  assert.equal(m.t, "Schatz"); assert.equal(m.e, "🗺️"); assert.equal(m.q0, q.q0);
  assert.ok(!JSON.stringify(W.request(q, "x", "")).includes(q.q0));
});
test("Wurf aendert den ganzen Look, Wunsch dazu Titel und Untertitel des Blatts", () => {
  const want = { card: ["stil", "farbe", "sticker"], photo: ["stil", "farbe", "sticker"], sound: ["stimme", "farbe"], duel: ["farbe", "regeln"], quest: ["farbe", "figur"], turn: ["farbe", "figur"] };
  for (const k of W.DICE) {
    const d = of(k), n = W.apply(d, W.dice(d, k + "|1", PAIRS), PAIRS, rand), got = D.changedAreas(d, n);
    for (const a of want[k]) assert.ok(got.includes(a), k + ": " + a + " fehlt in " + got);
    const ts = W.apply(d, { t: "Gruselnacht", s: "Nur fuer Mutige" }, PAIRS, rand);
    assert.equal(ts.t, "Gruselnacht", k); assert.equal(ts.s, "Nur fuer Mutige", k); assert.ok(D.changedAreas(d, ts).includes("idee"), k);
  }
  const c = W.apply(of("card"), { stickers: ["🎃", "👻"] }, PAIRS, rand), c2 = W.apply(c, { stickers: ["🦇"] }, PAIRS, rand);
  assert.deepEqual(c2.sk.map((s) => s.e), ["🦇"], "ein zweiter Wunsch stapelt keine Sticker");
});
test("Farbe: ein Wunsch bekommt genau das Farbpaar, das die KI nennt, kein erzwungener Wechsel; ein Wurf wechselt immer", () => {
  const d = Object.assign(of("card"), { col: PAIRS[1].slice() });
  assert.deepEqual(W.apply(d, { palette: 1 }, PAIRS, rand).col, PAIRS[1]);
  assert.deepEqual(W.apply(d, { palette: 0 }, PAIRS, rand).col, PAIRS[0]);
  for (let i = 0; i < 20; i++) assert.notDeepEqual(W.dice(d, "x|" + i, PAIRS).colors, d.col);
});
test("Wurf: eine Karte mit dem Text ihrer Idee bekommt eine andere Zeile derselben Idee, eigener Text bleibt", () => {
  const idea = D.IDEAS.find((i) => i.kind === "card" && i.de.lines.length > 2), d = D.docFromIdea(idea, me, "de"), L = idea.de.lines;
  const x = W.dice(d, "t|1", PAIRS, L).x; assert.ok(L.includes(x) && x !== d.x);
  assert.equal(W.dice({ ...d, x: "Mein eigener Satz" }, "t|1", PAIRS, L).x, undefined);
});
test("Adventstuerchen: Wunsch aendert Botschaft, Farben, Sticker, Stil und Titel/Untertitel auf einmal, Nummer bleibt", () => {
  const d = D.sanitizeDoc({ ...D.docFromIdea(D.byId("advent-tuer"), me, "de"), st: "zettel" }), nr = d.nr;
  const n = W.apply(d, { x: "Frohe Weihnachten!", st: "advent", colors: ["#b3001b", "#ffffff"], stickers: ["🎄", "⭐", "🎁"], t: "Tür voller Schnee", s: "Tipp drauf, es schneit.", nr: 3 }, PAIRS, rand);
  assert.equal(n.x, "Frohe Weihnachten!"); assert.equal(n.st, "advent"); assert.deepEqual(n.col, ["#b3001b", "#ffffff"]);
  assert.deepEqual(n.sk.map((s) => s.e), ["🎄", "⭐", "🎁"]); assert.equal(n.t, "Tür voller Schnee"); assert.equal(n.s, "Tipp drauf, es schneit.");
  assert.equal(n.nr, nr, "die Nummer waehlt nur der Mensch");
  assert.deepEqual(D.changedAreas(d, n).sort(), ["farbe", "idee", "sticker", "stil", "text"]);
});
test("Adventstuerchen: der Wurf bleibt weihnachtlich, Stil, Nummer und Botschaft bleiben", () => {
  const d = D.sanitizeDoc({ ...D.docFromIdea(D.byId("advent-tuer"), me, "de"), st: "advent", col: ["#ffd400", "#ff3b1d"], x: "Für dich" });
  for (let i = 1; i <= 5; i++) {
    const n = W.apply(d, W.dice(d, "advent|" + i, PAIRS), PAIRS, rand);
    assert.equal(n.st, "advent"); assert.equal(n.nr, d.nr); assert.equal(n.x, "Für dich");
    assert.ok(n.sk.length && n.sk.every((s) => D.SETS.advent.includes(s.e)), "Sticker aus dem Advent-Set");
    assert.notDeepEqual(n.col, d.col);
  }
});
test("KI-Siegel: reist im Link mit, fremde Zeichen fallen weg, ohne Siegel nur die Art", () => {
  const g = Object.assign(of("game"), { ki: { k: "wish", s: "v1.k1.abcDEF-123_x" } }), url = D.docUrl(g);
  assert.deepEqual(D.parseRoute("#" + url.split("#")[1]).doc.ki, { k: "wish", s: "v1.k1.abcDEF-123_x" });
  assert.deepEqual(D.sanitizeDoc({ ...g, ki: { k: "wish", s: "<b>x</b>" } }).ki, { k: "wish" });
  assert.equal(D.sanitizeDoc({ ...g, ki: { k: "Wish!" } }).ki, undefined);
  assert.equal(D.sanitizeDoc(of("card")).ki, undefined, "ohne KI kein Siegel");
});
