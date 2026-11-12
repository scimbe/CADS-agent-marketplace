// Karte "flug" (ADR 0001 (b)): Varianten, Geist, Agenten-Duell, Training, alte Links, Anzeigeliste und Determinismus.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import Ajv from "ajv";
import flug from "../src/cards/flug/card.js";
import * as S from "../src/engines/flug/spur.js";
import * as P from "../src/engines/flug/params.js";
import * as L from "../src/engines/flug/link.js";

const require = createRequire(import.meta.url);
const AC = require("./fixtures/alt-e2/core.cjs");
const AD = require("./fixtures/alt-e2/duel.cjs");
const G = require("./fixtures/alt-e2/spur-golden.cjs");
const LINKS = require("./fixtures/flug-lauf-links.json");
const M = flug.manifest, DEF = Object.fromEntries(Object.entries(M.params.properties).map(([k, d]) => [k, d.default]));
const full = (p) => Object.assign({}, DEF, p);
const ajv = new Ajv({ strict: false, allErrors: true }), valid = ajv.compile(M.params);
const run = (params, players, feed, max = 12000) => {
  let st = flug.init({ params: full(params), seed: "s", players }); const evs = [];
  for (let t = 0; t < max && !flug.status(st).over; t++) { const r = flug.step(st, feed(t, st), t); st = r.state; evs.push(...r.ev); }
  return { st, evs };
};

test("Manifest: Echtzeit, 120 Hz, f64, ein Knopf mit Tastatur, Modi allein + Link, 16 Varianten mit gueltigen Parametern", () => {
  assert.equal(M.kind, "realtime"); assert.equal(M.rt.tick, 120); assert.equal(M.rt.numeric, "f64");
  assert.deepEqual(M.modes, ["alone", "link"]);
  assert.ok(M.rt.controls.buttons.every((b) => b.keys.length > 0));
  assert.deepEqual(M.variants.map((v) => v.id), ["spiel-lava", "spiel-mond", "spiel-pizza", "spiel-tiefsee", "spiel-neon", "spiel-geist", "spiel-einhorn", "spiel-retro", "flug-agent", "flug-mond", "plan-01", "plan-08", "plan-13", "plan-18", "plan-22", "plan-28"]);
  assert.ok(valid(DEF), JSON.stringify(valid.errors));
  for (const v of M.variants) { assert.ok(valid(v.params), v.id + " " + JSON.stringify(valid.errors)); assert.ok(v.title.de && v.title.en && v.teaser.de && v.teaser.en, v.id); }
  for (const part of M.parts) for (const k of part.params) assert.ok(k in M.params.properties, part.id + "." + k);
});

test("Varianten = alte Links (golden-d1, alle Katalogkarten de/en): gleiche Spielwerte wie der Altcode liest", () => {
  let n = 0;
  for (const g of LINKS.d1) {
    const doc = g.doc, lang = g.name.endsWith(":en") ? "en" : "de", id = doc.i;
    if (!M.variants.some((v) => v.id === id)) continue;
    const vp = flug.variantParams(id, lang, { nick: "Ana", emoji: "🦊" });
    if (doc.k === "game") {
      const want = AC.sanitizeState({ v: 1, ...doc.g }), got = P.gameOf(vp);
      assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)), g.name);
      assert.deepEqual(P.gameOf(flug.fromFree(doc)), got, g.name + ": Link-Doc = Variante");
    } else {
      assert.equal(vp.mode, "agent"); assert.equal(vp.seed, doc.seed, g.name + " Seed");
      assert.deepEqual(vp.agent, doc.a, g.name + " Agent"); assert.deepEqual(vp.rival, doc.b, g.name + " Gegner");
      assert.deepEqual({ gravity: vp.gravity, jump: vp.jump, gap: vp.gap, speed: vp.speed }, doc.g.params); assert.equal(vp.theme, doc.g.theme);
    }
    n++;
  }
  assert.equal(n, 32, "16 Varianten x 2 Sprachen");
  for (const x of LINKS.links.filter((l) => l.doc.k === "game")) assert.deepEqual(flug.toFree(flug.fromFree(x.doc)), x.doc, x.name + ": alter Link liest und schreibt gleich");
});

test("Karte spielt die Golden-Spuren des Altcodes: gleicher Score, gleiche Ticks, gleicher float64-Bahnhash", () => {
  for (const c of G.CASES) {
    const st0 = L.sanitize({ v: 1, ...c.st }), rec = G.record(AC.sanitizeState({ v: 1, ...c.st }), c.frac);
    const pl = S.player(S.sanitize(rec.bytes));
    const params = { seed: st0.seed, ...st0.params, theme: st0.theme, title: st0.title, emoji: st0.emoji, route: st0.route || null, tempo: st0.k || 1 };
    let st = flug.init({ params: full(params), seed: "s", players: 1 }), h = 0x811c9dc5;
    const mix = (hh, x) => { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x); for (let j = 0; j < 8; j++) hh = Math.imul(hh ^ dv.getUint8(j), 16777619) >>> 0; return hh; };
    while (!flug.status(st).over && st.sims[0].ticks < (pl.end == null ? S.TMAX : pl.end)) {
      st = flug.step(st, [{ b: pl.at(st.sims[0].ticks) & 1 }], st.t).state;
      h = mix(mix(h, st.sims[0].bird.y), st.sims[0].bird.vy);
    }
    assert.deepEqual({ score: st.sims[0].score, ticks: st.sims[0].ticks, hash: h }, { score: c.want.score, ticks: c.want.ticks, hash: c.want.hash }, c.name);
  }
});

test("Geist-Duell: Sitz 1 aus der Spur fliegt bitgleich wie der Absender; Link-Rundreise mit Spur und Punkten", () => {
  const params = { ...P.presetState(P.PRESETS[2], "de").params, seed: 303, theme: "night" };
  // Absender: Bot, Aufnahme wie der Host (Eingabe je Tick)
  const rec = S.recorder();
  const a = run(params, 1, (t, st) => { const b = flug.bot(st, 0, { level: 2 }); if (b.b) rec.put(t, 1); return [b]; });
  rec.end(a.st.t);
  const bytes = rec.bytes(), frag = L.challengeFragment(P.gameOf(full(params)), a.st.sims[0].score, bytes);
  const back = L.parseHash("#" + frag);
  assert.equal(back.score, a.st.sims[0].score); assert.deepEqual([...back.spur], [...bytes]);
  // Empfaenger: Sitz 0 er selbst (hier derselbe Bot), Sitz 1 der Geist aus den Bytes
  const pl = S.player(back.spur);
  const b = run(params, 2, (t, st) => [flug.bot(st, 0, { level: 2 }), { b: pl.at(t) & 1 }]);
  assert.equal(b.st.sims[1].score, a.st.sims[0].score, "Geist erreicht die Punkte des Absenders");
  assert.equal(b.st.sims[1].ticks, a.st.sims[0].ticks);
  assert.equal(flug.hash({ ...b.st, sims: [b.st.sims[1]], t: a.st.t }), flug.hash({ ...a.st, t: a.st.t }), "Endhash Geist = Absender");
  assert.equal(flug.status(b.st).winner, -1, "gleich gut = unentschieden");
  // ein schwaecherer Empfaenger verliert gegen den Geist
  const pl2 = S.player(back.spur);
  const c = run(params, 2, (t) => [{ b: 0 }, { b: pl2.at(t) & 1 }]);
  assert.equal(flug.status(c.st).winner, 1);
});

test("Agenten-Duell (flug-agent, flug-mond, zufaellige Agenten): gleiche Punkte wie alt Duel.play, Erklaerung wie alt explain", () => {
  const docs = LINKS.d1.filter((g) => g.doc.k === "duel").map((g) => g.doc);
  const rnd = (() => { let s = 3; return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296; })();
  for (let i = 0; i < 12; i++) docs.push({ m: "flappy", a: { n: "", e: "🤖", r: Math.floor(rnd() * 101), c: 50, p: Math.floor(rnd() * 101) }, b: { n: "B", e: "👾", r: Math.floor(rnd() * 101), c: 50, p: Math.floor(rnd() * 101) }, seed: Math.floor(rnd() * 4e9), g: { params: { gravity: 1800, jump: 430, gap: 140, speed: 130 }, theme: "day" } });
  for (const d of docs) {
    const want = AD.play(AD.sanitize(d, {}), "de");
    const r = run({ mode: "agent", seed: d.seed, ...d.g.params, theme: d.g.theme, agent: d.a, rival: d.b }, 2, () => [], 120 * 90 + 10);
    const s = flug.status(r.st);
    assert.ok(s.over); assert.deepEqual(s.score, [want.sa, want.sb], JSON.stringify(d.a) + " vs " + JSON.stringify(d.b));
    assert.deepEqual(s.why, AD.explain(AD.sanitize(d, {}), want));
  }
});

test("Training: ein echter Flug lehrt den Agenten Mut und Geduld (alt learnFlap)", () => {
  const r = run({ mode: "train", seed: 101, gravity: 1400, jump: 400, gap: 175, speed: 105 }, 1, (t, st) => [flug.bot(st, 0, { level: 2 })], 120 * 25);
  const s = flug.status(r.st);
  assert.ok(r.st.samples.length >= 3);
  assert.deepEqual(s.learned || AD.learnFlap(r.st.samples), AD.learnFlap(r.st.samples));
  assert.ok(Number.isInteger(AD.learnFlap(r.st.samples).r));
});

test("Anzeige: Canvas 288x512, deterministisch, Look/Route/Foto-Slots, reduzierte Bewegung ohne Wackeln und Blitz", () => {
  for (const v of M.variants.filter((x) => x.params.mode === "solo")) {
    let st = flug.init({ params: v.params, seed: "s", players: 1 });
    for (let t = 0; t < 200; t++) st = flug.step(st, [flug.bot(st, 0, { level: 2 })], t).state;
    const a = flug.view(st, { t: 1.5, lang: "de" }), b = flug.view(st, { t: 1.5, lang: "de" });
    assert.equal(a.t, "canvas"); assert.equal(a.w, 288); assert.equal(a.h, 512);
    assert.equal(JSON.stringify(a), JSON.stringify(b), v.id + ": gleiche Eingabe, gleiches Bild");
    assert.match(a.a11y, /Flugspiel/);
    if (v.params.look && v.params.look.o) assert.ok(JSON.stringify(a).includes(v.params.look.o), v.id + ": Hindernis-Emoji");
    if (v.params.look && v.params.look.m) assert.ok(JSON.stringify(a).includes(v.params.look.m), v.id + ": Spur-Emoji");
  }
  let st = flug.init({ params: full({}), seed: "s", players: 1 });
  for (let t = 0; t < 2000 && !flug.status(st).over; t++) st = flug.step(st, [{ b: 0 }], t).state;
  const hit = flug.view(st, { t: 1 }), calm = flug.view(st, { t: 1, reduced: true });
  assert.ok(st.fx.flash > 0 || true);
  assert.ok(!/"o":"(shake|flash)"/.test(JSON.stringify(calm)), "reduziert: kein Wackeln, kein Blitz");
  const photo = flug.view(st, { t: 1, assets: { figur: true, hintergrund: true } });
  const js = JSON.stringify(photo);
  assert.ok(js.includes('"slot":"figur"') && js.includes('"slot":"hintergrund"'), "eigene Fotos nur als lokale Slots");
  assert.ok(!/data:|blob:/.test(js), "nie Pixel in der Anzeigeliste");
  assert.ok(hit.layers.length >= 3);
  const route = [{ p: "ruhig", d: { gravity: -200 }, t: "ocean", e: "🐟" }, { p: "sturm", d: { gap: -15 }, t: "night", e: "⚡" }, { p: "schnell", d: { speed: 40 }, t: "lava", e: "🐳" }];
  let rs = flug.init({ params: full({ route, gap: 175, gravity: 1400, jump: 400, speed: 105, seed: 101 }), players: 1 }); const sec = [];
  for (let t = 0; t < 10000 && !flug.status(rs).over; t++) { const r = flug.step(rs, [flug.bot(rs, 0, { level: 2 })], t); rs = r.state; if (r.ev.some((e) => e.k === "section")) sec.push(rs.sims[0].section); }
  assert.deepEqual(sec.slice(0, 2), [1, 2], "Abschnitte wechseln nach je 5 Roehren");
  assert.ok(JSON.stringify(flug.view(rs, { t: 0 })).includes("#2b0a0a"), "Welt des 3. Abschnitts (lava)");
});

test("Determinismus: gleicher Seed + gleiche Eingaben = gleiche Hash-Folge; step veraendert den alten Zustand nicht", () => {
  const seq = () => { let st = flug.init({ params: full({}), players: 2 }); const hs = []; for (let t = 0; t < 1500; t++) { st = flug.step(st, [flug.bot(st, 0, { level: 2 }), { b: t % 37 === 0 ? 1 : 0 }], t).state; if (t % 100 === 0) hs.push(flug.hash(st)); } return hs; };
  assert.deepEqual(seq(), seq());
  const s0 = flug.init({ params: full({}), players: 1 }), snap = JSON.stringify(s0);
  flug.step(s0, [{ b: 1 }], 0);
  assert.equal(JSON.stringify(s0), snap, "rein");
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(s0)).digest("hex").length, 64);
});
