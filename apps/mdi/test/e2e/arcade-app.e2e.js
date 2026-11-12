// Arcade in der App: Regal -> Karte -> Los (gegen den Computer) fuer alle zehn Duelle, auf der echten Buehne der App.
// Insel-Panzer bis zum Ende wie alt test/e2e/arcade.e2e.js ("standing still, the bot wins 3:0"). Dazu Verdeckung,
// Ueberlauf und axe der Spielansicht auf vier Ansichten.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, screen, waitScreen, axe, noOverflow, VIEWS, act } from "./lib/grund.mjs";

const IDS = ["arcade-kick", "arcade-elfer", "arcade-ziegel", "arcade-panzer", "arcade-stock", "arcade-puck", "arcade-volley", "arcade-flipper", "arcade-snow", "arcade-murmel"];
async function startBot(p, id) {
  await act(p, "open-" + id);
  await waitScreen(p, "card-view");
  await p.locator('[data-act="go"]').first().click();
  await waitScreen(p, "card-rt-ready");
  await p.locator("canvas.rt-canvas").waitFor();
  await waitScreen(p, "card-rt-run", 8000);
}

test("Regal -> Karte -> gegen den Computer: alle zehn Duelle starten, zeichnen, nehmen Tasten ohne Fehler an", async () => {
  const b = await browser();
  try {
    for (const id of IDS) {
      const { ctx, p, errs } = await open(b, { view: "phone390" });
      await startBot(p, id);
      await p.locator("canvas.rt-canvas").focus();
      for (const k of ["ArrowLeft", "ArrowUp", "Space", "ArrowRight"]) { await p.keyboard.down(k); await p.waitForTimeout(120); await p.keyboard.up(k); }
      await p.waitForTimeout(1500);
      const say = await p.locator(".rt-say").textContent(), label = await p.locator("canvas.rt-canvas").getAttribute("aria-label");
      assert.match(say, /Du \d : \d Bot/, id + ": Stand per aria-live");
      assert.match(label, /\d : \d/, id + ": Leinwand beschriftet");
      assert.ok(["card-rt-run", "card-rt-over"].includes(await screen(p)), id);
      assert.deepEqual(errs, [], id);
      await ctx.close();
    }
  } finally { await b.close(); }
});

test("Insel-Panzer in der App bis zum Ende: wer stillsteht, verliert 0:3 gegen den Bot", async () => {
  const b = await browser();
  try {
    const { ctx, p, errs } = await open(b, { view: "phone390" });
    await startBot(p, "arcade-panzer");
    await waitScreen(p, "card-rt-over", 150000);
    assert.match(await p.locator("main").innerText(), /0\s*:\s*3|Knapp/);
    assert.deepEqual(errs, []); await ctx.close();
  } finally { await b.close(); }
});

test("Spielansicht: Leinwand im ersten Bildschirm, nichts verdeckt, kein Ueberlauf, axe ohne Verstoesse (360, 390, 412, 1280)", async () => {
  const b = await browser(), found = [];
  try {
    for (const view of ["phone360", "phone390", "phone412", "desk1280"]) for (const id of ["arcade-flipper", "arcade-panzer"]) {
      const { ctx, p, errs } = await open(b, { view });
      await startBot(p, id);
      const r = await p.locator("canvas.rt-canvas").boundingBox(), vp = VIEWS[view].viewport;
      assert.ok(r.y >= 0 && r.y + r.height <= vp.height + 1 && r.x >= 0 && r.x + r.width <= vp.width + 1, id + " " + view + ": Leinwand ganz sichtbar " + JSON.stringify(r));
      assert.ok(await noOverflow(p), id + " " + view);
      const covered = await p.evaluate(() => [...document.querySelectorAll("canvas.rt-canvas, .rt-btn, header button")].filter((e) => { const q = e.getBoundingClientRect(); if (!q.width) return false; const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(t === e || e.contains(t)); }).map((e) => e.className || e.tagName));
      assert.deepEqual(covered, [], id + " " + view + ": nichts verdeckt");
      found.push(...(await axe(p, id + " " + view)));
      assert.deepEqual(errs, []); await ctx.close();
    }
    assert.deepEqual(found, []);
  } finally { await b.close(); }
});
