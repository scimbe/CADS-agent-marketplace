// Determinismus der Engines Flug und Lauf ueber Browser-Engines (Port von alt test/browser/flug-replay.e2e.js und
// test/e2e/lauf-replay.e2e.js): die Golden-Spuren des Altcodes und die Lauf-Goldwerte ergeben in Chromium (V8) und
// WebKit (JavaScriptCore) dieselben Punkte, Ticks und float64-Bahnhashes wie in Node, ueber die Karten des Registers.
import test from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { browser, ROOT } from "./lib/grund.mjs";

const GOLD_EV1 = "42d12dae9fa8f494f9d2fb16684fc7ed85306ca01e459828bb229923b915a7ff";
const GOLD_EV0 = "268498aeca8c721703ddc81fa2cdc7a4e2b215ea9b67b9bb9fe6b977d17fc197";
const ENTRY = `
import { CARDS } from "./src/cards/index.js";
import * as E from "./src/engines/flug/engine.js";
import * as S from "./src/engines/flug/spur.js";
import * as P from "./src/engines/flug/params.js";
import * as LE from "./src/engines/lauf/engine.js";
import { sanitize } from "./src/engines/flug/link.js";
import { sha256 } from "./src/contract/sdk.js";
import G from "./test/fixtures/alt-e2/spur-golden.cjs";
import F from "./test/fixtures/alt-e2/lauf-replay.cjs";
export function run() {
  const flug = G.CASES.map((c) => {
    const st = sanitize({ v: 1, ...c.st }), sim = E.createSim(st.params, st.seed, P.routeParams(st), st.k), r = S.recorder();
    r.put(sim.ticks, 1); sim.flap();
    while (sim.state === "run" && sim.ticks < S.TMAX) { if (E.demoWants(sim, c.frac)) { r.put(sim.ticks, 1); sim.flap(); } sim.step(); }
    r.end(sim.ticks);
    const p = S.fly(st, r.bytes());
    return { name: c.name, got: { score: p.score, ticks: p.ticks, hash: p.hash, len: r.bytes().length }, want: c.want };
  });
  const c = CARDS.flug, D = Object.fromEntries(Object.entries(c.manifest.params.properties).map(([k, d]) => [k, d.default]));
  let st = c.init({ params: D, players: ["human", "none"] }); const hs = [];
  for (let t = 0; t < 3600 && !c.status(st).over; t++) { st = c.step(st, [c.bot(st, 0, { level: 2 }), { b: 0 }], t).state; if (t % 120 === 0) hs.push(c.hash(st)); }
  return { flug, ev1: sha256(F.replay(LE, F.NEW, F.INPUTS, F.MAX).text), ev0: sha256(F.replay(LE, F.OLD, F.INPUTS, F.MAX).text), cardHashes: hs };
}`;
let code, node;
test.before(async () => {
  const r = await esbuild.build({ stdin: { contents: ENTRY, resolveDir: ROOT, loader: "js" }, bundle: true, format: "iife", globalName: "DET", write: false, logLevel: "error" });
  code = r.outputFiles[0].text;
  node = await import("data:text/javascript;base64," + Buffer.from((await esbuild.build({ stdin: { contents: ENTRY, resolveDir: ROOT, loader: "js" }, bundle: true, format: "esm", write: false, logLevel: "error", platform: "node" })).outputFiles[0].text).toString("base64")).then((m) => m.run());
});
async function inEngine(kind) {
  let b;
  try { b = await browser(kind); } catch (e) { return null; }
  try { const p = await (await b.newContext()).newPage(); await p.goto("about:blank"); await p.evaluate(code); return await p.evaluate(() => globalThis.DET.run()); }
  finally { await b.close(); }
}
function check(r, label) {
  for (const f of r.flug) assert.deepEqual(f.got, f.want, label + " " + f.name);
  assert.equal(r.ev1, GOLD_EV1, label + " Lauf ev 1"); assert.equal(r.ev0, GOLD_EV0, label + " Lauf ev 0 (alter Link)");
  assert.deepEqual(r.cardHashes, node.cardHashes, label + " Karte flug: Hash-Folge = Node");
}
test("Node: Golden-Spuren und Lauf-Goldwerte", () => { check(node, "node"); assert.ok(node.cardHashes.length > 5); });
test("Chromium (V8): gleich wie Node", async () => { check(await inEngine("chromium"), "chromium"); });
test("WebKit (JavaScriptCore): gleich wie Node, sofern im Runner installiert", async (t) => {
  const r = await inEngine("webkit");
  if (!r) { assert.ok(!process.env.CI, "WebKit fehlt im CI-Runner"); t.skip("WebKit nicht installiert"); return; }
  check(r, "webkit"); console.log("# webkit: Flug/Lauf = node");
});
