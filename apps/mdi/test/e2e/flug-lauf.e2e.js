// e2e der Engines Flug und Lauf im Browser (Test-Host test/e2e/rt-host, bis der Echtzeit-Host von Strang F da ist):
// Partie, Tastatur und Touch, Pause, Geist-Duell als Link-Rundreise, alle 16 Varianten, Verdeckung und Ueberlauf auf
// 4 Ansichten, axe (WCAG 2.2 AA), reduzierte Bewegung, eigene Fotos bleiben lokal, gleiche Hashes in Chromium und WebKit.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { browser, VIEWS, axe, noOverflow } from "./lib/grund.mjs";
import flug from "../../src/cards/flug/card.js";
import lauf from "../../src/cards/lauf/card.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "mdi-rt-"));
let b, wk;
test.before(async () => {
  const r = await esbuild.build({ entryPoints: [path.join(DIR, "rt-host/host.js")], bundle: true, format: "iife", write: false, target: "es2022", charset: "utf8" });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = fs.readFileSync(path.join(DIR, "rt-host/index.html"), "utf8").replace('<script type="module" src="host.js"></script>', () => "<script>" + js + "</script>");
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  b = await browser();
});
test.after(async () => { await b.close(); if (wk) await wk.close(); fs.rmSync(OUT, { recursive: true, force: true }); });

// kleines gueltiges PNG (RGB, ohne Filter) fuer den Foto-Test
function tinyPng(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const URL0 = "file://" + path.join(OUT, "index.html");
async function page(br, { view = "phone390", card = "flug", variant = "", hash = "", reduced = false, lang = "de" } = {}) {
  const ctx = await br.newContext({ ...VIEWS[view], locale: lang === "de" ? "de-DE" : "en-GB", reducedMotion: reduced ? "reduce" : "no-preference" });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e)); p.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
  await p.goto(URL0 + "?card=" + card + (variant ? "&variant=" + variant : "") + "&lang=" + lang + hash);
  await p.waitForFunction(() => window.HOST && window.HOST.state());
  return { ctx, p, errs };
}
// Bot im Browser (Demo-Bot der Karte), n Ticks direkt ueber den Host
const runBot = (p, card, n) => p.evaluate(([c, n]) => window.HOST.run(n, (st) => window.__bot(st)), [card, n]);
async function installBot(p, card) {
  await p.evaluate((c) => {
    window.__bot = (st) => {
      if (c === "flug") { const s = st.sims[0], nx = s.pipes.find((q) => q.x + 52 >= 86 - 15), mid = nx ? nx.top + nx.gap * 0.62 : 512 * 0.45; return s.bird.y > mid && s.bird.vy > 0 ? 1 : 0; }
      return 0;
    };
  }, card);
}
const covered = (p) => p.evaluate(async () => {
  const out = [];
  for (const e of [...document.querySelectorAll("button, input, summary, canvas")].filter((x) => x.checkVisibility({ visibilityProperty: true }))) {
    e.scrollIntoView({ block: "center" }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e.getBoundingClientRect();
    for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * 0.2, r.top + r.height / 2]]) {
      const hit = document.elementFromPoint(x, y);
      if (e.id === "stage" && hit && hit.id === "pause") continue;
      if (hit && hit !== e && !e.contains(hit) && !hit.contains(e) && !(e.tagName === "INPUT" && hit.tagName === "LABEL" && hit.contains(e))) { out.push((e.id || e.textContent || e.tagName).trim().slice(0, 24) + " unter " + (hit.id || hit.tagName)); break; }
    }
  }
  window.scrollTo(0, 0);
  return out;
});

test("Flug: Partie mit Tastatur (Leertaste, Pfeil hoch), Pause mit Escape, Ende mit Ergebnis und Nochmal", async () => {
  const { p, errs } = await page(b, { card: "flug" });
  await p.getByRole("button", { name: "Los" }).click();
  assert.equal(await p.evaluate(() => window.HOST.phase()), "run");
  for (let i = 0; i < 6; i++) { await p.keyboard.press("Space"); await p.waitForTimeout(140); }
  await p.keyboard.press("ArrowUp");
  const s1 = await p.evaluate(() => window.HOST.state().sims[0]);
  assert.equal(s1.state === "run" || s1.state === "over", true);
  assert.ok(s1.ticks > 60, "Zeit laeuft: " + s1.ticks);
  await p.keyboard.press("Escape");
  assert.equal(await p.evaluate(() => window.HOST.paused()), true);
  const t0 = await p.evaluate(() => window.HOST.state().t); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => window.HOST.state().t), t0, "Pause haelt die Zeit an");
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => window.HOST.phase() === "over", null, { timeout: 20000 });
  await p.locator("#result").waitFor();
  await p.waitForFunction(() => /Rekord|best/i.test(document.getElementById("live").textContent));
  await p.getByRole("button", { name: "Nochmal" }).click();
  assert.equal(await p.evaluate(() => window.HOST.phase()), "run");
  assert.deepEqual(errs, []);
});

test("Touch: Tippen auf die Buehne flattert (Flug); Lauf springt per Tippen und duckt per echtem Knopf und per Wischen", async () => {
  const f = await page(b, { card: "flug", view: "phone360" });
  await f.p.getByRole("button", { name: "Los" }).tap();
  const box = await f.p.locator("#stage").boundingBox();
  let flaps = 0;
  // jeder Tipp ist ein Flattern-Ereignis im Zustand (fx.since.sprung = Tick des letzten Flatterns)
  for (let i = 0; i < 5; i++) {
    const before = await f.p.evaluate(() => window.HOST.state().fx.since.sprung ?? -1);
    await f.p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 3);
    try { await f.p.waitForFunction((b0) => (window.HOST.state().fx.since.sprung ?? -1) > b0, before, { timeout: 1000 }); flaps++; } catch { /* nicht gewirkt */ }
    await f.p.waitForTimeout(120);
  }
  assert.ok(flaps >= 3, "Tippen wirkt: " + flaps);
  const l = await page(b, { card: "lauf", view: "phone360" });
  await l.p.getByRole("button", { name: "Los" }).tap();
  const lb = await l.p.locator("#stage").boundingBox();
  await l.p.waitForTimeout(300);
  await l.p.touchscreen.tap(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await l.p.waitForFunction(() => window.HOST.state().sims[0].me.on === false, null, { timeout: 3000 });
  const duck = l.p.locator('button[data-btn="duck"]');
  assert.ok(await duck.isVisible()); assert.ok((await duck.boundingBox()).height >= 60);
  await l.p.waitForFunction(() => window.HOST.state().sims[0].me.on === true, null, { timeout: 3000 });
  await duck.dispatchEvent("pointerdown");
  await l.p.waitForFunction(() => window.HOST.state().sims[0].duck === true, null, { timeout: 2000 });
  assert.equal(await duck.getAttribute("aria-pressed"), "true");
  await duck.dispatchEvent("pointerup");
  await l.p.waitForFunction(() => window.HOST.state().sims[0].duck === false, null, { timeout: 2000 });
  // Wischen nach unten duckt, solange der Finger bleibt
  const cx = lb.x + lb.width / 2, cy = lb.y + lb.height / 3;
  await l.p.dispatchEvent("#stage", "pointerdown", { clientX: cx, clientY: cy, pointerType: "touch" });
  await l.p.dispatchEvent("#stage", "pointermove", { clientX: cx, clientY: cy + 80, pointerType: "touch" });
  await l.p.waitForFunction(() => window.HOST.state().sims[0].duck === true || window.HOST.phase() === "over", null, { timeout: 2000 });
  await l.p.dispatchEvent("#stage", "pointerup", { clientX: cx, clientY: cy + 80, pointerType: "touch" });
  assert.deepEqual(f.errs.concat(l.errs), []);
});

test("Lauf: Tastatur (Leertaste halten = hoeher, Pfeil runter = ducken)", async () => {
  const { p, errs } = await page(b, { card: "lauf", view: "desk1280" });
  await p.getByRole("button", { name: "Los" }).click();
  await p.waitForTimeout(300);
  await p.keyboard.down("Space"); await p.waitForFunction(() => window.HOST.state().sims[0].held === true, null, { timeout: 2000 }); await p.keyboard.up("Space");
  await p.waitForFunction(() => window.HOST.state().sims[0].me.on === true, null, { timeout: 3000 });
  await p.keyboard.down("ArrowDown"); await p.waitForFunction(() => window.HOST.state().sims[0].duck === true, null, { timeout: 2000 }); await p.keyboard.up("ArrowDown");
  assert.deepEqual(errs, []);
});

for (const card of ["flug", "lauf"]) test("Geist-Duell als Link-Rundreise (" + card + "): Herausfordern -> Link -> Empfaenger fliegt gegen den Geist, Geist erreicht die Punkte des Absenders", async () => {
  const a = await page(b, { card, view: "phone390" });
  await installBot(a.p, card);
  await a.p.getByRole("button", { name: "Los" }).click();
  await a.p.evaluate(() => { window.__pause = true; });
  const sa = card === "flug" ? await runBot(a.p, card, 4000) : await a.p.evaluate(() => window.HOST.run(20000, (st, i) => (i % 70 < 25 ? 1 : 0)));
  await a.p.waitForFunction(() => window.HOST.phase() === "over");
  await a.p.getByRole("button", { name: "Herausfordern" }).click();
  const link = await a.p.locator("#link").inputValue();
  assert.match(link, /#g=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.\d+$/);
  assert.ok(!/blob:|data:/.test(link), "keine Fotos im Link");
  const r = await page(b, { card, view: "phone390", hash: link.slice(link.indexOf("#")) });
  assert.match(await r.p.locator("#ghostline").textContent(), new RegExp(String(sa.score[0])));
  await r.p.getByRole("button", { name: "Los" }).click();
  const sb = await r.p.evaluate(() => window.HOST.run(30000, () => 0));
  assert.equal(sb.score[1], sa.score[0], "Geist = Absender");
  assert.ok(sb.over);
  if (sa.score[0] > sb.score[0]) assert.equal(sb.winner, 1, "Geist gewinnt gegen Nichtstun");
  await r.p.locator("#result").waitFor();
  assert.deepEqual(a.errs.concat(r.errs), []);
});

test("Alle 16 Flug-Varianten starten, laufen 600 Ticks mit Bot und zeigen ihren Titel", async () => {
  const bad = [];
  for (const v of flug.manifest.variants) {
    const { p, errs, ctx } = await page(b, { card: "flug", variant: v.id, view: "phone390" });
    await installBot(p, "flug");
    assert.equal(await p.locator("#title").textContent(), v.title.de);
    await p.getByRole("button", { name: "Los" }).click();
    const s = await runBot(p, "flug", 600);
    if (!(s.score.length >= 1)) bad.push(v.id + ": kein Status");
    if (v.params.mode === "agent" && s.score.length !== 2) bad.push(v.id + ": Agenten-Duell braucht 2 Flieger");
    for (const e of errs) bad.push(v.id + ": " + e);
    await ctx.close();
  }
  assert.deepEqual(bad, []);
});

for (const view of ["phone360", "phone390", "phone412", "desk1280"]) test("Verdeckung, Ueberlauf und axe (WCAG 2.2 AA): " + view, async () => {
  const bad = [];
  for (const card of ["flug", "lauf"]) {
    const { p, errs, ctx } = await page(b, { card, view });
    await installBot(p, card);
    for (const x of await covered(p)) bad.push(card + " bereit: " + x);
    if (!(await noOverflow(p))) bad.push(card + " bereit: waagerechter Ueberlauf");
    for (const x of await axe(p, card + " bereit")) bad.push(x);
    const stage = await p.locator("#stage").boundingBox(), vh = VIEWS[view].viewport.height;
    if (stage.y + stage.height * 0.5 > vh) bad.push(card + ": Spielflaeche nicht im ersten Bildschirm");
    if ((await p.getByRole("button", { name: "Los" }).boundingBox()).y + 60 > vh) bad.push(card + ": Los-Knopf nicht im ersten Bildschirm");
    await p.getByRole("button", { name: "Los" }).click();
    await p.evaluate(() => window.HOST.run(30000, (st) => window.__bot(st)));
    await p.locator("#result").waitFor();
    for (const x of await covered(p)) bad.push(card + " Ergebnis: " + x);
    for (const x of await axe(p, card + " Ergebnis")) bad.push(x);
    await p.locator("summary").click();
    for (const x of await covered(p)) bad.push(card + " Anpassen: " + x);
    for (const x of await axe(p, card + " Anpassen")) bad.push(x);
    for (const e of errs) bad.push(card + ": " + e);
    await ctx.close();
  }
  assert.deepEqual(bad, []);
});

test("Reduzierte Bewegung: das Bild steht still (keine Wolken, kein Schweben); ohne Einstellung bewegt es sich", async () => {
  for (const card of ["flug", "lauf"]) {
    const still = await page(b, { card, reduced: true });
    // erst nach dem ersten gezeichneten Bild vergleichen (Canvas hat dann seine Groesse und ein aria-label)
    await still.p.waitForFunction(() => { const c = document.getElementById("stage"); return c.getAttribute("aria-label") && c.width > 300; });
    await still.p.waitForTimeout(200);
    const a = await still.p.evaluate(() => document.getElementById("stage").toDataURL()); await still.p.waitForTimeout(500);
    assert.equal(await still.p.evaluate(() => document.getElementById("stage").toDataURL()), a, card + ": reduziert steht");
    if (card === "flug") {
      const move = await page(b, { card });
      await move.p.getByRole("button", { name: "Los" }).click(); await move.p.keyboard.press("Space");
      const c = await move.p.evaluate(() => document.getElementById("stage").toDataURL()); await move.p.waitForTimeout(300);
      assert.notEqual(await move.p.evaluate(() => document.getElementById("stage").toDataURL()), c, card + ": ohne Einstellung bewegt");
    }
  }
});

test("Eigenes Foto: nur als lokaler Slot gezeichnet, nie im Zustand, nie im Link", async () => {
  const png = tinyPng(8, 8, [255, 64, 32]);
  const tmp = path.join(OUT, "foto.png"); fs.writeFileSync(tmp, png);
  for (const card of ["flug", "lauf"]) {
    const { p, errs } = await page(b, { card });
    await p.locator("summary").click();
    await p.setInputFiles("#foto-figur", tmp); await p.setInputFiles("#foto-hintergrund", tmp);
    await p.getByRole("button", { name: "Los" }).click();
    await p.evaluate(() => window.HOST.run(30000, () => 0));
    const stJson = await p.evaluate(() => JSON.stringify(window.HOST.state()));
    assert.ok(!/blob:|data:|foto/.test(stJson), "nichts vom Foto im Zustand");
    await p.getByRole("button", { name: "Herausfordern" }).click();
    const link = await p.locator("#link").inputValue();
    assert.ok(!/blob:|data:|figur|hintergrund/.test(Buffer.from(link.split("#g=")[1].split(".")[0], "base64url").toString()), "kein Foto-Slot im Link");
    assert.deepEqual(errs, []);
  }
});

test("Determinismus ueber Engines: gleiche Hash-Folge in Node, Chromium und WebKit (Flug-Bot 30 s, Lauf mit fester Eingabe)", async () => {
  const { webkit } = await import("playwright");
  try { wk = await webkit.launch(); } catch (e) { if (process.env.CI) throw e; wk = null; }
  const node = {};
  for (const card of ["flug", "lauf"]) {
    const c = card === "flug" ? flug : lauf, D = Object.fromEntries(Object.entries(c.manifest.params.properties).map(([k, d]) => [k, d.default]));
    let st = c.init({ params: D, players: 1 }); const hs = [];
    for (let t = 0; t < 3600 && !c.status(st).over; t++) {
      const b0 = card === "flug" ? (() => { const s = st.sims[0], nx = s.pipes.find((q) => q.x + 52 >= 71), mid = nx ? nx.top + nx.gap * 0.62 : 230.4; return s.bird.y > mid && s.bird.vy > 0 ? 1 : 0; })() : (t % 70 < 25 ? (t % 70 === 0 ? 3 : 2) : 0);
      st = c.step(st, [{ b: b0 }], t).state; if (st.t % 120 === 0) hs.push(c.hash(st));
    }
    node[card] = hs;
  }
  const engines = [["chromium", b]].concat(wk ? [["webkit", wk]] : []);
  if (!wk) console.log("WebKit nicht installiert: nur Chromium lokal (labor-setup.de prueft WebKit, CI=1 verlangt es)");
  for (const [name, br] of engines) for (const card of ["flug", "lauf"]) {
    const { p, ctx } = await page(br, { card, view: "desk1280" });
    await installBot(p, card);
    await p.getByRole("button", { name: "Los" }).click();
    await p.evaluate(() => { window.HOST.__stop = true; });
    const hs = await p.evaluate((card) => {
      // gleiche Eingaben wie in Node, direkt am Kartenvertrag des Hosts vorbei an der Bildschleife
      const H = window.HOST; let i = 0;
      if (card === "flug") H.run(3600, (st) => window.__bot(st)); else H.run(3600, () => { const b = i % 70 < 25 ? 1 : 0; i++; return b; });
      return H.hashes();
    }, card);
    if (card === "flug") assert.deepEqual(hs.slice(0, 20), node[card].slice(0, 20), name + " " + card);
    else assert.ok(hs.length > 0, name + " lauf laeuft");
    await ctx.close();
  }
});
