// Mal & Rat (zug-malrat): portierte Alt-Tests (alt test/malrat.test.js) gegen Engine und Karte, dazu der Kartenvertrag
// (Zugfolge, Tagesmodus, accepts) und die Rundreise ueber src/contract/session.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as M from "../src/engines/malrat/malrat.js";
import { cleanInput, questFold } from "../src/engines/malrat/filter.js";
import { mulberry32, form } from "../src/engines/seed32/seed32.js";
import card, { accepts, draftInput, prepare, compact, merge, linesOf, tryGuess, known, hints, face, words } from "../src/cards/zug-malrat/card.js";
import { strokeItems, visibleAt } from "../src/cards/zug-malrat/strokes.js";
import { rng } from "../src/contract/sdk.js";
import * as S from "../src/contract/session.js";
import { encode as linkEncode, decode as linkDecode, MAX_FRAGMENT } from "../src/app/link.js";
import { validInput } from "../src/cards/index.js";

const T = M.DATA.text;
function scribble(n, k, seed) {
  const r = mulberry32(seed || 1), out = [];
  for (let i = 0; i < n; i++) {
    const cx = r(), cy = r(), a = r() * 6, p = [];
    for (let j = 0; j < k; j++) p.push([Math.min(1, Math.max(0, cx + 0.3 * Math.cos(a + j / 9) + (r() - 0.5) * 0.004)), Math.min(1, Math.max(0, cy + 0.3 * Math.sin(a + j / 7) + (r() - 0.5) * 0.004))]);
    out.push({ c: i % 8, w: i % 3, p });
  }
  return out;
}
const DAY = 20448;
const fresh = () => card.init({ rng: rng("t"), params: {} });
const obsOf = (st) => card.observe(st, 0);
// Zug wie vom Geraet: Bild aus Wort und Strichen, der Host stempelt den Tag d (manifest.inputDay)
function DI(obs, seat, o, day = DAY) {
  const inp = draftInput(obs, seat, { seed: obs.pub.pic ? undefined : String(day), ...o });
  return inp ? { ...inp, d: day } : null;
}
function draw(st, seat, word, lines, secs) {
  const inp = DI(obsOf(st), seat, { word, lang: "de", lines, secs });
  return inp ? card.step(st, inp) : null;
}

test("Karte: Zugkarte per Link, zwei Sitze, Titel Mal & Rat, keine Marke im Text", () => {
  const m = card.manifest;
  assert.equal(m.kind, "turn"); assert.equal(m.mode, "turn"); assert.equal(m.id, "zug-malrat");
  assert.deepEqual(m.players, { min: 2, max: 2 }); assert.equal(m.hidden, "none");
  assert.equal(m.title.de, "Mal & Rat"); assert.equal(m.title.en, "Draw & Guess");
  assert.doesNotMatch(JSON.stringify(m) + JSON.stringify(M.DATA), /montagsmaler|pictionary/i);
});

test("Wortlisten de/en: mindestens 150 je Sprache in drei Stufen, einzelne Woerter, kindgerecht, ohne Doppelte", () => {
  for (const l of ["de", "en"]) {
    const w = M.ALL.map((e) => e[l]);
    assert.ok(w.length >= 150, l + " " + w.length);
    for (const lvl of [0, 1, 2]) assert.ok(M.ALL.filter((e) => e.lvl === lvl).length >= 50, l + " Stufe " + lvl);
    assert.equal(new Set(w.map(M.fold)).size, w.length, l + " doppelt");
    for (const x of w) {
      assert.match(x, /^\p{L}{2,16}$/u, x);
      assert.equal(cleanInput(x, 16), x, "Wortfilter " + x);
      assert.equal(M.own(x), x, "als eigenes Wort erlaubt " + x);
    }
  }
  for (const c of M.CATS) for (const l of ["de", "en"]) assert.ok(T[l]["mr_cat_" + c], l + " Kategorie " + c);
  assert.deepEqual(Object.keys(T.de).sort(), Object.keys(T.en).sort(), "alle Texte zweisprachig");
});

test("Vorschlaege: drei Woerter, je eins pro Stufe, nur aus Seed und Runde; Tagesmodus nimmt den Tag als Seed", () => {
  const a = M.suggest(20448, 1, "de");
  assert.deepEqual(a.map((s) => s.lvl), [0, 1, 2]);
  assert.deepEqual(M.suggest(20448, 1, "de"), a, "gleicher Seed, gleiche Woerter");
  assert.deepEqual(M.suggest(20448, 1, "en").map((s) => s.cat), a.map((s) => s.cat), "dieselben Begriffe auf Englisch");
  const many = new Set(); for (let r = 1; r < 30; r++) many.add(M.suggest(20448, r, "de")[0].w);
  assert.ok(many.size > 10, "jede Runde andere Woerter");
  // Tagesmodus immer (alt game.daily): Seed ist der Tag des ersten Bildes, unabhaengig vom Partie-Seed des Hosts
  const d1 = card.init({ rng: rng("eins"), params: {} }), d2 = card.init({ rng: rng("zwei"), params: {} });
  assert.deepEqual(d1, d2, "der Partie-Seed spielt keine Rolle");
  assert.deepEqual(words(obsOf(d1), "de", 20448), a, "vor dem ersten Bild: Woerter des heutigen Tages (ctx.today)");
  assert.equal(words(obsOf(d1), "de", null), null, "ohne Tag keine Woerter (die Karte hat keine Uhr)");
  const one = draw(d1, 0, a[0].w, scribble(1, 9, 1));
  assert.equal(one.pub.day, 20448, "der gestempelte Tag des ersten Bildes ist der Seed");
  assert.deepEqual(words(card.observe(one, 1), "de", 20999), M.suggest(20448, 2, "de"), "danach zaehlt der Tag der Partie, nicht heute");
});

test("Striche: Douglas-Peucker, Raster 64, Kodierung und Dekodierung, Farbe und Staerke bleiben", () => {
  const line = Array.from({ length: 50 }, (x, i) => [i / 49, i / 49]);
  assert.deepEqual(M.simplify(line.map((p) => [p[0] * 63, p[1] * 63]), 0.5).length, 2, "eine Gerade bleibt zwei Punkte");
  const lines = [{ c: 5, w: 2, p: line }, { c: 1, w: 0, p: [[0.5, 0.5]] }, { c: 7, w: 1, p: scribble(1, 120, 3)[0].p }];
  const s = M.encode(lines, 0.45), back = M.decode(s);
  assert.match(s, /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/);
  assert.equal(back.length, 3);
  assert.deepEqual(back.map((l) => [l.c, l.w]), [[5, 2], [1, 0], [7, 1]]);
  assert.deepEqual(back[0].p, [[0, 0], [63, 63]]); assert.deepEqual(back[1].p, [[32, 32]], "ein Punkt bleibt ein Punkt");
  assert.ok(back[2].p.length > 4 && back[2].p.length < 120, "eine Kurve wird kleiner, behaelt aber ihre Form: " + back[2].p.length);
  assert.ok(back.every((l) => l.p.every((p) => p.every((x) => Number.isInteger(x) && x >= 0 && x < 64))));
  assert.equal(M.encode(M.decode(s).map((l) => ({ c: l.c, w: l.w, p: l.p.map((p) => [p[0] / 63, p[1] / 63]) })), -1), s, "dekodiert und ohne Vereinfachen neu kodiert: dasselbe");
  assert.ok(M.encode(lines, 2).length <= M.encode(lines, 0.45).length, "groebere Toleranz, kuerzerer Link");
  for (const bad of ["", "A", "AB", "AABB", "zAA", "A.", ".AAA", "AAA..AAA", "AA!", "A".repeat(901) + "A", Array(81).fill("AAA").join("."), 7, null])
    assert.equal(M.decode(bad), null, "kein Bild: " + JSON.stringify(bad).slice(0, 30));
});

test("Platz: ein volles Bild passt in 600 Zeichen Striche; was nicht passt, wird nicht abgeschnitten, sondern abgelehnt", () => {
  const big = scribble(14, 80, 7);
  const p = M.pack(big);
  assert.ok(p && p.s.length <= M.MAX_CHARS, "14 Striche passen");
  assert.equal(M.decode(p.s).length, 14, "alle Striche bleiben");
  let n = 14; while (M.pack(scribble(n + 1, 80, 7))) n++;
  assert.ok(n >= 14 && n < M.MAX_LINES, "Platz fuer " + n + " Striche");
  assert.equal(M.pack(scribble(n + 1, 80, 7)), null, "zu viel: kein Kuerzen");
  assert.equal(DI(obsOf(fresh()), 0, { word: "Schildkröte", lang: "de", lines: scribble(n + 1, 80, 7) }), null, "kein Zug aus einem Bild, das nicht passt");
  // eine Platzpruefung des Links (fits) kann enger sein: dann eine groebere Toleranz, nie ein abgeschnittenes Bild
  const tight = DI(obsOf(fresh()), 0, { word: "Hund", lang: "de", lines: big, fits: (s) => s.length <= 200 });
  if (tight) assert.equal(M.decode(tight.s).length, 14);
});

test("Kein Bild geht still verloren: Striche bis 600 Zeichen sind ein Bild, darueber keins", () => {
  const line = (k, o) => ({ c: o % 8, w: o % 3, p: Array.from({ length: k }, (_, j) => [((j * 7 + o) % 64) / 63, ((j * 13 + o * 5) % 64) / 63]) });
  const lines = (len) => { const out = []; let left = len; while (left > 0) { const k = Math.min(20, Math.max(1, Math.floor((left - 1 - (out.length ? 1 : 0)) / 2))); out.push(line(k, out.length)); left -= 1 + 2 * k + (out.length > 1 ? 1 : 0); } return out; };
  let pics = 0, none = 0;
  for (let len = 300; len <= 900; len += 10) {
    const s = M.encode(lines(len), -1);
    if (s.length > 600) { assert.equal(M.decode(s), null, s.length + " Zeichen sind kein Bild"); none++; }
    else { assert.ok(M.decode(s), s.length + " Zeichen sind ein Bild"); assert.equal(M.encode(M.decode(s).map((l) => ({ c: l.c, w: l.w, p: l.p.map((q) => [q[0] / 63, q[1] / 63]) })), -1), s); pics++; }
  }
  assert.ok(pics > 0 && none > 0);
});

test("Hash statt Klartext: das Wort steht nie im Zug, nur Pruefwert und Hinweis; Gross-/Kleinschreibung und Umlaute zaehlen nicht", () => {
  const st0 = fresh();
  for (const w of ["Hund", "Schildkröte", "Regenbogen", "Zwerg"]) {
    const inp = DI(obsOf(st0), 0, { word: w, lang: "de", lines: scribble(3, 40, 2) }), all = JSON.stringify(inp).toLowerCase();
    assert.ok(!all.includes(w.toLowerCase()) && !all.includes(questFold(w)), w + " steht im Zug");
    assert.match(inp.k, /^[A-Za-z0-9_-]{11}$/); assert.equal(inp.h, w[0].toUpperCase() + Array.from(w).length);
    const st = card.step(st0, inp), o = card.observe(st, 1);
    assert.equal(tryGuess(o, w.toLowerCase()).ok, true);
    assert.equal(tryGuess(o, "  " + w.toUpperCase() + " ").ok, true);
    assert.equal(tryGuess(o, "Katze").ok, false);
    assert.deepEqual(known(o).w, w, "Wort aus der Liste wird auf dem Geraet wiedergefunden");
  }
  const sk = M.picture(M.check("Schildkröte", 1, 1), "Schildkröte", "de", "AAA", 0, 1);
  assert.equal(M.right("schildkrote", sk, 1), true, "ö wie o");
  for (const g of ["Schildkroete", "SCHILDKROETE"]) assert.equal(M.right(g, sk, 1), true, g + ": oe wie ö");
  for (const [w, g] of [["Bär", "Baer"], ["Tür", "Tuer"], ["Fuß", "Fuss"], ["Feuer", "feuer"], ["Strauß", "Strauss"]])
    assert.equal(M.right(g, M.picture(M.check(w, 1, 1), w, "de", "AAA", 0, 1), 1), true, g + " fuer " + w);
  assert.equal(M.right("Schildkrate", sk, 1), false, "ae ist nicht oe");
  const a = M.check("Hund", 1, 1), b = M.check("Hund", 2, 1), c = M.check("Hund", 1, 2);
  assert.ok(a !== b && a !== c && b !== c, "Salz aus Seed und Runde");
  // ein eigenes Wort steht nicht in der Liste: nur der Pruefwert kann es bestaetigen
  const own = card.step(st0, DI(obsOf(st0), 0, { word: "Wackelpudding", lang: "de", lines: scribble(2, 30, 1) }));
  assert.equal(known(card.observe(own, 1)), null); assert.equal(tryGuess(card.observe(own, 1), "wackelpudding").ok, true);
});

test("Wortfilter: eigene Woerter und Rateversuche gehen durch den Filter (cleanInput, Kontakt, Beleidigung)", () => {
  assert.equal(M.own("Wackelpudding"), "Wackelpudding");
  for (const bad of ["Arschloch", "scheiße", "zwei Wörter", "R2D2", "x", "ß", "", "  ", "<b>", "a".repeat(17)]) assert.equal(M.own(bad), "", bad);
  assert.equal(M.guess("Arschloch"), ""); assert.equal(M.guess("  Hund "), "Hund");
  assert.equal(cleanInput("ruf 0171 1234567 an", 90), "", "Telefonnummer (kontakt.js, im Kern der App)");
  assert.equal(cleanInput("verpiss dich", 90), "", "Beleidigung als Befehl");
  const st = draw(fresh(), 0, "Hund", scribble(1, 20, 1));
  assert.equal(tryGuess(card.observe(st, 1), "Arschloch").ok, false);
  assert.equal(DI(obsOf(fresh()), 0, { word: "Arschloch", lang: "de", lines: scribble(1, 20, 1) }), null, "gefiltertes Wort: kein Zug");
});

test("Zurueckmalen: der Zustand haelt nur das neueste Bild, Runde zaehlt hoch, die Zeit des Ratens reist mit", () => {
  let st = draw(fresh(), 0, "Hund", scribble(2, 30, 1));
  assert.equal(card.status(st).turn, 1); assert.equal(card.status(st).over, false);
  assert.deepEqual(face(st.pub, "de"), ["Was ist das?", "4 Buchstaben, 2 Striche"]);
  st = draw(st, 1, "Mond", scribble(3, 30, 2), 14);
  assert.equal(st.pub.pic.r, 2); assert.equal(st.pub.pic.sec, 14); assert.equal(card.status(st).turnNo, 2);
  assert.deepEqual(face(st.pub, "en"), ["What is it?", "4 letters, 3 lines", "Your last picture was guessed in 14 seconds."]);
  st = draw(st, 0, "Stern", scribble(1, 30, 3), 0);
  assert.equal(face(st.pub, "de")[2], "Dein letztes Bild war knifflig.");
  assert.equal(face(draw(st, 1, "Hund", scribble(1, 9, 4), 1).pub, "de")[2], "Dein letztes Bild wurde in 1 Sekunde erraten.");
  assert.equal(tryGuess(card.observe(st, 1), "Stern").ok, true, "Salz aus Seed und Runde 3");
  assert.equal(DI(obsOf(fresh()), 0, { word: "Hund", lang: "de", lines: scribble(1, 9, 4), secs: 50 }).sec, 0, "das erste Bild hat keine Ratezeit");
});

test("Von Hand gebauter Zug: nur was der Bildschirm schicken kann (accepts)", () => {
  const st = fresh(), o = obsOf(st), chk = M.check("Hund", String(DAY), 1), s = M.encode(scribble(1, 20, 1), 0.8);
  const ok = { t: "draw", seat: 0, k: chk, h: "H4", l: 0, s, sec: 0, r: 1, d: DAY };
  assert.equal(accepts(o, 0, ok), true);
  for (const [what, v] of [["Pruefwert", { ...ok, k: "kurz" }], ["Hinweis", { ...ok, h: "Hund" }], ["Laenge", { ...ok, h: "H40" }], ["Laenge 1", { ...ok, h: "H1" }],
    ["Sprache", { ...ok, l: 2 }], ["Striche", { ...ok, s: "AB" }], ["Zeit", { ...ok, sec: -1 }], ["Zeit", { ...ok, sec: 99999 }],
    ["Runde", { ...ok, r: 0 }], ["Tag fehlt", (({ d, ...x }) => x)(ok)], ["Tag 0", { ...ok, d: 0 }], ["Rohpunkte", { ...ok, a: [[0, 0, [1, 1]]] }], ["Klartext-Feld", { ...ok, w: "Hund" }], ["Typ", { ...ok, t: "guess" }], ["kein Objekt", "Hund"], ["falscher Sitz", { ...ok, seat: 1 }]])
    assert.equal(accepts(o, typeof v === "object" ? v.seat : 0, v), false, what);
  assert.throws(() => card.step(st, { ...ok, seat: 1 }), /ungueltig/);
  const one = card.step(st, ok), o1 = card.observe(one, 1);
  assert.equal(accepts(o1, 1, { ...ok, seat: 1, r: 5 }), false, "Runde springt nicht");
  assert.equal(accepts(o1, 1, { ...ok, seat: 1, r: 2 }), true);
  assert.equal(accepts(o1, 0, { ...ok, seat: 0, r: 2 }), false, "nicht am Zug");
  assert.equal(accepts(o, 0, { ...ok, r: 7 }), true, "ohne voriges Bild jede Runde (alt ok, Wiederherstellung aus dem Link)");
  assert.equal(accepts(o, 1, { ...ok, seat: 1, r: 2 }), false, "auf leerem Stand setzt nur Sitz 0 das Bild");
  // Hinweiszug: erstes Wort der naechsten Runde mit fester Skizze, gueltig und wiederfindbar; vor dem ersten Bild keiner
  assert.deepEqual(card.moves(o, 0), [], "vor dem ersten Bild kennt die Karte den Tag nicht");
  const mv = card.moves(o1, 1);
  assert.equal(mv.length, 1); assert.equal(accepts(o1, 1, mv[0]), true);
  assert.equal(tryGuess(card.observe(card.step(one, mv[0]), 0), M.suggest(String(DAY), 2, "de")[0].w).ok, true);
});

test("Tipps beim Raten in Altreihenfolge: Kategorie, Farben, Anfangsbuchstabe, Buchstabenbank, je ein Buchstabe", () => {
  const st = draw(fresh(), 0, "Schildkröte", [{ c: 4, w: 1, p: [[0.1, 0.1], [0.9, 0.9]] }, { c: 5, w: 0, p: [[0.2, 0.8], [0.8, 0.2]] }]);
  const o = card.observe(st, 1), k = known(o), list = hints(o, "de", k);
  assert.equal(k.w, "Schildkröte");
  assert.deepEqual(list.slice(0, 4).map((h) => h.t), ["cat", "col", "first", "bank"]);
  assert.equal(list[0].text, "Tipp: " + T.de["mr_cat_" + k.cat]);
  assert.equal(list[1].text, "Farben: Grün und Blau");
  assert.equal(list[2].text, "Fängt mit S an.");
  assert.deepEqual(list[3].bank, M.bank("Schildkröte", String(DAY), 1));
  assert.equal(list.length, 4 + 11 - 2, "bis auf zwei Buchstaben");
  const own = draw(fresh(), 0, "Wackelpudding", scribble(1, 9, 1));
  assert.deepEqual(hints(card.observe(own, 1), "de", null).map((h) => h.t), ["col", "first"], "eigenes Wort: nur Farben und Anfangsbuchstabe");
  assert.equal(M.spelt("Schildkroete", 11), "Schildkröte");
  assert.equal(form(T.de, "mr_right", 1, "de"), T.de.mr_right_one);
});

test("Anzeige: Wortwahl als Entwurf, Zeichenflaeche (draw), Abspielen (strokes), Raten mit Feld und Tipps", () => {
  const st0 = fresh(), kinds = (v) => v.children.map((c) => c.t);
  const v0 = card.view(obsOf(st0), 0, { lang: "de", today: DAY, draft: null });
  const pick = v0.children.find((c) => c.t === "choice");
  assert.deepEqual(pick.options.slice(0, 3).map((o) => o.draft.w), M.suggest(DAY, 1, "de").map((x) => x.w), "drei Woerter des Tages als Entwurf");
  assert.equal(pick.options[3].label, T.de.mr_own); assert.ok(pick.options.every((o) => !o.input), "Wortwahl ist nie ein Zug");
  assert.ok(!kinds(v0).includes("draw"), "erst das Wort, dann die Leinwand");
  const ownV = card.view(obsOf(st0), 0, { lang: "de", today: DAY, draft: { own: "Arschloch" } });
  assert.equal(ownV.children.find((c) => c.t === "field").key, "own");
  assert.equal(ownV.children.filter((c) => c.t === "choice").pop().options[0].disabled, true, "gefiltertes eigenes Wort: gesperrt mit Grund");
  const v1 = card.view(obsOf(st0), 0, { lang: "de", today: DAY, draft: { w: "Hund", l: "de" } }), dr = v1.children.find((c) => c.t === "draw");
  assert.equal(dr.colors.length, 8); assert.equal(dr.widths.length, 3); assert.deepEqual(dr.submit, { t: "draw", seat: 0 });
  assert.ok(!JSON.stringify(dr.submit).includes("Hund"), "das Wort steht nicht in der Zugvorlage");
  assert.deepEqual(card.view(obsOf(st0), 1, { lang: "de", today: DAY }).children, [], "wer nicht malt, sieht vor dem ersten Bild nichts zum Bedienen");
  const st = draw(st0, 0, "Hund", [{ c: 1, w: 2, p: [[0, 0], [1, 1]] }, { c: 3, w: 0, p: [[0.5, 0.5]] }]);
  const g = card.view(card.observe(st, 1), 1, { lang: "en", today: DAY }), sk = g.children.find((c) => c.t === "strokes");
  assert.equal(sk.total, 3); assert.equal(sk.play, true); assert.equal(sk.items[1].dot, true); assert.equal(sk.items[1].from, 2);
  assert.match(sk.a11y, /2 lines in Red and Yellow/);
  assert.deepEqual(visibleAt(sk.items, 1), [1, 0]); assert.deepEqual(visibleAt(sk.items, 3), [2, 1]);
  assert.equal(g.children.find((c) => c.t === "field").key, "guess");
  const right = card.view(card.observe(st, 1), 1, { lang: "de", today: DAY, draft: { guess: "hund", tried: "hund", sec: 9, tips: 2 } });
  assert.ok(right.children.some((c) => c.t === "text" && c.text === "Richtig! Hund – in 9 Sekunden erraten."));
  assert.ok(right.children.some((c) => c.text === "Tipp: " + T.de["mr_cat_" + known(card.observe(st, 1)).cat]), "Tipps bis zur gewaehlten Zahl");
  const back = right.children.filter((c) => c.t === "choice").pop().options.find((o) => o.label === T.de.mr_back);
  assert.ok(back, "nach dem Treffer: zurueckmalen");
  assert.ok(kinds(card.view(card.observe(st, 1), 1, { lang: "de", today: DAY, draft: back.draft })).includes("choice"), "Wortwahl fuer das Gegenbild");
  assert.equal(strokeItems([]).total, 0);
  assert.equal(card.view(obsOf(st0), 0, { lang: "de", preview: true }).children[0].text, card.manifest.howto.de);
});

test("Vom Widget zum Zug: prepare rechnet Rohpunkte (0..1000) und Entwurfswort in das Altbild um", () => {
  const st0 = fresh(), a = [[1, 2, [0, 0, 500, 500, 1000, 1000]], [4, 0, [[100, 900], [900, 100]]], [3, 1, [500, 500]]];
  const lines = linesOf(a);
  assert.deepEqual(lines[1].p, [[0.1, 0.9], [0.9, 0.1]]);
  for (const bad of [null, [], [[8, 0, [1, 1]]], [[0, 3, [1, 1]]], [[0, 0, [1]]], [[0, 0, [1, 1001]]], [[0, 0, []]], "x"]) assert.equal(linesOf(bad), null, JSON.stringify(bad));
  const inp = prepare(obsOf(st0), 0, { t: "draw", seat: 0, a }, { lang: "de", today: DAY, draft: { w: "Hund", l: "de" } });
  assert.equal(inp.s, M.pack(lines).s, "im Zug steht genau die Altkodierung");
  assert.equal(inp.k, M.check("Hund", String(DAY), 1)); assert.equal(inp.h, "H4"); assert.equal(inp.r, 1); assert.equal(inp.sec, 0);
  assert.equal("a" in inp, false, "keine Rohpunkte im Zug"); assert.equal("d" in inp, false, "den Tag stempelt der Host");
  assert.equal(prepare(obsOf(st0), 0, { t: "draw", seat: 0, a }, { lang: "de", today: DAY, draft: {} }), null, "ohne Wort kein Zug");
  assert.equal(prepare(obsOf(st0), 0, { t: "draw", seat: 0, a }, { lang: "de", today: null, draft: { w: "Hund" } }), null, "ohne Tag kein Zug");
  assert.equal(prepare(obsOf(st0), 1, { t: "draw", seat: 0, a }, { today: DAY, draft: { w: "Hund" } }), null, "fremder Sitz");
  const st1 = card.step(st0, { ...inp, d: DAY });
  const back = prepare(card.observe(st1, 1), 1, { t: "draw", seat: 1, a }, { lang: "en", today: DAY + 3, draft: { w: "Moon", l: "en", sec: 21 } });
  assert.equal(back.r, 2); assert.equal(back.sec, 21); assert.equal(back.l, 1);
  assert.equal(back.k, M.check("Moon", String(DAY), 2), "Seed bleibt der Tag der Partie");
  assert.equal(validInput("zug-malrat", { ...back, d: DAY + 3 }), true, "Schema der Karte (manifest.inputs)");
  assert.equal(validInput("zug-malrat", { t: "draw", seat: 0, a }), false, "Rohpunkte reisen nie");
});

test("Ende: nach Runde 999 ist Schluss (Altgrenze MAX_ROUND)", () => {
  const st = fresh();
  const last = { ...st, pub: { ...st.pub, day: DAY, pic: { k: "AAAAAAAAAAA", h: "H4", l: 0, s: "AAA", sec: 0, r: 999 } } };
  assert.equal(card.status(last).over, true); assert.equal(card.status(last).turn, -1);
  assert.equal(accepts(card.observe(last, 0), 0, { t: "draw", seat: 0, k: "AAAAAAAAAAA", h: "H4", l: 0, s: "AAA", sec: 0, r: 1000, d: DAY }), false);
});

// Rundreise ueber den Kartenvertrag und den Link (Snapshot: der Link haelt nur das neueste Bild, alt "snap")
function session4() {
  let s = S.newSession(card, { params: {}, seed: "0123456789abcdef0123456789abcdef", mine: [0, 1] });
  const plan = [["Hund", 0], ["Mond", 12], ["Stern", 0], ["Wackelpudding", 3]];
  plan.forEach(([w, secs], i) => {
    const seat = i % 2, inp = DI(S.observe(card, s, seat), seat, { word: w, lang: "de", lines: scribble(2 + i, 25, i + 1), secs }, DAY + i);
    s = S.apply(card, s, inp);
  });
  return s;
}
test("Vertrag: toWire verdichtet auf das neueste Bild, fromWire rechnet denselben Stand", () => {
  const s = session4();
  assert.equal(s.log.length, 4); assert.equal(s.state.pub.day, DAY, "Seed ist der Tag des ersten Bildes, spaetere Stempel aendern ihn nicht");
  const w = S.toWire(s, card);
  assert.equal(w.m.length, 1, "nur das neueste Bild");
  assert.deepEqual(w.m[0], { t: "draw", seat: 0, ...s.state.pub.pic, d: DAY });
  assert.deepEqual(compact(s.log), w.m); assert.deepEqual(compact(s.log, s.state), w.m);
  const back = S.fromWire(card, JSON.parse(JSON.stringify(w)), { mine: [] });
  assert.equal(S.pubHash(back), S.pubHash(s));
  assert.equal(S.status(card, back).turn, 0, "nach Runde 4 malt Sitz 0"); assert.equal(back.state.pub.pic.r, 4);
  assert.equal(tryGuess(card.observe(back.state, 0), "Wackelpudding").ok, true);
});

test("Link: das Fragment traegt genau die Altkodierung, Unicode-Hinweis, unter MAX_FRAGMENT", () => {
  let s = S.newSession(card, { params: {}, seed: "0123456789abcdef0123456789abcdef", mine: [0] });
  const lines = scribble(14, 80, 7), inp = DI(S.observe(card, s, 0), 0, { word: "Öl", lang: "de", lines });
  s = S.apply(card, s, inp);
  const f = linkEncode("challenge", { ...S.toWire(s, card), g: "0123456789abcdef", h: S.pubHash(s) });
  assert.ok(f.length <= MAX_FRAGMENT, f.length + " Zeichen");
  const d = linkDecode(f);
  assert.equal(d.ok, true); assert.equal(d.data.m[0].h, "Ö2"); assert.equal(d.data.m[0].s, M.pack(lines).s, "dieselbe Strich-Kodierung wie der Altcode");
});

test("Snapshot: merge nimmt das neuere Bild; Empfang ueber game.receive vereinigt mit dem eigenen Stand", async () => {
  const G = await import("../src/app/game.js");
  let a = S.newSession(card, { params: {}, seed: "0123456789abcdef0123456789abcdef", mine: [0] });
  a = S.apply(card, a, DI(S.observe(card, a, 0), 0, { word: "Hund", lang: "de", lines: scribble(2, 20, 1) }));
  const entryA = G.gameEntry(a, "0123456789abcdef");
  const linkA = linkEncode("challenge", G.challengeOf({ cardId: "zug-malrat", session: a, gameId: "0123456789abcdef" }));
  const rb = G.receive(linkA, null, ["f".repeat(32)]);
  assert.equal(rb.ok, true, rb.reason); assert.deepEqual(rb.session.mine, [1]);
  let b = S.apply(card, rb.session, DI(S.observe(card, rb.session, 1), 1, { word: "Mond", lang: "de", lines: scribble(3, 20, 2), secs: 7 }, DAY + 1));
  const linkB = linkEncode("challenge", G.challengeOf({ cardId: "zug-malrat", session: b, gameId: "0123456789abcdef" }));
  const ra = G.receive(linkB, entryA, []);
  assert.equal(ra.ok, true, ra.reason);
  assert.equal(S.pubHash(ra.session), S.pubHash(b)); assert.equal(S.status(card, ra.session).turn, 0);
  assert.equal(ra.session.state.pub.pic.sec, 7);
  // ein aelterer Link (Runde 1) aendert den eigenen neueren Stand nicht
  assert.deepEqual(merge(b.state.pub, a.state.pub), b.state.pub); assert.deepEqual(merge(a.state.pub, b.state.pub), b.state.pub);
  assert.deepEqual(merge({ day: 0, pic: null }, a.state.pub), a.state.pub);
});
