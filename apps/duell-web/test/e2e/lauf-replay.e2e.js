"use strict";
// Golden replay of the runner across engines (test/fixtures/lauf-replay.js, unit test test/lauf-engine.test.js): the same
// doc and the same inputs at the same ticks give the same sha256 of the states in Node, in Chromium (the source files and
// the shipped part "lauf" of dist/, opened by a link with an old doc) and in WebKit. ev 1 must match bit for bit everywhere. ev 0
// (old links, the frozen Math.sin path) differs in the last bits between engines, even between V8 in Node and in
// Chromium, which is why ev 1 has no Math.sin at all: ev 0 is compared to 6 places (F.rounded), its ticks and points
// exactly. WebKit: Playwright's WebKit if it is installed,
// else JavaScriptCore (WebKit's engine, /System/.../jsc on macOS) with the same source files; without both the WebKit
// case is skipped and says so (CI installs only Chromium).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const pw = require("playwright");
const E = require("../../src/lauf-engine.js");
const F = require("../fixtures/lauf-replay.js");
const D = require("../../src/daily.js");

const SRC = ["core.js", "lauf.js", "lauf-engine.js"].map((f) => path.resolve(__dirname, "../../src", f));
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
// the cases: a new doc (ev 1) and the old link's doc with a seed whose run meets flying foes (ev 0, old path)
const CASES = [["ev1", F.NEW], ["ev0", { ...F.OLD, seed: 11 }]];
const call = (engine, l) => "(" + F.replay.toString() + ")(" + engine + "," + JSON.stringify(l) + "," + JSON.stringify(F.INPUTS) + "," + F.MAX + ")";
const want = {};
const got = (r) => ({ hash: sha(r.text), round: sha(F.rounded(r.text)), ticks: r.ticks, points: r.points });
for (const [n, l] of CASES) want[n] = got(F.replay(E, l, F.INPUTS, F.MAX));
// ev 1 exact; ev 0 to 6 places (the exact hash only reported)
function same(out, where, t) {
  assert.deepEqual(out.ev1, want.ev1, where + ": ev 1 bitgleich");
  const { hash, ...rest } = out.ev0, { hash: h0, ...w0 } = want.ev0;
  assert.deepEqual(rest, w0, where + ": ev 0 auf 6 Stellen, Ticks und Punkte");
  t.diagnostic(where + ": ev 0 exakt " + (hash === h0 ? "gleich wie Node" : "anders als Node (Math.sin, letzte Bits)"));
}

async function inBrowser(type, t) {
  let b;
  try { b = await pw[type].launch(type === "chromium" ? { executablePath: process.env.PW_CHROME || undefined } : {}); } catch (e) { if (type === "chromium") throw e; t.skip(type + " nicht installiert: " + e.message.split("\n")[0]); return null; }
  try {
    const p = await (await b.newContext()).newPage();
    for (const f of SRC) await p.addScriptTag({ path: f });
    const out = {};
    for (const [n, l] of CASES) out[n] = got(await p.evaluate(call("window.LaufEngine", l)));
    return out;
  } finally { await b.close(); }
}

test("Node: die eingefrorenen Hashes (wie test/lauf-engine.test.js)", () => {
  assert.equal(want.ev1.hash, "42d12dae9fa8f494f9d2fb16684fc7ed85306ca01e459828bb229923b915a7ff");
  assert.equal(want.ev0.round, "e4639726fb86289187ed90580d1291cf1e1fe71e7ad9499a0f234db4ee465fe8");
});

test("Chromium: Quelldateien und der ausgelieferte Teil lauf (Link mit altem Doc) ergeben denselben Hash wie Node", async (t) => {
  same(await inBrowser("chromium"), "Chromium src", t);
  // the shipped bundle: a link with the old doc (no ev, no seal to check) opens the card, which loads the part lauf
  const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  try {
    const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, locale: "de-DE" })).newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    const url = D.docUrl(D.sanitizeDoc({ k: "lauf", col: ["#2b4bff", "#ffe600"], by: [], t: "Brückenlauf", l: F.OLD }));
    await p.goto(page + url.slice(url.indexOf("#")));
    await p.waitForFunction(() => window.LaufEngine && window.Lauf, null, { timeout: 15000 });
    const out = {};
    for (const [n, l] of CASES) out[n] = got(await p.evaluate(call("window.LaufEngine", l)));
    same(out, "Chromium dist/parts/lauf.*.js", t);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test("WebKit: derselbe Hash wie Node (Playwright-WebKit, sonst JavaScriptCore)", async (t) => {
  let ok = false;
  try { await pw.webkit.launch().then((b) => b.close()); ok = true; } catch (e) { /* not installed */ }
  if (ok) { same(await inBrowser("webkit", t), "WebKit", t); return; }
  const jsc = ["/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc", "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"].find((f) => fs.existsSync(f));
  if (!jsc) { t.skip("weder Playwright-WebKit noch jsc vorhanden"); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lauf-jsc-"));
  try {
    const out = {};
    for (const [n, l] of CASES) {
      const run = path.join(dir, n + ".js");
      fs.writeFileSync(run, "var r = " + call("globalThis.LaufEngine", l) + ";\nprint(JSON.stringify(r));\n");
      out[n] = got(JSON.parse(execFileSync(jsc, [...SRC, run], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 60000 })));
    }
    same(out, "JavaScriptCore", t);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
