// Karte mit Foto als Bild teilen (Entscheidung Integrator "Foto mitschicken"; Strang H Teilen-Blatt, Strang P cardImage):
// Foto im Editor waehlen -> Teilen-Blatt bietet "Mit Foto als Bild teilen" -> PNG (hier Download, kein System-Teilen im Test)
// mit dem Foto darin (Pixelprobe Magenta); der Link bleibt ohne Foto. Ohne Foto kein Knopf.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { browser, open, act, axe } from "./lib/grund.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

async function magentaPng() {
  const p = await b.newPage();
  const b64 = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#ff00aa"; g.fillRect(0, 0, 64, 64); return c.toDataURL("image/png").split(",")[1]; });
  await p.close();
  return Buffer.from(b64, "base64");
}

test("advent-tuer: ohne Foto kein Bild-Knopf; mit Foto PNG mit dem Foto, Link ohne Foto, axe 0", async () => {
  const { p, errs } = await open(b, { view: "phone390" });
  await act(p, "open-advent-tuer"); await p.locator("main.s-card-view").waitFor();
  await act(p, "go"); await p.locator("main.s-card-share").waitFor();
  assert.equal(await p.locator('[data-act="share-image"]').count(), 0, "ohne Foto kein Knopf");
  await act(p, "done"); await p.locator("main.s-card-view").waitFor();

  await act(p, "customize"); await p.locator("main.s-card-customize-bubbles").waitFor();
  await p.locator('.bubble[data-for="foto"]').click(); await p.locator("#dialog").waitFor();
  await p.locator("#dialog input[type=file]").setInputFiles({ name: "ich.png", mimeType: "image/png", buffer: await magentaPng() });
  await p.locator("#dialog .ef-photo [role=status]").waitFor();
  await p.keyboard.press("Escape"); await p.locator("#dialog").waitFor({ state: "detached" });
  await act(p, "done"); await p.locator("main.s-card-view").waitFor();
  await act(p, "go"); await p.locator("main.s-card-share").waitFor();

  const link = await p.evaluate(() => (document.querySelector("main input[readonly], main .link-text, main a[href*='#']") || {}).value || document.querySelector("main").innerText);
  assert.ok(!/local:|[0-9a-f]{32}/.test(link), "Foto-id nie im Link");
  const btn = p.locator('[data-act="share-image"]');
  await btn.waitFor();
  assert.deepEqual(await axe(p, "bild-teilen"), []);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }), btn.click()]);
  assert.match(dl.suggestedFilename(), /\.png$/);
  const buf = fs.readFileSync(await dl.path());
  assert.equal(buf.subarray(1, 4).toString(), "PNG");
  const hits = await p.evaluate(async (b64) => {
    const bmp = new Image(); bmp.src = "data:image/png;base64," + b64; await bmp.decode();
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) if (d[i] > 100 && d[i + 1] < 50 && d[i + 2] > 60) n++;
    return { n, w: bmp.width, h: bmp.height };
  }, buf.toString("base64"));
  assert.ok(hits.n > 50, "Foto im Bild: " + JSON.stringify(hits));
  assert.deepEqual(errs, []);
});
