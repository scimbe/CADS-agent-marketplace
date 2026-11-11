"use strict";
// Code-Modus in the app: the SDK (src/code-sdk.js, the same bytes as CADS-DEMO-wrapper lib/code/sdk.js), the card's doc
// (only the signed link part, never code), the player's sandbox text and its input/view cleaning. The browser half
// (verify, sandbox, live) is in test/e2e/code.e2e.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const SDK = require("../src/code-sdk.js");
const D = require("../src/daily.js");
const FIX = require("./e2e/fixtures/code-games.json");

// the wrapper pins the same hash (test/fixtures/code-sdk.sha256 there): change both together
const SDK_SHA256 = "28cc31f920b57e673195c4d676221ca9f9cf94cee2157a6bad183bad270a3f91";

test("SDK: dieselben Bytes wie auf dem Server (SHA-256 gepinnt)", () => {
  const h = crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "../src/code-sdk.js"))).digest("hex");
  assert.equal(h, SDK_SHA256, "src/code-sdk.js changed: copy it to CADS-DEMO-wrapper lib/code/sdk.js and pin the new hash in both: " + h);
});

test("Karte k=code: nur id.hash.signatur übersteht sanitizeDoc, nie Code oder andere Felder", () => {
  const c = "A".repeat(16) + "." + "B".repeat(43) + "." + "C".repeat(86);
  const d = D.sanitizeDoc({ k: "code", c, t: "Verdopplung", g: "zahlen", pl: [1, 2], m: "realtime", code: "const GAME = {}", x: "<script>" });
  assert.equal(d.c, c); assert.equal(d.t, "Verdopplung"); assert.deepEqual(d.pl, [1, 2]); assert.equal(d.m, "realtime");
  assert.equal(d.code, undefined); assert.equal(d.x, undefined);
  assert.equal(D.sanitizeDoc({ k: "code", c: c + "x" }), null);
  assert.equal(D.sanitizeDoc({ k: "code", c: "../../code" }), null);
  assert.equal(D.sanitizeDoc({ k: "code" }), null);
});

test("Anzeigeliste und Eingaben werden gesäubert: unbekannte Ops, fremde Emoji, Riesenlisten, Steuerzeichen", () => {
  const v = SDK.cleanView([{ o: "rect", x: 1e9, y: -1e9, w: 10, h: 10, c: "javascript:alert(1)" }, { o: "img", src: "x" }, { o: "emoji", e: "💣" }, { o: "text", x: 1, y: 2, s: "<b>Hallo</b>\u0000" + "x".repeat(99) }]);
  assert.equal(v.length, 2);
  assert.equal(v[0].x, 720); assert.equal(v[0].c, "#111111");
  assert.equal(v[1].s.length, 40); assert.ok(!/[<>\u0000]/.test(v[1].s));
  assert.equal(SDK.cleanView(Array(5000).fill({ o: "bg", c: 1 })).length, SDK.MAX_OPS);
  assert.equal(SDK.cleanInput({ seat: 0, t: "swipe", d: "x" }, 1), null);
  assert.equal(SDK.cleanInput({ seat: 3, t: "tap", x: 1, y: 1 }, 2), null);
  assert.deepEqual(SDK.cleanInput({ seat: 0, t: "tap", x: 999, y: -5 }, 1), { seat: 0, t: "tap", x: 360, y: 0 });
  assert.equal(SDK.unpackInput("m" + JSON.stringify("x".repeat(300)), 0), null);
});

test("Sandbox-Text: kein </script> aus dem Code entkommt, die Wächter sind Parameter, Code-Erzeugung ist aus", () => {
  const code = FIX.games.verdopplung.code.replace("'Geschafft!'", "'</script><img src=x onerror=alert(1)>'");
  const script = (SDK.selfSource() + "\n" + SDK.wrapGame(code)).replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  assert.ok(!/<\/script/i.test(script));
  assert.match(SDK.wrapGame("x"), /function \(SDK, __g, __in, __out, __k\)/);
  // the same text runs in a vm without code generation: eval and Function are blocked inside
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(script, ctx);
  assert.throws(() => vm.runInContext("__SDK.constructor.constructor('return 1')()", ctx), /Code generation from strings disallowed/);
  assert.equal(JSON.parse(vm.runInContext("JSON.stringify(__H.meta)", ctx)).title, "Verdopplung");
});

test("Determinismus: gleicher Seed + gleiche Eingaben -> gleicher Hash in zwei getrennten Laufzeiten", () => {
  const mk = () => { const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } }); vm.runInContext(SDK.selfSource() + "\n" + SDK.wrapGame(FIX.games.verdopplung.code), ctx); return (s) => JSON.parse(vm.runInContext("JSON.stringify(" + s + ")", ctx)); };
  const a = mk(), b = mk();
  a("__H.start(77, {}, 2)"); b("__H.start(77, {}, 2)");
  for (const d of "lurdlldrru") for (const seat of [0, 1]) { a(`__H.apply({ seat: ${seat}, t: "swipe", d: "${d}" })`); b(`__H.apply({ seat: ${seat}, t: "swipe", d: "${d}" })`); }
  assert.equal(a("__H.hash()"), b("__H.hash()"));
  // a race: both seats got the same tile sequence (rng.keyed): the same swipes give the same board
  const st = a("JSON.parse(__H.snapshot())");
  assert.deepEqual(st.g.p[0].b, st.g.p[1].b);
});

test("der Teil code ist nur bei Bedarf geladen und kein Code-Editor existiert", () => {
  const parts = fs.readFileSync(path.join(__dirname, "../src/parts.js"), "utf8"), player = fs.readFileSync(path.join(__dirname, "../src/code-player.js"), "utf8");
  assert.match(parts, /var ONDEMAND = \[[^\]]*"code"/);
  assert.doesNotMatch(player, /textarea|contenteditable|\.code\s*=\s*[^=]/i);
  assert.match(player, /sandbox", "allow-scripts"/);
  assert.doesNotMatch(player, /allow-same-origin/);
});
