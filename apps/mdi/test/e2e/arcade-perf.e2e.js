// Arcade-Messungen (aus arcade.e2e.js ausgelagert: das Zeitlimit des Runners ist 300 s je Datei).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { browser, VIEWS } from "./lib/grund.mjs";
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
// Bildrate auf einem Mittelklasse-Handy, nachgebildet als 4x gedrosselte CPU (Chromium):
// (a) Anteil der Karte je Bild im Browser gemessen: zwei Ticks (Regeln, Bot, Nachrichten) und die Anzeigeliste, ohne
//     Zeichnen. Das ist, was die Karte verantwortet. Grenze aus dem Budget, nicht aus dem Messwert: p95 <= 8 ms = die
//     Haelfte von 16,7 ms je Bild bei 60 fps; die andere Haelfte bleibt fuer Host und Zeichnen. Gemessen 2026-11-12:
//     Labor unter Last p95 1,7-4,2 ms, lokal 0,7-0,9 ms. Den lastunabhaengigen Aufwand (Ops, Knoten, Zustand,
//     Nachrichten mit festen Grenzen je Spiel) prueft test/arcade-cards.test.js.
// (b) fps und Bild-Callback aus dem Chromium-Trace, ohne und mit GPU-Rasterung (SwiftShader), jeweils gegen die leere
//     Buehne: nur Bericht. Im Headless-Lauf rastert Chromium in Software im Bild-Callback, und im Labor teilen sich viele
//     Container den Rechner; diese Zahlen schwanken mit der Last (Labor 2026-11-12: leer 58-60 fps, Spiele 19-36 fps).
async function frameStats(b, o) {
  const { ctx, p, errs } = await openStage(b, o, "phone412");
  const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 10000 });
  const file = path.join(os.tmpdir(), "arc-trace-" + o.card + (o.blank ? "-blank" : "") + ".json");
  await b.startTracing(p, { path: file, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline.frame"] });
  await p.waitForTimeout(3000);
  await b.stopTracing();
  const ev = JSON.parse(fs.readFileSync(file, "utf8")).traceEvents || [];
  const frames = ev.filter((e) => e.name === "DrawFrame").map((e) => e.ts).sort((a, c) => a - c);
  const raf = ev.filter((e) => e.name === "FireAnimationFrame" && e.ph === "X").map((e) => e.dur / 1000).sort((a, c) => a - c);
  const fps = frames.length > 1 ? (frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1e6) : 0;
  await ctx.close();
  return { fps: Math.round(fps * 10) / 10, jsP95: raf.length ? Math.round(raf[Math.floor(raf.length * 0.95)] * 100) / 100 : null, jsMean: raf.length ? Math.round(raf.reduce((a, c) => a + c, 0) / raf.length * 100) / 100 : null, frames: frames.length, errs };
}
test("Anteil der Karte je Bild bei 4x gedrosselter CPU: zwei Ticks und Anzeigeliste, p95 <= 8 ms (ohne Zeichnen)", async () => {
  const b = await browser(), out = {}, bad = [];
  try {
    const ctx = await b.newContext({ ...VIEWS.phone412 }), p = await ctx.newPage();
    await p.goto(await stagePage());
    const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    for (const id of IDS) {
      const r = await p.evaluate((id) => globalThis.ARC.cardCost(id, "cost", 360), id);
      out[id] = r; if (!(r.p95 <= 8)) bad.push(id + ": p95 " + r.p95 + " ms");
    }
    console.log("ARCADE-KARTE " + JSON.stringify(out));
    assert.deepEqual(bad, [], "Anteil der Karte je Bild");
    await ctx.close();
  } finally { await b.close(); }
});
async function fpsReport(b, ids, label) {
  const out = {};
  const base = await frameStats(b, { card: "arcade-kick", mode: "bot", seed: "fps", fast: 0, blank: true });
  out.leer = { fps: base.fps, jsMean: base.jsMean };
  for (const id of ids) { const r = await frameStats(b, { card: id, mode: "bot", seed: "fps", fast: 0 }); assert.deepEqual(r.errs, [], id); out[id] = { fps: r.fps, jsMean: r.jsMean, jsP95: r.jsP95 }; }
  console.log(label + " " + JSON.stringify(out));
}
test("Bildrate aus dem Chromium-Trace (Bericht): Software-Raster gegen die leere Buehne", async () => {
  const b = await browser();
  try { await fpsReport(b, IDS, "ARCADE-FPS"); } finally { await b.close(); }
});
test("Bildrate mit GPU-Rasterung (--enable-gpu-rasterization, --use-angle=swiftshader), Bericht gegen die leere Buehne", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined, args: ["--enable-gpu-rasterization", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
  try { await fpsReport(b, ["arcade-ziegel", "arcade-flipper", "arcade-panzer", "arcade-murmel"], "ARCADE-FPS-GPU"); } finally { await b.close(); }
});
