"use strict";
// Mal & Rat (zug-malrat, src/malrat.js): the lines in the link, the size of the link, the check value instead of the word,
// the word filter, the word lists and what a hand-made link may carry.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
const C = require("../src/core.js");
const Q = require("../src/quest.js");
const M = require("../src/malrat.js");
const TAGS = require("../scripts/tags.js");
const me = { emoji: "🐙", nick: "Ana", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const idea = D.IDEAS.find((i) => i.id === "zug-malrat");
const fresh = (seed) => Tn.fresh(D.docFromIdea(idea, me, "de"), seed);
// what the link really carries after #c=: the JSON any reader can decode, and the moves with the seal opened
function payload(url) {
  const raw = JSON.parse(Buffer.from(url.split("#c=")[1], "base64url").toString("utf8"));
  return { raw, text: JSON.stringify(raw), moves: Tn.unseal(raw.d.q, raw.d.seed) };
}
const through = (d) => { const r = D.parseRoute("#" + D.docUrl(d).split("#")[1]); assert.equal(r.type, "doc"); return r.doc; };
// A picture as a person draws it: n lines of k raw points each (wobbly, so simplifying has something to do).
function scribble(n, k, seed) {
  const r = C.mulberry32(seed || 1), out = [];
  for (let i = 0; i < n; i++) {
    const cx = r(), cy = r(), a = r() * 6, p = [];
    for (let j = 0; j < k; j++) p.push([Math.min(1, Math.max(0, cx + 0.3 * Math.cos(a + j / 9) + (r() - 0.5) * 0.004)), Math.min(1, Math.max(0, cy + 0.3 * Math.sin(a + j / 7) + (r() - 0.5) * 0.004))]);
    out.push({ c: i % 8, w: i % 3, p });
  }
  return out;
}
async function draw(doc, word, lines, secs) {
  const p = M.pack(lines, (s) => M.fits(doc, word, "de", s));
  if (!p) return null;
  const r = M.round(Tn.moves(doc)), v = M.move(await M.check(word, doc.seed, r), word, "de", p.s, secs || 0, r);
  return Tn.play(doc, [v], Tn.today());
}

test("Katalog: Tageskarte vom Typ turn mit Kalendertag, braucht Web Crypto, per Link, in der Suche unter malen, zeichnen und raten", () => {
  assert.equal(idea.kind, "turn"); assert.equal(idea.turn.g, "malrat"); assert.equal(idea.on, "12-25"); assert.deepEqual(idea.needs, ["crypto"]);
  assert.equal(D.plainTitle(idea.de.t), "Mal & Rat"); assert.doesNotMatch(JSON.stringify(idea), /montagsmaler|pictionary/i);
  assert.equal(Tn.who("malrat"), "link");
  const names = { de: {}, en: {} };
  for (const q of ["malen", "zeichnen", "raten", "draw", "guess"]) assert.ok(D.searchIdeas(q, new Date(Date.UTC(2026, 10, 7)), names).some((h) => h.idea.id === "zug-malrat"), "Suche: " + q);
  assert.deepEqual(idea.tags.filter((t) => TAGS.cleanTag(t) !== t), [], "Tags sauber");
});

test("Wortlisten de/en: mindestens 150 je Sprache in drei Stufen, einzelne Woerter, kindgerecht, ohne Marken, ohne Doppelte", () => {
  for (const l of ["de", "en"]) {
    const w = M.ALL.map((e) => e[l]);
    assert.ok(w.length >= 150, l + " " + w.length);
    for (const lvl of [0, 1, 2]) assert.ok(M.ALL.filter((e) => e.lvl === lvl).length >= 50, l + " Stufe " + lvl);
    assert.equal(new Set(w.map(Q.fold)).size, w.length, l + " doppelt");
    for (const x of w) {
      assert.match(x, /^\p{L}{2,16}$/u, x);
      assert.equal(D.cleanInput(x, 16), x, "Wortfilter " + x);
      assert.equal(TAGS.cleanTag(x.toLowerCase()), x.toLowerCase(), "Jugendschutz und Marken " + x);
      assert.equal(M.own(x), x, "als eigenes Wort erlaubt " + x);
    }
  }
  for (const c of M.CATS) for (const l of ["de", "en"]) assert.ok(Tn.T(l)["mr_cat_" + c], l + " Kategorie " + c);
});

test("Vorschlaege: drei Woerter, je eins pro Stufe, nur aus Seed und Runde", () => {
  const a = M.suggest(20448, 1, "de");
  assert.deepEqual(a.map((s) => s.lvl), [0, 1, 2]);
  assert.deepEqual(M.suggest(20448, 1, "de"), a, "gleicher Seed, gleiche Woerter");
  assert.deepEqual(M.suggest(20448, 1, "en").map((s) => s.cat), a.map((s) => s.cat), "dieselben Begriffe auf Englisch");
  const many = new Set(); for (let r = 1; r < 30; r++) many.add(M.suggest(20448, r, "de")[0].w);
  assert.ok(many.size > 10, "jede Runde andere Woerter");
  assert.equal(Tn.GAMES.malrat.daily, true, "die erste Runde nimmt den Seed des Tages");
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

test("Link: ein volles Bild passt in 1200 Zeichen; was nicht passt, wird nicht abgeschnitten, sondern abgelehnt", async () => {
  const doc = fresh(20448), big = scribble(14, 80, 7);
  const d = await draw(doc, "Schildkröte", big);
  assert.ok(d, "14 Striche passen");
  const url = D.docUrl(d), frag = url.split("#c=")[1];
  assert.ok(frag.length <= C.MAX_FRAGMENT, "Link " + frag.length);
  assert.equal(frag.length, M.size(d.q ? doc : doc, Tn.moves(d)[0][0]), "size() rechnet wie der Link");
  const got = through(d), mv = Tn.moves(got)[0][0];
  assert.equal(M.decode(mv[3]).length, 14, "alle Striche kommen an");
  // as many lines as fit, then one more: pack finds nothing, the picture keeps all it had
  let n = 14; while (M.pack(scribble(n + 1, 80, 7), (s) => M.fits(doc, "Schildkröte", "de", s))) n++;
  assert.ok(n >= 14 && n < M.MAX_LINES, "Platz fuer " + n + " Striche");
  assert.equal(M.pack(scribble(n + 1, 80, 7), (s) => M.fits(doc, "Schildkröte", "de", s)), null, "zu viel: kein Kuerzen");
  assert.equal(await draw(doc, "Schildkröte", scribble(n + 1, 80, 7)), null);
  // and the doc with that many lines, the longest title and a trail still opens
  const full = await draw(doc, "Schildkröte", scribble(n, 80, 7));
  full.by = [{ n: "Annabellchen", w: ["regeln"] }];
  assert.ok(D.docUrl(full).split("#c=")[1].length <= C.MAX_FRAGMENT); assert.equal(D.parseRoute("#" + D.docUrl(full).split("#")[1]).type, "doc");
});

test("Hash statt Klartext: das Wort steht nie im Link, nur Pruefwert und Hinweis; Gross-/Kleinschreibung und Umlaute zaehlen nicht", async () => {
  const doc = fresh(20448);
  for (const w of ["Hund", "Schildkröte", "Regenbogen", "Zwerg"]) {
    const d = await draw(doc, w, scribble(3, 40, 2)), P = payload(D.docUrl(d)), all = (P.text + JSON.stringify(P.moves)).toLowerCase();
    assert.ok(!all.includes(w.toLowerCase()) && !all.includes(Q.fold(w)), w + " steht im Link");
    const mv = P.moves[0][0];
    assert.match(mv[0], /^[A-Za-z0-9_-]{11}$/); assert.equal(mv[1], w[0].toUpperCase() + Array.from(w).length);
    assert.equal(await M.right(w.toLowerCase(), mv, doc.seed), true);
    assert.equal(await M.right("  " + w.toUpperCase() + " ", mv, doc.seed), true);
    assert.equal(await M.right("Katze", mv, doc.seed), false);
    assert.deepEqual((await M.find(mv, doc.seed)).w, w, "Wort aus der Liste wird auf dem Geraet wiedergefunden");
  }
  assert.equal(await M.right("schildkrote", M.move(await M.check("Schildkröte", 1, 1), "Schildkröte", "de", "AAA", 0, 1), 1), true, "ö wie o");
  // the salt from the doc: another seed or round, another check value
  const a = await M.check("Hund", 1, 1), b = await M.check("Hund", 2, 1), c = await M.check("Hund", 1, 2);
  assert.ok(a !== b && a !== c && b !== c);
  // an own word is not in the list: it stays unknown on the guesser's phone, only the check value can confirm it
  const own = await draw(doc, "Wackelpudding", scribble(2, 30, 1)), mv = Tn.moves(own)[0][0];
  assert.equal(await M.find(mv, doc.seed), null); assert.equal(await M.right("wackelpudding", mv, doc.seed), true);
});

test("Wortfilter: eigene Woerter und Rateversuche gehen durch Daily.cleanInput", async () => {
  assert.equal(M.own("Wackelpudding"), "Wackelpudding");
  for (const bad of ["Arschloch", "scheiße", "zwei Wörter", "R2D2", "x", "ß", "", "  ", "<b>", "a".repeat(17)]) assert.equal(M.own(bad), "", bad);
  assert.equal(M.guess("Arschloch"), ""); assert.equal(M.guess("  Hund "), "Hund");
  const doc = fresh(20448), mv = Tn.moves(await draw(doc, "Hund", scribble(1, 20, 1)))[0][0];
  assert.equal(await M.right("Arschloch", mv, doc.seed), false);
});

test("Zurueckmalen: der Link haelt nur das neueste Bild, Runde zaehlt hoch, die Zeit des Ratens reist mit", async () => {
  let d = through(await draw(fresh(20448), "Hund", scribble(2, 30, 1)));
  assert.equal(Tn.state(d).turn, 1); assert.equal(Tn.state(d).over, false);
  assert.deepEqual(Tn.face(d, "de"), ["Was ist das?", "4 Buchstaben, 2 Striche"]);
  d = through(await draw(d, "Mond", scribble(3, 30, 2), 14));
  const m = Tn.moves(d);
  assert.equal(m.length, 1, "snap: nur das neueste Bild"); assert.equal(m[0][0][5], 2); assert.equal(m[0][0][4], 14);
  assert.deepEqual(Tn.face(d, "en"), ["What is it?", "4 letters, 3 lines", "Your last picture was guessed in 14 seconds."]);
  d = through(await draw(d, "Stern", scribble(1, 30, 3), 0));
  assert.equal(Tn.face(d, "de")[2], "Dein letztes Bild war knifflig.");
  assert.equal(await M.right("Stern", Tn.moves(d)[0][0], d.seed), true, "Salz aus Seed und Runde 3");
});

test("Von Hand gebauter Link: nur was der Bildschirm schicken kann", async () => {
  const doc = fresh(20448), chk = await M.check("Hund", doc.seed, 1), s = M.encode(scribble(1, 20, 1), 0.8);
  const ok = M.move(chk, "Hund", "de", s, 0, 1);
  assert.ok(Tn.play(doc, [ok], 0));
  for (const [what, v] of [["Pruefwert", ["kurz", "H4", 0, s, 0, 1]], ["Hinweis", [chk, "Hund", 0, s, 0, 1]], ["Laenge", [chk, "H40", 0, s, 0, 1]],
    ["Sprache", [chk, "H4", 2, s, 0, 1]], ["Striche", [chk, "H4", 0, "AB", 0, 1]], ["Zeit", [chk, "H4", 0, s, -1, 1]], ["Zeit", [chk, "H4", 0, s, 99999, 1]],
    ["Runde", [chk, "H4", 0, s, 0, 0]], ["Klartext-Feld", [chk, "H4", 0, s, 0, 1, "Hund"]], ["kein Array", "Hund"]])
    assert.equal(Tn.play(doc, [v], 0), null, what);
  const one = Tn.play(doc, [ok], 0);
  assert.equal(Tn.play(one, [M.move(chk, "Hund", "de", s, 0, 5)], 0), null, "Runde springt nicht");
  assert.equal(Tn.state(Object.assign({}, one, { q: Tn.seal([[[chk, "H4", 0, "zz", 0, 1]]], one.seed) })).turn, 0, "kaputte Striche: kein Zug");
});
