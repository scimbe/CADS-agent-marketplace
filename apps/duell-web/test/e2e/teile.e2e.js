"use strict";
// src/teile.js on the real page (A2 of the plan "freie Karte"): a flying game and a runner opened in "Selber bauen" name
// their parts; every rectangle lies in the stage box, teilAt finds each part again, every panel is a sheet of A.PANEL.
// teile.js comes with the part blasen (A3b); the test adds it to the page itself, so it holds before the part is there.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const G = require("./lib/grund.js");
const E = require("../../src/lauf-engine.js");
const TEILE = path.resolve(__dirname, "../../src/teile.js");
// the runner of lauf.e2e.js: "Endless Runner über Brücken", with foes, seed 12345
const LAUF = { k: "lauf", col: ["#ffd400", "#ff3b1d"], by: [], t: "Brückenlauf", l: E.build({ mode: "endlos", world: "bruecke", level: "normal", figure: "🦊", obstacle: "📦", coin: "🪙", foe: "🐦", has: ["hindernisse", "muenzen", "gegner"], foes: ["geh", "flug"] }, 12345) };
let page, b;
test.before(async () => { page = await G.webUrl("index.html"); b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function open(dev) {
  const ctx = await b.newContext({ ...devices[dev], locale: "de-DE" }), p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(page);
  await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  await p.addScriptTag({ path: TEILE });
  return { p, errs };
}
// teile() and, at the same moment, the stage box, teilAt at each middle and anchor, the sheets there are
const measure = (p, id) => p.evaluate((id) => {
  const doc = window.DailyDebug.doc(), box = document.getElementById(id), list = window.Teile.teile(doc);
  return {
    list, k: doc.k, bw: box.clientWidth, bh: box.clientHeight, panels: Object.keys(window.DailyApp.PANEL), tabs: window.DailyApp.TABS[doc.k],
    mid: list.map((t) => window.Teile.teilAt(t.x + t.w / 2, t.y + t.h / 2)), at: list.map((t) => window.Teile.teilAt(t.ax, t.ay))
  };
}, id);
function check(m, ids, background) {
  assert.deepEqual(m.list.map((t) => t.id).sort(), ids.slice().sort(), "alle Teile da");
  m.list.forEach((t, i) => {
    assert.ok(t.w >= 1 && t.h >= 1 && t.x >= 0 && t.y >= 0 && t.x + t.w <= m.bw + 0.05 && t.y + t.h <= m.bh + 0.05, t.id + " liegt im Rahmen " + m.bw + "x" + m.bh + ": " + JSON.stringify(t));
    assert.ok(m.panels.includes(t.panel), t.id + ": " + t.panel + " ist ein Blatt von A.PANEL");
    assert.ok(m.tabs.includes(t.panel), t.id + ": " + t.panel + " ist ein Reiter dieser Art");
    assert.equal(m.at[i], t.id, t.id + ": teilAt(Anker)");
    // the middle answers the part itself; only the whole background may have a smaller part in front of its middle
    if (!background.includes(t.id)) { assert.equal(m.mid[i], t.id, t.id + ": teilAt(Mitte)"); assert.deepEqual([t.ax, t.ay], [t.x + t.w / 2, t.y + t.h / 2]); }
  });
}

for (const dev of ["Pixel 7", "iPhone SE"]) {
  test(`Flug im Editor meldet figur, saeule, himmel, titel (${dev})`, async () => {
    const { p, errs } = await open(dev);
    await p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('game', window.DailyApp.me(), 'de'), {own:true})");
    await p.waitForTimeout(1500);   // the sheet has settled, the frame has its size
    // stop the demo's own loop, then fly on until a column is in the picture; teile() and teilAt see the same frame
    await p.evaluate(() => { window.Game.hold(true); for (let i = 0; i < 40 && !window.Game.view().pipes.some((q) => q.x > 20 && q.x < 200); i++) window.DuellDebug.tick(0.25); });
    const v = await p.evaluate(() => window.Game.view());
    assert.deepEqual(Object.keys(v).sort(), ["bird", "h", "pipes", "title", "w"]);
    assert.deepEqual([v.w, v.h], [288, 512]);
    const m = await measure(p, "gamestage");
    check(m, ["figur", "saeule", "himmel", "titel"], ["himmel"]);
    // the frame is filled (canvas-fit.e2e.js): the sky is the whole canvas, at least one side meets the box
    const sky = m.list.find((t) => t.id === "himmel");
    assert.ok(Math.max(sky.w / m.bw, sky.h / m.bh) > 0.97, JSON.stringify(sky) + " in " + m.bw + "x" + m.bh);
    assert.deepEqual(errs, []);
  });
}

test("Lauf im Editor meldet figur, hindernis, muenze, gegner, welt, titel (Pixel 7)", async () => {
  const { p, errs } = await open("Pixel 7");
  await p.evaluate((d) => window.DailyApp.openEditor(d, { own: true }), LAUF);
  await p.locator("#tabLWish").waitFor();
  await p.waitForTimeout(1500);   // the sheet has settled
  const m = await measure(p, "stage");
  assert.equal(m.k, "lauf");
  check(m, ["figur", "hindernis", "muenze", "gegner", "welt", "titel"], ["welt"]);
  const fig = m.list.find((t) => t.id === "figur");
  // the runner stands in the left third, as draw() puts it (28 % of the view)
  assert.ok(fig.x + fig.w / 2 < m.bw / 3, JSON.stringify(fig));
  assert.deepEqual(errs, []);
});
