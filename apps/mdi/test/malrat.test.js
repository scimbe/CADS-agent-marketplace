// Mal & Rat (zug-malrat): portierte Alt-Tests (alt test/malrat.test.js) gegen Engine und Karte, dazu der Kartenvertrag
// (Zugfolge, Tagesmodus, accepts) und die Rundreise ueber src/contract/session.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as M from "../src/engines/malrat/malrat.js";
import { cleanInput, questFold } from "../src/engines/malrat/filter.js";
import { mulberry32, form } from "../src/engines/seed32/seed32.js";
import card, { accepts, draftInput, tryGuess, known, hints, face, words } from "../src/cards/zug-malrat/card.js";
import { strokeItems, visibleAt } from "../src/cards/zug-malrat/strokes.js";
import { rng } from "../src/contract/sdk.js";
import * as S from "../src/contract/session.js";
import { encode as linkEncode } from "../src/app/link.js";

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
const fresh = (day) => card.init({ rng: rng("t"), params: { day } });
const obsOf = (st) => card.observe(st, 0);
function draw(st, seat, word, lines, secs) {
  const inp = draftInput(obsOf(st), seat, { word, lang: "de", lines, secs });
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
  // Tagesmodus: alle bekommen am selben Tag dieselben Woerter, unabhaengig vom Partie-Seed
  const d1 = card.init({ rng: rng("eins"), params: { day: 20448 } }), d2 = card.init({ rng: rng("zwei"), params: { day: 20448 } });
  assert.equal(d1.pub.seed, "20448"); assert.deepEqual(words(obsOf(d1), "de"), a); assert.deepEqual(words(obsOf(d2), "de"), a);
  const f1 = card.init({ rng: rng("eins"), params: { day: 0 } }), f2 = card.init({ rng: rng("zwei"), params: { day: 0 } });
  assert.match(f1.pub.seed, /^[0-9a-f]{16}$/); assert.notEqual(f1.pub.seed, f2.pub.seed, "ohne Tagesmodus: Seed der Partie");
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
  assert.equal(draftInput(obsOf(fresh(20448)), 0, { word: "Schildkröte", lang: "de", lines: scribble(n + 1, 80, 7) }), null, "kein Zug aus einem Bild, das nicht passt");
  // eine Platzpruefung des Links (fits) kann enger sein: dann eine groebere Toleranz, nie ein abgeschnittenes Bild
  const tight = draftInput(obsOf(fresh(20448)), 0, { word: "Hund", lang: "de", lines: big, fits: (s) => s.length <= 200 });
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
  const st0 = fresh(20448);
  for (const w of ["Hund", "Schildkröte", "Regenbogen", "Zwerg"]) {
    const inp = draftInput(obsOf(st0), 0, { word: w, lang: "de", lines: scribble(3, 40, 2) }), all = JSON.stringify(inp).toLowerCase();
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
  const own = card.step(st0, draftInput(obsOf(st0), 0, { word: "Wackelpudding", lang: "de", lines: scribble(2, 30, 1) }));
  assert.equal(known(card.observe(own, 1)), null); assert.equal(tryGuess(card.observe(own, 1), "wackelpudding").ok, true);
});

test("Wortfilter: eigene Woerter und Rateversuche gehen durch den Filter (cleanInput, Kontakt, Beleidigung)", () => {
  assert.equal(M.own("Wackelpudding"), "Wackelpudding");
  for (const bad of ["Arschloch", "scheiße", "zwei Wörter", "R2D2", "x", "ß", "", "  ", "<b>", "a".repeat(17)]) assert.equal(M.own(bad), "", bad);
  assert.equal(M.guess("Arschloch"), ""); assert.equal(M.guess("  Hund "), "Hund");
  assert.equal(cleanInput("ruf 0171 1234567 an", 90), "", "Telefonnummer (kontakt.js, im Kern der App)");
  assert.equal(cleanInput("verpiss dich", 90), "", "Beleidigung als Befehl");
  const st = draw(fresh(20448), 0, "Hund", scribble(1, 20, 1));
  assert.equal(tryGuess(card.observe(st, 1), "Arschloch").ok, false);
  assert.equal(draftInput(obsOf(fresh(20448)), 0, { word: "Arschloch", lang: "de", lines: scribble(1, 20, 1) }), null, "gefiltertes Wort: kein Zug");
});

test("Zurueckmalen: der Zustand haelt nur das neueste Bild, Runde zaehlt hoch, die Zeit des Ratens reist mit", () => {
  let st = draw(fresh(20448), 0, "Hund", scribble(2, 30, 1));
  assert.equal(card.status(st).turn, 1); assert.equal(card.status(st).over, false);
  assert.deepEqual(face(st.pub, "de"), ["Was ist das?", "4 Buchstaben, 2 Striche"]);
  st = draw(st, 1, "Mond", scribble(3, 30, 2), 14);
  assert.equal(st.pub.pic.r, 2); assert.equal(st.pub.pic.sec, 14); assert.equal(st.pub.n, 2);
  assert.deepEqual(face(st.pub, "en"), ["What is it?", "4 letters, 3 lines", "Your last picture was guessed in 14 seconds."]);
  st = draw(st, 0, "Stern", scribble(1, 30, 3), 0);
  assert.equal(face(st.pub, "de")[2], "Dein letztes Bild war knifflig.");
  assert.equal(face(draw(st, 1, "Hund", scribble(1, 9, 4), 1).pub, "de")[2], "Dein letztes Bild wurde in 1 Sekunde erraten.");
  assert.equal(tryGuess(card.observe(st, 1), "Stern").ok, true, "Salz aus Seed und Runde 3");
  assert.equal(draftInput(obsOf(fresh(20448)), 0, { word: "Hund", lang: "de", lines: scribble(1, 9, 4), secs: 50 }).sec, 0, "das erste Bild hat keine Ratezeit");
});

test("Von Hand gebauter Zug: nur was der Bildschirm schicken kann (accepts)", () => {
  const st = fresh(20448), o = obsOf(st), chk = M.check("Hund", st.pub.seed, 1), s = M.encode(scribble(1, 20, 1), 0.8);
  const ok = { t: "draw", seat: 0, k: chk, h: "H4", l: 0, s, sec: 0, r: 1 };
  assert.equal(accepts(o, 0, ok), true);
  for (const [what, v] of [["Pruefwert", { ...ok, k: "kurz" }], ["Hinweis", { ...ok, h: "Hund" }], ["Laenge", { ...ok, h: "H40" }], ["Laenge 1", { ...ok, h: "H1" }],
    ["Sprache", { ...ok, l: 2 }], ["Striche", { ...ok, s: "AB" }], ["Zeit", { ...ok, sec: -1 }], ["Zeit", { ...ok, sec: 99999 }],
    ["Runde", { ...ok, r: 0 }], ["Klartext-Feld", { ...ok, w: "Hund" }], ["Typ", { ...ok, t: "guess" }], ["kein Objekt", "Hund"], ["falscher Sitz", { ...ok, seat: 1 }]])
    assert.equal(accepts(o, typeof v === "object" ? v.seat : 0, v), false, what);
  assert.throws(() => card.step(st, { ...ok, seat: 1 }), /ungueltig/);
  const one = card.step(st, ok), o1 = card.observe(one, 1);
  assert.equal(accepts(o1, 1, { ...ok, seat: 1, r: 5 }), false, "Runde springt nicht");
  assert.equal(accepts(o1, 1, { ...ok, seat: 1, r: 2 }), true);
  assert.equal(accepts(o1, 0, { ...ok, seat: 0, r: 2 }), false, "nicht am Zug");
  assert.deepEqual(card.moves(o1, 1), [], "Bilder lassen sich nicht aufzaehlen");
});

test("Tipps beim Raten in Altreihenfolge: Kategorie, Farben, Anfangsbuchstabe, Buchstabenbank, je ein Buchstabe", () => {
  const st = draw(fresh(20448), 0, "Schildkröte", [{ c: 4, w: 1, p: [[0.1, 0.1], [0.9, 0.9]] }, { c: 5, w: 0, p: [[0.2, 0.8], [0.8, 0.2]] }]);
  const o = card.observe(st, 1), k = known(o), list = hints(o, "de", k);
  assert.equal(k.w, "Schildkröte");
  assert.deepEqual(list.slice(0, 4).map((h) => h.t), ["cat", "col", "first", "bank"]);
  assert.equal(list[0].text, "Tipp: " + T.de["mr_cat_" + k.cat]);
  assert.equal(list[1].text, "Farben: Grün und Blau");
  assert.equal(list[2].text, "Fängt mit S an.");
  assert.deepEqual(list[3].bank, M.bank("Schildkröte", st.pub.seed, 1));
  assert.equal(list.length, 4 + 11 - 2, "bis auf zwei Buchstaben");
  const own = draw(fresh(20448), 0, "Wackelpudding", scribble(1, 9, 1));
  assert.deepEqual(hints(card.observe(own, 1), "de", null).map((h) => h.t), ["col", "first"], "eigenes Wort: nur Farben und Anfangsbuchstabe");
  assert.equal(M.spelt("Schildkroete", 11), "Schildkröte");
  assert.equal(form(T.de, "mr_right", 1, "de"), T.de.mr_right_one);
});

test("Anzeige: Wortvorschlaege, Zeichenflaeche und Abspielen als Anzeige-Knoten; Strichdaten im Raster", () => {
  const st0 = fresh(20448), v0 = card.view(obsOf(st0), 0, { lang: "de" });
  const kinds = (v) => v.children.map((c) => c.t);
  assert.ok(kinds(v0).includes("draw"));
  const dr = v0.children.find((c) => c.t === "draw");
  assert.deepEqual(dr.words.map((w) => w.w), M.suggest(20448, 1, "de").map((s) => s.w));
  assert.equal(dr.colors.length, 8); assert.equal(dr.widths.length, 3); assert.equal(dr.round, 1);
  assert.deepEqual(card.view(obsOf(st0), 1, { lang: "de" }).children, [], "wer nicht malt, sieht vor dem ersten Bild nichts zum Bedienen");
  const st = draw(st0, 0, "Hund", [{ c: 1, w: 2, p: [[0, 0], [1, 1]] }, { c: 3, w: 0, p: [[0.5, 0.5]] }]);
  const v1 = card.view(card.observe(st, 1), 1, { lang: "en" }), sk = v1.children.find((c) => c.t === "strokes");
  assert.equal(sk.total, 3); assert.equal(sk.play, true); assert.equal(sk.items[1].dot, true); assert.equal(sk.items[1].from, 2);
  assert.match(sk.a11y, /2 lines in Red and Yellow/);
  assert.deepEqual(visibleAt(sk.items, 1), [1, 0]); assert.deepEqual(visibleAt(sk.items, 3), [2, 1]);
  assert.ok(kinds(v1).includes("draw"), "wer raet, malt danach zurueck");
  assert.equal(strokeItems([]).total, 0);
  assert.equal(card.view(obsOf(st0), 0, { lang: "de", preview: true }).children[0].text, card.manifest.howto.de);
});

test("Ende: nach Runde 999 ist Schluss (Altgrenze MAX_ROUND)", () => {
  const st = fresh(20448);
  const last = { ...st, pub: { ...st.pub, n: 998, pic: { k: "AAAAAAAAAAA", h: "H4", l: 0, s: "AAA", sec: 0, r: 999 } } };
  assert.equal(card.status(last).over, true); assert.equal(card.status(last).turn, -1);
  assert.equal(accepts(card.observe(last, 0), 0, { t: "draw", seat: 0, k: "AAAAAAAAAAA", h: "H4", l: 0, s: "AAA", sec: 0, r: 1000 }), false);
});

// Rundreise ueber den Kartenvertrag: braucht den angefragten Hook accepts in session.apply (Strang F). Bis dahin laeuft
// der Test als todo (sichtbar im Bericht, nicht still uebersprungen).
const hook = /\.accepts\b/.test(fs.readFileSync(new URL("../src/contract/session.js", import.meta.url), "utf8"));
test("Vertrag: toWire/fromWire-Rundreise ueber vier Bilder, jedes Geraet rechnet dasselbe", { todo: hook ? false : "wartet auf Hook accepts in src/contract/session.js (Strang F)" }, () => {
  let s = S.newSession(card, { params: { day: 20448 }, seed: "0123456789abcdef0123456789abcdef", mine: [0, 1] });
  const plan = [["Hund", 0], ["Mond", 12], ["Stern", 0], ["Wackelpudding", 3]];
  plan.forEach(([w, secs], i) => {
    const seat = i % 2, inp = draftInput(S.observe(card, s, seat), seat, { word: w, lang: "de", lines: scribble(2 + i, 25, i + 1), secs });
    s = S.apply(card, s, inp);
  });
  const w = S.toWire(s), back = S.fromWire(card, JSON.parse(JSON.stringify(w)), { mine: [] });
  assert.equal(S.pubHash(back), S.pubHash(s));
  assert.equal(back.state.pub.pic.r, 4); assert.equal(back.state.pub.n, 4);
  assert.equal(tryGuess(card.observe(back.state, 0), "Wackelpudding").ok, true);
});

// Offen (Strang F): Link-Schema erlaubt heute je Eingabe hoechstens 6 Felder, Strings bis 64 Zeichen aus [A-Za-z0-9_-]
// und kein Unicode im Hinweis; ein Bild hat 8 Felder, Striche bis 600 Zeichen mit ".", Hinweise wie "Ö2".
test("Link: ein Bild reist im Fragment (#v2.challenge)", { todo: "wartet auf Input-Schema je Karte und groesseres Fragment (Strang F)" }, () => {
  const st = fresh(20448), inp = draftInput(obsOf(st), 0, { word: "Öl", lang: "de", lines: scribble(10, 60, 3) });
  const f = linkEncode("challenge", { c: "zug-malrat", v: "1.0.0", p: { day: 20448 }, s: "0123456789abcdef0123456789abcdef", k: [null, null], m: [inp], g: "0123456789abcdef" });
  assert.ok(f.startsWith("#v2.challenge."));
});
