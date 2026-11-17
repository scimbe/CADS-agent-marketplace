// Poster-Engine (E7): Alt-Orakel (gleiche Zeichenaufrufe wie alt render.js/warm.js), Bereinigung, Tuernummer, Noto, Filter.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { recCanvas } from "./poster-rec.js";
import { compile } from "../src/engines/poster/compile.js";
import { exec, layout } from "../src/engines/poster/paint.js";
import * as P from "../src/engines/poster/doc.js";
import * as N from "../src/engines/poster/noto.js";
import * as F from "../src/engines/poster/filters.js";

const ME = { nick: "Ada" };
// Alt-Erwartungen: einmal mit dem Altmodul berechnet (Herkunft in der Fixture)
const ALT = JSON.parse(fs.readFileSync(new URL("./fixtures/poster-alt.json", import.meta.url), "utf8"));
const ALT_LOGS = JSON.parse(zlib.gunzipSync(Buffer.from(ALT.logs, "base64")).toString("utf8"));
function newLog(doc, opt = {}) {
  const { c, log } = recCanvas(540, 675);
  const list = compile(doc, { nick: ME.nick, photo: !!opt.photo, exporting: !!opt.exporting, peaks: opt.peaks, lyr: opt.lyr });
  exec(c, list, { photo: opt.photo ? { width: 800, height: 600, _id: "f1", __img: "photo" } : null, noto: { __img: "noto" }, canvas: () => recCanvas(540, 675, "layer").cv });
  return log;
}
// Zahlen auf 4 Stellen (die Liste rundet auf 6), Bilder als Name
// Zahlen mit Toleranz 1e-3 px (die Liste rundet auf 6 Stellen), sonst exakt
function near(a, b) { return typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-3 : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => near(x, b[i])) : typeof a === "string" && typeof b === "string" ? fs2(a) === fs2(b) : a === b; }
const fs2 = (s) => s.replace(/\d+\.\d+/g, (x) => Number(x).toFixed(3));
function same(doc, opt, msg, o) {
  const n = newLog(doc, opt);
  const i = n.findIndex((x, k) => !near(x, o[k]));
  assert.ok(n.length === o.length && i < 0, msg + ": ab Aufruf " + i + " neu " + JSON.stringify(n.slice(i, i + 2)) + " alt " + JSON.stringify(o.slice(i, i + 2)) + " Laengen " + n.length + "/" + o.length);
}

const SK = [{ e: "🎄", x: 0.2, y: 0.3, r: 0.4, z: 1.2 }, { e: "😀", x: 0.7, y: 0.6, r: -1, z: 0.8 }];
const W = { p: "Hamburg", d: "2026-12-03", hi: 4, lo: -1, rn: 60, c: 61 };

test("Alt-Orakel: Karte (6 Stile), Foto (4 Stile, mit/ohne Foto), Klang zeichnen dieselben Aufrufe wie der Altcode (4:5)", () => {
  assert.equal(ALT.cases.length, ALT_LOGS.length); assert.ok(ALT.cases.length >= 29);
  ALT.cases.forEach((c, i) => {
    const doc = P.sanitizePoster(c.doc);
    assert.deepEqual(JSON.parse(JSON.stringify({ ...doc, n: undefined })), JSON.parse(JSON.stringify(c.doc)), "Fall " + i + ": Bereinigung laesst ein gueltiges Altdokument unveraendert");
    same(doc, c.opt, "Fall " + i + " " + c.doc.k + "/" + c.doc.st, ALT_LOGS[i]);
  });
});
test("16:9: Adventstuer quer, Nummer gross, deterministisch, Text bleibt Block, KI-Bild nur im Feld", () => {
  const doc = P.sanitizePoster({ k: "card", st: "advent", x: "Heute kein Stress. Nur Kekse.", nr: 12, col: ["#0f5132", "#ffd400"] });
  const a = compile(doc, { W: 960, H: 540 }), b = compile(doc, { W: 960, H: 540 });
  assert.deepEqual(a, b);
  assert.deepEqual([a.w, a.h], [960, 540]);
  assert.ok(a.ops.some((o) => o.m === "fillText" && o.a[0] === "12"), "Nummer 12 steht drauf");
  assert.equal(a.ops.filter((o) => o.op === "block").length, 1);
  assert.ok(!a.ops.some((o) => o.op === "image"));
  const g = compile(doc, { W: 960, H: 540, gi: true });
  assert.equal(g.ops.filter((o) => o.op === "image" && o.a[0] === "gi").length, 1);
  // ein anderer Text gibt andere Flocken, dieselbe Nummer bleibt
  const c2 = compile({ ...doc, x: "Anders" }, { W: 960, H: 540 });
  assert.notDeepEqual(c2.ops.slice(0, 20), a.ops.slice(0, 20));
});
test("Golden: Anzeigeliste der Adventstuer 16:9 und des Alien-Beweisfotos bleibt stabil", () => {
  const url = new URL("./fixtures/poster-golden.json", import.meta.url);
  const cases = {
    advent: compile(P.sanitizePoster({ k: "card", st: "advent", x: "Du bist mein Lieblingstürchen.", nr: 24, col: ["#0f5132", "#ffd400"], sk: [{ e: "⭐", x: 0.9, y: 0.2, r: 0, z: 1 }] }), { W: 960, H: 540, nick: "Oma" }),
    alien: compile(P.sanitizePoster({ k: "photo", st: "glitch", x: "STRENG GEHEIM", y: "BEWEIS NR. 7", col: ["#7ee0ff", "#ff5a1f"] }), { photo: true })
  };
  const herkunft = "Neu (Strang P): eingefrorene Anzeigeliste der Poster-Engine; neu erzeugen mit UPDATE_GOLDEN=1, Abweichung im PR begruenden.";
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(url)) fs.writeFileSync(url, JSON.stringify({ herkunft, cases }) + "\n");
  assert.deepEqual(JSON.parse(JSON.stringify(cases)), JSON.parse(fs.readFileSync(url, "utf8")).cases);
});

test("Bereinigung: Felder wie alt sanitizeDoc (Text 90, Foto 28, Sticker 8, Tuer 1-24, Wetter nur mit Ort und Zahlen)", () => {
  const d = P.sanitizePoster({ k: "card", x: "a".repeat(200), st: "laser", nr: 99, sk: new Array(12).fill({ e: "🐸", x: 2, y: -1, r: 9, z: 0 }), col: ["red", "#000000"], w: { p: "Ort", d: "2026-12-01", hi: 99, lo: "x" } });
  assert.equal(d.x.length, 90); assert.equal(d.st, "druck"); assert.equal(d.nr, 24); assert.equal(d.sk.length, 8);
  assert.deepEqual(d.sk[0], { e: "🐸", x: 1, y: 0, r: 3.14, z: 0.5 }); assert.deepEqual(d.col, P.DEFAULT_COL); assert.equal(d.w, undefined);
  assert.equal(P.sanitizePoster({ k: "card", x: "du bist so hässlich" }).x, "", "Filter");
  assert.equal(P.sanitizePoster({ k: "card", x: "ruf an 0171 2345678" }).x, "", "keine Telefonnummer");
  assert.equal(P.sanitizePoster({ k: "photo", x: "x".repeat(40) }).x.length, 28);
  assert.equal(P.sanitizePoster({ k: "nope" }), null);
  assert.deepEqual(P.weatherFromApi({ place: "Hamburg", date: "2026-12-03", hi: 4.4, lo: -1, rain: 60, code: 61, source: "Open-Meteo" }), W);
  assert.equal(P.weatherFromApi({ place: "", date: "2026-12-03", hi: 1, lo: 1 }), null);
  assert.deepEqual(P.sanitizeGi({ p: "A".repeat(22) + ".jpg", l: "../x" }), { p: "A".repeat(22) + ".jpg" });
  const s = P.sanitizePoster({ k: "sound", fx: "laser", tp: "warp", bpm: 300, p: { k: "x---x---x---x---", s: "bad" } });
  assert.equal(s.fx, "chip"); assert.equal(s.tp, undefined); assert.equal(s.bpm, 170); assert.equal(s.p.s, "----------------");
});
import { doorNumber, early, civil } from "../src/engines/poster/door.js";
const day = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
test("Tuernummer aus dem UTC-Tag: 1.-24. Dezember, sonst Tuer 1 (alt daily.js doorNumber); zu frueh = vor dem Tag", () => {
  assert.equal(doorNumber(day(2026, 12, 5)), 5); assert.equal(doorNumber(day(2026, 12, 24)), 24); assert.equal(doorNumber(day(2026, 12, 25)), 1);
  assert.equal(doorNumber(day(2026, 11, 11)), 1, "am 11.11. war es Tuer 1 (Screenshot [61])");
  assert.ok(early(5, day(2026, 11, 30))); assert.ok(early(5, day(2026, 12, 4))); assert.ok(!early(5, day(2026, 12, 5))); assert.ok(!early(5, day(2027, 1, 2)));
  for (let t = day(1999, 12, 25); t < day(2031, 3, 1); t += 37) { const d = new Date(t * 86400000); assert.deepEqual(civil(t), { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }); }
});

// ---------- portiert aus alt test/noto.test.js ----------
const offered = () => [...new Set([].concat(...Object.values(P.SETS), P.EMOJI, ["🪁"]))];
test("Noto: jedes angebotene Sticker-Emoji hat genau eine eigene Kachel, keine Kachel zu viel", () => {
  const all = offered(), tiles = all.map((e) => N.tile(e));
  all.forEach((e, i) => assert.ok(tiles[i], "Kachel fuer " + e));
  assert.equal(new Set(tiles.map((t) => t.x + "," + t.y)).size, all.length);
  assert.equal(N.KEYS.length, all.length); assert.equal(new Set(N.KEYS).size, N.KEYS.length);
});
test("Noto: FE0F egal, Code-Punkte wie Notos Dateinamen, fremde Emoji ohne Kachel", () => {
  assert.equal(N.key("🐸"), "1f438"); assert.deepEqual(N.tile("☄️"), N.tile("☄")); assert.deepEqual(N.tile("🕷️"), N.tile("🕷"));
  assert.deepEqual(N.tile("🐸"), { x: N.PAD, y: N.PAD, s: N.TILE });
  assert.deepEqual(N.tile("🦆"), { x: N.TILE + 3 * N.PAD, y: N.PAD, s: N.TILE });
  assert.deepEqual(N.tile("🍩"), { x: N.PAD, y: N.TILE + 3 * N.PAD, s: N.TILE });
  for (const e of ["😀", "🇩🇪", "👍🏽", "a", "", "🐸🐸", null, undefined, 42, {}]) assert.equal(N.tile(e), null, String(e));
  for (const e of P.SETS.advent) assert.ok(N.has(e), "Advent-Set: " + e);
});
test("Noto: Bogen ist PNG, alle Kacheln liegen darin, klein; Zeichnen nur mit Bogen", () => {
  const sheet = fs.readFileSync(new URL("../src/engines/poster/noto-stickers.png", import.meta.url));
  assert.equal(sheet.subarray(1, 4).toString(), "PNG");
  const w = sheet.readUInt32BE(16), h = sheet.readUInt32BE(20);
  assert.deepEqual([w, h], [N.COLS * N.CELL, Math.ceil(N.KEYS.length / N.COLS) * N.CELL]);
  assert.ok(sheet.length < 96 * 1024);
  const calls = [], c = { drawImage: (...a) => calls.push(a) };
  assert.equal(N.draw(c, null, "🐸", 0, 0, 10), false);
  assert.equal(N.draw(c, {}, "😀", 0, 0, 10), false);
  assert.equal(N.draw(c, {}, "🦆", 100, 200, 50), true);
  assert.deepEqual(calls[0].slice(1), [N.TILE + 3 * N.PAD, N.PAD, N.TILE, N.TILE, 75, 175, 50, 50]);
});

// ---------- portiert aus alt test/studio.test.js (Fototeil) ----------
const img = (w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % w; d[i] = d[i + 1] = d[i + 2] = x / w * 255; d[i + 3] = 255; } return d; };
test("Foto: Duoton nur zwischen zwei Toenen, Poster reduziert Stufen, Raster zweifarbig, Glitch haengt vom Seed ab", () => {
  const d = F.duotone(img(8, 2), "#000000", "#ff0000");
  for (let i = 0; i < d.length; i += 4) { assert.equal(d[i + 1], 0); assert.equal(d[i + 2], 0); }
  assert.ok(d[7 * 4] > 200);
  const p = F.posterize(img(64, 1), 4); assert.ok(new Set(p.filter((_, i) => i % 4 === 0)).size <= 4);
  const h = F.halftone(img(32, 32), 32, 32, 8, "#112233", "#ffeedd"), cols = new Set(); for (let i = 0; i < h.length; i += 4) cols.add(h[i]);
  assert.deepEqual([...cols].sort((a, b) => a - b), [0x11, 0xff]);
  const a = F.glitch(img(64, 64), 64, 64, 1), b = F.glitch(img(64, 64), 64, 64, 2), c = F.glitch(img(64, 64), 64, 64, 1);
  assert.notDeepEqual(a, b); assert.deepEqual(a, c);
});
test("Layout: Plakatblock fuellt die Breite, laengster Text schrumpft in die Hoehe", () => {
  const { c } = recCanvas(10, 10);
  const L = layout(c, "Heute kein Stress nur Kekse", 400, 300);
  assert.ok(L.length >= 1 && L.length <= 6);
  assert.ok(L.reduce((s, l) => s + l.size * 0.98, 0) <= 300 + 1e-6);
  assert.deepEqual(layout(c, "   ", 100, 100), []);
});

// ---------- portiert aus alt test/stickers.test.js ----------
import * as K from "../src/engines/poster/stickers.js";
test("Sticker: oberster gewinnt, kleine bleiben fingertauglich; 16:9 trifft mit kleinerem Radius", () => {
  const l = [{ x: 0.5, y: 0.5, z: 1 }, { x: 0.52, y: 0.5, z: 1 }];
  assert.equal(K.hit(l, { x: 0.5, y: 0.5 }), 1); assert.equal(K.hit(l, { x: 0.9, y: 0.9 }), -1);
  const small = [{ x: 0.5, y: 0.5, z: 0.5 }];
  assert.equal(K.hit(small, { x: 0.57, y: 0.5 }), -1); assert.equal(K.hit(small, { x: 0.57, y: 0.5 }, 0.08), 0);
  const wide = [{ x: 0.5, y: 0.5, z: 1 }];
  assert.equal(K.hit(wide, { x: 0.54, y: 0.5 }, 0, 9 / 16), 0); assert.equal(K.hit(wide, { x: 0.56, y: 0.5 }, 0, 9 / 16), -1, "Radius 0.1*0.45 der Breite");
});
test("Sticker: zwei Finger, Rueckgaengig mit Grenze, Muelleimer nur in der Flaeche", () => {
  const s = { z: 1, r: 0 }, a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
  assert.equal(K.transform(s, a, b, a, { x: 200, y: 0 }).z, 2);
  assert.ok(Math.abs(K.transform(s, a, b, a, { x: 0, y: 100 }).r - Math.PI / 2) < 0.001);
  assert.equal(K.transform(s, a, b, a, { x: 9000, y: 0 }).z, K.MAX_Z); assert.equal(K.transform(s, a, b, a, { x: 1, y: 0 }).z, K.MIN_Z);
  const l = [{ e: "🐸" }], h = [];
  K.remember(h, K.snapshot(l)); K.remember(h, K.snapshot(l)); assert.equal(h.length, 1);
  l.length = 0; assert.equal(K.restore(h, l), true); assert.deepEqual(l, [{ e: "🐸" }]); assert.equal(K.restore(h, l), false);
  for (let i = 0; i < 50; i++) K.remember(h, "[" + i + "]");
  assert.equal(h.length, 20);
  const box = { left: 10, right: 20, top: 10, bottom: 20 };
  assert.ok(K.inBox({ x: 15, y: 15 }, box)); assert.ok(!K.inBox({ x: 25, y: 15 }, box)); assert.ok(!K.inBox({ x: 15, y: 15 }, null));
});
test("Sticker: gedrehter Sticker uebersteht die Bereinigung (Drehung ueber 1 rad bleibt)", () => {
  const d = P.sanitizePoster({ k: "card", x: "Hallo", sk: [{ e: "🐸", x: 0.5, y: 0.5, r: 2.5, z: 1 }, { e: "🍕", x: 0.2, y: 0.2, r: 0, z: 1 }] });
  assert.equal(d.sk[0].r, 2.5); assert.deepEqual(P.sanitizePoster(d), d, "idempotent");
});
