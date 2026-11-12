// Arcade-Duelle Ende zu Ende auf der Pruefseite (echter Echtzeit-Host, Buehne und Canvas-Ausfuehrer von Strang F):
// Bot-Partie bis zum Ende fuer alle zehn Karten, Touch (auch zwei Finger) und Tastatur, Verdeckung und axe auf vier
// Ansichten, reduzierte Bewegung, Live zwischen zwei Seiten, Determinismus Chromium/WebKit = Node, und die Bildrate auf
// einem gedrosselten Mittelklasse-Handy aus dem Chromium-Trace. Port der Faelle aus alt:test/e2e/arcade.e2e.js.
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
const canvasBox = (p) => p.locator("canvas.rt-canvas").boundingBox();
/** Weltpunkt (W=1000, H=1600) in Seitenkoordinaten der Leinwand. */
async function toPage(p, x, y) { const r = await canvasBox(p), k = Math.min(r.width / 1000, r.height / 1600), ox = (r.width - 1000 * k) / 2, oy = (r.height - 1600 * k) / 2; return [r.x + ox + x * k, r.y + oy + y * k]; }

test("Bot-Partie bis zum Ende: alle zehn Karten auf dem echten Host, ohne Fehler und ohne unbekannte Ops", async () => {
  const b = await browser();
  try {
    for (const id of IDS) {
      const { ctx, p, errs } = await openStage(b, { card: id, mode: "bot", seed: "e2e-" + id, fast: 24 });
      await p.waitForFunction(() => globalThis.__arcDone === true, null, { timeout: 120000 });
      const r = await p.evaluate(() => ({ st: globalThis.__arc.status(), unknown: globalThis.__arc.unknown.slice(0, 5), ev: globalThis.__arc.events.length, say: document.querySelector(".rt-say").textContent, label: document.querySelector("canvas.rt-canvas").getAttribute("aria-label") }));
      assert.ok(r.st.over, id + " endet"); assert.deepEqual(r.unknown, [], id + ": Renderer kennt alle Ops"); assert.ok(r.ev > 0, id + " Ereignisse fuer Klang");
      assert.match(r.say, /Du \d : \d Bot/, id + ": Stand per aria-live"); assert.match(r.label, /\d : \d/, id + ": Leinwand beschriftet");
      assert.deepEqual(errs, [], id); await ctx.close();
    }
  } finally { await b.close(); }
});

test("Touch und Tastatur: ziehen, tippen, zwei Finger beim Flipper, Pfeile und Leertaste", async () => {
  const b = await browser();
  try {
    // Ziegel: Finger zieht den Schlaeger (Touch), dann Pfeil rechts
    let { ctx, p, errs } = await openStage(b, { card: "arcade-ziegel", mode: "bot", seed: "touch", fast: 0 });
    await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 });
    const [x1, y1] = await toPage(p, 200, 1400), [x2] = await toPage(p, 150, 1400);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x2, y: y1, id: 1 }] });
    await p.waitForTimeout(500);
    const paddle = () => p.evaluate(() => { const n = globalThis.__arc.stage.last.node; const fg = n.layers.find((l) => l.id === "fg").ops; const r = fg.filter((o) => o.o === "rect" && o.r === 12 && o.h === 24); return r.map((o) => o.x + o.w / 2); });
    let px = await paddle(); assert.ok(px.some((x) => Math.abs(x - 150) < 4), "Touch zieht den Schlaeger: " + px);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await p.locator("canvas.rt-canvas").focus();
    await p.keyboard.down("ArrowRight"); await p.waitForTimeout(400); await p.keyboard.up("ArrowRight");
    px = await paddle(); assert.ok(px.some((x) => x > 400), "Pfeil rechts bewegt den Schlaeger: " + px);
    assert.deepEqual(errs, []); await ctx.close();
    // Flipper: zwei Finger gleichzeitig, links und rechts
    ({ ctx, p, errs } = await openStage(b, { card: "arcade-flipper", mode: "bot", seed: "touch", fast: 0 }));
    await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 });
    const c2 = await ctx.newCDPSession(p), [lx, ly] = await toPage(p, 150, 1300), [rx] = await toPage(p, 850, 1300);
    await c2.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: lx, y: ly, id: 1 }, { x: rx, y: ly, id: 2 }] });
    await p.waitForTimeout(300);
    const tips = await p.evaluate(() => { const fg = globalThis.__arc.stage.last.node.layers.find((l) => l.id === "fg").ops; return fg.filter((o) => o.o === "line" && o.lw > 30 && o.y1 === 1370).map((o) => o.y2); });
    assert.ok(tips.length >= 2 && tips.every((y) => y < 1370), "beide eigenen Klappen oben: " + tips);
    await c2.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.deepEqual(errs, []); await ctx.close();
    // Insel-Panzer: Tastatur zielt und feuert
    ({ ctx, p, errs } = await openStage(b, { card: "arcade-panzer", mode: "bot", seed: "keys", fast: 0 }));
    await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 });
    await p.locator("canvas.rt-canvas").focus();
    await p.keyboard.down("ArrowUp"); await p.waitForTimeout(300); await p.keyboard.up("ArrowUp"); await p.keyboard.press("Space");
    await p.waitForFunction(() => globalThis.__arc.events.includes("fire"), null, { timeout: 4000 });
    assert.deepEqual(errs, []); await ctx.close();
  } finally { await b.close(); }
});

test("Verdeckung, Ueberlauf und axe auf 360, 390, 412 und 1280: Leinwand im ersten Bildschirm, Knoepfe frei", async () => {
  const b = await browser(), found = [];
  try {
    for (const view of ["phone360", "phone390", "phone412", "desk1280"]) for (const id of ["arcade-flipper", "arcade-volley", "arcade-murmel"]) {
      const { ctx, p, errs } = await openStage(b, { card: id, mode: "bot", seed: "lay", fast: 0 }, view);
      await p.waitForTimeout(400);
      const r = await canvasBox(p), vp = VIEWS[view].viewport;
      assert.ok(r.y >= 0 && r.y + r.height <= vp.height + 1 && r.x >= 0 && r.x + r.width <= vp.width + 1, id + " " + view + ": Leinwand ganz im ersten Bildschirm " + JSON.stringify(r));
      assert.ok(await noOverflow(p), id + " " + view + ": kein waagerechter Ueberlauf");
      const covered = await p.evaluate(() => [...document.querySelectorAll("canvas.rt-canvas, .rt-btn")].filter((e) => { const q = e.getBoundingClientRect(); const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(t === e || e.contains(t)); }).map((e) => e.className));
      assert.deepEqual(covered, [], id + " " + view + ": nichts verdeckt");
      const small = await p.evaluate(() => [...document.querySelectorAll(".rt-btn")].filter((e) => e.getBoundingClientRect().height < 60).length);
      assert.equal(small, 0, id + ": Knoepfe >= 60 px");
      found.push(...(await axe(p, id + " " + view)));
      assert.deepEqual(errs, []); await ctx.close();
    }
    assert.deepEqual(found, [], "axe ohne Verstoesse");
  } finally { await b.close(); }
});

test("Reduzierte Bewegung: kein Wackeln, kein Blitz, weniger Partikel; das Spiel bleibt gleich", async () => {
  const b = await browser();
  try {
    const run = async (reduced) => {
      const { ctx, p } = await openStage(b, { card: "arcade-panzer", mode: "bot", seed: "calm", fast: 6 }, "phone390", reduced);
      const r = await p.evaluate(async () => {
        let shake = 0, flash = 0, parts = 0;
        for (let i = 0; i < 600; i++) {
          await new Promise((ok) => requestAnimationFrame(ok));
          const n = globalThis.__arc.stage.last.node; if (!n) continue;
          for (const L of n.layers) for (const o of L.ops) { if (o.o === "shake") shake++; if (L.id === "top" && o.o === "rect" && o.alpha) flash++; if (o.o === "particles") parts += o.list.length; if (o.o === "group") for (const q of o.ops) if (q.o === "particles") parts += q.list.length; }
          if (globalThis.__arc.status().over) break;
        }
        return { shake, flash, parts, hash: globalThis.__arc.hash(), tick: globalThis.__arc.tick() };
      });
      await ctx.close(); return r;
    };
    const full = await run(false), calm = await run(true);
    assert.equal(calm.shake, 0); assert.equal(calm.flash, 0); assert.ok(full.shake + full.flash > 0, "ohne Einschraenkung gibt es Effekte");
    assert.ok(calm.parts < full.parts * 0.6, "Partikel " + calm.parts + " < " + full.parts);
  } finally { await b.close(); }
});

test("Live: zwei Seiten (net split) ueber eine direkte Leitung, Ziegel bis 2 Punkte, beide zaehlen gleich, gespiegelt", async () => {
  const b = await browser();
  try {
    const mk = async (seat) => {
      const ctx = await b.newContext({ ...VIEWS.phone390, locale: "de-DE" }), p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(String(e)));
      await p.goto(await stagePage()); return { ctx, p, errs, seat };
    };
    const A = await mk(0), B = await mk(1);
    await A.p.exposeFunction("__arcOut", (s) => B.p.evaluate((m) => globalThis.__arcIn && globalThis.__arcIn(m), s).catch(() => {}));
    await B.p.exposeFunction("__arcOut", (s) => A.p.evaluate((m) => globalThis.__arcIn && globalThis.__arcIn(m), s).catch(() => {}));
    for (const X of [A, B]) await X.p.evaluate((seat) => globalThis.ARC.boot({ card: "arcade-ziegel", mode: "live", seat, serving: seat === 0, seed: "live-e2e", params: { win: 2 } }), X.seat);
    // beide Schlaeger nach ganz links: die meisten Baelle kommen durch, die Partie endet schnell und echt (wie alt e2e)
    for (const X of [A, B]) { await X.p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 }); await X.p.locator("canvas.rt-canvas").focus(); await X.p.keyboard.down("ArrowLeft"); }
    await A.p.waitForFunction(() => globalThis.__arc.status().over, null, { timeout: 240000 });
    await B.p.waitForFunction(() => globalThis.__arc.status().over, null, { timeout: 30000 });
    const sa = await A.p.evaluate(() => globalThis.__arc.status()), sb = await B.p.evaluate(() => globalThis.__arc.status());
    assert.deepEqual(sa.score, [sb.score[1], sb.score[0]], "gespiegelt gleich"); assert.equal(Math.max(...sa.score), 2); assert.equal(sa.rejected + sb.rejected, 0);
    assert.deepEqual(A.errs, []); assert.deepEqual(B.errs, []);
  } finally { await b.close(); }
});

test("Determinismus: Bot-Partien ergeben in Chromium und WebKit denselben Hash wie in Node", async (t) => {
  const want = {};
  const { botHash } = await import("./lib/arcade-node.mjs");
  for (const id of IDS) want[id] = botHash(id, "det-" + id, 2400);
  for (const kind of ["chromium", "webkit"]) {
    let b; try { b = await browser(kind); } catch (e) { if (kind === "webkit") { t.diagnostic("WebKit nicht installiert"); continue; } throw e; }
    try {
      const p = await (await b.newContext()).newPage(); await p.goto(await stagePage());
      for (const id of IDS) assert.equal(await p.evaluate(([i, n]) => globalThis.ARC.botHash(i, "det-" + i, n), [id, 2400]), want[id], kind + " " + id);
    } finally { await b.close(); }
  }
});

test("60 fps auf einem Mittelklasse-Handy: CPU 4x gedrosselt, Bildzeiten aus dem Chromium-Trace", async () => {
  const b = await browser(), out = {};
  try {
    for (const id of ["arcade-snow", "arcade-murmel", "arcade-volley", "arcade-panzer"]) {
      const { ctx, p, errs } = await openStage(b, { card: id, mode: "bot", seed: "fps", fast: 0 }, "phone412");
      const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 10000 });
      const file = path.join(os.tmpdir(), "arc-trace-" + id + ".json");
      await b.startTracing(p, { path: file, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline.frame"] });
      await p.waitForTimeout(6000);
      await b.stopTracing();
      const ev = JSON.parse(fs.readFileSync(file, "utf8")).traceEvents || [];
      const draws = ev.filter((e) => e.name === "DrawFrame" || e.name === "Commit").map((e) => e.ts).sort((a, c) => a - c);
      const frames = ev.filter((e) => e.name === "DrawFrame").map((e) => e.ts).sort((a, c) => a - c);
      const gaps = frames.slice(1).map((x, i) => (x - frames[i]) / 1000).sort((a, c) => a - c);
      const fps = frames.length > 1 ? (frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1e6) : 0, p95 = gaps.length ? gaps[Math.floor(gaps.length * 0.95)] : Infinity;
      out[id] = { fps: Math.round(fps * 10) / 10, p95: Math.round(p95 * 10) / 10, frames: frames.length, draws: draws.length };
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      assert.deepEqual(errs, []); await ctx.close();
    }
    console.log("ARCADE-FPS " + JSON.stringify(out));
    for (const [id, r] of Object.entries(out)) { assert.ok(r.fps >= 55, id + ": " + r.fps + " fps"); assert.ok(r.p95 <= 25, id + ": p95 Bildabstand " + r.p95 + " ms"); }
  } finally { await b.close(); }
});
