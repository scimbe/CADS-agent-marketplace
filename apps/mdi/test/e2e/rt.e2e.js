// Echtzeit-Buehne und Widgets im Browser (ADR 0001 b/c): Canvas zeichnet, Countdown/Pause/Tastatur/Achsenknoepfe,
// Verstecken pausiert, reduzierte Bewegung, axe ohne Verstoesse, kein Ueberlauf, keine CSP-Verstoesse.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, VIEWS, axe, noOverflow } from "./lib/grund.mjs";
import { harnessPage } from "./lib/harness.mjs";

let b, rtUrl, wUrl;
test.before(async () => { b = await browser(); rtUrl = await harnessPage("test/e2e/lib/rt-page.js"); wUrl = await harnessPage("test/e2e/lib/widget-page.js"); });
test.after(async () => { await b.close(); });
async function openPage(url, { view = "phone390", reduced = false, scheme = "light" } = {}) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: "de-DE", reducedMotion: reduced ? "reduce" : "no-preference", colorScheme: scheme });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e)); p.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
  await p.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSP " + e.violatedDirective)));
  await p.goto(url);
  return { p, errs, ctx };
}

for (const view of ["phone360", "desk1280"]) {
  test("Echtzeit-Buehne " + view + ": Countdown, Spiel, Tastatur, Pause beim Verstecken, Ende", async () => {
    const { p, errs } = await openPage(rtUrl + "?mode=bot", { view });
    await p.locator(".rt-canvas").waitFor();
    assert.match(await p.locator(".rt-say").textContent(), /Gleich geht's los/);
    await p.waitForFunction(() => window.__rt.phase === "run", null, { timeout: 8000 });
    const painted = await p.evaluate(() => { const c = document.querySelector(".rt-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4000) s.add(d[i] + "," + d[i + 1] + "," + d[i + 2]); return s.size; });
    assert.ok(painted > 2, "Canvas gezeichnet (" + painted + " Farben)");
    const t0 = await p.evaluate(() => window.__rt.tick);
    await p.keyboard.down("ArrowLeft"); await p.waitForTimeout(300); await p.keyboard.up("ArrowLeft");
    assert.ok(await p.evaluate(() => window.__rt.tick) > t0, "Tick laeuft");
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForFunction(() => window.__rt.phase === "pause");
    const tp = await p.evaluate(() => window.__rt.tick); await p.waitForTimeout(400);
    assert.equal(await p.evaluate(() => window.__rt.tick), tp, "Pause haelt die Zeit an");
    assert.equal(await p.locator(".rt-pause").getAttribute("aria-pressed"), "true");
    await p.locator(".rt-pause").click(); await p.waitForFunction(() => window.__rt.phase === "run");
    assert.equal(await p.locator('.rt-axis[aria-label="Links"]').count(), 1, "Achse als echter Knopf");
    assert.equal(await p.locator(".rt-hud .rt-sound").getAttribute("aria-pressed"), "false");
    await p.locator(".rt-hud .rt-sound").click();
    assert.equal(await p.locator(".rt-hud .rt-sound").getAttribute("aria-pressed"), "true", "Ton aus im HUD");
    assert.deepEqual(await axe(p, "rt-" + view), []);
    assert.ok(await noOverflow(p));
    assert.deepEqual(errs, []);
  });
}

test("Echtzeit-Buehne mit reduzierter Bewegung und dunklem Schema: axe, keine Fehler", async () => {
  const { p, errs } = await openPage(rtUrl, { reduced: true, scheme: "dark" });
  await p.waitForFunction(() => window.__rt.phase === "run", null, { timeout: 8000 });
  assert.deepEqual(await axe(p, "rt-reduced"), []);
  assert.deepEqual(errs, []);
});

for (const view of ["phone360", "phone412", "desk1280"]) {
  test("Widgets " + view + ": axe ohne Verstoesse, kein Ueberlauf, Tastatur waehlt und sendet, grosse Schrift", async () => {
    const { p, errs } = await openPage(wUrl, { view });
    await p.locator(".w-pick").waitFor();
    assert.deepEqual(await axe(p, "widgets-" + view), []);
    assert.ok(await noOverflow(p), "kein waagerechter Ueberlauf");
    await p.locator(".w-pick .opt").first().focus(); await p.keyboard.press("Enter");
    await p.locator(".w-pick .opt").nth(1).focus(); await p.keyboard.press("Enter");
    await p.locator(".w-pick .w-go").click();
    assert.deepEqual(await p.evaluate(() => window.__sent[0]), { t: "answer", seat: 0, a: [0, 1] });
    await p.evaluate(() => document.documentElement.style.setProperty("font-size", "137.5%"));
    assert.ok(await noOverflow(p), "grosse Schrift ohne Ueberlauf");
    // WCAG 2.2 AA 2.5.8: Ziele mindestens 24×24 px (das 16-Schritt-Raster scrollt dafuer innerhalb des Widgets)
    const small = await p.evaluate(() => [...document.querySelectorAll(".opt, .chip, .bcell, .btn")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).map((e) => e.className));
    assert.deepEqual(small, [], "Ziele >= 24 px");
    assert.deepEqual(errs, []);
  });
}
