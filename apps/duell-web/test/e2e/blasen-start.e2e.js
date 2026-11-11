"use strict";
// Bubbles on the first page (src/blasen-start.js in the part blasen): on the day's card and on "Erschaffe deine Karte",
// on a 390x844 phone. The part comes only after the first paint; no bubble lies on a word or a button of the card; a
// drag moves one and the place survives a reload (this device only); a tap opens the matching sheet at once.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
let b, url;
test.before(async () => { b = await G.launch(); url = await G.webUrl("index.html"); });
test.after(async () => { await b.close(); });

const meets = (a, c) => a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y;
// the bubbles and every word and button they must leave free (page px)
const look = (p) => p.evaluate(() => {
  const r = (e) => { const q = e.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; }, free = [];
  for (const box of [document.getElementById("leaf"), document.getElementById("create")]) {
    const tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), rg = document.createRange(); let n;
    while ((n = tw.nextNode())) { if (!n.nodeValue.trim() || n.parentNode.closest(".hblasen")) continue; rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width) free.push({ what: n.nodeValue.trim().slice(0, 20), x: q.left + 1, y: q.top + 1, w: q.width - 2, h: q.height - 2 }); }
  }
  document.querySelectorAll("#leaf button, #leaf canvas").forEach((e) => { if (!e.closest(".hblasen") && e.offsetParent) free.push(Object.assign({ what: e.id || e.className }, r(e))); });
  return { bubbles: [...document.querySelectorAll(".hblasen .blase")].filter((e) => !e.hidden).map((e) => Object.assign(r(e), { id: e.dataset.blase, tab: e.dataset.tab, focus: e.dataset.focus, round: getComputedStyle(e).borderRadius })), free };
});
async function phone(ctx0) {
  const ctx = ctx0 || await G.person(b, { view: "phone390", web: true }), p = await ctx.newPage(), errs = [];
  // when the first frame was painted and when the part blasen was asked for (its script tag)
  await p.addInitScript(() => {
    requestAnimationFrame(() => setTimeout(() => { window.__frame = performance.now(); }, 0));
    new MutationObserver((l) => l.forEach((m) => m.addedNodes.forEach((n) => { if (n.tagName === "SCRIPT" && /blasen\./.test(n.src || "") && !window.__blasen) window.__blasen = performance.now(); }))).observe(document, { childList: true, subtree: true });
  });
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.clock.setFixedTime(new Date("2026-11-11T09:00:00Z"));   // a day whose card is a photo meme (Beweisfoto: Alien)
  await p.goto(url);
  await p.locator("#hblasenday .blase").first().waitFor({ timeout: 15000 });
  await p.locator("#hblasenfree .blase").first().waitFor();
  await p.waitForTimeout(400);
  return { p, errs, ctx };
}
async function tap(p, id) { const q = await p.locator(`.hblasen .blase[data-blase="${id}"]`).boundingBox(); await p.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2); }

test("Erste Seite: Blasen auf der Tageskarte und der freien Karte, nach dem ersten Bild geladen, nie auf Worten oder Knoepfen", async () => {
  const { p, errs, ctx } = await phone();
  const m = await look(p);
  assert.deepEqual(m.bubbles.map((x) => x.id).sort(), ["day:farbe", "day:look", "day:titel", "free:genre", "free:satz"]);
  m.bubbles.forEach((x) => {
    assert.match(x.round, /50%|px/, x.id + " rund");
    m.free.forEach((f) => assert.ok(!meets(x, f), x.id + " liegt auf " + f.what + " " + JSON.stringify(f)));
  });
  // the part came after the first paint: its request starts after first-contentful-paint
  const t = await p.evaluate(() => ({ frame: window.__frame, bl: window.__blasen }));
  assert.ok(t.frame > 0 && t.bl > t.frame, "blasen erst nach dem ersten Bild: " + JSON.stringify(t));
  if (process.env.BLASEN_SHOT) await p.screenshot({ path: process.env.BLASEN_SHOT + "-start.png" });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Ziehen verschiebt eine Blase, der Platz bleibt nach dem Neuladen (nur auf diesem Geraet); Tipp oeffnet das passende Blatt", async () => {
  const { p, errs, ctx } = await phone();
  const a = (await look(p)).bubbles.find((x) => x.id === "day:look");
  await p.mouse.move(a.x + a.w / 2, a.y + a.h / 2); await p.mouse.down(); await p.mouse.move(a.x + a.w / 2 - 20, a.y + a.h / 2 + 70, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(300);   // the bubble settles back to its size
  const a2 = (await look(p)).bubbles.find((x) => x.id === "day:look");
  assert.ok(a2.y - a.y > 50, "verschoben " + a.y + " -> " + a2.y);
  assert.equal(await p.locator("#editor").isHidden(), true, "Ziehen oeffnet nichts");
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem("daily.blasen.start"))["day:look"]);
  assert.ok(kept && kept.y > 0, "gemerkt: " + JSON.stringify(kept));
  await p.reload(); await p.locator("#hblasenday .blase").first().waitFor({ timeout: 15000 }); await p.waitForTimeout(400);
  const a3 = (await look(p)).bubbles.find((x) => x.id === "day:look");
  const mid = (q) => [q.x + q.w / 2, q.y + q.h / 2];
  assert.ok(Math.hypot(mid(a3)[0] - mid(a2)[0], mid(a3)[1] - mid(a2)[1]) < 3, "nach dem Neuladen am selben Platz: " + JSON.stringify([a2, a3]));
  // tap: the title opens the editor on the text sheet of this card (a photo meme: Text), the look on its style
  await tap(p, "day:titel");
  await p.waitForFunction(() => { const t = document.getElementById("tabText"); return t && t.getAttribute("aria-selected") === "true"; });
  assert.equal(await p.locator("#editor").isVisible(), true);
  await p.locator("#edback").click(); await p.locator("#hblasenday .blase").first().waitFor();
  await tap(p, "day:look");
  await p.waitForFunction(() => { const t = document.getElementById("tabStyle"); return t && t.getAttribute("aria-selected") === "true"; });
  await p.locator("#edback").click(); await p.locator("#hblasenfree .blase").first().waitFor(); await p.waitForTimeout(300);
  // the free card: the sentence bubble opens its making, asked to start at the sentence
  await tap(p, "free:satz");
  await p.waitForFunction(() => document.getElementById("shtitle").textContent === "Deine eigene Karte" && window.CreateUI && window.CreateUI.asked === "text");
  assert.deepEqual(errs, []);
  await ctx.close();
});
