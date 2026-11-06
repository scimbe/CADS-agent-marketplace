"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
const QS = require("../src/quizspiele.js");   // the quiz cards Echt oder Phishing? (Business) and Was kostet das? join the table
const me = { emoji: "🐙", nick: "M", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const ideas = D.IDEAS.filter((i) => i.kind === "turn");
const through = (d) => { const hash = D.docUrl(d).split("#")[1]; const r = D.parseRoute("#" + hash); assert.equal(r.type, "doc"); return r.doc; };
// Team-Quiz and Typen-Quiz only run with a question pack (quizpack.js): the first night pack that fits.
const PACKS = require("../src/quiz-packs.json").packs, QP = require("../src/quizpack.js");
const BIZ = require("../src/flavors/business/ideas.json").ideas.filter((i) => i.kind === "turn");
const fresh = (g, seed) => { const d = D.docFromIdea(ideas.concat(BIZ).find((i) => i.turn.g === g), me, "de"); if (Tn.GAMES[g].needs) { d.pk = PACKS.map((x) => QP.sanitize(x.pk)).find((p) => QP.fits(g, p)); d.pk.q = d.pk.q.slice(0, 3); } return Tn.fresh(d, seed); };
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
  kreis: [[[["Toast", "Hai", "Mond", "Kuh", "Wind"], [0, 1, 2, 3, 4]], [[0, 1], [0, 2], [0, 3], [0, 1, 2, 3, 4]]]],
  hoeflich: [[[[0]], [[0]], [[0]], [[0]], [[0]], [[0]]]],
  woerter: [[[[0], [0]], [[0], [1], [1]], [[0], [2], [2]], [[0], [3], [3]], [[0]]]],
  abfragen: [[[["Eins", "Zwei", "Drei", "Vier"], ["ja", "ja", "nein", "ja"]], [0, [0], 0, [1], 0, [0], 0, [0], ["Aa", "Bb", "Cc", "Dd"], ["x", "y", "x", "y"]], [0, [0], 0, [0], 0, [1], 0, [0]]]],
  regel: [[[[0], [0]], [[1], [1]], [[2], [2]], [[3], [3]], [[0], [4]]]],
  werbung: [[[["Ana", "Ben", "Cem"]], [0], [0], [0], [[0]], [[0]], [[0]]]],
  maschine: [[[["Ana", "Ben", "Cem"]], Array(6).fill([0]), Array(6).fill([1]), Array(6).fill([0]), [[0]], [[1]], [[2]]]],
  suche: [[[0, ["Unter dem Kissen", "Am Fenster", "Im Schuh", "Beim Regal"]], [42]]],
  wichteln: [[[["Ana", "Ben", "Cem", "", "", "", "", "", "", "", "", ""]], [[0], 0]]],
  sammeln: [[["maxmuster", "Pizza-Abend", 4, 3750], [0]]],
  einkauf: [[[[[], [["Milch", 0, 2, []], ["Brot", 1, 1, []]]]], [[[["Ana", 0]], [["Milch", 0, 2, [[0, 5]]], ["Brot", 1, 1, [[0, 5]]]]]]]],
  wunsch: [[[[[], [["Hörbuch", 0, 1, []], ["Rad", 1, 1, []]]]], [[[["Ana", 0]], [["Hörbuch", 0, 1, [[0, 1]]], ["Rad", 1, 1, [[0, 1]]]]]]]],
  geschenk: [[[[0], [1], [2, 5], [["Tee-Probierset", "Notizbuch", "Kartenspiel"], 1]], [[2]]]],
  rangliste: [[[[0, 1, 2, 3, 4, 5, 6, 7]], [[7, 1, 2, 3, 4, 5, 6, 0]]]],
  schaetzen: [[[1, 1, 1, 1, 1]]],
  reihum: [[[[0], "dein Lachen", "Ana"], [[1], "Toast machen", "Ben"], [[2], "wir lachten", "Cem"], [[4], "alles", "Dag"]]],
  termin: [[[["Mia", [207606, 207616, 207626]]]].concat(["Ben", "Lea", "Cem", "Dag", "Eva", "Finn", "Gus", "Hana", "Ida"].map((n, i) => [[n, [i % 3, 0, 2]]]))],
  danke: [[["du mir geholfen hast", "Ana"], [0]]],
  kerzen: [[["Alles Gute, du Held"], [0]]],
  tunnel: [[["Pommes"]]],
  post: [[[["Mathe", "Gitarre", "Toast"], 30], [[0], [1], [0]]]],
  fallpreis: [[[70, 60, 50, 40], [65, 60, 55, 0]]],
  socken: [[[[0, 24]], [[5, 6], [0, 1, 2, 3, 4, 24]], [[7, 8, 10, 11, 12, 13]]]],
  advent: [[[Array(24).fill("").map((x, i) => i % 3 ? "" : "Tür " + (i + 1))], [0]]],
  rap: [[[[0], [0]], [[1], [2]]]],
  disco: [[[[0], 3]]],
  stimme: [[[0], [[1], 4]]],
  maus: [[["Oma", [0], 0], [0]]],
  papagei: [[[0, 0], [0, [1]]]],
  tier: [[[["Ana", "Ben", "Cem"]], [0], [0], [0], [0, 1, 2]]],
  uhr: [[[[100, -200, 300, 0, -100]]]],
  pokal: [[[9800], [10300]]],
  pommes: [[[[1], 1]]],
  reaktion: [[[1800], [2100]]],
  tuer: [[[[2, 15, 20]]]],
  luecke: [[[[0]], [["Lama", "Nudeln", "Knopf", "Heissa", "tanzen", "Riese"]]]],
  quiz: [[[[0], [1], [2]], [[1], [1], [1]]]],
  typen: [[[0], [[0], [1], [2], 0]]],
  phish: [Array.from({ length: QS.PEOPLE }, (x, i) => QS.full((i * 37) % 1024))],
  preis: [[Array(QS.PREIS_N).fill(100), Array(QS.PREIS_N).fill(50)]]
};
test("Jede Art hat ihr Blatt und laeuft ueber echte Links bis zum Ergebnis, ohne Server", () => {
  // phish is a card of the Business catalog (src/flavors/business/ideas.json), every other game has a daily card
  assert.deepEqual(ideas.map((i) => i.turn.g).concat(["phish"]).sort(), [...Tn.IDS].sort());
  for (const g of Tn.IDS) {
    let d = fresh(g, 12345);
    for (const answers of LINES[g][0]) { const n = Tn.play(d, answers, 100); assert.ok(n, g); d = through(n); }
    // A game its owner ends by hand (the wish list) is still open after every move and ends with that one tap
    if (Tn.GAMES[g].close) { assert.equal(Tn.state(d).over, false, g + " endet nicht von allein"); d = through(Tn.close(d)); }
    else assert.equal(Tn.close(d), null, g);
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
  const words = ["Aa", "Bb", "Cc", "Dd", "Ee"], tests = [[0, 1], [0, 2], [0, 3]];
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
  const forged = Object.assign({}, fresh("sammeln", 9), { q: Tn.seal([["evil.com/x", "Pizza", 1, 500]], 9) });
  assert.equal(Tn.moves(forged).length, 0); assert.equal(pay.link(forged, Tn.moves(forged)), "");
  const big = Object.assign({}, fresh("sammeln", 9), { q: Tn.seal([["max", "Pizza", 1, 500000]], 9) });
  assert.equal(Tn.moves(big).length, 0);
  assert.equal(D.byId("zug-sammeln").on, "12-02"); assert.equal(D.ideaForDay(new Date(Date.UTC(2026, 11, 2))).id, "zug-sammeln");
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
  const old = Object.assign({}, fresh("sammeln", 9), { q: Tn.seal([["max", "Pizza", 5]], 9) });
  assert.deepEqual(Tn.moves(old), [["max", "Pizza", 1, 500]]); assert.equal(pay.link(old, Tn.moves(old)), "https://paypal.me/max/5EUR");
  assert.equal(Tn.moves(Object.assign({}, old, { q: Tn.seal([["max", "Pizza", 51]], 9) })).length, 0, "auch alte Links nur bis zur Grenze");
});
test("Geld einsammeln: Obergrenze nur per Build-Flavor, ohne Flavor bleibt es bei 1 bis 50 Euro je Person", () => {
  const ok = (t, c) => !!t.play(Object.assign({}, fresh("sammeln", 1), { g: "sammeln" }), ["max", "Pizza", 1, c], 0), load = (fl) => { delete require.cache[require.resolve("../src/turns.js")]; if (fl === undefined) delete globalThis.DailyFlavor; else globalThis.DailyFlavor = fl; const t = require("../src/turns.js"); delete globalThis.DailyFlavor; delete require.cache[require.resolve("../src/turns.js")]; return t; };
  assert.equal(ok(Tn, 5000), true); assert.equal(ok(Tn, 5001), false); assert.equal(ok(Tn, 99), false);
  const big = load({ eur: [1, 500] }); assert.equal(ok(big, 50000), true); assert.equal(ok(big, 50001), false);
  for (const bad of [[1, 5000], [0, 50], [50, 1], ["1", "50"], [1], null]) assert.equal(ok(load({ eur: bad }), 5001), false, JSON.stringify(bad));
});
test("Schaetzen: gleicher Tag gleiche Fragen, das Bild verraet keine Loesung", () => {
  const f = (s) => fresh("schaetzen", s), q = (d) => Tn.GAMES.schaetzen.turns[0].map((p) => p.peek(d, [], [], "de"));
  assert.deepEqual(q(f(100)), q(f(100))); assert.notDeepEqual(q(f(100)), q(f(101)));
  const d = Tn.play(f(100), [0, 0, 0, 0, 0], 0), r = Tn.result(d, "de");
  assert.equal(r.h, "Im Schnitt 100 Prozent daneben"); assert.ok(!/\d{2,}/.test(r.lines.join(" ").replace(/100 Prozent/g, ""))); assert.ok(r.note);
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
  assert.ok(D.docUrl(x).length < 1400, "Linklaenge " + D.docUrl(x).length);
  assert.equal(de(x).h, "Alle können: Do 5.11., 20 Uhr"); assert.match(de(x).lines.at(-1), /^Können: Mia, Ä[ä]{9}B, Ä[ä]{9}C \+7$/);
  // in the calendar on its day, in the shelf of the evening chat
  const idea = D.IDEAS.find((i) => i.id === "zug-termin");
  assert.equal(idea.on, "12-04"); assert.equal(D.ideaForDay(new Date(Date.UTC(2026, 11, 4))).id, "zug-termin");
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
test("Socken: Antworten aus dem Versteck, Spielende sobald beide gefunden", () => {
  assert.equal(Tn.sockAnswer([12], 12), 2); assert.equal(Tn.sockAnswer([12], 6), 1); assert.equal(Tn.sockAnswer([12], 0), 0);
  let d = Tn.play(fresh("socken", 1), [[0, 24]], 0); d = Tn.play(d, [[5, 6], [1, 2, 3, 4, 9, 14]], 0);
  assert.equal(Tn.state(d).over, false); d = Tn.play(d, [[7, 8, 10, 11, 12, 13]], 0); assert.equal(Tn.state(d).over, false);
  assert.equal(Tn.play(d, [[1, 0]], 0), null); d = Tn.play(d, [[0, 24]], 0);
  assert.equal(Tn.state(d).over, false, "die erste Seite bekommt noch ihren Suchzug"); d = Tn.play(d, [[14, 15, 16, 17, 18, 19]], 0);
  assert.equal(Tn.state(d).over, true); assert.equal(Tn.result(d, "de").h, "Zweiter hat alle Socken gefunden!".replace("Zweiter", Tn.T("de").second));
});
test("Fallpreis: wer frueher tippt, kauft, Gewinn ist Wert minus Preis", () => {
  let d = Tn.play(fresh("fallpreis", 1), [100, 0, 0, 0], 0); d = Tn.play(d, [0, 10, 0, 0], 0);
  const r = Tn.result(d, "de"); assert.match(r.lines[0], new RegExp(Tn.T("de").first + " kauft für 100")); assert.match(r.lines[2], /keiner kauft/);
});
test("Rap: zweite Karte reimt auf die erste und ist nie dieselbe, Konter zaehlen", () => {
  for (let seed = 1; seed < 60; seed++) {
    let d = fresh("rap", seed); const p = Tn.GAMES.rap.turns[0];
    for (let a = 0; a < 3; a++) { const one = p[0].from(d, [], [], "de")[a], two = p[1].from(d, [], [[a]], "de"); assert.equal(two.length, 3); assert.ok(!two.includes(one)); }
    d = Tn.play(d, [[0], [0]], 0); d = Tn.play(d, [[0], [0]], 0); const r = Tn.result(d, "de");
    assert.equal(r.lines.length, 4); assert.equal(new Set(r.lines).size, 4);
  }
});
test("Advent: leere Tueren bekommen einen festen Satz, volle Saetze passen in den Link", () => {
  const full = Array(24).fill(0).map((x, i) => ("Satz " + i).padEnd(20, "x"));
  assert.ok(Tn.play(fresh("advent", 1), [full], 0)); assert.equal(Tn.play(fresh("advent", 1), [full.map((x) => "ä".repeat(20))], 0), null);
  const d = Tn.play(fresh("advent", 1), [Array(24).fill("")], 0), p = Tn.GAMES.advent.turns[1][0];
  assert.ok(p.text(d, Tn.moves(d), 3, "de").length > 3); assert.ok(D.docUrl(Tn.play(fresh("advent", 1), [full], 0)).length < 1400);
});
test("Stimmen: sechs verschiedene Karten, die richtige Figur ist immer dabei", () => {
  const p = Tn.GAMES.stimme.turns[1][1];
  for (let seed = 1; seed < 80; seed++) for (let r = 0; r < 5; r++) { const d = fresh("stimme", seed), c = p.cards(d, r, "de"); assert.equal(new Set(c).size, 6); assert.equal(c[p.right(d, r)], p.figure(d, r, "de")); }
  const t = Tn.GAMES.disco.turns[0][1]; assert.ok(t.pause(fresh("disco", 3), 0) >= 4 && t.pause(fresh("disco", 3), 0) <= 12);
});
test("Ton-Blaetter: keine Aufnahme im Link, Tier-Aufstellung zaehlt Erkannte", () => {
  let d = fresh("maus", 1); for (const a of [["Oma", [0], 0], [0]]) d = Tn.play(d, a, 0);
  assert.ok(D.docUrl(d).length < 400);
  let e = fresh("tier", 4); for (const a of [[["Ana", "Ben", "Cem"]], [0], [0], [0]]) e = Tn.play(e, a, 0);
  const o = [0, 1, 2].map((k) => Number(Tn.GAMES.tier.turns[4][k].slot(e).slice(4)));
  assert.equal(Tn.result(Tn.play(e, o, 0), "de").h, "3 von 3 erkannt");
});
test("Pommes: der gute Bot spielt Misere-Nim richtig, 3/4/5 ist fuer den Anfang gewinnbar", () => {
  const r = () => 0.5, x = (h) => h.reduce((a, b) => a ^ b, 0);
  assert.notEqual(x([3, 4, 5]), 0);
  for (const h of [[3, 4, 5], [1, 4, 5], [2, 2, 3], [0, 0, 4], [1, 1, 3], [1, 0, 0]]) {
    const [i, k] = Tn.nimMove(h, true, r); assert.ok(k >= 1 && k <= h[i], JSON.stringify(h));
  }
  assert.deepEqual(Tn.nimMove([0, 0, 4], true, r), [2, 3]); assert.deepEqual(Tn.nimMove([1, 1, 3], true, r), [2, 2]); assert.deepEqual(Tn.nimMove([1, 0, 3], true, r), [2, 3]);
});
test("Uhr: zu frueh und zu spaet richtig benannt, Pokal und Reaktion vergleichen fair", () => {
  let d = Tn.play(fresh("uhr", 7), [[-400, -400, -400, -400, -400]], 0); assert.equal(Tn.result(d, "de").h, "Du tippst im Schnitt 0,4 s zu früh");
  d = Tn.play(fresh("uhr", 7), [[500, 500, 500, 500, 500]], 0); assert.equal(Tn.result(d, "de").h, "Du tippst im Schnitt 0,5 s zu spät");
  let p = Tn.play(Tn.play(fresh("pokal", 1), [9800], 0), [10100], 0); assert.match(Tn.result(p, "de").h, new RegExp(Tn.T("de").second));
  assert.equal(Tn.play(fresh("pokal", 1), [1500], 0), null);
  const a = Tn.GAMES.reaktion.turns[0][0].plan(fresh("reaktion", 3)), b = Tn.GAMES.reaktion.turns[1][0].plan(fresh("reaktion", 3)); assert.deepEqual(a, b);
});
test("Tuersteher: jede Regel zeigt frueh ein Ja und ein Nein, gleiche Wesen fuer alle am Tag", () => {
  const d = fresh("tuer", 20400), o = Tn.doorOrder(d);
  assert.deepEqual(Tn.doorBeing(d, o[0], 3, [true, false]), Tn.doorBeing(fresh("tuer", 20400), o[0], 3, [true, false]));
  for (const r of o) { const prev = []; const seen = new Set(); for (let i = 0; i < 6; i++) { const b = Tn.doorBeing(d, r, i, prev); const v = Tn.doorIn(r, b); prev.push(v); seen.add(v); } assert.equal(seen.size, 2, "Regel " + r); }
  const res = Tn.result(Tn.play(fresh("tuer", 1), [[2, 15, 20]], 0), "de");
  assert.equal(res.h, "2 Regeln geknackt"); assert.equal(res.lines.length, 4); assert.ok(res.lines[0].startsWith("✓ ")); assert.ok(res.lines[2].startsWith("✗ "));
  assert.equal(Tn.play(fresh("tuer", 1), [[2, 25, 20]], 0), null);
});
test("Keine Werbe- und Manipulationstechnik in den Quellen", () => {
  const fs = require("node:fs"), path = require("node:path"), dir = path.join(__dirname, "../src");
  // One exception for device signals: the protocol page picks the speech model size and thread count from them (or says
  // honestly that the device is too weak). They stay on the device; build.test.js checks they are not in what is sent.
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const s = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!/ad_revenue|interstitial|rewarded|\brevive\b/i.test(s), f);
    if (f !== "protokoll-page.js") assert.ok(!/userAgent|deviceMemory|hardwareConcurrency/.test(s), f);
  }
});
test("Unberechenbar: ein starres Muster wird erkannt", () => {
  let d = fresh("unlesbar", 1), r;
  d = Tn.play(d, Array(20).fill(0).map((x, i) => [i % 2]), 0); r = Tn.result(d, "de");
  assert.equal(r.lines[0], Tn.T("de").unl_low);
});
// ---------- Einkaufszettel: the list in the link, replies merge ----------
const S = (v) => JSON.stringify(v);
const edit = (name, face, adds, marks) => ({ name, face, adds: adds.map((a) => Tn.shopParse(a)), marks: marks || {} });
const shopList = (d) => Tn.moves(d)[0][0];
const rowsOf = (v) => Object.fromEntries(Tn.shopRows(v).map((r) => [r.label, { b: r.bought.map((p) => p[0]), c: r.bring.map((p) => p[0]) }]));
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
  const forged = Object.assign({}, fresh("einkauf", 4), { q: Tn.seal([[[[], [["<script>", 0, 1, []]]]]], 4) });
  assert.equal(Tn.moves(forged).length, 0); assert.equal(Tn.state(forged).turn, 0);
  // the fullest list still fits a link that opens again
  const long = (i) => "Ää" + String(i).padStart(2, "0") + "x".repeat(Tn.SHOP.text - 4);
  let full = Tn.shopApply(null, { name: "", adds: Array.from({ length: 30 }, (x, i) => ({ text: long(i), qty: 99 })) });
  for (const n of ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh", "Ii", "Jj"]) full = Tn.shopApply(full, { name: n + "ääääääää", face: 11, marks: Object.fromEntries(Tn.shopRows(full).map((r) => [r.key, 1])) });
  assert.ok(Tn.shopOk(full)); assert.ok(full[1].length <= Tn.SHOP.items && full[0].length <= Tn.SHOP.people, S(full).length);
  const d = through(Tn.play(fresh("einkauf", 4294967295), [full], 0));
  assert.deepEqual(shopList(d), full); assert.ok(D.docUrl(d).split("#c=")[1].length <= 1200, "Linklaenge " + D.docUrl(d).length);
  // KI seal with option hash h: a list well under the budget keeps h; one that fits only with the seal alone drops h, never
  // the seal, and the link still opens
  const h = "Y-feMaAnaOXUrB2BxPv3vUTgMan0NNfOQmA6jhDp_Tc", s = "s2.liste.mhl2x0ab.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
  const sized = (n) => through(Tn.play(fresh("einkauf", 4294967295), [Tn.shopApply(null, { name: "", adds: Array.from({ length: n }, (x, i) => ({ text: long(i), qty: 99 })) })], 0));
  const frag = (x) => D.docUrl(x).split("#c=")[1].length;
  const small = Object.assign({}, sized(3), { ki: { k: "liste", s, h } });
  assert.ok(frag(small) <= 1200); assert.deepEqual(through(small).ki, { k: "liste", s, h });
  let n = 3; while (frag(Object.assign({}, sized(n + 1), { ki: { k: "liste", s } })) <= 1200) n++;
  const edge = Object.assign({}, sized(n), { ki: { k: "liste", s, h } });
  assert.ok(frag(Object.assign({}, edge, { ki: { k: "liste", s } })) > 1200 - 64, "Grenzfall: ohne h knapp unter dem Budget (" + n + " Posten)");
  assert.ok(frag(edge) <= 1200, "Linklaenge mit KI-Siegel und h " + frag(edge));
  const back = through(edge); assert.deepEqual(back.ki, { k: "liste", s }, "h faellt zuerst weg, das Siegel bleibt"); assert.deepEqual(shopList(back), shopList(sized(n)));
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
  const C = require("../src/core.js"), r = C.mulberry32(20261104), pick = (l) => l[Math.floor(r() * l.length)];
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
test("Einkaufszettel: kein Kalendertag, im Business-Flavor als Mitbringliste", () => {
  const idea = D.IDEAS.find((i) => i.id === "zug-einkauf");
  assert.equal(idea.on, undefined); assert.equal(idea.turn.g, "einkauf");
  const biz = require("../src/flavors/business/ideas.json").ideas.find((i) => i.turn && i.turn.g === "einkauf");
  assert.ok(biz && biz.turn.grip === "raum");
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
  const own = Object.assign({}, all, { o: 1 });
  assert.equal(Tn.state(through(own)).over, false, "ihr eigener Link (o: 1) endet nicht");
  const shut = through(Tn.close(all));
  assert.equal(shut.o, 2); assert.equal(Tn.state(shut).over, true);
  assert.equal(Tn.result(shut, "de").h, "Wunschzettel geschlossen");
  assert.deepEqual(Tn.result(shut, "de").lines, ["Rad", "Buch"], "nur die Wünsche, kein Name");
  assert.deepEqual(Tn.result(through(Tn.close(d)), "de"), Tn.result(shut, "de"), "geschlossen sieht gleich aus mit 0 und allen Reservierungen");
  assert.equal(Tn.play(shut, [[[], [["Rad", 0, 1, []]]]], 100), null, "nach dem Schliessen kein Zug");
  assert.equal(Tn.close(shut), null);
});
