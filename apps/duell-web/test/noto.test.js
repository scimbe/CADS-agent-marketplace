"use strict";
// Stickers in the finished picture (src/noto.js): every emoji the app offers as a sticker has its own tile in the Noto
// Emoji sheet, the variation selector does not matter, anything else has none (and so stays out of the picture).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const N = require("../src/noto.js");
const D = require("../src/daily.js");
const C = require("../src/core.js");

const sheet = fs.readFileSync(path.join(__dirname, "../src/noto-stickers.png"));
const offered = () => {
  const app = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
  const emoji = JSON.parse(app.match(/^var EMOJI = (\[[^\]]*\]);/m)[1]);   // My style's emoji, a sticker in every set
  return [...new Set([].concat(...Object.values(D.SETS), emoji, [C.sanitizeEmoji("")]))];
};

test("Zuordnung: jedes angebotene Sticker-Emoji hat genau eine eigene Kachel, keine Kachel zu viel", () => {
  const all = offered(), tiles = all.map((e) => N.tile(e));
  assert.equal(C.sanitizeEmoji(""), "🪁", "Ersatz-Emoji fuer kaputte Eingaben");
  all.forEach((e, i) => assert.ok(tiles[i], "Kachel fuer " + e + " (" + N.key(e) + ")"));
  assert.equal(new Set(tiles.map((t) => t.x + "," + t.y)).size, all.length, "jede Kachel nur einmal");
  assert.equal(N.KEYS.length, all.length, "nur die angebotenen Emoji im Teil");
  assert.equal(new Set(N.KEYS).size, N.KEYS.length);
});

test("Zuordnung: Schreibweise mit und ohne FE0F gleich, Code-Punkte wie Notos Dateinamen", () => {
  assert.equal(N.key("🐸"), "1f438");
  assert.equal(N.key("☄️"), "2604"); assert.deepEqual(N.tile("☄️"), N.tile("☄"));
  assert.equal(N.key("🕷️"), "1f577"); assert.deepEqual(N.tile("🕷️"), N.tile("🕷"));
  assert.deepEqual(N.tile("🐸"), { x: N.PAD, y: N.PAD, s: N.TILE }, "erste Kachel oben links");
  assert.deepEqual(N.tile("🦆"), { x: N.TILE + 3 * N.PAD, y: N.PAD, s: N.TILE }, "zweite rechts daneben, mit Rand");
  assert.deepEqual(N.tile("🍩"), { x: N.PAD, y: N.TILE + 3 * N.PAD, s: N.TILE }, "Zeile zwei nach " + N.COLS);
});

test("Zuordnung: fremde Emoji, Text und Unsinn haben keine Kachel", () => {
  for (const e of ["😀", "🇩🇪", "👍🏽", "a", "", "🐸🐸", null, undefined, 42, {}]) {
    assert.equal(N.tile(e), null, String(e)); assert.equal(N.has(e), false);
  }
});

test("Bogen: PNG, alle Kacheln liegen ganz darin", () => {
  assert.equal(sheet.subarray(1, 4).toString(), "PNG");
  const w = sheet.readUInt32BE(16), h = sheet.readUInt32BE(20), cell = N.TILE + 2 * N.PAD;
  assert.deepEqual([w, h], [N.COLS * cell, Math.ceil(N.KEYS.length / N.COLS) * cell]);
  for (const k of N.KEYS) {
    const t = N.tile(String.fromCodePoint(...k.split("_").map((x) => parseInt(x, 16))));
    assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.s <= w && t.y + t.s <= h, k);
  }
  assert.ok(sheet.length < 50 * 1024, "Bogen klein: " + sheet.length);
});

test("Zeichnen: erst nach ready(), Quelle = Kachel, Ziel = Quadrat um den Mittelpunkt; ohne Daten scheitert ready()", async () => {
  const calls = [], c = { drawImage: (...a) => calls.push(a) };
  assert.equal(N.draw(c, "🐸", 100, 200, 50), false, "vor ready() nichts");
  await assert.rejects(N.ready(), /no sheet/);
  globalThis.Image = class { set src(v) { this.v = v; setTimeout(() => (/^data:image\/png;base64,/.test(v) ? this.onload() : this.onerror())); } };
  globalThis.NotoData = sheet.toString("base64");
  try {
    assert.equal(await N.ready(), N);
    assert.equal(N.draw(c, "😀", 0, 0, 10), false, "ohne Kachel nichts");
    assert.equal(N.draw(c, "🦆", 100, 200, 50), true);
    assert.deepEqual(calls[0].slice(1), [N.TILE + 3 * N.PAD, N.PAD, N.TILE, N.TILE, 75, 175, 50, 50]);
    assert.equal(calls.length, 1);
  } finally { delete globalThis.Image; delete globalThis.NotoData; }
});
