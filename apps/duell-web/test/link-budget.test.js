"use strict";
// Link budget (A7a, Konzept 7: "Worst-Case-Test mit Namen-Testsatz und Tempo 50 % vor dem ersten Engine-PR"): a flight
// with the sender's Spur must fit the 1200 characters the page parses (core.js MAX_FRAGMENT), with the longest names
// and the longest Spur that sanitize lets through. When it does not, the test names the bytes of every field.
const test = require("node:test");
const assert = require("node:assert/strict");
const { record, C, E, S } = require("./fixtures/spur-golden.js");
const D = require("../src/daily.js");

// Name test set: CJK, ZWJ emoji, Devanagari, Arabic, and 4-byte emoji only (the most bytes per code point the filter keeps)
const NAMES = ["王小明李华张伟刘洋陈静杨帆赵磊黄", "👨‍👩‍👧‍👦👩‍❤️‍💋‍👨🧑‍🧑‍🧒👨‍👩‍👧‍👦", "प्रिया", "محمد", "🦄🐉🚀👾🪁🐟👽🦇🐸🍕🎉🌈🔥🌟🎈🎁"];
const KI = { k: "karte", s: "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER", h: "h".repeat(43), o: "o".repeat(22) };
const B = (x) => Buffer.byteLength(typeof x === "string" ? x : JSON.stringify(x));
const b64len = (n) => Math.ceil(n * 4 / 3);       // base64url without padding

// The longest 90 s Spur at k = 0.5: the bot on the hardest legal physics (most taps per second) that still flies 90 s.
const memo = {};
function longest90(k) {
  if (memo[k]) return memo[k];
  let best = null;
  for (const gravity of [2600, 2200, 1800]) for (const jump of [280, 340, 400, 460]) for (const gap of [200, 170, 140]) for (const seed of [1, 2, 3]) {
    const st = C.sanitizeState({ v: 1, seed, params: { gravity, jump, gap, speed: 90 }, k });
    for (const frac of [0.62, 0.75]) {
      const r = record(st, frac);
      if (r.ticks === S.TMAX && S.parse(r.bytes).end === S.TMAX && (!best || r.bytes.length > best.bytes.length)) best = { ...r, st, frac };
    }
  }
  return (memo[k] = best);
}
// The longest Spur the recorder writes: 2-byte taps until its cap (MAX_BYTES - 3, room for the end mark).
function capSpur() { const r = S.recorder(); for (let t = 0; t <= S.TMAX; t += 64) r.put(t, 1); r.end(S.TMAX); return r.bytes(); }
// The longest Spur sanitize keeps (a hand-made link): MAX_BYTES of 2-byte taps, 168 x 64 ticks <= TMAX.
function maxSpur() {
  const ev = []; for (let i = 1; i <= S.MAX_BYTES / 2; i++) ev.push([i * 64, 1]);
  const b = S.sanitize(S.encode(ev, null));
  assert.equal(b && b.length, S.MAX_BYTES, "sanitize behaelt MAX_BYTES");
  return b;
}

function report(rows, spur, total) {
  return rows.map(([k, v]) => k + " " + v + " B").join(", ") + ", spur " + spur + " B -> " + total + " Zeichen Base64 (Grenze " + C.MAX_FRAGMENT + ")";
}

test("Link-Budget: Worst-Case-Flug (Namen CJK/ZWJ/प्रिया/محمد, k=0.5, 90-s-Spur) bleibt <= 1200 - Form #c= Duell (core.js)", () => {
  const run = longest90(0.5), cap = capSpur();
  assert.ok(run, "kein Bot-Lauf ueber 90 s bei k=0.5");
  assert.ok(run.bytes.length <= S.MAX_BYTES, "90-s-Spur bei k=0.5 wird nicht gekappt: " + run.bytes.length);
  for (const spur of [run.bytes, cap, maxSpur()]) for (const n of NAMES) {
    const st = { v: 1, seed: 4294967295, params: { gravity: 2600, jump: 620, gap: 200, speed: 260 }, theme: "sunset", title: n + n, emoji: "👨‍👩‍👧‍👦", name: n, score: 9999, ki: KI, ev: E.EV, k: 0.5, spur };
    const enc = C.encodeState(st), s = C.sanitizeState(st);
    assert.deepEqual([...C.decodeState(enc).spur], [...spur], "Spur kommt an");
    const rows = Object.keys(s).filter((k) => k !== "spur").map((k) => [k, B(s[k])]);
    assert.ok(enc.length <= C.MAX_FRAGMENT, report(rows, spur.length, enc.length));
  }
  console.log("Link-Budget #c=: 90-s-Spur k=0.5 " + run.bytes.length + " B (" + run.st.params.gravity + "/" + run.st.params.jump + "/" + run.st.params.gap + "), Kappe " + cap.length + " B");
});

test("Link-Budget: dieselbe Spur in der freien Karte (#c={v:1,d}, Siegel karte mit h und o) bleibt <= 1200", () => {
  // daily.js carries g without ev/k/spur until A7b; measured here with the same rule as core.js: JSON, a 0, the bytes.
  const run = longest90(0.5), cap = capSpur(), out = [];
  for (const spur of [run.bytes, cap, maxSpur()]) for (const n of NAMES) {
    const d = D.sanitizeDoc({ k: "game", col: ["#ffd400", "#ff3b1d"], n, by: [{ n, w: ["text"] }], ki: KI, g: { seed: 4294967295, params: { gravity: 2600, jump: 620, gap: 200, speed: 260 }, theme: "sunset", title: n + n, emoji: "👨‍👩‍👧‍👦" } });
    d.g.ev = E.EV; d.g.k = 0.5;
    const size = () => b64len(B({ v: 1, d }) + 1 + spur.length);
    // docUrl (daily.js) gives way in this order when a link is too long: stickers, then the trail by (oldest first). The
    // name n, the seal (s, h, o), the game and the Spur stay.
    let dropped = 0;
    while (size() > C.MAX_FRAGMENT && d.by.length) { d.by.shift(); dropped++; }
    const json = B({ v: 1, d }), total = size();
    const rows = [["huelle", json - B(d)]].concat(Object.keys(d).map((k) => [k, B(d[k])]));
    assert.ok(total <= C.MAX_FRAGMENT, report(rows, spur.length, total));
    out.push([total, dropped, n, spur.length]);
  }
  for (const [total, dropped, n, len] of out) console.log("Link-Budget freie Karte: " + JSON.stringify(n) + ", Spur " + len + " B -> " + total + " Zeichen" + (dropped ? ", Spur des Weges (by) weggelassen" : ""));
});
