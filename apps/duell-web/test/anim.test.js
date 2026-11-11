"use strict";
// The figure's animation (DuellCore.sanitizeAnim, animPose, animWords): a small schema the AI fills, checked here without
// a page: values off the lists are dropped, never guessed; the pose comes from time and seed only; the link carries it.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../src/core.js");
const L = require("../src/lauf.js");

test("sanitizeAnim: nur Werte aus den Listen und Bereichen, alles andere faellt weg", () => {
  assert.deepEqual(C.ANIM, ["huepfen", "wippen", "drehen", "wackeln", "fluegel", "blinken", "pulsieren", "keine"]);
  assert.deepEqual(C.ANIM_BEI, ["immer", "sprung", "treffer", "sieg"]);
  assert.deepEqual(C.sanitizeAnim({ art: "huepfen", tempo: 1.5, staerke: 1, bei: "sprung" }), { art: "huepfen", tempo: 1.5, staerke: 1, bei: "sprung" });
  assert.deepEqual(C.sanitizeAnim({ art: "drehen", tempo: 0.5, staerke: 0 }), { art: "drehen", tempo: 0.5, staerke: 0 });
  // off the range: dropped, not clamped
  assert.deepEqual(C.sanitizeAnim({ art: "wackeln", tempo: 2.5, staerke: 1.2, bei: "nie" }), { art: "wackeln" });
  assert.deepEqual(C.sanitizeAnim({ art: "wackeln", tempo: "1", staerke: NaN, bei: "immer" }), { art: "wackeln" }, "kein String, kein NaN, immer ist der Standard");
  assert.deepEqual(C.sanitizeAnim({ art: "blinken", tempo: 1.234 }), { art: "blinken", tempo: 1.2 });
  for (const bad of [null, "huepfen", [], {}, { art: "tanzen" }, { art: "keine" }, { art: "HUEPFEN" }, { art: ["huepfen"] }]) assert.equal(C.sanitizeAnim(bad), null, JSON.stringify(bad));
  assert.equal(C.sanitizeAnim({ art: "huepfen", code: "alert(1)" }).code, undefined, "nur die Felder des Schemas");
});

test("Zustand, Doc und Link tragen die Animation; ungueltige faellt weg", () => {
  const st = C.sanitizeState({ v: 1, seed: 7, title: "x", emoji: "🐸", anim: { art: "pulsieren", staerke: 0.4 } });
  assert.deepEqual(st.anim, { art: "pulsieren", staerke: 0.4 });
  assert.deepEqual(C.decodeState(C.encodeState(st)).anim, st.anim, "Link hin und zurueck");
  assert.equal(C.sanitizeState({ v: 1, anim: { art: "fliegen" } }).anim, undefined);
  assert.deepEqual(L.sanitize({ anim: { art: "fluegel", bei: "treffer" } }).anim, { art: "fluegel", bei: "treffer" });
  assert.equal(L.sanitize({ anim: { art: "x" } }).anim, undefined);
  // the AI answer (kind welt): anim taken through the same check; "keine" takes it away (null), missing keeps the old one
  const base = { params: { gravity: 1500, flapPower: 400, pipeGap: 150, pipeSpeed: 120 }, theme: "day", title: "T", emoji: "🐸" };
  assert.deepEqual(C.stateFromApi({ ...base, anim: { art: "huepfen", tempo: 3 } }, "x").anim, { art: "huepfen" });
  assert.equal(C.stateFromApi({ ...base, anim: { art: "keine" } }, "x").anim, null);
  assert.equal("anim" in C.stateFromApi(base, "x"), false);
});

test("animPose: fest aus Zeit und Seed, ohne Zufall; bei = nur kurz nach dem Ausloeser", () => {
  const a = { art: "huepfen", tempo: 1, staerke: 1 };
  assert.deepEqual(C.animPose(a, 0.37, 0, 42, 36), C.animPose(a, 0.37, 0, 42, 36));
  const ys = Array.from({ length: 50 }, (x, i) => C.animPose(a, i / 50, 0, 42, 36).y);
  assert.ok(Math.min(...ys) < -14 && Math.max(...ys) <= 0, "hüpft nach oben, nie in den Boden");
  assert.deepEqual(C.animPose(null, 1, 0, 1, 36), { x: 0, y: 0, r: 0, sx: 1, sy: 1, a: 1 });
  assert.deepEqual(C.animPose({ art: "huepfen", staerke: 0 }, 0.4, 0, 1, 36).y, 0);
  const j = { art: "wackeln", bei: "sprung", staerke: 1 };
  assert.notEqual(C.animPose(j, 0.3, 0.1, 1, 36).r, 0, "kurz nach dem Sprung");
  assert.equal(C.animPose(j, 0.3, 5, 1, 36).r, 0, "lange danach ruhig");
  assert.equal(C.animPose(j, 0.3, 1e9, 1, 36).r, 0, "nie ausgeloest");
  assert.ok(C.animPose({ art: "blinken", staerke: 1 }, 0.25, 0, 0, 36).a < 1 || C.animPose({ art: "blinken", staerke: 1 }, 0.05, 0, 0, 36).a < 1);
  const src = fs.readFileSync(path.join(__dirname, "../src/core.js"), "utf8"), fn = src.slice(src.indexOf("function animPose"), src.indexOf("function animWords"));
  assert.doesNotMatch(fn, /Math\.random/, "kein Zufall in der Animation");
});

test("animWords: der Weg ohne KI liest die Bewegung aus festen Woertern", () => {
  assert.deepEqual(C.animWords("lass die Figur hüpfen"), { art: "huepfen" });
  assert.deepEqual(C.animWords("Die Figur soll sich beim Sprung schnell drehen"), { art: "drehen", bei: "sprung", tempo: 1.6 });
  assert.deepEqual(C.animWords("make it wiggle slowly"), { art: "wackeln", tempo: 0.7 });
  assert.equal(C.animWords("Unter Wasser mit Haien"), null);
  assert.deepEqual(C.animWords("keine Animation mehr"), { art: "keine" });
  assert.deepEqual(C.localConfig("lass die Figur hüpfen", "de").anim, { art: "huepfen" });
  assert.equal("anim" in C.localConfig("Unter Wasser", "de"), false);
});
