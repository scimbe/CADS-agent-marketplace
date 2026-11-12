// Arcade: eigenes Foto auf der Leinwand (aus arcade.e2e.js ausgelagert, Zeitlimit 300 s je Datei im Runner).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { browser, VIEWS, axe, noOverflow } from "./lib/grund.mjs";
import { stagePage } from "./lib/arcade-stage.mjs";

const IDS = ["arcade-kick", "arcade-elfer", "arcade-ziegel", "arcade-panzer", "arcade-stock", "arcade-puck", "arcade-volley", "arcade-flipper", "arcade-snow", "arcade-murmel"];
async function openStage(b, o, view = "phone390", reduced = false) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: "de-DE", reducedMotion: reduced ? "reduce" : "no-preference" });
  ctx.setDefaultTimeout(30000);
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e)); p.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
  await p.goto(await stagePage());
  await p.evaluate((o) => globalThis.ARC.boot(o), o);
  await p.locator("canvas.rt-canvas").waitFor();
  return { ctx, p, errs };
}
// Eigenes Foto (Feldtyp media.local, Strang H): Parameterwert "local:<id>" -> die Karte zeichnet {kind:"local", id}, der
// Bilddienst liefert das Foto dieses Geraets. Pixelprobe: das Testbild (Magenta #ff00aa mit gruener Mitte) ist auf der
// Leinwand, als Figur und als Hintergrund, in allen zehn Spielen; ohne Foto kommt die Farbe nicht vor.
test("Eigenes Foto als Figur und als Hintergrund: in allen zehn Spielen auf der Leinwand (Pixelprobe)", async () => {
  const b = await browser(), ID = "0123456789abcdef".repeat(2), bad = [], tint = {};
  try {
    for (const id of IDS) for (const use of ["figure", "bg", "off"]) {
      const { ctx, p, errs } = await openStage(b, { card: id, mode: "bot", seed: "foto", fast: 0, photoId: ID, params: { photo: "local:" + ID, photoUse: use } });
      await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 });
      await p.waitForTimeout(400);
      const n = await p.evaluate(() => {
        const c = document.querySelector("canvas.rt-canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0, m = 0;
        let t = 0;   // Farbstich: Rot und Blau deutlich ueber Gruen (das Testbild unter der Abdunklung)
        for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - 255) < 12 && d[i + 1] < 14 && Math.abs(d[i + 2] - 170) < 14) k++; if (d[i] < 20 && d[i + 1] > 235 && Math.abs(d[i + 2] - 170) < 14) m++; t += Math.max(0, Math.min(d[i], d[i + 2]) - d[i + 1]); }
        return { magenta: k, gruen: m, tint: Math.round(t / (d.length / 4)), unknown: globalThis.__arc.unknown.slice(0, 3) };
      });
      // Figur: die reinen Farben des Testbilds; Hintergrund (alpha 0,45, abgedunkelt): mittlerer Farbstich deutlich ueber
      // demselben Spiel ohne Foto (Reihenfolge der Schleife: figure, bg, off).
      if (use === "figure" && n.magenta < 15) bad.push(id + " Figur: " + JSON.stringify(n));
      if (use === "off" && (n.magenta > 0 || n.gruen > 0)) bad.push(id + " ohne Foto: " + JSON.stringify(n));
      tint[id + "|" + use] = n.tint;
      if (use === "off" && !(tint[id + "|bg"] >= n.tint + 8)) bad.push(id + " Hintergrund: Farbstich " + tint[id + "|bg"] + " gegen " + n.tint + " ohne Foto");
      if (n.unknown.length) bad.push(id + " " + use + ": " + n.unknown.join(","));
      assert.deepEqual(errs, [], id + " " + use);
      await ctx.close();
    }
    assert.deepEqual(bad, []);
  } finally { await b.close(); }
});
