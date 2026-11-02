"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
const me = { emoji: "🐙", nick: "M", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const ideas = D.IDEAS.filter((i) => i.kind === "turn");
const through = (d) => { const hash = D.docUrl(d).split("#")[1]; const r = D.parseRoute("#" + hash); assert.equal(r.type, "doc"); return r.doc; };
const fresh = (g, seed) => { const d = D.docFromIdea(ideas.find((i) => i.turn.g === g), me, "de"); return Tn.fresh(d, seed); };
const LINES = {
  deal: [[[4], [3, 6], [5]]], einig: [[[["Pizza", "Sushi", "Döner", "Pommes", "Nudeln"], [0, 1, 2, 3, 4]], [[4, 0, 1, 2, 3]]]],
  wort: [[[[0, 1, 2], "Zzzz"], [[0, 1, 5]]]], schmuggel: [[[0], [0, [0, 1, 2]], [[3, 4, 5]]]],
  lob: [[[[0, 1, 2], [3, 4, 5]], [[3, 9, 10], [0, 1, 11]]]], auktion: [[[[50, 30, 20, 0, 0]], [[40, 30, 30, 0, 0]]]], kapsel: [[[[2], 7], [[0]]]],
  kennst: [[[[0], [1], [2], [0], [1]], [[0], [1], [2], [0], [1], [2], [2], [2], [2], [2]], [[2], [2], [2], [2], [0]]]],
  snack: [[Array(10).fill([0]), Array(10).fill(0).map((x, i) => [i % 2])]],
  teilen: [[[[5, 3, 2, 0]], [[0, 3, 2, 5]]]],
  wette: [[[[1], 3], [[1]]]],
  socke: [[[50], [80]]], bluff: [[[[0], [0], [0], [0], [0]], [[0], [1], [0], [1], [0]]]], auftrag: [[[[1]], [[2]]]],
  ausrede: [[[[0], [1], [2]], [[1]]]], gutschein: [[[[0, 3, 5]], [[1]]]], rubbellos: [[[[2], [3]], [[0, 3, 5]]]], urkunde: [[[[1], 9, 9, 9]]],
  luege: [[[["Ich mag Toast", "Ich kann pfeifen", "Ich war am Mond"], [2]], [[1]]]], blitz: [[[["", "", "", "", "", ""]], [["", "", "", "", "", ""]]]], recht: [[["Toast ist Brot"], ["Toast ist Kunst"], [[1], [2]]]],
  morgen: [[[[1], 1], [0]]], umschlag: [[["Spiel was", "Atme durch", "Zähl Enten"], [[1]]]], rad: [[[[0, 4, 7]], [[2]]]],
  steine: [[[[0, 20, 40]], [[0, 21, 42]]]],
  unlesbar: [[Array(20).fill(0).map((x, i) => [i % 2])]], damals: [[["Pudding", "Lesen", "Schlager", "Kaugummi", "Video"]]],
  streichen: [[[[0]], [[0]], [[0]], [[0]], [[0]], [[0]]]], finger: [[[0]]], erklaeren: [[[7]]], sorry: [[[[0], [1], [2]]]],
  kreis: [[[["Toast", "Hai", "Mond", "Kuh", "Wind"], [0, 1, 2, 3, 4]], [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [0, 1, 2, 3, 4]]]],
  hoeflich: [[[[0]], [[0]], [[0]], [[0]], [[0]], [[0]]]],
  woerter: [[[[0], [0]], [[0], [1], [1]], [[0], [2], [2]], [[0], [3], [3]], [[0]]]],
  abfragen: [[[["Eins", "Zwei", "Drei", "Vier"], ["ja", "ja", "nein", "ja"]], [0, [0], 0, [1], 0, [0], 0, [0], ["Aa", "Bb", "Cc", "Dd"], ["x", "y", "x", "y"]], [0, [0], 0, [0], 0, [1], 0, [0]]]],
  regel: [[[[0], [0]], [[1], [1]], [[2], [2]], [[3], [3]], [[0], [4]]]],
  werbung: [[[["Ana", "Ben", "Cem"]], [0], [0], [0], [[0]], [[0]], [[0]]]],
  maschine: [[[["Ana", "Ben", "Cem"]], Array(6).fill([0]), Array(6).fill([1]), Array(6).fill([0]), [[0]], [[1]], [[2]]]],
  suche: [[[0, ["Unter dem Kissen", "Am Fenster", "Im Schuh", "Beim Regal"]], [42]]],
  wichteln: [[[["Ana", "Ben", "Cem", "", "", "", "", "", "", "", "", ""]], [[0], 0]]],
  rangliste: [[[[0, 1, 2, 3, 4, 5, 6, 7]], [[7, 1, 2, 3, 4, 5, 6, 0]]]],
  schaetzen: [[[1, 1, 1, 1, 1]]],
  reihum: [[[[0], "dein Lachen", "Ana"], [[1], "Toast machen", "Ben"], [[2], "wir lachten", "Cem"], [[4], "alles", "Dag"]]],
  danke: [[["du mir geholfen hast", "Ana"], [0]]],
  kerzen: [[["Alles Gute, du Held"], [0]]],
  tunnel: [[["Pommes"]]],
  post: [[[["Mathe", "Gitarre", "Toast"], 30], [[0], [1], [0]]]],
  luecke: [[[[0]], [["Lama", "Nudeln", "Knopf", "Heissa", "tanzen", "Riese"]]]]
};
test("Jede Art hat ihr Blatt und laeuft ueber echte Links bis zum Ergebnis, ohne Server", () => {
  assert.deepEqual(ideas.map((i) => i.turn.g).sort(), [...Tn.IDS].sort());
  for (const g of Tn.IDS) {
    let d = fresh(g, 12345);
    for (const answers of LINES[g][0]) { const n = Tn.play(d, answers, 100); assert.ok(n, g); d = through(n); }
    assert.equal(Tn.state(d).over, true, g);
    const r = Tn.result(d, "de"), e = Tn.result(d, "en");
    assert.ok(r.h && r.lines.length, g); assert.ok(e.h && e.lines.length, g);
    assert.ok(!/undefined|\{\w+\}/.test(JSON.stringify([r, e])), g + " " + JSON.stringify(r));
    assert.ok(D.docUrl(d).length < 1400, g + " Linklaenge " + D.docUrl(d).length);
  }
});
test("Jede neue Partie hat eigenen Stand: fremde Zuege und kaputte Links laufen nicht weiter", () => {
  const d = Tn.play(fresh("deal", 1), [4], 0);
  assert.equal(Tn.state(Object.assign({}, d, { seed: 2 })).turn, 0);
  assert.equal(Tn.play(fresh("deal", 1), [11], 0), null);
  assert.equal(Tn.play(fresh("deal", 1), ["x"], 0), null);
  assert.equal(Tn.play(fresh("lob", 1), [[0, 0, 1], [1, 2, 3]], 0), null);
  assert.equal(Tn.play(fresh("auktion", 1), [[90, 90, 0, 0, 0]], 0), null);
  assert.equal(Tn.state(Object.assign({}, fresh("deal", 1), { q: Tn.seal([[99]], 1) })).turn, 0);
  assert.equal(Tn.state(Object.assign({}, fresh("deal", 1), { q: "kaputt" })).turn, 0);
  assert.equal(D.sanitizeDoc({ k: "turn", g: "weg", q: "<x>" }).g, Tn.IDS[0]);
});
test("Freier Text nur durch den Filter: Kontaktdaten und Woerter vom Feld gehen nicht", () => {
  const d = fresh("wort", 7), board = Tn.GAMES.wort.turns[0][0].from(d, [], [], "de");
  assert.equal(Tn.play(d, [[0, 1, 2], board[3]], 0), null);
  assert.equal(Tn.play(d, [[0, 1, 2], "zwei woerter"], 0), null);
  assert.equal(Tn.play(fresh("einig", 1), [["Treff am Bahnhof", "b", "c", "d", "e"], [0, 1, 2, 3, 4]], 0), null);
  assert.equal(Tn.play(fresh("einig", 1), [["aa", "aa", "c", "d", "e"], [0, 1, 2, 3, 4]], 0), null);
});
test("Rechnet richtig: Einigung nimmt den besten schlechtesten Platz, Deal platzt unter der Grenze", () => {
  let d = Tn.play(fresh("einig", 3), [["Aa", "Bb", "Cc", "Dd", "Ee"], [0, 1, 2, 3, 4]], 0); d = Tn.play(d, [[4, 3, 2, 1, 0]], 0);
  assert.match(Tn.result(d, "de").h, /Cc/);
  d = Tn.play(fresh("deal", 3), [2], 0); d = Tn.play(d, [5, 5], 0); d = Tn.play(d, [5], 0);
  assert.equal(Tn.result(d, "de").h, Tn.T("de").deal_broke);
});
test("Beide Seiten sehen dasselbe Feld, geheime Werte unterscheiden sich", () => {
  const d = fresh("auktion", 9), a = Tn.GAMES.auktion.turns[0][0].vals(d), b = Tn.GAMES.auktion.turns[1][0].vals(d);
  assert.deepEqual([...a].sort(), [10, 20, 30, 40, 50].sort()); assert.notDeepEqual(a, b);
  const w = fresh("wort", 9), f = Tn.GAMES.wort.turns[0][0].from(w, [], [], "de"); assert.equal(new Set(f).size, 9);
  assert.deepEqual(Tn.GAMES.wort.turns[1][0].from(w, [], [], "de"), f);
});
test("Kapsel oeffnet erst am Tag, Vorhersage steht nicht im Klartext im Link", () => {
  const d = through(Tn.play(fresh("kapsel", 5), [[2], 7], 1000));
  assert.equal(Tn.gate(d, 1000), 7); assert.equal(Tn.gate(d, 1006), 1); assert.equal(Tn.gate(d, 1007), 0);
  assert.equal(Tn.state(d).turn, 1); assert.ok(!Buffer.from(d.q, "base64url").toString("latin1").includes("[[2"));
});
test("Vorgaben: Daten paarig, jugendfrei, keine Kurzschrift", () => {
  const C = require("../src/core.js");
  for (const s of Tn.strings()) assert.ok(C.isClean(s), s);
  const T = require("../src/turn.json");
  for (const k of ["words", "smuggle", "praise", "items", "fates", "either", "tasks", "vows", "jobs", "who", "what", "why", "vouchers", "prizes", "awards", "fights", "verdicts", "lifts", "fates2", "past"]) for (const x of T[k]) assert.equal(x.split("|").length, 2, x);
  assert.deepEqual(Object.keys(T.text.de).sort(), Object.keys(T.text.en).sort());
});
test("Filter: Saetze, die einzeln harmlos wirken, gehen nicht; Treffer und am Platz gehen", () => {
  const C = require("../src/core.js"), Q = require("../src/quest.js");
  for (const x of ["Du bist hässlich", "Niemand mag dich", "Keiner mag dich", "Wir lachen alle über dich", "you are so ugly", "nobody likes you"]) assert.equal(C.isClean(x), false, x);
  assert.equal(Q.clean("Komm morgen vorbei", 40), "");
  for (const x of ["Du bist witzig", "Niemand mag Montage", "Treffer", "am Platz"]) assert.equal(Q.clean(x, 40), x, x);
});
test("Luecke fuellt die Geschichte, Teilen vergibt jede Aufgabe genau einmal, Wette ist bis zum Tag zu", () => {
  let d = Tn.play(Tn.play(fresh("luecke", 2), [[0]], 0), [["Lama", "Nudeln", "Knopf", "Heissa", "tanzen", "Riese"]], 0);
  assert.ok(!/\\{\\d\\}/.test(Tn.result(d, "de").lines[0])); assert.match(Tn.result(d, "de").lines[0], /Lama.*Riese/);
  d = Tn.play(Tn.play(fresh("teilen", 2), [[5, 3, 2, 0]], 0), [[0, 3, 2, 5]], 0);
  const all = Tn.result(d, "de").lines.join(); for (const w of ["Folien", "Vortrag", "Recherche", "Handout"]) assert.equal(all.split(w).length, 2, w);
  d = through(Tn.play(fresh("wette", 2), [[1], 3], 500)); assert.equal(Tn.gate(d, 502), 1); assert.equal(Tn.gate(d, 503), 0);
});
test("Raum-Blaetter: Streichen laesst genau einen Vorschlag, Sorry bleibt Text ohne Absender", () => {
  let d = fresh("streichen", 4); for (let i = 0; i < 6; i++) d = Tn.play(d, [[0]], 0);
  assert.match(Tn.result(d, "de").h, /Beschluss: /); assert.equal(Tn.GAMES.streichen.turns[0][0].from(d, [[[0]], [[0]]], [], "de").length, 5);
  d = Tn.play(fresh("sorry", 1), [[0], [1], [2]], 0); const r = Tn.result(d, "de"); assert.equal(r.copy, r.lines[0]); assert.ok(!/daily/i.test(r.copy));
});
test("Bluff: nur nach oben luegen, Luege beim Aufdecken bringt der anderen Seite die Punkte", () => {
  const d = fresh("bluff", 3), first = Tn.GAMES.bluff.turns[0][0].from(d, [], [], "de");
  assert.equal(Number(first[0]) >= 1 && first.length <= 6, true);
  assert.equal(Tn.play(d, [[9], [0], [0], [0], [0]], 0), null);
  const c = Number(first[0]), ok = Tn.play(Tn.play(d, [[0], [0], [0], [0], [0]], 0), [[1], [1], [1], [1], [1]], 0);
  assert.match(Tn.result(ok, "de").h, / zu 0$/); assert.ok(c);
});
test("Blitz zaehlt nur eigene Woerter mit dem Buchstaben, Doppeltes faellt raus", () => {
  const d = Tn.fresh(fresh("blitz", 0), 0), L = "B";
  let x = Tn.play(d, [["Bär", "Brot", "", "", "", ""]], 0); x = Tn.play(x, [["Bär", "Apfel", "", "", "", ""]], 0);
  const r = Tn.result(x, "de"); assert.match(r.h, /^1 zu 0/); assert.match(r.lines[1], /Bär/); assert.ok(L);
});
test("Gleiche Steine: beide Seiten bekommen denselben Strom, Punkte werden nachgerechnet, nichts haengt am Geraet", () => {
  const d = fresh("steine", 77), e = fresh("steine", 77);
  for (let i = 0; i < 40; i++) assert.deepEqual(Tn.blockAt(d, i), Tn.blockAt(e, i));
  assert.equal(Tn.replay(d, [0, 0]), null, "Feld schon belegt");
  assert.equal(Tn.play(d, [[0, 0]], 0), null);
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/turns.js"), "utf8");
  const part = src.slice(src.indexOf("var SIZE = 8"), src.indexOf("GAMES.steine"));
  assert.ok(!/navigator|screen\.|userAgent|Date\.|Math\.random|localStorage|store/.test(part), "Steine haengen nur am Seed");
  let st = { grid: new Array(64).fill(0), score: 0, lines: 0, i: 0 }; for (let i = 0; i < 7; i++) st.grid[i] = 1;
  assert.equal(Tn.drop(st, [[0, 0]], 7).lines, 1); assert.equal(Tn.drop(st, [[0, 0]], 7).grid.slice(0, 8).join(""), "00000000");
});
test("Kreis: jedes Wort schlaegt die zwei naechsten, gedrehter Kreis zaehlt als richtig", () => {
  const words = ["Aa", "Bb", "Cc", "Dd", "Ee"], tests = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3]];
  let d = Tn.play(fresh("kreis", 5), [words, [0, 2, 4, 1, 3]], 0);
  const p = Tn.GAMES.kreis.turns[1][1].peek(d, Tn.moves(d), [[0, 2], [0, 1]], "de");
  assert.match(p, /Aa schlägt Cc/); assert.match(p, /Bb schlägt Aa/);
  assert.equal(Tn.result(Tn.play(d, [...tests, [2, 4, 1, 3, 0]], 0), "de").h, Tn.T("de").krs_right);
  assert.equal(Tn.result(Tn.play(d, [...tests, [0, 1, 2, 3, 4]], 0), "de").h, Tn.T("de").krs_wrong);
});
test("Hoeflich: wer die Grenze reisst, verliert sofort, der Rest der Zuege entfaellt", () => {
  let d = fresh("hoeflich", 9), n = 0;
  while (!Tn.state(d).over) { d = Tn.play(d, [[2]], 0); n++; }
  assert.ok(n >= 3 && n <= 6); const r = Tn.result(d, "de");
  assert.ok(/gewinnt/.test(r.h)); assert.ok(n % 2 ? r.h.startsWith(Tn.T("de").second) : r.h.startsWith(Tn.T("de").first));
  assert.equal(Tn.play(d, [[0]], 0), null);
  for (const s of [1, 2, 3]) assert.ok(Tn.GAMES.hoeflich.turns[0][0].from(fresh("hoeflich", s), [], [], "de").every((x) => /^•{1,3} /.test(x)));
});
test("Woerterbuch: drei Antworten, eine davon stimmt, und die Zaehlung passt", () => {
  let d = Tn.play(fresh("woerter", 3), [[0], [0]], 0), hit = 0;
  for (let r = 0; r < 4; r++) {
    const st = Tn.state(d), g = Tn.GAMES.woerter.turns[r + 1][0], o = g.from(d, st.moves, [], "de"), m = st.moves[r], off = r ? 1 : 0;
    assert.equal(o.length, 3);
    const want = Tn.GAMES.woerter.turns[r][off + 1].from(d, st.moves, [], "de")[m[off + 1][0]], at = o.indexOf(want); assert.ok(at >= 0);
    const pick = r % 2 ? (at + 1) % 3 : at; if (pick === at) hit++;
    d = Tn.play(d, r < 3 ? [[pick], [1], [2]] : [[pick]], 0);
  }
  assert.equal(Tn.result(d, "de").h, "Euer Wörterbuch: " + hit + " von 4 erraten");
});
test("Abfragen: volle Karten passen in den Link, Falsches bleibt auf dem Stapel", () => {
  const q = (c) => [0, 1, 2, 3].map((i) => (c + i).padEnd(28, "ae")), a = (c) => [0, 1, 2, 3].map((i) => (c + i).padEnd(24, "oe"));
  assert.equal(Tn.play(fresh("abfragen", 4), [[0, 1, 2, 3].map((i) => "ä".repeat(27) + i), a("B")], 0), null);
  let d = Tn.play(fresh("abfragen", 4), [q("A"), a("B")], 0);
  d = Tn.play(d, [0, [0], 0, [1], 0, [0], 0, [0], q("C"), a("D")], 0); assert.ok(d);
  d = Tn.play(d, [0, [1], 0, [1], 0, [0], 0, [0]], 0); assert.ok(d, "Link zu lang");
  assert.ok(Tn.state(d).over); assert.ok(D.docUrl(d).length < 1400, "Laenge " + D.docUrl(d).length);
  const r = Tn.result(d, "de"); assert.equal(r.lines.filter((x) => /übt noch/.test(x)).length, 3);
});
test("Regel: fuenf Tausche ergeben ein Gesetz, alte Fassungen bleiben sichtbar", () => {
  let d = fresh("regel", 2); const seen = [];
  for (let i = 0; i < 5; i++) { seen.push(Tn.GAMES.regel.turns[i][0].peek(d, Tn.moves(d), [], "de")); d = Tn.play(d, [[i % 4], [i]], 0); assert.ok(d); }
  const r = Tn.result(d, "de"); assert.equal(r.lines.length, 5); assert.ok(r.lines[0].includes(seen[0])); assert.ok(!r.h.includes(seen[0]));
  assert.equal(Tn.play(fresh("regel", 2), [[0], [7]], 0), null);
});
test("Werbung: niemand kauft bei sich selbst, die Stimmen werden richtig gezaehlt", () => {
  let d = fresh("werbung", 2); for (const a of [[["Ana", "Ben", "Cem"]], [0], [0], [0], [[0]], [[0]], [[0]]]) d = Tn.play(d, a, 0);
  assert.deepEqual(Tn.result(d, "de").lines, ["Ana: 2", "Ben: 1", "Cem: 0"]); assert.match(Tn.result(d, "de").h, /Ana/);
  let e = fresh("werbung", 2); for (const a of [[["Ana", "Ben", "Cem"]], [0], [0], [0], [[0]], [[1]], [[0]]]) e = Tn.play(e, a, 0);
  assert.equal(Tn.result(e, "de").h, Tn.T("de").wer_tie);
});
test("Maschine: ihre Reihe entsteht aus der Runde, mit ein bis zwei Ausreissern", () => {
  for (const seed of [4, 5]) {
    let d = fresh("maschine", seed); d = Tn.play(d, [["Ana", "Ben", "Cem"]], 0);
    for (let i = 0; i < 3; i++) d = Tn.play(d, Array(6).fill([0]), 0);
    const opts = Tn.GAMES.maschine.turns[4][0].from(d, Tn.moves(d), [], "de"), first = [0, 1, 2, 3, 4, 5].map((q) => Tn.GAMES.maschine.turns[1][q].from(d, [], [], "de")[0]).join(", ");
    assert.equal(opts.filter((x) => x === first).length, 3); const at = opts.findIndex((x) => x !== first);
    for (let i = 0; i < 3; i++) d = Tn.play(d, [[at]], 0);
    assert.equal(Tn.result(d, "de").h, "Die Maschine hat 0 von 3 reingelegt");
  }
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
test("Schaetzen: gleicher Tag gleiche Fragen, das Bild verraet keine Loesung", () => {
  const f = (s) => fresh("schaetzen", s), q = (d) => Tn.GAMES.schaetzen.turns[0].map((p) => p.peek(d, [], [], "de"));
  assert.deepEqual(q(f(100)), q(f(100))); assert.notDeepEqual(q(f(100)), q(f(101)));
  const d = Tn.play(f(100), [0, 0, 0, 0, 0], 0), r = Tn.result(d, "de");
  assert.equal(r.h, "Im Schnitt 100 Prozent daneben"); assert.ok(!/\d{2,}/.test(r.lines.join(" ").replace(/100 Prozent/g, ""))); assert.ok(r.note);
});
test("Rangliste nennt den groessten Streit", () => {
  let d = Tn.play(fresh("rangliste", 0), [[0, 1, 2, 3, 4, 5, 6, 7]], 0); d = Tn.play(d, [[7, 1, 2, 3, 4, 5, 6, 0]], 0);
  const r = Tn.result(d, "de"); assert.match(r.lines[2], /Pausenbrot/); assert.equal(r.h, "56 Prozent einig");
});
test("Geheimschrift: gleiches Wort gleiche Zeichen, 26 verschiedene", () => {
  const a = Tn.glyphs("Pommes"), b = Tn.glyphs("pommes"), c = Tn.glyphs("Nudel");
  assert.deepEqual(a, b); assert.notDeepEqual(a, c); assert.equal(new Set(a).size, 26);
});
test("Post an mich: oeffnet erst am gewaehlten Tag", () => {
  const d = Tn.play(fresh("post", 1), [["Mathe", "Gitarre", "Toast"], 30], 100);
  assert.equal(Tn.gate(d, 100), 30); assert.equal(Tn.gate(d, 130), 0);
  assert.equal(Tn.result(Tn.play(d, [[0], [1], [0]], 130), "de").h, "2 von 3 Vorhersagen stimmten");
});
test("Keine Werbe- und Manipulationstechnik in den Quellen", () => {
  const fs = require("node:fs"), path = require("node:path"), dir = path.join(__dirname, "../src");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) assert.ok(!/ad_revenue|interstitial|rewarded|userAgent|deviceMemory|hardwareConcurrency|\brevive\b/i.test(fs.readFileSync(path.join(dir, f), "utf8")), f);
});
test("Unberechenbar: ein starres Muster wird erkannt", () => {
  let d = fresh("unlesbar", 1), r;
  d = Tn.play(d, Array(20).fill(0).map((x, i) => [i % 2]), 0); r = Tn.result(d, "de");
  assert.equal(r.lines[0], Tn.T("de").unl_low);
});
