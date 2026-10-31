"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");

const base = () => ({ v: 1, seed: 42, params: { gravity: 1800, jump: 430, gap: 140, speed: 130 }, theme: "night", title: "Mein Spiel", emoji: "\u{1F680}" });

test("Kodierung: Roundtrip mit score und Spitzname, Umlaute und Emoji", () => {
  const st = { ...base(), title: "Grüße \u{1F525}", score: 17, name: "Jürgen" };
  const enc = C.encodeState(st);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(C.decodeState(enc), st);
});
test("Kodierung: Fragment-Parser und Link-Bau", () => {
  const url = C.buildUrl(base());
  assert.ok(url.startsWith("https://bunsenbrenner.org/duell#c="));
  assert.deepEqual(C.parseHash(url.slice(url.indexOf("#"))), base());
  assert.deepEqual(C.parseHash("#x=1&c=" + C.encodeState(base())), base());
  assert.equal(C.parseHash("#nix"), null);
  assert.equal(C.parseHash(""), null);
});
test("Kodierung: Muell, falsche Version, zu lang, kaputtes UTF-8 -> null", () => {
  const b64 = (s) => Buffer.from(s).toString("base64url");
  assert.equal(C.decodeState("!!!"), null);
  assert.equal(C.decodeState(""), null);
  assert.equal(C.decodeState(b64("{nope")), null);
  assert.equal(C.decodeState(b64("[]")), null);
  assert.equal(C.decodeState(b64("null")), null);
  assert.equal(C.decodeState(b64(JSON.stringify({ ...base(), v: 2 }))), null);
  assert.equal(C.decodeState("A".repeat(C.MAX_FRAGMENT + 1)), null);
  assert.equal(C.decodeState(Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url")), null);
  assert.equal(C.decodeState(123), null);
});
test("Begrenzung: Parameter werden hart geklemmt", () => {
  const evil = { ...base(), params: { gravity: 1e9, jump: -5, gap: 0, speed: "999" }, score: 1e12 };
  const st = C.decodeState(Buffer.from(JSON.stringify(evil)).toString("base64url"));
  assert.deepEqual(st.params, { gravity: 2600, jump: 280, gap: 90, speed: 260 });
  assert.equal(st.score, C.MAX_SCORE);
});
test("Begrenzung: NaN, Strings, Objekte, fehlende Felder -> Defaults", () => {
  assert.deepEqual(C.sanitizeParams({ gravity: NaN, jump: "abc", gap: {}, speed: null }), { gravity: 1800, jump: 430, gap: 140, speed: 130 });
  assert.deepEqual(C.sanitizeParams(undefined), { gravity: 1800, jump: 430, gap: 140, speed: 130 });
  assert.equal(C.sanitizeTheme("<script>"), "day");
  assert.equal(C.sanitizeTheme("lava"), "lava");
  assert.equal(C.sanitizeSeed(-1), 0);
  assert.equal(C.sanitizeSeed("x"), 1);
  assert.equal(C.sanitizeSeed(1e99), 4294967295);
  const st = C.sanitizeState({ v: 1, score: -3 });
  assert.equal(st.score, 0);
  assert.equal(C.sanitizeState({ v: 1, score: "x" }).score, undefined);
});
test("Begrenzung: unbekannte Felder verschwinden, Name max 16, Titel max 28, Emoji nur Emoji", () => {
  const st = C.sanitizeState({ ...base(), evil: "<img onerror=x>", name: "A".repeat(40), title: "T".repeat(90), emoji: "<b>hi</b>" });
  assert.equal("evil" in st, false);
  assert.equal(Array.from(st.name).length, 16);
  assert.equal(Array.from(st.title).length, 28);
  assert.equal(st.emoji, "\u{1F424}");
  assert.equal(C.sanitizeEmoji("\u{1F468}‍\u{1F680} extra"), "\u{1F468}‍\u{1F680}");
});
test("XSS: Markup-Zeichen und Steuerzeichen fliegen aus Name und Titel", () => {
  const n = C.sanitizeName('<img src=x onerror=alert(1)>"‮\u0000');
  assert.ok(!/[<>"=()‮\u0000]/.test(n), n);
  const t = C.sanitizeTitle("<script>alert(1)</script>");
  assert.ok(!/[<>()/]/.test(t), t);
  const st = C.decodeState(C.encodeState({ ...base(), name: "<svg/onload=alert(1)>" }));
  assert.ok(!st.name || !/[<>=()]/.test(st.name));
});
test("Filter: de/en, Leetspeak, Leerzeichen, Wiederholung", () => {
  for (const bad of ["fuck", "F U C K", "fuuuck you", "sh1t", "Scheisse", "Scheiße", "arschloch", "Hurensohn", "ficken", "B!tch", "hitler", "n a z i", "dick"]) assert.equal(C.isClean(bad), false, bad);
  for (const ok of ["Anna", "Essex", "Scunthorpe", "Rakete", "Nachtschicht", "Max 2000", "Klassenfahrt", "\u{1F680}", "Assistent", "Dickens", "Heilbronn", "Torpedo"]) assert.equal(C.isClean(ok), true, ok);
});
test("Filter: greift bei Name, Titel, Spielidee und Link-Inhalt", () => {
  assert.equal(C.sanitizeName("Arschloch"), "");
  assert.equal(C.sanitizeTitle("fuck this", "Duell"), "Duell");
  assert.equal(C.localConfig("mach scheisse", "de").rejected, "filter");
  assert.equal(C.localConfig("   ", "de").rejected, "empty");
  const st = C.decodeState(C.encodeState({ ...base(), name: "Hurensohn", title: "Fuck" }));
  assert.equal(st.name, undefined);
  assert.equal(st.title, "Duell");
});
test("Tages-Seed: gleich innerhalb eines UTC-Tages, anders am naechsten", () => {
  const a = new Date("2026-11-01T00:00:00Z"), b = new Date("2026-11-01T23:59:59Z"), c = new Date("2026-11-02T00:00:00Z");
  assert.equal(C.dailySeed(a), C.dailySeed(b));
  assert.notEqual(C.dailySeed(a), C.dailySeed(c));
  assert.equal(C.dailyKey(new Date("2026-11-01T23:30:00-05:00")), "2026-11-02"); // UTC, nicht lokal
  assert.deepEqual(C.dailyConfig(a), C.dailyConfig(b));
  assert.equal(C.dailySeed(a), 3292932445); // eingefroren: aendert sich das, sehen Nutzer unterschiedliche Strecken
});
test("Tagesrunde: Konfiguration ist gueltig und stabil durch den Link", () => {
  const d = C.dailyConfig(new Date("2026-11-01T12:00:00Z"));
  assert.deepEqual(C.sanitizeState(d), d);
  assert.deepEqual(C.decodeState(C.encodeState(d)), d);
});
test("PRNG: deterministisch pro Seed", () => {
  const r1 = C.mulberry32(7), r2 = C.mulberry32(7), r3 = C.mulberry32(8);
  const s1 = [r1(), r1(), r1()], s2 = [r2(), r2(), r2()], s3 = [r3(), r3(), r3()];
  assert.deepEqual(s1, s2);
  assert.notDeepEqual(s1, s3);
  assert.ok(s1.every((x) => x >= 0 && x < 1));
});
test("Presets: 8 Stueck, alle gueltig, alle Themes vertreten", () => {
  assert.equal(C.PRESETS.length, 8);
  for (const p of C.PRESETS) {
    const st = C.presetState(p, "de");
    assert.deepEqual(C.sanitizeState(st), st, p.id);
    assert.deepEqual(C.sanitizeParams(p.params), p.params, p.id);
  }
});
test("Lokale Wortlogik: schnell/Nacht/Rakete wirken, gleiche Idee = gleiche Strecke", () => {
  const a = C.localConfig("nachts, mega schnell, Raketen", "de");
  assert.equal(a.theme, "night");
  assert.equal(a.emoji, "\u{1F680}");
  assert.ok(a.params.speed > 130);
  assert.deepEqual(a, C.localConfig("nachts, mega schnell, Raketen", "de"));
  const slow = C.localConfig("chill und leicht", "de");
  assert.ok(slow.params.gap > 140 && slow.params.speed < 130);
  assert.deepEqual(C.sanitizeState(a), a);
});
test("API-Antwort wird wie ein Link behandelt (klemmen, filtern)", () => {
  const st = C.stateFromApi({ params: { gravity: 99999, jump: 1, gap: 1, speed: 1 }, theme: "<x>", title: "Scheisse", emoji: "hi" }, "test");
  assert.deepEqual(st.params, { gravity: 2600, jump: 280, gap: 90, speed: 90 });
  assert.equal(st.theme, "day");
  assert.equal(st.title, "Duell");
  assert.equal(C.stateFromApi(null, "x"), null);
  assert.equal(C.stateFromApi({ params: "x" }, "x"), null);
});
test("API-Namen: flapPower/pipeGap/pipeSpeed werden angenommen und mit den API-Grenzen geklemmt", () => {
  const st = C.stateFromApi({ params: { gravity: 2000, flapPower: 9999, pipeGap: 95, pipeSpeed: 1 }, theme: "lava", title: "Hallo", emoji: "\u{1F525}" }, "x");
  assert.deepEqual(st.params, { gravity: 2000, jump: 620, gap: 95, speed: 90 });
  assert.deepEqual(C.sanitizeParams({ gravity: 900, flapPower: 280, pipeGap: 200, pipeSpeed: 260 }), { gravity: 900, jump: 280, gap: 200, speed: 260 });
});
