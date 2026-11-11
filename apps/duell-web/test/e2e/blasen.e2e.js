"use strict";
// The bubble layer (A3b of the plan "freie Karte", src/blasen-ebene.js in the part blasen): a flying game and a runner opened
// in "Selber bauen" on a 390x844 phone show one bubble per part (src/teile.js) plus the red wish bubble, each part bubble
// with a thread to its part; no bubble lies on the figure; a tap opens the matching sheet (the same as its tab); a drag only
// moves the bubble; the brush in the header hides them (then the tab bar is back); the keyboard's way with bubbles on is
// "Alle Einstellungen". The sheet opens as a dialog (blasen-dialog.e2e.js tests the dialog itself).
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const E = require("../../src/lauf-engine.js");
const LAUF = { k: "lauf", col: ["#ffd400", "#ff3b1d"], by: [], t: "Zweierrennen", l: E.build({ mode: "endlos", world: "bruecke", level: "normal", figure: "🦊", obstacle: "📦", coin: "🪙", foe: "🐦", has: ["hindernisse", "muenzen", "gegner"], foes: ["geh", "flug"] }, 12345) };
let b, url;
test.before(async () => { b = await G.launch(); url = await G.webUrl("index.html"); });
test.after(async () => { await b.close(); });

async function open(doc) {
  const ctx = await G.person(b, { view: "phone390" }); await ctx.addInitScript(() => localStorage.setItem("daily.blasen", "an")); const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  if (doc === "game") await p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('game', window.DailyApp.me(), 'de'), {own:true})");
  else await p.evaluate((d) => window.DailyApp.openEditor(d, { own: true }), doc);
  await p.locator("#blasen .blase").first().waitFor();
  await p.waitForTimeout(600);
  return { p, errs, ctx };
}
// the bubbles, the figure's rectangle (page px) and the threads' path
const look = (p) => p.evaluate(() => {
  const r = (e) => { const q = e.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; };
  const doc = window.DailyApp.ed().doc, box = document.getElementById(doc.k === "game" ? "gamestage" : "stage"), br = box.getBoundingClientRect();
  const fig = window.Teile.teile(doc).find((t) => t.id === "figur"), off = (t) => ({ id: t.id, x: t.x + br.left + box.clientLeft, y: t.y + br.top + box.clientTop, w: t.w, h: t.h });
  return {
    bubbles: Array.from(document.querySelectorAll("#blasen .blase")).map((e) => Object.assign(r(e), { id: e.dataset.blase, panel: e.dataset.blatt, label: e.textContent, aria: e.getAttribute("aria-label"), exp: e.getAttribute("aria-expanded"), shown: e.offsetParent !== null })),
    parts: window.Teile.teile(doc).map((t) => t.id),
    free: window.Teile.frei(doc).map(off).concat(window.Teile.teile(doc).filter((t) => window.Teile.TEXT.includes(t.id) && doc.k !== "game").map(off)),
    fig: fig && { x: fig.x + br.left + box.clientLeft, y: fig.y + br.top + box.clientTop, w: fig.w, h: fig.h },
    wrap: r(document.getElementById("stagewrap")), thread: document.querySelector("#blasen svg path").getAttribute("d"),
    tabs: Array.from(document.querySelectorAll("#tabs [role=tab]")).map((e) => e.dataset.k)
  };
});
const meets = (a, c) => a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y;
async function tapBubble(p, id) { const e = p.locator(`#blasen .blase[data-blase="${id}"]`), q = await e.boundingBox(); await p.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2); }
function common(m, game) {
  assert.ok(m.bubbles.length >= 3, "Blasen da: " + m.bubbles.map((x) => x.id));
  assert.ok(m.bubbles.some((x) => x.id === "wunsch"), "die rote Wunsch-Blase");
  m.bubbles.forEach((x) => {
    assert.ok(x.shown, x.id + " sichtbar");
    assert.ok(Math.abs(x.w - x.h) < 0.5 && x.w >= 56 && x.w <= 76, x.id + " rund, 56-76 px: " + x.w);
    assert.ok(x.x >= m.wrap.x - 0.5 && x.y >= m.wrap.y - 0.5 && x.x + x.w <= m.wrap.x + m.wrap.w + 0.5 && x.y + x.h <= m.wrap.y + m.wrap.h + 0.5, x.id + " im Bildbereich");
    // Magie / Mit KI (#225) are actions with their own label, not a tab: checked in blasen-dialog.e2e.js
    if (x.id !== "magie" && x.id !== "roboter") { assert.ok(m.tabs.includes(x.panel), x.id + ": " + x.panel + " ist ein Reiter"); assert.match(x.aria, /einstellen/); }
    // no word on the figure (in the flying game: not in the bird's column, it moves up and down)
    const f = game ? { x: m.fig.x, y: m.wrap.y, w: m.fig.w, h: m.wrap.h } : m.fig;
    assert.ok(!meets(x, f), x.id + " liegt nicht auf der Figur");
    m.free.forEach((r) => assert.ok(!meets(x, r), x.id + " liegt nicht auf " + r.id + " (Titelschrift, Name und Signet bleiben frei)"));
  });
  m.bubbles.forEach((x, i) => m.bubbles.slice(i + 1).forEach((y) => assert.ok(Math.hypot(x.x - y.x, x.y - y.y) >= x.w, x.id + " / " + y.id + " ueberdecken sich nicht")));
  assert.ok((m.thread.match(/M/g) || []).length >= m.bubbles.length - 2, "Faeden zu den Teilen: " + m.thread.slice(0, 80));
  assert.deepEqual(m.tabs.length >= 4, true, "Reiterleiste bleibt");
}

test("Flug: Blasen fuer Figur, Saeule, Himmel, Titel, Wunsch; Tipp auf Figur oeffnet das Figur-Blatt, Ziehen verschiebt nur", async () => {
  const { p, errs, ctx } = await open("game");
  await p.waitForFunction(() => document.querySelectorAll("#blasen .blase").length >= 5, null, { timeout: 8000 });
  const m = await look(p);
  assert.deepEqual(m.bubbles.map((x) => x.id).filter((x) => x !== "magie" && x !== "roboter").sort(), ["figur", "himmel", "saeule", "titel", "wunsch"]);   // Magie / Mit KI: blasen-dialog.e2e.js
  assert.deepEqual(Object.fromEntries(m.bubbles.filter((x) => x.id !== "magie" && x.id !== "roboter").map((x) => [x.id, x.panel])), { figur: "Figure", saeule: "Rules", himmel: "World", titel: "Text", wunsch: "Wish" });
  common(m, true);
  await tapBubble(p, "figur");
  await p.waitForFunction(() => document.getElementById("tabFigure").getAttribute("aria-selected") === "true");
  assert.ok(await p.locator("#panel .chip.em").count() > 3, "Figur-Blatt mit Emojis");
  await p.waitForTimeout(250);
  assert.equal(await p.locator('#blasen .blase[data-blase="figur"]').getAttribute("aria-expanded"), "true");
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  await tapBubble(p, "saeule");
  await p.waitForFunction(() => document.getElementById("tabRules").getAttribute("aria-selected") === "true");
  if (process.env.BLASEN_SHOT) await p.screenshot({ path: process.env.BLASEN_SHOT + "-flug.png" });
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  // drag: the bubble moves, the sheet stays
  const before = await p.locator('#blasen .blase[data-blase="titel"]').boundingBox();
  await p.mouse.move(before.x + 30, before.y + 30); await p.mouse.down(); await p.mouse.move(before.x + 30, before.y + 90, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(250);
  const after = await p.locator('#blasen .blase[data-blase="titel"]').boundingBox();
  assert.ok(after.y - before.y > 40, "verschoben: " + before.y + " -> " + after.y);
  assert.equal(await p.locator("#bdlg").isVisible(), false, "Ziehen oeffnet kein Blatt");
  // the brush in the header hides them (the tab bar comes back), and shows them again
  assert.equal(await p.locator("#tabs").isVisible(), false, "mit Blasen keine Reiterleiste");
  await p.locator("#blasenan").click();
  assert.equal(await p.locator("#blasen .blase").first().isVisible(), false);
  assert.equal(await p.locator("#blasenan").getAttribute("aria-pressed"), "true");
  assert.equal(await p.locator("#tabs").isVisible(), true, "ohne Blasen die Reiterleiste");
  await p.locator("#blasenan").click();
  assert.equal(await p.locator("#blasen .blase").first().isVisible(), true);
  // keyboard: Enter on a bubble opens its sheet; "Alle Einstellungen" opens the list, where the arrows move along the tabs
  await p.locator('#blasen .blase[data-blase="himmel"]').focus(); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.getElementById("tabWorld").getAttribute("aria-selected") === "true");
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  await p.locator("#ballset").focus(); await p.keyboard.press("Enter");
  await p.locator("#bdlg #tabs").waitFor();
  await p.locator("#bdlg #tabWorld").focus(); await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => document.getElementById("tabText").getAttribute("aria-selected") === "true");
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Lauf (Zweierrennen): je Teil eine Blase, Muenze oeffnet die Welt, Gegner die Figur, Titel den Text", async () => {
  const { p, errs, ctx } = await open(LAUF);
  const m = await look(p);
  assert.deepEqual(m.bubbles.map((x) => x.id).sort(), ["figur", "gegner", "hindernis", "muenze", "titel", "welt", "wunsch"]);
  common(m, false);
  assert.deepEqual(m.free.map((r) => r.id).sort(), ["signet", "titel"]);
  for (const [id, tab] of [["muenze", "LWorld"], ["gegner", "LFigure"], ["titel", "LText"], ["wunsch", "LWish"], ["figur", "LFigure"]]) {
    await tapBubble(p, id);
    await p.waitForFunction((t) => document.getElementById("tab" + t).getAttribute("aria-selected") === "true", tab);
    await p.waitForTimeout(150);
    assert.equal(await p.locator(`#blasen .blase[data-blase="${id}"]`).getAttribute("aria-expanded"), "true", id + " offen");
    if (process.env.BLASEN_SHOT && id === "figur") await p.screenshot({ path: process.env.BLASEN_SHOT + "-lauf.png" });
    await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  }
  // a change through the sheet the bubble opened reaches the card: the title
  await tapBubble(p, "titel");
  await p.locator("#panel input").fill("Brückenlauf");
  assert.equal(await p.evaluate(() => window.DailyApp.ed().doc.t), "Brückenlauf");
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Karte (A8): die gezeichnete Karte meldet ihre Teile, Blasen und Reiter stehen beide bereit", async () => {
  const { p, errs, ctx } = await (async () => {
    const ctx = await G.person(b, { view: "phone390" }); await ctx.addInitScript(() => localStorage.setItem("daily.blasen", "an")); const p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(url); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
    await p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('card', window.DailyApp.me(), 'de'), {own:true})");
    await p.locator("#tabs [role=tab]").first().waitFor({ state: "attached" }); await p.waitForTimeout(600);
    return { p, errs, ctx };
  })();
  assert.ok(await p.locator("#blasen .blase:visible").count() >= 3, "Text, Stil, Farbe (blasen-alle.e2e.js prueft alle Karten)");
  assert.ok(await p.locator("#tabs [role=tab]").count() >= 3);
  assert.deepEqual(errs, []);
  await ctx.close();
});
