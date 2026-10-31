"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const P = require("../src/playable.js");
const me = { emoji: "🐙", nick: "Mira", colors: ["#2b4bff", "#ffe600"] };
const card = (o) => D.sanitizeDoc({ k: "card", x: "Heute bin ich ein Keks und das ist gut so", st: "neon", col: ["#2b4bff", "#ffe600"], sk: [], ...o });

test("Karte zu Spiel: Sticker wird Figur, sonst Mein-Stil-Emoji; Spruch wird Titel und Schlusstext; Farben reisen mit", () => {
  const a = P.fromDoc(card({ sk: [{ e: "🍕", x: 0.5, y: 0.5, r: 0, z: 1 }] }), me), b = P.fromDoc(card(), me);
  assert.equal(a.emoji, "🍕"); assert.equal(b.emoji, "🐙");
  assert.equal(a.title, "Heute bin ich ein Keks und"); assert.equal(a.skin.l, "Heute bin ich ein Keks und das ist gut so");
  assert.deepEqual(a.skin.c, ["#2b4bff", "#ffe600"]);
  const photo = D.sanitizeDoc({ k: "photo", x: "Oben", y: "Unten", st: "meme", col: ["#ffd400", "#ff3b1d"], sk: [] });
  assert.equal(P.fromDoc(photo, me).skin.l, "Oben Unten");
});
test("Spielwerte bleiben im Rahmen der Engine, jeder Stil ist spielbar", () => {
  for (const st of D.STYLES.card) { const s = P.fromDoc(card({ st }), me); for (const k of Object.keys(C.RANGES)) { assert.ok(s.params[k] >= C.RANGES[k][0] && s.params[k] <= C.RANGES[k][1], st + k); } }
});
test("Herausforderung: Link traegt nur Spieldaten, kein Bild, und oeffnet mit Farben, Figur und Spruch", () => {
  const url = D.challengeUrl(P.fromDoc(card({ sk: [{ e: "🍕", x: 0.5, y: 0.5, r: 0, z: 1 }] }), me), 12);
  const raw = JSON.parse(Buffer.from(url.split("#c=")[1], "base64url").toString());
  assert.deepEqual(Object.keys(raw).sort(), ["emoji", "params", "score", "seed", "skin", "theme", "title", "v"]);
  assert.deepEqual(Object.keys(raw.skin).sort(), ["c", "l"]);
  assert.ok(url.length < 700, "kurz genug, kein Bild passt hinein: " + url.length);
  const r = D.parseRoute("#c=" + url.split("#c=")[1]);
  assert.equal(r.type, "challenge"); assert.equal(r.state.skin.l, raw.skin.l); assert.equal(r.state.emoji, "🍕");
});
test("Fremder Link: kaputte oder boese Skin-Felder fallen weg, kein Skript, kein Bild, kein Schimpfwort", () => {
  assert.equal(C.sanitizeState({ v: 1, skin: { c: ["red", "url(x)"], l: "x" } }).skin, undefined);
  assert.equal(C.sanitizeState({ v: 1, skin: { c: ["#000000"] } }).skin, undefined);
  assert.deepEqual(C.sanitizeState({ v: 1, skin: { c: ["#000000", "#ffffff"], l: "fuck", img: "data:image/png;base64,AAAA" } }).skin, { c: ["#000000", "#ffffff"] });
  assert.ok(!/[<>]/.test(C.sanitizeState({ v: 1, skin: { c: ["#000000", "#ffffff"], l: "<img src=x onerror=y>" } }).skin.l));
});
test("Farben: Hindernisse heben sich immer vom Himmel ab, auch bei gleichen Kartenfarben", () => {
  assert.equal(P.skinTheme({ c: ["#ffd400", "#ff3b1d"] }).pipe, "#ff3b1d");
  assert.equal(P.skinTheme({ c: ["#ffffff", "#fffffe"] }).pipe, "#111111");
  assert.equal(P.skinTheme({ c: ["#101010", "#111111"] }).pipe, "#ffffff");
  for (const v of Object.values(P.skinTheme({ c: ["#2b4bff", "#ffe600"] }))) assert.match(v, /^#[0-9a-f]{6}$/);
});
