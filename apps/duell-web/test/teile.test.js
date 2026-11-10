"use strict";
// src/teile.js: the parts of a card from a fixed view() snapshot (Game.view() of the flying game, LaufUI.view() of the
// runner), scaled into the stage box, cut to it, and found again by teilAt (the smallest part under the point).
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/teile.js");
const K = { PIPE_W: 52, GROUND: 56 };   // src/engine.js
const FLUG = { bird: { x: 86, y: 200, r: 15 }, pipes: [{ x: -60, gapY: 100, gapH: 140 }, { x: 150, gapY: 120, gapH: 140 }, { x: 320, gapY: 90, gapH: 140 }], w: 288, h: 512, title: "Flug" };
const M = { sx: 1.25, sy: 1.25, ox: 0, oy: 0, bw: 360, bh: 640 };   // the canvas fills a 360 x 640 box
const rect = (p) => [p.x, p.y, p.w, p.h];

test("Flug: figur, saeule, himmel, titel mit den erwarteten Rechtecken (Spieleinheiten)", () => {
  const l = T.flug(FLUG, K);
  assert.deepEqual(l.map((p) => p.id), ["figur", "saeule", "himmel", "titel"]);
  assert.deepEqual(l.map((p) => p.panel), ["Figure", "Rules", "World", "Text"]);
  assert.deepEqual(rect(l[0]), [69, 183, 34, 34], "Vogel: 17 px um die Mitte (das Emoji ist groesser als der Trefferkreis r=15)");
  assert.deepEqual(rect(l[1]), [150, 0, 52, 456], "die erste Saeule im Bild (x=-60 ist schon vorbei), oben bis zum Boden");
  assert.deepEqual(rect(l[2]), [0, 0, 288, 512]);
  assert.deepEqual(rect(l[3]), [28.8, 8, 230.4, 40]);
});

test("Flug: in CSS-Pixel des Rahmens, jede Mitte liefert ihre id", () => {
  const l = T.place(T.flug(FLUG, K), M);
  assert.deepEqual(l.map(rect), [[86.3, 228.8, 42.5, 42.5], [187.5, 0, 65, 570], [0, 0, 360, 640], [36, 10, 288, 50]]);
  for (const p of l) {
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= M.bw && p.y + p.h <= M.bh, p.id + " im Rahmen");
    assert.equal(T.hit(l, p.x + p.w / 2, p.y + p.h / 2), p.id, p.id + ": teilAt(Mitte)");
    assert.deepEqual([p.ax, p.ay], [p.x + p.w / 2, p.y + p.h / 2], p.id + ": Anker = Mitte");
  }
  assert.equal(T.hit(l, 100, 250), "figur", "der Vogel vor dem Himmel");
  assert.equal(T.hit(l, 200, 600), "himmel", "der Boden gehoert zur Welt");
  assert.equal(T.hit(l, 400, 10), null, "ausserhalb des Rahmens");
});

test("Flug: eine Saeule ueber der Bildmitte; der Himmel bekommt einen freien Anker, die Saeule wird am Rand abgeschnitten", () => {
  const v = Object.assign({}, FLUG, { pipes: [{ x: 118, gapY: 150, gapH: 140 }] });
  const l = T.place(T.flug(v, K), M), sky = l.find((p) => p.id === "himmel");
  assert.equal(T.hit(l, 180, 320), "saeule", "die Mitte des Himmels liegt auf der Saeule");
  assert.notDeepEqual([sky.ax, sky.ay], [180, 320]);
  assert.equal(T.hit(l, sky.ax, sky.ay), "himmel");
  const cut = T.place(T.flug(Object.assign({}, FLUG, { pipes: [{ x: 260, gapY: 150, gapH: 140 }] }), K), M).find((p) => p.id === "saeule");
  assert.deepEqual(rect(cut), [325, 0, 35, 570], "nur der sichtbare Teil (260..288 von 260..312)");
  assert.equal(T.flug(Object.assign({}, FLUG, { pipes: [{ x: 300, gapY: 1, gapH: 1 }] }), K).some((p) => p.id === "saeule"), false, "keine Saeule im Bild: keine Blase");
});

// as LaufUI.view() reports the still picture of a 540 x 675 stage (items in px, sorts as in lauf-engine.js)
const LAUF = { me: { x: 80, y: 380, w: 60, h: 60 }, items: [{ t: "c", x: 200, y: 330, w: 25, h: 25 }, { t: "o", x: 260, y: 400, w: 40, h: 40 }, { t: "c", x: 240, y: 330, w: 25, h: 25 }, { t: "f", x: 400, y: 410, w: 32, h: 32 }, { t: "x", x: 470, y: 300, w: 30, h: 30 }], w: 540, h: 675, title: "Brückenlauf", band: { x: 43.2, y: 39, w: 453.6, h: 56 } };

test("Lauf: figur, hindernis, muenze, gegner, welt, titel; je Sorte das erste Ding im Bild", () => {
  const l = T.lauf(LAUF);
  assert.deepEqual(l.map((p) => p.id), ["figur", "muenze", "hindernis", "gegner", "welt", "titel"]);
  assert.deepEqual(l.map((p) => p.panel), ["LFigure", "LWorld", "LWorld", "LFigure", "LWorld", "LText"]);
  assert.deepEqual(rect(l[1]), [200, 330, 25, 25]);
  assert.deepEqual(rect(l[2]), [260, 400, 40, 40]);
  assert.deepEqual(rect(l[3]), [400, 410, 32, 32]);
  assert.deepEqual(rect(l[4]), [0, 0, 540, 675]);
  const s = T.place(l, { sx: 0.5, sy: 0.5, ox: 0, oy: 0, bw: 270, bh: 337.5 });
  assert.deepEqual(rect(s[0]), [40, 190, 30, 30]);
  for (const p of s) assert.equal(T.hit(s, p.x + p.w / 2, p.y + p.h / 2), p.id, p.id + ": teilAt(Mitte)");
});

test("Lauf ohne Gegner und Muenzen: nur was im Bild ist", () => {
  const l = T.lauf(Object.assign({}, LAUF, { items: [{ t: "d", x: 300, y: 0, w: 60, h: 300 }] }));
  assert.deepEqual(l.map((p) => p.id), ["figur", "hindernis", "welt", "titel"]);
});

test("Lauf: was das Standbild noch nicht zeigt, bekommt seine Blase am rechten Rand, uebereinander statt aufeinander", () => {
  // the editor's still picture right after the start: no item in sight yet, three sorts to come at nearly the same height
  const v = Object.assign({}, LAUF, { items: [], ahead: [{ t: "o", x: 600, y: 400, w: 40, h: 40 }, { t: "c", x: 640, y: 405, w: 31, h: 31 }, { t: "f", x: 900, y: 410, w: 40, h: 40 }, { t: "o", x: 990, y: 100, w: 40, h: 40 }] });
  const l = T.lauf(v), edge = l.filter((p) => p.edge);
  assert.deepEqual(l.map((p) => p.id), ["figur", "hindernis", "muenze", "gegner", "welt", "titel"]);
  assert.deepEqual(edge.map((p) => p.id), ["hindernis", "muenze", "gegner"]);
  assert.deepEqual(edge.map(rect), [[493, 398.5, 43, 43], [493, 448, 43, 43], [493, 506.5, 43, 43]], "hindernis auf seiner Hoehe, muenze darunter; fuer den gegner ist darueber kein Platz mit Abstand, also unter der muenze");
  for (const a of edge) for (const c of edge) if (a !== c) assert.ok(Math.abs(a.y - c.y) >= 43 + 4, a.id + "/" + c.id + ": kein Ueberlappen");
  const s = T.place(l, { sx: 0.5, sy: 0.5, ox: 0, oy: 0, bw: 270, bh: 337.5 });
  for (const p of s) {
    assert.ok(p.x + p.w <= 270 && p.y + p.h <= 337.5, p.id + " im Rahmen");
    assert.equal(T.hit(s, p.ax, p.ay), p.id, p.id + ": teilAt(Anker)");
    if (p.id !== "welt") assert.equal(T.hit(s, p.x + p.w / 2, p.y + p.h / 2), p.id, p.id + ": teilAt(Mitte)");
  }
  assert.equal(s.find((p) => p.id === "muenze").edge, true);
  assert.equal(s.find((p) => p.id === "figur").edge, false);
});

test("Die Bezeichnungen der Blasen", () => {
  for (const id of ["figur", "saeule", "himmel", "titel", "hindernis", "muenze", "gegner", "welt"]) assert.ok(T.LABEL[id], id);
});
