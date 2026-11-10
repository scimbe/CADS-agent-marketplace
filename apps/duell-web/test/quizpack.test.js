"use strict";
// The shared quiz engine (quizpack.js, quizmake.js): question packs from the server's quiz kind or a night pack, the four quiz cards,
// Team-Quiz and Typen-Quiz with a pack, all through real links. The night packs: checked, youth-safe, one link each.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
const P = Object.assign({}, require("../src/quizpack.js"), require("../src/quizmake.js"));
const J = require("../src/quiz-packs.json");
require("../src/quizspiele.js");   // the Schätzen sentences come with the part "quiz" (quizspiele.json ui), as in the page
const me = { emoji: "🐙", nick: "M", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const through = (d) => { const r = D.parseRoute("#" + D.docUrl(d).split("#")[1]); assert.equal(r.type, "doc"); return r.doc; };
const size = (d) => Math.ceil(Buffer.byteLength(JSON.stringify({ v: 1, d: D.sanitizeDoc(d) })) / 3) * 4;
const ROOM = C.MAX_FRAGMENT - 80;
// What the server sends for kind quiz (CADS-DEMO-wrapper lib/duell-ai.mjs, shape of quiz), learning and group mode.
const LEARN = { modus: "lernen", titel: "Planeten", fragen: [
  { f: "Wie viele Planeten hat das Sonnensystem?", a: "8", d: ["9", "7", "10"], quelle_im_text: true },
  { f: "Welcher Planet ist der größte?", a: "Jupiter", d: ["Saturn", "Erde"], quelle_im_text: false },
  { f: "Wie heißt der rote Planet?", a: "Mars", d: ["Venus", "Merkur", "Pluto"], quelle_im_text: true },
  { f: "Wie viele Monde hat der Mars?", a: "2", d: ["0", "1", "4"], quelle_im_text: true },
  { f: "Wie viele Tage hat ein Jahr?", a: "365", d: ["360", "366", "300"], quelle_im_text: false }] };
const GROUP = { modus: "gruppe", titel: "Wer von uns ist …?", typen: [{ name: "Planerin", staerke: "Du behältst den Überblick." }, { name: "Motor", staerke: "Du steckst alle an." }],
  fragen: [{ f: "Zeltlager: was zuerst?", antworten: [{ t: "Plan", typ: 0 }, { t: "Zelt", typ: 1 }] }, { f: "Regen?", antworten: [{ t: "Spiele", typ: 1 }, { t: "Liste", typ: 0 }] }, { f: "Abends?", antworten: [{ t: "Lagerfeuer", typ: 1 }, { t: "Morgen planen", typ: 0 }] }] };
const card = (g, pk, seed) => { const idea = D.IDEAS.find((i) => i.turn && i.turn.g === g); const d = D.docFromIdea(idea, me, "de"); d.pk = pk; return Tn.fresh(d, seed || 77); };
// Every turn answered with its first choice (pick 0, slider at its middle, a show step 0).
const first = (d) => Tn.state(d).prompts.map((p) => (p.w === "pick" ? [0] : p.w === "slide" ? Math.floor(p.maxOf(d) / 2) : 0));

test("Paket aus der KI-Antwort: Texte gefiltert, Zahlen nur als Ziffern-Antwort, Gruppen nur mit Staerken", () => {
  const pk = P.fromOption(LEARN);
  assert.equal(pk.m, "l"); assert.equal(pk.q.length, 5);
  assert.deepEqual(pk.z, [8, 0, 0, 2, 365], "Schaetzen nimmt nur ganze Zahlen, die so in der Antwort stehen");
  assert.equal(P.whole("1.000"), 1000); assert.equal(P.whole("ca. 8"), 0); assert.equal(P.whole("8 km"), 0); assert.equal(P.whole("1"), 0);
  // Review B2 #5: a leading zero is not a number as it stands
  for (const x of ["007", "0 100", "01.000", "00"]) assert.equal(P.whole(x), 0, x);
  assert.equal(P.whole("10"), 10); assert.equal(P.whole("100.000"), 100000);
  const g = P.fromOption(GROUP);
  assert.equal(g.m, "g"); assert.deepEqual(g.y[0], ["Planerin", "Du behältst den Überblick."]);
  // an answer pointing at a type that does not exist goes, a question with fewer than two answers goes
  const bad = P.fromOption(Object.assign({}, GROUP, { fragen: GROUP.fragen.concat([{ f: "Extra?", antworten: [{ t: "A", typ: 9 }, { t: "B", typ: 0 }] }]) }));
  assert.equal(bad.q.length, 3);
  assert.equal(P.fromOption({ modus: "lernen", titel: "x", fragen: LEARN.fragen.slice(0, 2) }), null, "unter 3 Fragen kein Paket");
  assert.equal(P.sanitize({ t: "Scheiße", m: "l", q: P.fromOption(LEARN).q }), null, "Titel durch die Wortliste");
  assert.equal(P.sanitize({ t: "Ok", m: "l", q: [["Was?", "<b>x</b>", "y", "z"], ["Wo?", "https://x.de", "a", "b"], ["Wer?", "Ana", "Ana", "Ben"]] }), null, "Link, Doppel, nichts mehr uebrig");
});

test("Vier Karten mit Paket: jede Art eigene Mechanik, Ergebnis mit beiden Staenden, alles ueber echte Links", () => {
  const pk = P.fromOption(LEARN);
  for (const g of ["abfragen", "luecke", "woerter", "schaetzen", "quiz"]) {
    let d = through(card(g, pk));
    assert.ok(d.pk, g + " behaelt das Paket im Link");
    const p0 = Tn.state(d).prompts;
    if (g === "abfragen") assert.deepEqual(p0.slice(0, 2).map((p) => p.w), ["show", "pick"], "Karteikarte: Frage, dann gewusst?");
    if (g === "schaetzen") assert.ok(p0.every((p) => p.w === "slide") && p0.length === 3, "nur die drei Zahlenfragen");
    if (g === "woerter") assert.ok(p0[0].from(d, [], [], "de").includes(pk.q[0][0]), "Antwort sucht ihre Frage");
    if (g === "luecke" || g === "quiz") assert.deepEqual(p0[0].from(d, [], [], "de").slice().sort(), pk.q[0].slice(1).sort(), "alle Antworten gemischt");
    d = through(Tn.play(d, first(d), 100));
    d = through(Tn.play(d, first(d), 100));
    const r = Tn.result(d, "de"), e = Tn.result(d, "en");
    assert.ok(Tn.state(d).over, g);
    assert.equal(r.h, "Planeten");
    // Schätzen (A6): a fixed sentence per person and the distance per question, never a percentage
    assert.match(r.lines[0], g === "schaetzen" ? /^Spieler 1: (Alles genau getroffen!|Ganz nah dran\.|Gut geschätzt\.|Da war noch Luft\. Revanche\?)$/ : /^Spieler 1: \d von 5 richtig$/, g);
    if (g === "schaetzen") assert.ok(r.lines.length === 5 && !/%|Prozent|percent/.test(JSON.stringify([r, e])), JSON.stringify(r));
    assert.ok(!/undefined|\{\w+\}/.test(JSON.stringify([r, e])), g);
  }
});

test("Gleiche Reihenfolge auf beiden Handys, nur aus dem Seed; Schaetzen-Regler verraet die Zahl nicht", () => {
  const pk = P.fromOption(LEARN), a = card("luecke", pk, 5), b = through(card("luecke", pk, 5));
  for (let i = 0; i < 5; i++) assert.deepEqual(P.choices(a, i), P.choices(b, i));
  assert.equal(P.choices(a, 0)[P.rightAt(a, 0)], "8");
  const seen = new Set();
  for (let s = 1; s < 60; s++) { const d = card("schaetzen", pk, s), top = P.top(d, 0); assert.ok(Number.isInteger(top) && top > 8 && top <= 45, "Ende ganzzahlig, die Zahl liegt zwischen gut einem Sechstel und vier Fuenfteln: " + top); seen.add(top); }
  assert.ok(seen.size >= 2, "das Ende wechselt mit dem Seed");
  // Review B2 #3: where the number sits on the slider (number / end) spreads around the middle, for small and big numbers
  for (const z of [2, 7, 24, 206, 4000, 999999]) {
    const pz = Object.assign({}, pk, { z: [z, 0, 0, 2, 365] }), at = [];
    for (let s = 1; s < 400; s++) { const top = P.top(card("schaetzen", pz, s), 0); assert.ok(top > z, z + " " + top); at.push(z / top); }
    at.sort((a, b) => a - b);
    const below = at.filter((x) => x < 0.5).length / at.length;
    assert.ok(below > 0.3 && below < 0.7, z + ": unter der Mitte " + below.toFixed(2));
    assert.ok(at[0] > 0.15 && at[at.length - 1] < 0.85, z + ": " + at[0].toFixed(2) + ".." + at[at.length - 1].toFixed(2));
  }
  // right answers: count them
  const d = card("luecke", pk, 9), right = [0, 1, 2, 3, 4].map((i) => [P.rightAt(d, i)]);
  const s = P.score(d, "luecke", right); assert.equal(s.ok, 5); assert.deepEqual(s.open, []);
  // Frag mich ab and Woerter: the right answers count as right, the wrong ones stay open
  const ab = card("abfragen", pk, 9), knew = [];
  for (let i = 0; i < 5; i++) knew.push(0, [i === 2 ? 1 : 0]);
  const sa = P.score(ab, "abfragen", knew); assert.equal(sa.ok, 4); assert.deepEqual(sa.open, [pk.q[2][0] + " → " + pk.q[2][1]]);
  const wo = card("woerter", pk, 9), from = (i) => Tn.state(wo).prompts[i].from(wo, [], [], "de");
  const hit = [0, 1, 2, 3, 4].map((i) => [from(i).indexOf(pk.q[i][0])]);
  assert.ok(hit.every((x) => x[0] >= 0));
  assert.equal(P.score(wo, "woerter", hit).ok, 5);
  assert.equal(P.score(wo, "woerter", hit.map((x) => [(x[0] + 1) % 3])).ok, 0);
});

test("Team-Quiz und Typen: jede Person spielt allein, kein Ergebnis kommt zurueck, keine Rangliste, Typen nur Staerken", () => {
  const firma = P.sanitize(Object.assign(P.fromOption(LEARN), { m: "f" }));
  let d = card("quiz", firma);
  assert.equal(Tn.game(d).stay, true);
  assert.equal(Tn.state(d).prompts.length, 1, "wer es macht, sendet nur");
  d = through(Tn.play(d, [0], 100));
  const p = Tn.state(d).prompts, last = p[p.length - 1];
  const mine = last.list(d, [], [[P.rightAt(d, 0)], [0], [0], [0], [0]], "de");
  assert.match(mine[0], /^Du: \d von 5 richtig$/); assert.equal(mine.length, 1);
  assert.equal(last.notes(d, [], [[P.rightAt(d, 0)], [P.rightAt(d, 1)], [P.rightAt(d, 2)], [P.rightAt(d, 3)], [P.rightAt(d, 4)]]).length, 0, "alles richtig: nichts offen");
  assert.equal(Tn.T("de")[last.later], "Nur du siehst dein Ergebnis. Es gibt keine Rangliste.");
  assert.ok(!mine.some((x) => /Spieler/.test(x)), "keine Namen, kein Vergleich");
  let g = card("typen", P.fromOption(GROUP));
  assert.equal(Tn.game(g).stay, true);
  g = through(Tn.play(g, [0], 100));
  const st = Tn.state(g), pick = st.prompts.slice(0, 3);
  // whichever answers: the result is one of the strengths, the same answers always give the same type
  const ans = pick.map((x, i) => [i % 2]);
  const t1 = st.prompts[3].list(g, [], ans, "de"), t2 = st.prompts[3].list(g, [], ans, "de");
  assert.deepEqual(t1, t2); assert.match(t1[0], /^Du bist: (Planerin|Motor)$/); assert.equal(Tn.T("de")[st.prompts[3].later], "Jede Stärke zählt. Niemand wird verglichen.");
  // without a pack Team- and Typen-Quiz have no valid move
  const none = D.docFromIdea(D.IDEAS.find((i) => i.turn && i.turn.g === "typen"), me, "de");
  assert.equal(Tn.play(none, [0], 100), null); assert.equal(Tn.play(none, [[0]], 100), null);
  // a group pack never fits a learning card and the other way round
  assert.equal(P.fits("luecke", P.fromOption(GROUP)), false); assert.equal(P.fits("typen", P.fromOption(LEARN)), false);
  assert.equal(D.sanitizeDoc(Object.assign(card("luecke", P.fromOption(LEARN)), { pk: P.fromOption(GROUP) })).pk, undefined);
});

test("Link: das Paket wird so gekuerzt, dass es nach allen Zuegen in einen Link passt", () => {
  const big = P.fromOption({ modus: "lernen", titel: "Langes Thema mit vielen Fragen", fragen: Array.from({ length: 8 }, (x, i) => ({ f: "Frage Nummer " + (i + 1) + " mit einem recht langen Fragetext über das Thema?", a: "Antwort " + (i + 1), d: ["Falsch eins " + i, "Falsch zwei " + i, "Falsch drei " + i] })) });
  for (const g of ["abfragen", "luecke", "woerter", "quiz"]) {
    const d0 = card(g, null), ki = { k: "quiz", s: "s2.quiz.mh2x9k1a." + "A".repeat(32), h: "y".repeat(43) };
    const doc = Object.assign(JSON.parse(JSON.stringify(d0)), { ki }), pk = P.fit(doc, big, size, ROOM, Tn.seal);
    assert.ok(pk && pk.q.length >= 3 && pk.q.length < 8, g + " " + (pk && pk.q.length));
    if (g === "abfragen" || g === "woerter") assert.ok(pk.q.every((r) => r.length === 2), "Falschantworten fallen weg, wo sie nie gezeigt werden");
    let d = Object.assign(doc, { pk });
    for (let t = 0; t < 2; t++) { const w = P.worst(d)[t]; d = Tn.play(d, w, 100); assert.ok(D.docUrl(d).split("#c=")[1].length <= C.MAX_FRAGMENT - 80, g + " Zug " + t); d = through(d); }
    assert.equal(D.sanitizeDoc(d).ki.s, ki.s, "das Siegel bleibt im Link");
  }
});

test("Nachtpakete: Format fuer 100, 20 gepruefte Pakete, jugendfrei, jedes passt auf seine Karten und in einen Link", () => {
  assert.equal(J.v, 1); assert.equal(J.max, 100); assert.ok(J.packs.length >= 20 && J.packs.length <= J.max);
  assert.match(J.checked, /^\d{4}-\d{2}-\d{2}$/); assert.equal(J.model, "local-qwen36-35b-a3b-coding");
  const ids = new Set();
  // "Blut" stays allowed in a learning pack, as on the server (LEARN_OK: the heart, first aid)
  const UNSAFE = /(^|[^\p{L}])(alkohol\w*|bier|wein|schnaps|zigarett\w*|rauchen|droge\w*|tablette\w*|waffe\w*|messer|töten|tot|sex\w*|kuss|wette\w*|casino|drugs?|weapons?|kill\w*|dead|alcohol)(?![\p{L}])/iu;
  for (const x of J.packs) {
    assert.ok(/^[a-z]{3,20}$/.test(x.id) && !ids.has(x.id), x.id); ids.add(x.id);
    assert.ok(["de", "en"].includes(x.lang) && Number.isInteger(x.ab) && x.ab >= 8 && x.ab <= 18, x.id);
    const pk = P.sanitize(x.pk);
    assert.deepEqual(pk, x.pk, x.id + " geht unveraendert durch den Filter");
    assert.ok(P.clean(pk, C.isClean), x.id);
    assert.ok(!P.texts(pk).some((s) => UNSAFE.test(s)), x.id + " Jugendschutz");
    const games = ["abfragen", "luecke", "woerter", "schaetzen", "quiz", "typen"].filter((g) => P.fits(g, pk));
    assert.ok(games.length, x.id);
    for (const g of games) {
      const d = card(g, null);
      assert.ok(P.fit(d, pk, size, ROOM, Tn.seal), x.id + " passt fuer " + g);
    }
  }
  const by = (m) => J.packs.filter((x) => x.pk.m === m).length;
  assert.ok(by("l") >= 14 && by("f") >= 2 && by("g") >= 2, "Lernen, Firma und Gruppe");
  assert.ok(J.packs.filter((x) => P.fits("schaetzen", x.pk)).length >= 3, "Pakete auch fuer Schaetzen");
  assert.ok(J.packs.some((x) => x.lang === "en"), "auch Englisch");
});

test("Meldung traegt die Fragen mit (nach Einwilligung), nie die Zuege", () => {
  const A = require("../src/ai.js"), d = card("luecke", P.fromOption(LEARN));
  d.ki = { k: "quiz", s: "s2.quiz.mh2x9k1a." + "A".repeat(32) };
  const b = A.reportBody(Tn.play(d, first(d), 100), "wrong", "");
  assert.deepEqual(b.content.quiz, d.pk); assert.equal(b.kind, "quiz"); assert.ok(!("q" in b.content));
});
