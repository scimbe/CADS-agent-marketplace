"use strict";
// Meine Wand (Nutzerbericht 11.11.): ein Bild von der Wand nehmen (Grossansicht und Raster, 6 s Rueckgaengig), die
// Grossansicht schliesst mit ✕ und mit Zurueck auf die Wand an derselben Stelle, dieselbe Karte zweimal fertig = ein Eintrag.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const SHOTS = process.env.WAND_SHOTS || "";

test("Wand: kein Doppel beim zweiten Fertig, Grossansicht zurueck zur Wand (✕ und Zurueck), Wegnehmen mit Rueckgaengig, bleibt nach Neuladen weg", async () => {
  const b = await G.launch();
  const ctx = await G.person(b, { view: "phone390", web: true }), p = await G.open(ctx, "#i=warm-toll");
  const shot = (n) => SHOTS ? p.screenshot({ path: SHOTS + "/" + n + ".png" }) : null;
  const wall = () => p.evaluate(() => window.DailyDebug.wall().map((e) => e.ts));
  const state = () => p.evaluate(() => document.body.getAttribute("data-state"));
  // The same feel-good card finished twice: one entry.
  for (let k = 0; k < 2; k++) {
    await p.locator("#go").click(); await p.locator("#done").waitFor();
    await p.locator("#dback").click(); await p.locator("#home").waitFor();
  }
  assert.equal((await wall()).length, 1, "dieselbe Karte zweimal fertig ist ein Eintrag");
  // 23 more pictures, each different, so the grid scrolls.
  await p.evaluate(() => {
    const out = [];
    for (let i = 0; i < 23; i++) {
      const c = document.createElement("canvas"); c.width = 40; c.height = 50; const x = c.getContext("2d");
      x.fillStyle = "hsl(" + i * 15 + ",80%,55%)"; x.fillRect(0, 0, 40, 50); x.fillStyle = "#000"; x.fillText(String(i), 14, 30);
      out.push({ id: "own", ts: 1000 + i, th: c.toDataURL("image/jpeg", 0.8), k: "card" });
    }
    window.Kit.store.wall = window.Kit.store.wall.concat(out); window.Kit.save();
  });
  await p.reload(); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  assert.equal((await wall()).length, 24);
  await p.locator("#wall").click();
  await p.getByRole("tab", { name: "Meine Wand" }).and(p.locator("[aria-selected=true]")).waitFor();
  const cells = p.locator(".wallgrid .invcell > button:first-child");
  assert.equal(await cells.count(), 24);
  assert.equal(await p.getByRole("button", { name: "Von der Wand nehmen", exact: true }).count(), 24, "jedes Bild hat sein ✕ im Raster");
  await p.evaluate(() => { document.getElementById("shbody").scrollTop = 300; });
  const y = await p.evaluate(() => document.getElementById("shbody").scrollTop);
  assert.ok(y > 200, "das Raster scrollt: " + y);
  await shot("1-wand");
  // Large view, closed with ✕: the wall again, same tab, same place.
  await cells.nth(10).click();
  await p.locator("#shbody img.big").waitFor();
  await p.getByRole("button", { name: "✕ Von der Wand nehmen" }).waitFor();
  await shot("2-grossansicht");
  await p.locator("#shback").click();
  await cells.first().waitFor();
  assert.equal(await state(), "shelf", "✕ fuehrt zur Wand, nicht zur Startseite");
  assert.equal(await p.evaluate(() => document.getElementById("shbody").scrollTop), y, "dieselbe Stelle");
  await p.getByRole("tab", { name: "Meine Wand" }).and(p.locator("[aria-selected=true]")).waitFor();
  // The same with the phone's Back.
  await cells.nth(10).click(); await p.locator("#shbody img.big").waitFor();
  await p.evaluate(() => history.back());
  await cells.first().waitFor();
  assert.equal(await state(), "shelf", "Zurueck fuehrt zur Wand");
  assert.equal(await p.evaluate(() => document.getElementById("shbody").scrollTop), y);
  // Taking a picture off in the large view, then undoing it: back in its place.
  const before = await wall(), off = before[10];
  await cells.nth(10).click(); await p.locator("#shbody img.big").waitFor();
  await p.getByRole("button", { name: "✕ Von der Wand nehmen" }).click();
  await p.getByRole("status").filter({ hasText: "Von der Wand genommen" }).waitFor();
  assert.equal(await state(), "shelf");
  assert.equal(await cells.count(), 23); assert.ok(!(await wall()).includes(off));
  await shot("3-rueckgaengig");
  await p.getByRole("button", { name: "↶ Rückgängig" }).click();
  assert.deepEqual(await wall(), before, "Rueckgaengig legt es an dieselbe Stelle zurueck");
  assert.equal(await cells.count(), 24);
  // Taking one off in the grid; after 6 s the offer is gone, and after a reload the picture too.
  const gone = before[3];
  await p.getByRole("button", { name: "Von der Wand nehmen", exact: true }).nth(3).click();
  assert.ok(!(await wall()).includes(gone));
  await p.getByRole("button", { name: "↶ Rückgängig" }).waitFor();
  await p.getByRole("button", { name: "↶ Rückgängig" }).waitFor({ state: "detached", timeout: 9000 });
  await p.reload(); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  const after = await wall();
  assert.equal(after.length, 23); assert.ok(!after.includes(gone), "bleibt nach Neuladen weg");
  // Closing the wall itself still goes home.
  await p.locator("#wall").click(); await cells.first().waitFor(); await p.locator("#shback").click();
  await p.locator("#home").waitFor();
  assert.deepEqual(p.errs, []);
  await b.close();
});
