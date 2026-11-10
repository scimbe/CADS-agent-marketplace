"use strict";
// The second game engine (part lauf): a free card "Endless Runner über Brücken" comes back as a runner (never as the flying
// game), opens in "Selber bauen" with its own questions and tabs, plays on a canvas that fills the game screen, jumps,
// ends, starts again; pause, keys and the line for screen readers. 412x915 and 360x780. The server is a stub here
// (its matching and schema: CADS-DEMO-wrapper test/duell-karte.test.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const E = require("../../src/lauf-engine.js");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.LAUF_SHOTS || "";      // a folder: screenshots of the runner (412x915)
// as lib/duell-karte.mjs compose() builds it for "Endless Runner über Brücken" (seed 12345)
const DOC = { k: "lauf", col: ["#ffd400", "#ff3b1d"], by: [], t: "Brückenlauf", l: E.build({ mode: "endlos", world: "bruecke", level: "normal", figure: "🦊", obstacle: "📦", coin: "🪙", foe: "🐦", has: ["hindernisse", "muenzen", "gegner"], foes: ["geh", "flug"] }, 12345) };
const SEAL = "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER";
const CREATE = { size: 5, remaining: 5, pot: "create", period: "ever", refundsLeft: 2, age16: true };
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(vp, opt) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: vp[0], height: vp[1] }, locale: "de-DE", ...(opt || {}) }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u.startsWith(API)) {
      const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body });
      const a = p0 === "ai/status" ? { meter: {}, create: CREATE } : p0 === "ai" ? { kind: "karte", options: [{ art: "lauf", doc: DOC }], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-lauf", meter: {}, create: CREATE } : p0 === "ai/accept" ? { final: true, meter: {}, create: CREATE } : null;
      if (a) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(a) });
    }
    return r.abort();
  });
  await p.goto(page);
  return { p, errs, sent };
}
const box = (p, s) => p.locator(s).evaluate((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
const snap = (p) => p.evaluate(() => window.LaufDebug.snap());

for (const vp of [[412, 915], [360, 780]]) {
  test(`${vp.join("x")}: freie Karte "Endless Runner über Brücken" -> Laufspiel, Selber bauen mit eigenen Fragen, Spielen, Sprung, Tod, Neustart`, async () => {
    const { p, errs, sent } = await phone(vp);
    await p.evaluate(() => { window.DailyApp.me().pref = { age: "a18" }; });
    await p.locator("#create").tap();
    await p.getByRole("button", { name: "🕹 Spiel" }).tap();
    await p.getByLabel("Deine Beschreibung").fill("Endless Runner über Brücken");
    await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
    const pv = p.locator(".createpv");
    await pv.waitFor();
    assert.match((await pv.textContent()).replace(/\s+/g, " "), /🦊 Brückenlauf.*Endlos-Lauf/);
    assert.equal(sent.find((s) => s.path === "ai").body.input.art, "game", "die Art bleibt Spiel, der Server waehlt die Engine");
    await p.getByRole("button", { name: "Übernehmen" }).tap();
    await p.locator("#tabLWish").waitFor();
    assert.equal(await p.locator("#edtitle").textContent(), "Selber bauen");
    const tabs = await p.locator("#tabs [role=tab]").allTextContents();
    assert.deepEqual(tabs.map((x) => x.replace(/[^\p{L}]/gu, "")), ["Aufgabe", "Wunsch", "Regeln", "Figur", "Welt", "Text"]);
    await p.locator("#tabLWish").tap();
    assert.equal(await p.getByLabel("Was willst du laufen oder springen?").count(), 1);
    assert.equal(await p.getByText("Was willst du fliegen?").count(), 0, "keine Flug-Frage");
    const doc = await p.evaluate(() => window.DailyDebug.doc());
    assert.equal(doc.k, "lauf"); assert.equal(doc.ki.k, "karte"); assert.deepEqual(doc.l, DOC.l);
    // the stage shows the runner (drawn, not empty)
    assert.ok(await p.locator("#stage").evaluate((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4000) set.add(d[i] + "," + d[i + 1] + "," + d[i + 2]); return set.size > 5; }), "Vorschau gemalt");
    await p.locator("#edmain").tap();
    await p.locator("#lauf:not([hidden])").waitFor();
    // the canvas fills the game screen, in CSS px and in device px
    await p.waitForTimeout(300);
    const [g, c] = [await box(p, "#game"), await box(p, "#lfcv")];
    assert.deepEqual(c, g, "Canvas fuellt den Rahmen");
    const s0 = await snap(p), dpr = await p.evaluate(() => Math.min(devicePixelRatio, 2));
    assert.ok(Math.abs(s0.cw - g[2] * dpr) <= 1 && Math.abs(s0.ch - g[3] * dpr) <= 1, "Pixel passend: " + JSON.stringify([s0.cw, s0.ch, g]));
    assert.equal(s0.state, "ready");
    assert.match(await p.locator(".lfhint").textContent(), /Tippen = springen/);
    assert.equal(await p.locator("#gki").isVisible(), true, "KI-Zeichen im Spiel");
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "lauf-1-start-" + vp[0] + ".png") });
    // start, then a jump with the space key
    await p.keyboard.press("Space");
    assert.equal((await snap(p)).state, "run");
    await p.waitForFunction(() => /Los!/.test(document.querySelector("#lauf .dmsg").textContent));
    await p.keyboard.down("Space");
    await p.evaluate(() => window.LaufDebug.tick(0.15));
    const up = await snap(p);
    await p.keyboard.up("Space");
    assert.ok(up.y < E.GY - 30 && !up.on, "Sprung: " + up.y);
    await p.evaluate(() => window.LaufDebug.tick(1.2));
    // a little further along (a simple bot in the page jumps), for the picture of the bridges
    await p.evaluate(() => window.LaufDebug.auto(3.5));
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "lauf-2-sprung-" + vp[0] + ".png") });
    // pause and on
    await p.locator(".lfpause").tap();
    assert.equal((await snap(p)).paused, true);
    await p.waitForFunction(() => /Pause/.test(document.querySelector("#lauf .dmsg").textContent));
    await p.locator(".lfpause").tap();
    assert.equal((await snap(p)).paused, false);
    // nobody jumps: the run ends at the next gap or block; the result says it, also to a screen reader
    await p.evaluate(() => window.LaufDebug.tick(60));
    const end = await snap(p);
    assert.equal(end.state, "over");
    await p.locator(".lfres:not([hidden])").waitFor();
    await p.waitForFunction(() => /Ende: \d+ Punkte, \d+ Meter/.test(document.querySelector("#lauf .dmsg").textContent));
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "lauf-3-ende-" + vp[0] + ".png") });
    await p.getByRole("button", { name: "Nochmal" }).tap();
    assert.equal((await snap(p)).state, "ready");
    assert.equal(await p.locator(".lfres").isHidden(), true);
    // back to building: the editor again, the same doc
    await p.locator("#gback").tap();
    await p.locator("#editor:not([hidden])").waitFor();
    assert.equal(await p.locator("#lauf").isHidden(), true);
    assert.equal((await p.evaluate(() => window.DailyDebug.doc())).k, "lauf");
    assert.deepEqual(errs, []);
    await p.context().close();
  });
}

test("Selber bauen -> Laufspiel ohne KI: Wunsch nach festen Wortregeln, Reiter Regeln/Welt, ein geteilter Link oeffnet dasselbe Spiel", async () => {
  const { p, errs } = await phone([412, 915], { reducedMotion: "reduce" });
  await p.locator("#own").tap();
  await p.getByRole("button", { name: "🏃 Laufspiel" }).tap();
  await p.locator("#tabLWish").waitFor();
  await p.locator("#tabLWish").tap();
  await p.getByRole("button", { name: "Jump’n’Run mit Ziel im Wald" }).tap();
  let doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.l.m, "ziel"); assert.equal(doc.l.w, "wald");
  assert.match(await p.locator("#panel").textContent(), /Ohne KI, nach festen Wortregeln/);
  await p.locator("#tabLRules").tap();
  assert.ok(await p.getByRole("slider", { name: "Ziel (m)" }).count());
  await p.locator("#tabLWorld").tap();
  await p.getByRole("button", { name: "Brücken" }).tap();
  doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.l.w, "bruecke");
  // the link of this doc opens the same game on another device (sheet with its picture, then the editor)
  const url = await p.evaluate((d) => window.Daily.docUrl(d), doc);
  const q = await phone([412, 915]);
  await q.p.goto(page + url.slice(url.indexOf("#")));
  await q.p.locator("#leaf .pvcard:not([hidden])").waitFor();
  const got = await q.p.evaluate(() => window.DailyDebug.home().doc);
  assert.deepEqual(got.l, doc.l);
  assert.deepEqual(errs.concat(q.errs), []);
  await p.context().close(); await q.p.context().close();
});
