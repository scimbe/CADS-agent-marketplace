// Barrierefreiheit: axe (WCAG 2.2 AA) in allen D0-Zustaenden; Dialog mit Fokusfalle, Escape, Fokus-Rueckgabe;
// reduzierte Bewegung; kein waagerechter Ueberlauf; keine CSP-Verstoesse.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, noOverflow } from "./lib/grund.mjs";
import { visitAll } from "./lib/states.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

for (const o of [{ view: "phone390", lang: "de", scheme: "light" }, { view: "phone390", lang: "en", scheme: "dark" }, { view: "desk1280", lang: "en", scheme: "dark" }]) {
  test("axe ohne Verstoesse, kein Ueberlauf: " + o.view + "/" + o.lang + "/" + o.scheme, async () => {
    const found = [], over = [];
    const errs = await visitAll(b, o, async (name, p) => { found.push(...(await axe(p, name))); if (!(await noOverflow(p))) over.push(name); });
    assert.deepEqual(found, []);
    assert.deepEqual(over, [], "waagerechter Ueberlauf");
    assert.deepEqual(errs, [], "Seitenfehler oder CSP-Verstoss");
  });
}

test("Dialog: waechst aus der Blase, Fokusfalle, Escape schliesst, Fokus kehrt zur Blase zurueck", async () => {
  const { p, errs } = await open(b, { view: "phone390" });
  await act(p, "open-gruss"); await act(p, "customize");
  const bubble = p.locator('.bubble[data-for="farbe"]');
  await bubble.focus(); await p.keyboard.press("Enter");
  await p.locator("#dialog").waitFor();
  assert.equal(await p.locator("#dialog").getAttribute("aria-modal"), "true");
  const anim = await p.evaluate(() => document.querySelector("#dialog").getAnimations().map((a) => a.effect.getKeyframes().map((k) => k.transform || "")));
  assert.ok(anim.flat().some((t) => /translate|scale/.test(t)), "FLIP-Animation aus der Blase: " + JSON.stringify(anim));
  for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); assert.ok(await p.evaluate(() => document.querySelector("#dialog").contains(document.activeElement)), "Fokus bleibt im Dialog"); }
  await p.keyboard.press("Shift+Tab");
  assert.ok(await p.evaluate(() => document.querySelector("#dialog").contains(document.activeElement)));
  await p.keyboard.press("Escape");
  await p.locator("#dialog").waitFor({ state: "detached" });
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.dataset.for), "farbe");
  assert.deepEqual(errs, []);
});

test("Reduzierte Bewegung: Dialog nur mit Blende, ohne Verschieben/Skalieren", async () => {
  const { p } = await open(b, { view: "phone390", reduced: true });
  await act(p, "open-gruss"); await act(p, "customize"); await p.locator('.bubble[data-for="titel"]').click();
  await p.locator("#dialog").waitFor();
  const anim = await p.evaluate(() => document.querySelector("#dialog").getAnimations().map((a) => a.effect.getKeyframes()));
  assert.ok(anim.flat().every((k) => !k.transform || k.transform === "none"), JSON.stringify(anim));
});

test("System-Zurueck (Browser-Verlauf) folgt der Statechart: Dialog -> Blasen -> Karte -> Regal", async () => {
  const { p } = await open(b, { view: "phone390" });
  await act(p, "open-gruss"); await act(p, "customize"); await p.locator('.bubble[data-for="text"]').click(); await p.locator("#dialog").waitFor();
  await p.goBack(); await p.locator("main.s-card-customize-bubbles").waitFor();
  await p.goBack(); await p.locator("main.s-card-view").waitFor();
  await p.goBack(); await p.locator("main.s-shelf").waitFor();
});
