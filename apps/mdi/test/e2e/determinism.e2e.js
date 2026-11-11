// Determinismus ueber Engines: dieselbe Bot-Partie (Seed + Iterationsbudget) ergibt in Chromium (V8) und, wenn
// installiert, in WebKit (JavaScriptCore) denselben Zustandshash wie in Node (Goldwert aus test/fixtures).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import { browser, ROOT } from "./lib/grund.mjs";


const GOLD = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/sdk-gold.json"), "utf8"));
const DET = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/determinism.json"), "utf8"));
const ENTRY = `
import { CARDS } from "./src/cards/index.js"; import * as S from "./src/contract/session.js"; import { chooseMove } from "./src/bot/ismcts.js";
import { defaults } from "./src/contract/fields.js"; import * as K from "./src/contract/sdk.js";
export function run(seed, salt, it) {
  const c = CARDS.bluff;
  let a = S.newSession(c, { params: defaults(c.manifest.params), seed, mine: [0], secrets: { 0: salt }, commits: [S.commitOf(salt), null] });
  let b = S.newSession(c, { params: a.params, seed, mine: [1], commits: a.commits });
  while (!S.status(c, a).over) { const due = S.dueReveal(c, a), st = S.status(c, a); const mv = due || chooseMove(c, S.observe(c, st.turn === 0 ? a : b, st.turn), st.turn, { iterations: it, seed: seed + "|" + a.log.length }); a = S.apply(c, a, mv); b = S.apply(c, b, mv); }
  const r = K.rng("mdi-golden"); const tab = []; for (let i = 0; i < 4096; i++) tab.push(K.sinT(i));
  return { hash: S.pubHash(a), moves: a.log.map((x) => x.t === "say" ? x.v : x.t === "call" ? (x.open ? "O" : "B") : "R"), rng: [r.u32(), r.u32(), r.u32()], sin: K.stateHash(tab), log: K.logD(12345).toString() };
}`;
async function bundle() {
  const r = await esbuild.build({ stdin: { contents: ENTRY, resolveDir: ROOT, loader: "js" }, bundle: true, format: "iife", globalName: "DET", write: false, logLevel: "error" });
  return r.outputFiles[0].text;
}
async function inEngine(kind, code) {
  let b;
  try { b = await browser(kind); } catch (e) { return null; }
  try { const p = await (await b.newContext()).newPage(); await p.goto("about:blank"); await p.evaluate(code); return await p.evaluate(([s, salt, it]) => globalThis.DET.run(s, salt, it), [DET.seed, DET.salt, 400]); }
  finally { await b.close(); }
}
test("Bot-Partie und SDK-Goldwerte in Chromium (V8) gleich wie in Node", async () => {
  const r = await inEngine("chromium", await bundle());
  assert.equal(r.hash, DET.hash); assert.deepEqual(r.moves, DET.moves);
  assert.deepEqual(r.rng, GOLD.rng); assert.equal(r.sin, GOLD.sinTable); assert.equal(r.log, GOLD.logD);
});
test("dieselbe Partie in WebKit (JavaScriptCore), sofern im Runner installiert", async (t) => {
  const r = await inEngine("webkit", await bundle());
  if (!r) {
    // Im Runner (CI=1, Playwright-Image mit WebKit) ist der Engine-Vergleich Pflicht (KONZEPT §3.5)
    assert.ok(!process.env.CI, "WebKit fehlt im CI-Runner");
    t.skip("WebKit nicht installiert"); return;
  }
  assert.equal(r.hash, DET.hash); assert.deepEqual(r.moves, DET.moves);
  assert.deepEqual(r.rng, GOLD.rng); assert.equal(r.sin, GOLD.sinTable); assert.equal(r.log, GOLD.logD);
  console.log("# webkit: hash " + r.hash + " = node");
});
