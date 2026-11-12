// Startansicht mit Level (Board GFlugStart, Canvas v54): -/+ aendern die Stufe und den Stufennamen, die Vorlesehilfe nennt
// die Stufe; Varianten-Chips (Manifest chip) wechseln die Variante; axe 0 hell und dunkel; Lauf zeigt nur Regler.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe } from "./lib/grund.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

for (const scheme of ["light", "dark"]) test("Flug Startansicht " + scheme + ": Regler -/+ mit Stufennamen, Chips wechseln die Variante, axe 0", async () => {
  const { p, errs } = await open(b, { view: "phone390", scheme });
  await act(p, "open-flug"); await p.locator("main.s-card-view").waitFor(); await p.locator(".lv-box").waitFor();
  const r = p.locator("#lv-gravity"), before = await r.getAttribute("aria-valuetext");
  const plus = p.locator('[data-act="lv-plus-gravity"]'), minus = p.locator('[data-act="lv-minus-gravity"]');
  assert.ok((await plus.boundingBox()).height >= 48 && (await minus.boundingBox()).width >= 48, "-/+ mindestens 48 px");
  await ((await plus.isDisabled()) ? minus : plus).click();
  assert.notEqual(await r.getAttribute("aria-valuetext"), before, "Stufe gewechselt");
  assert.deepEqual(await p.locator(".lv-chips .chip").allInnerTexts(), ["Klassisch", "Mond", "Unterwasser", "Nacht"]);
  await p.locator('[data-act="lv-var-spiel-mond"]').click();
  await p.locator('[data-act="lv-var-spiel-mond"][aria-pressed="true"]').waitFor();
  assert.deepEqual(await axe(p, scheme + "/flug-start"), []);
  assert.deepEqual(errs, []);
});

test("Lauf Startansicht: keine Chips (keine Varianten)", async () => {
  const { p, errs } = await open(b, { view: "phone390" });
  await act(p, "open-lauf"); await p.locator("main.s-card-view").waitFor();
  assert.equal(await p.locator(".lv-chips").count(), 0);
  assert.deepEqual(errs, []);
});
