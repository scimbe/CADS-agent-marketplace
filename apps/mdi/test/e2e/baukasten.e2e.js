// Strang B: Baukasten-Karten im Browser. Echtzeit (Flappy, Breakout, Snake, Reaktion): Canvas zeichnet, Tick laeuft, die
// Partie endet gegen den Bot; Zug (Drei gewinnt, Memory, Quiz): der echte Renderer zeigt das Brett, ein Tippen ist ein Zug.
// Je Ansicht axe (WCAG 2.2 AA) ohne Verstoesse, kein waagerechter Ueberlauf, keine CSP-Verstoesse, keine Seitenfehler.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, VIEWS, axe, noOverflow } from "./lib/grund.mjs";
import { harnessPage } from "./lib/harness.mjs";

let b, url;
test.before(async () => { b = await browser(); url = await harnessPage("test/e2e/lib/bau-page.js"); });
test.after(async () => { await b.close(); });
async function openPage(q, { view = "phone390", reduced = false, scheme = "light" } = {}) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: "de-DE", reducedMotion: reduced ? "reduce" : "no-preference", colorScheme: scheme });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e)); p.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
  await p.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSP " + e.violatedDirective)));
  await p.goto(url + "?" + q);
  return { p, errs, ctx };
}

for (const ex of ["flappy", "breakout", "snake", "reaktion"]) for (const view of ["phone360", "desk1280"]) {
  test("Baukasten Echtzeit " + ex + " " + view + ": zeichnet, laeuft, axe 0, kein Ueberlauf", async () => {
    const { p, errs, ctx } = await openPage("ex=" + ex + "&mode=bot", { view });
    await p.locator(".rt-canvas").waitFor();
    await p.waitForFunction(() => window.__bau.phase === "run", null, { timeout: 10000 });
    const t0 = await p.evaluate(() => window.__bau.tick);
    await p.keyboard.press("Space"); await p.keyboard.down("ArrowLeft"); await p.waitForTimeout(400); await p.keyboard.up("ArrowLeft");
    assert.ok(await p.evaluate(() => window.__bau.tick) > t0, "Tick laeuft");
    const painted = await p.evaluate(() => { const c = document.querySelector(".rt-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4000) s.add(d[i] + "," + d[i + 1] + "," + d[i + 2]); return s.size; });
    assert.ok(painted > 2, "Canvas gezeichnet (" + painted + " Farben)");
    assert.equal(await p.locator(".rt-canvas").getAttribute("role"), "img");
    assert.deepEqual(await axe(p, ex + " " + view), []);
    assert.ok(await noOverflow(p));
    assert.deepEqual(errs, []);
    await ctx.close();
  });
}

test("Baukasten Echtzeit: Bot-Partie (Reaktion, Bot tippt fuer Sitz 0 nicht) endet von selbst und meldet das Ende", async () => {
  const { p, errs, ctx } = await openPage("ex=reaktion&mode=bot", { view: "phone390", reduced: true });
  await p.waitForFunction(() => window.__bau.phase === "over", null, { timeout: 45000 });
  assert.equal((await p.evaluate(() => window.__bau.status())).over, true);
  assert.deepEqual(errs, []);
  await ctx.close();
});

for (const [ex, cells] of [["drei", 9], ["memory", 16], ["quiz", 0]]) for (const view of ["phone360", "phone412", "desk1280"]) {
  test("Baukasten Zug " + ex + " " + view + ": Brett sichtbar, Zug per Tippen, axe 0, kein Ueberlauf", async () => {
    const { p, errs, ctx } = await openPage("ex=" + ex, { view, scheme: view === "phone412" ? "dark" : "light" });
    const opts = p.locator(".opt");
    await opts.first().waitFor();
    if (cells) assert.equal(await opts.count(), cells, "alle Felder sichtbar");
    const before = await p.evaluate(() => JSON.stringify(window.__bau.status()));
    await opts.first().click();
    if (ex === "memory") await opts.nth(1).click();
    await p.waitForTimeout(100);
    assert.notEqual(await p.evaluate(() => JSON.stringify(window.__bau.status())), before, "Zug angewandt");
    assert.equal(await p.evaluate(() => window.__bau.err), "");
    assert.deepEqual(await axe(p, ex + " " + view), []);
    assert.ok(await noOverflow(p));
    assert.deepEqual(errs, []);
    await ctx.close();
  });
}
