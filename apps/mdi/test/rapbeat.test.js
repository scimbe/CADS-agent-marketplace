// Strassenrap-Beat gegen das Verhalten von PR #227 (Fixture rapbeat-227.json, einmal mit dem Code aus #227 berechnet):
// Pruefung des Links, Muster, Ereignisse, Samples (bitgleich), WAV, Lautheit, Dateiname, Variantengang.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as R from "../src/engines/klang/rapbeat-rule.js";
import * as S from "../src/engines/klang/rapbeat.js";

const A = JSON.parse(fs.readFileSync(new URL("./fixtures/rapbeat-227.json", import.meta.url), "utf8"));
const J = (x) => JSON.parse(JSON.stringify(x));
const r6 = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v)));
// Fingerabdruck mit Toleranz: Math.tan/pow/log10 duerfen je V8-Version im letzten Bit abweichen (Labor-Node != lokal)
function near(a, f, msg) {
  let s = 0, m = 0; for (const x of a) { s += x * x; m = Math.max(m, Math.abs(x)); }
  assert.ok(Math.abs(Math.sqrt(s / a.length) - f.rms) < 1e-5, msg + " RMS"); assert.ok(Math.abs(m - f.peak) < 1e-5, msg + " Spitze");
  let worst = 0; f.every.forEach((v, k) => { worst = Math.max(worst, Math.abs(a[k * 64] - v)); });
  assert.ok(worst < 1e-4, msg + " Samples, groesste Abweichung " + worst);
}

test("#227: Link-Pruefung, frischer Beat, Song mit 64 Takten, Schleifen, Variantengang", () => {
  for (const [c, want] of A.ok) assert.equal(R.ok(c), want, JSON.stringify(c));
  assert.deepEqual([R.fresh(0, 1234), R.fresh(3, 4294967295)], A.fresh);
  assert.equal(R.SONG.length, A.song); assert.equal(R.SONG.length, 64);
  assert.deepEqual({ hook: J(S.loop("hook")), verse: J(S.loop("verse")), song: J(S.loop("song")) }, A.loops);
  assert.deepEqual([1, 4512, 9999].map(R.dice), A.dice);
});
test("#227: Muster je Element und Ereignisse der Takte 4-11 gleich (5 Beats: alle Stile, Stimmungen, Tonarten)", () => {
  A.vectors.forEach((v, i) => {
    assert.deepEqual(r6(J(R.phrase(R.params(v)))), A.phrase[i], "phrase " + v);
    assert.deepEqual(r6(J(S.events(v, 4, 8))), A.events[i], "events " + v);
    assert.equal(S.fileName(v, "de"), A.label[i][2]);
  });
});
test("#227: Samples gleich (Hook-Schleife Boom Bap und Trap, Einzaehlen Drill; Toleranz 1e-4), Lautheit, Limiter, WAV-Kopf", () => {
  for (const c of A.render) {
    const r = S.render(c.v, c.opt || Object.assign(J(S.loop("hook")), { wrap: true }));
    assert.equal(r.L.length, c.len, "Laenge " + c.v);
    near(r.L, c.L, "links " + c.v); near(r.R, c.R, "rechts " + c.v);
    if (c.lufs !== undefined) { assert.ok(Math.abs(S.lufs(r.L, r.R) - c.lufs) < 0.01, "LUFS"); assert.ok(Math.abs(r.gr.max - c.gr.max) < 0.01 && Math.abs(r.gr.time - c.gr.time) < 1e-3, "Limiter"); }
    if (c.off !== undefined) assert.equal(r.off, c.off);
    if (c.opt) {
      const w = S.wav(r.L.subarray(0, 4410), r.R.subarray(0, 4410), 44100);
      assert.deepEqual({ len: w.length, head: Array.from(w.slice(0, 44)) }, A.wav);
    }
  }
});

// ---------- Karte strassenrap-beat ----------
import * as Sess from "../src/contract/session.js";
import { checkCardSource } from "../scripts/harness.js";
import card, { label, picture } from "../src/cards/strassenrap-beat/card.js";
const find = (n, t) => { const out = []; const w = (x) => { if (!x || typeof x !== "object") return; if (x.t === t) out.push(x); (x.children || []).forEach(w); }; w(n); return out; };
test("Karte: Beschriftung wie #227 (de/en), Harness, Bild mit Raster unter 4000 Ops", () => {
  A.vectors.forEach((v, i) => { assert.equal(label(v, "de"), A.label[i][0]); assert.equal(label(v, "en"), A.label[i][1]); });
  for (const f of ["src/cards/strassenrap-beat/card.js", "src/engines/klang/rapbeat-rule.js"]) assert.deepEqual(checkCardSource(fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"), { file: f }), [], f);
  const pic = picture(A.vectors[1], "Beat für Straßenrap", "de");
  assert.ok(pic.ops.length < 4000); assert.ok(pic.ops.some((o) => o.op === "block"));
  assert.ok(pic.ops.some((o) => o.m === "fillText" && o.a[0] === A.label[1][0]));
});
test("Karte: dein Beat, Antwort-Beat, Ende; der Link traegt nur den letzten Zug; Handgebautes wird abgelehnt", () => {
  let s = Sess.newSession(card, { params: {}, seed: "rap", mine: [0, 1] });
  const v0 = card.view(card.observe(s.state, 0), 0, { lang: "de" });
  const go = find(v0, "go")[0];
  assert.ok(R.ok(go.input.a)); assert.equal(find(v0, "audio")[0].src.kind, "rapbeat");
  assert.equal(find(v0, "slide")[0].min, 84); assert.equal(find(v0, "slide")[0].max, 96);
  const trap = find(v0, "choice")[0].options[1].draft.v;
  assert.deepEqual(trap.slice(0, 2), [1, 140], "Stilwechsel: Tempo springt in den neuen Bereich");
  assert.throws(() => Sess.apply(card, s, { t: "beat", seat: 0, a: [0, 140, 0, 0, 0] }), /zug-ungueltig/, "BPM ausserhalb des Stils");
  s = Sess.apply(card, s, go.input);
  s = Sess.apply(card, s, { t: "beat", seat: 1, a: [2, 142, 4, 1, 9999] });
  assert.equal(Sess.status(card, s).over, true);
  assert.equal(JSON.stringify(Sess.toWire(s, card).m).length < 120, true, "zwei Zuege, je fuenf Zahlen");
  const end = card.view(card.observe(s.state, 0), 0, { lang: "en" });
  assert.equal(find(end, "text")[0].text, label([2, 142, 4, 1, 9999], "en").replace("#9999", "Nr. 9999"));
  assert.equal(find(end, "audio")[0].save.name, "strassenrap-drill-142bpm-e-minor-melan-9999.wav");
});
