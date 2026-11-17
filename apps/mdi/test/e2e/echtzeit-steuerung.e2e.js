// Befunde „Das Spiel ist buggy“ (Flug) und „Schlitten nicht fein steuerbar“ (Ziegel/Breakout), Ende zu Ende auf Desktop
// 1280 und Handy 390:
// - Flug: Figur = Hitbox (Pixel der gezeichneten Figur um die Hitbox-Mitte, auch mit grosser eigener Figur), Absturz gegen
//   den Computer beendet die Runde, eine durchflogene Roehre zaehlt fuer „Du“.
// - Ziegel: Maus- und Touch-Zug fuehrt den Schlaeger auf +-5 px ans Ziel, gehaltene Pfeiltaste gleitet stetig und haelt
//   beim Loslassen an.
// - Layout in der App: Spielfeld mittig, Pause/Ton und Steuerknoepfe am Feld, Spielstand nur einmal sichtbar.
// Mechanik auf der Pruefseite (echter Host src/app/rt/session.js, echte Buehne rt-stage.js, echter Canvas-Ausfuehrer),
// Layout in der gebauten App.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, VIEWS, open, act, waitScreen, screen } from "./lib/grund.mjs";
import { stagePage } from "./lib/arcade-stage.mjs";
import { pickMode, pauseOnRun } from "./lib/scenarios.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

async function openStage(o, view, reduced = false) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: "de-DE", reducedMotion: reduced ? "reduce" : "no-preference" });
  ctx.setDefaultTimeout(30000);
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e)); p.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
  await p.goto(await stagePage());
  await p.evaluate((o) => globalThis.ARC.boot(o), o);
  await p.locator("canvas.rt-canvas").waitFor();
  return { ctx, p, errs };
}
/** Letterbox der Leinwand: Weltpunkt <-> Seitenpunkt (wie fitView). */
const fitOf = (p, w, h) => p.locator("canvas.rt-canvas").boundingBox().then((r) => { const k = Math.min(r.width / w, r.height / h); return { k, x: r.x + (r.width - w * k) / 2, y: r.y + (r.height - h * k) / 2 }; });

// ---------- Flug ----------
const FW = 288, FH = 512, BX = 86, R = 15;
/** Eigener Vogel aus der letzten Anzeigeliste: die letzte Gruppe der Welt mit alpha 1 (Gegner: alpha < 1). */
const ownBird = (p) => p.evaluate(() => { const w = globalThis.__arc.stage.last.node.layers.find((l) => l.id === "world").ops; const g = w.filter((o) => o.o === "group" && o.alpha === 1).pop(); return g ? { tx: g.tx, ty: g.ty } : null; });

for (const view of ["desk1280", "phone390"]) for (const emoji of ["🐉", "🦖"]) test("Flug " + view + " " + emoji + ": die gezeichnete Figur liegt auf der Hitbox (Mitte +-5, Groesse ~ 2R)", async () => {
  const { ctx, p, errs } = await openStage({ card: "flug", mode: "bot", seed: "hitbox", params: { emoji } }, view, true);
  await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 });
  for (let i = 0; i < 3; i++) { await p.keyboard.press("Space"); await p.waitForTimeout(120); }
  await p.evaluate(() => globalThis.__arc.session.pause());
  // Figur-Pixel = Unterschied zwischen dem Bild mit Figur und demselben Bild ohne Figur (Emoji leer), am selben Stand
  const r = await p.evaluate((emoji) => {
    const st = globalThis.__arc.stage, last = st.last, c = document.querySelector("canvas.rt-canvas"), x2 = c.getContext("2d");
    const grab = () => x2.getImageData(0, 0, c.width, c.height).data;
    const node = JSON.parse(JSON.stringify(last.node)), world = node.layers.find((l) => l.id === "world").ops;
    const own = world.filter((o) => o.o === "group" && o.alpha === 1).pop();
    const strip = (o) => { if (o.o === "sprite" && o.emoji === emoji) o.emoji = " "; for (const q of o.ops || []) strip(q); };
    for (const g of world.filter((o) => o.o === "group")) strip(g);
    for (const g of world.filter((o) => o.o === "group" && o !== own)) g.alpha = 0;   // nur die eigene Figur vergleichen
    // Vergleichsbild: alles gleich, nur die Figur da
    const nodeA = JSON.parse(JSON.stringify(last.node)); for (const g of nodeA.layers.find((l) => l.id === "world").ops.filter((o) => o.o === "group" && o.alpha !== 1)) g.alpha = 0;
    st.draw(nodeA, last.info); const a2 = grab(); st.draw(node, last.info); const bb = grab();
    let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let i = 0; i < a2.length; i += 4) {
      const d = Math.abs(a2[i] - bb[i]) + Math.abs(a2[i + 1] - bb[i + 1]) + Math.abs(a2[i + 2] - bb[i + 2]);
      if (d > 60) { const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width); n++; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    }
    const rc = c.getBoundingClientRect(), dpr = c.width / rc.width;
    return { n, x0: x0 / dpr, x1: (x1 + 1) / dpr, y0: y0 / dpr, y1: (y1 + 1) / dpr, bw: (x1 - x0 + 1) / dpr, bh: (y1 - y0 + 1) / dpr, tx: own.tx, ty: own.ty, rot: own.rot, cw: rc.width, ch: rc.height };
  }, emoji);
  assert.ok(r.n > 30, "Figur sichtbar: " + JSON.stringify(r));
  const k = Math.min(r.cw / FW, r.ch / FH), ox = (r.cw - FW * k) / 2, oy = (r.ch - FH * k) / 2;
  const hx = ox + BX * k, hy = oy + r.ty * k;   // Hitbox-Mitte (BX, bird.y) in Leinwandpunkten
  assert.equal(r.tx, BX, "Figur bei BX");
  // Toleranz 5 Welteinheiten (1/3 R): ein Emoji ist kein symmetrischer Kreis; vor dem Fix lag die Figur 18 Einheiten daneben
  const ex = (r.x0 + r.x1) / 2, ey = (r.y0 + r.y1) / 2, tol = 5 * k;
  assert.ok(Math.abs(ex - hx) <= tol && Math.abs(ey - hy) <= tol, view + " " + emoji + ": Figur-Mitte " + [ex, ey].map(Math.round) + " = Hitbox-Mitte " + [hx, hy].map(Math.round) + " (+-" + tol.toFixed(1) + ")");
  const size = Math.max(r.bw, r.bh) / k;   // in Welteinheiten
  assert.ok(size >= 2 * R * 0.7 && size <= 2 * R * 1.45, "Figur so gross wie die Hitbox (2R = " + 2 * R + "): " + size.toFixed(1));
  assert.deepEqual(errs, []); await ctx.close();
});

for (const view of ["desk1280", "phone390"]) test("Flug " + view + ": Absturz mit grosser eigener Figur beendet die Runde gegen den Computer; der Computer fliegt nicht allein weiter", async () => {
  const { ctx, p, errs } = await openStage({ card: "flug", mode: "bot", seed: "crash", params: { emoji: "🦖" }, fast: 1 }, view);
  // Autopilot hoch hinaus: flattern, solange die Figur unter y = 40 ist -> sie trifft die obere Roehre
  await p.evaluate(() => { const f = () => { const n = globalThis.__arc.stage.last.node; if (globalThis.__arcDone) return; const w = n && n.layers.find((l) => l.id === "world"); const g = w && w.ops.filter((o) => o.o === "group" && o.alpha === 1).pop();
    if (g && g.ty > 40) { globalThis.__arc.session.key("Space", true); globalThis.__arc.session.key("Space", false); } requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.waitForFunction(() => globalThis.__arcDone === true, null, { timeout: 60000 });
  const st = await p.evaluate(() => globalThis.__arc.status());
  assert.ok(st.over, "Runde zu Ende");
  assert.equal(st.winner, 1, "der Computer fliegt noch und gewinnt: " + JSON.stringify(st));
  assert.ok(st.score[1] - st.score[0] <= 0 && st.score[0] === st.score[1], "Computer sammelt nach dem Absturz nichts mehr: " + st.score);
  assert.match(st.say.de, /Computer fliegt noch/);
  // Absturz an der Roehre (nicht am Boden): die Figur steht beim Ende an einer Roehre
  const hit = await p.evaluate(() => { const w = globalThis.__arc.stage.last.node.layers.find((l) => l.id === "world").ops; const g = w.filter((o) => o.o === "group" && o.alpha === 1).pop();
    const tops = w.filter((o) => o.o === "poly" && o.pts[1] === 0).map((o) => [o.pts[0], o.pts[5]]); return { y: g.ty, pipes: tops }; });
  // letztes Bild ist ein Tick vor dem Treffer: Roehre noch bis zu einem Schritt (speed/120 < 3) weiter rechts
  assert.ok(hit.pipes.some(([x, top]) => x - 3 < BX + R && x + 52 > BX - R && hit.y - R < top), "Figur beruehrt die obere Roehre: " + JSON.stringify(hit));
  assert.deepEqual(errs, []); await ctx.close();
});

for (const view of ["desk1280", "phone390"]) test("Flug " + view + ": eine durchflogene Roehre zaehlt fuer DU (Kopfzeile und Stand)", async () => {
  const { ctx, p, errs } = await openStage({ card: "flug", mode: "bot", seed: "score", fast: 1 }, view);
  // Autopilot wie der Demo-Bot: flattern, wenn die Figur unter 62 % der naechsten Luecke faellt
  await p.evaluate(() => { let prev = null; const f = () => { if (globalThis.__arcDone || globalThis.__arc.status().score[0] >= 2) return; const n = globalThis.__arc.stage.last.node, w = n && n.layers.find((l) => l.id === "world");
    const g = w && w.ops.filter((o) => o.o === "group" && o.alpha === 1).pop();
    if (g) { const tops = w.ops.filter((o) => o.o === "poly" && o.pts[1] === 0), bots = w.ops.filter((o) => o.o === "poly" && o.pts[1] !== 0);
      let mid = 230; for (let i = 0; i < tops.length; i++) if (tops[i].pts[0] + 52 > 86 - 15) { const top = tops[i].pts[5], by = bots[i].pts[5]; mid = top + (by - top) * 0.62; break; }
      if (g.ty > mid && prev !== null && g.ty >= prev) { globalThis.__arc.session.key("Space", true); globalThis.__arc.session.key("Space", false); } prev = g.ty; }
    requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.waitForFunction(() => globalThis.__arc.status().score[0] >= 1, null, { timeout: 60000 });
  const label = await p.locator("canvas.rt-canvas").getAttribute("aria-label");
  assert.match(label, /DU [1-9]\d* : COMPUTER \d+/, "Kopfzeile zaehlt DU: " + label);
  assert.deepEqual(errs, []); await ctx.close();
});

// ---------- Ziegel (Breakout-Duell) ----------
const ZW = 1000, ZH = 1600;
const paddle = (p) => p.evaluate(() => { const fg = globalThis.__arc.stage.last.node.layers.find((l) => l.id === "fg").ops; const r = fg.filter((o) => o.o === "rect" && o.r === 12 && o.h === 24 && o.y > 800); return r.length ? r[0].x + r[0].w / 2 : null; });

for (const view of ["desk1280", "phone390"]) test("Ziegel " + view + ": Zeiger-Zug (Maus bzw. Touch) fuehrt den Schlaeger auf +-5 px ans Ziel", async () => {
  const { ctx, p, errs } = await openStage({ card: "arcade-ziegel", mode: "bot", seed: "drag" }, view);
  await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 });
  const f = await fitOf(p, ZW, ZH), at = (x, y) => [f.x + x * f.k, f.y + y * f.k];
  for (const [from, to] of [[500, 260], [260, 735], [735, 618]]) {
    const [x1, y] = at(from, 1300), [x2] = at(to, 1300);
    if (view === "desk1280") { await p.mouse.move(x1, y); await p.mouse.down(); await p.mouse.move(x2, y, { steps: 12 }); }
    else {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y, id: 1 }] });
      for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x1 + (x2 - x1) * i / 12, y, id: 1 }] });
      p.__cdp = cdp;
    }
    await p.waitForTimeout(500);
    const px = await paddle(p), got = f.x + px * f.k;
    assert.ok(Math.abs(got - x2) <= 5, view + ": Schlaeger bei " + got.toFixed(1) + " px, Ziel " + x2.toFixed(1) + " px");
    if (view === "desk1280") await p.mouse.up(); else await p.__cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  // keine Textmarkierung durch Ziehen auf der Buehne
  assert.equal(await p.evaluate(() => String(getSelection())), "");
  assert.deepEqual(errs, []); await ctx.close();
});

test("Ziegel desk1280: gehaltene Pfeiltaste gleitet stetig (schneller werdend), kurzer Tipp bewegt fein, Loslassen haelt an", async () => {
  const { ctx, p, errs } = await openStage({ card: "arcade-ziegel", mode: "bot", seed: "keys" }, "desk1280");
  await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 });
  await p.locator("canvas.rt-canvas").focus();
  // kurzer Tipp (ca. 3 Ticks): wenige Einheiten statt eines 300er-Sprungs
  const x0 = await paddle(p);
  await p.evaluate(() => { globalThis.__arc.session.key("ArrowRight", true); });
  await p.waitForFunction(() => globalThis.__arc.tick() > 0, null);
  const t0 = await p.evaluate(() => globalThis.__arc.tick());
  await p.waitForFunction((t) => globalThis.__arc.tick() >= t + 3, t0);
  await p.evaluate(() => globalThis.__arc.session.key("ArrowRight", false));
  await p.waitForTimeout(400);
  const x1 = await paddle(p);
  assert.ok(x1 > x0 && x1 - x0 <= 40, "kurzer Tipp bewegt fein: " + x0 + " -> " + x1);
  // halten: stetig nach links, jede Probe weiter, schneller werdend
  await p.keyboard.down("ArrowLeft");
  const xs = [];
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(90); xs.push(await paddle(p)); }
  await p.keyboard.up("ArrowLeft");
  const stopAt = await paddle(p); await p.waitForTimeout(400); const after = await paddle(p);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] <= xs[i - 1], "stetig nach links: " + xs.map(Math.round));
  assert.ok(xs[0] < x1 && xs[xs.length - 1] < xs[0] - 50, "bewegt sich kontinuierlich: " + xs.map(Math.round));
  assert.ok(Math.abs(after - stopAt) <= 25, "haelt beim Loslassen an (kein Nachrutschen): " + stopAt + " -> " + after);
  assert.deepEqual(errs, []); await ctx.close();
});

// ---------- Layout in der App ----------
for (const view of ["desk1280", "phone390"]) for (const [card, mode] of [["flug", "bot"], ["arcade-ziegel", null]]) test("Layout " + card + " " + view + ": Feld mittig, Pause/Ton und Knoepfe am Feld, Spielstand einmal", async () => {
  const { p, errs, ctx } = await open(b, { view });
  await act(p, "open-" + card); await waitScreen(p, "card-view");
  if (mode) await pickMode(p, "de", mode);
  await pauseOnRun(p);
  await act(p, "go"); await waitScreen(p, "card-rt-pause", 20000);
  const r = await p.evaluate(() => { const q = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
    return { vw: innerWidth, vh: innerHeight, stage: q(".rt-stage"), canvas: q("canvas.rt-canvas"), pause: q(".rt-pause"), sound: q(".rt-sound"), ctl: [...document.querySelectorAll(".rt-key, .rt-axis")].map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }),
      say: q(".rt-say"), sayText: document.querySelector(".rt-say").textContent, msg: document.querySelector(".rt-msg").textContent, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
  const mid = (x) => (x.l + x.r) / 2;
  assert.ok(Math.abs(mid(r.canvas) - r.vw / 2) <= 24, view + ": Feld mittig (" + mid(r.canvas) + " / " + r.vw / 2 + ")");
  assert.ok(Math.abs(mid(r.stage) - mid(r.canvas)) <= 2, "Buehne um das Feld zentriert");
  assert.ok(r.stage.w <= Math.max(r.canvas.w + 40, 340), "Buehne nicht breiter als Feld und Knoepfe: " + r.stage.w + " vs Feld " + r.canvas.w);
  const inside = (e) => e.l >= r.stage.l - 0.5 && e.r <= r.stage.r + 0.5 && e.t >= r.stage.t - 0.5 && e.b <= r.stage.b + 0.5;
  for (const [n, e] of [["Pause", r.pause], ["Ton", r.sound], ...r.ctl.map((c, i) => ["Knopf " + i, c])]) {
    assert.ok(e && inside(e), n + " gehoert zum Feld: " + JSON.stringify(e) + " in " + JSON.stringify(r.stage));
    assert.ok(e.t >= 0 && e.b <= r.vh + 1, n + " sichtbar");
  }
  assert.ok(r.pause.b <= r.canvas.t + 1, "Pause/Ton direkt ueber dem Feld");
  assert.ok(r.canvas.t >= 0 && r.canvas.b <= r.vh + 1, "Feld ganz sichtbar");
  assert.ok(r.say.w <= 1, "Spielstand nicht doppelt: aria-live nur fuer Screenreader");
  assert.equal(r.msg, "Pausiert", "sichtbar nur die Ansage des Hosts");
  assert.ok(!r.overflow, "kein Ueberlauf");
  assert.ok(["card-rt-pause"].includes(await screen(p)));
  assert.deepEqual(errs, []); await ctx.close();
});

// ---------- Funde des Echtzeit-Tests (A9) im gemeinsamen Host ----------
test("F4: nach Mausklick auf Ton und Pause liegt die Eingabe wieder beim Feld; per Tastatur ausgeloest bleibt der Fokus am Knopf", async () => {
  const { ctx, p, errs } = await openStage({ card: "arcade-ziegel", mode: "bot", seed: "fokus" }, "desk1280");
  await p.waitForFunction(() => globalThis.__arcPhase === "go", null, { timeout: 8000 });
  for (const sel of [".rt-sound", ".rt-pause"]) {
    await p.locator(sel).click();
    assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.className), "rt-canvas", sel + ": Fokus zurueck auf dem Feld");
    const x0 = await paddle(p);
    await p.keyboard.down(x0 > 500 ? "ArrowLeft" : "ArrowRight"); await p.waitForTimeout(400); await p.keyboard.up(x0 > 500 ? "ArrowLeft" : "ArrowRight");
    await p.waitForTimeout(100);
    assert.ok(Math.abs((await paddle(p)) - x0) > 80, sel + ": Pfeiltaste bewegt den Schlaeger nach dem Klick");
  }
  // Tastatur: Ton per Tab und Enter -> Fokus bleibt auf dem Knopf (Tastaturbedienung der Knoepfe bleibt erhalten)
  await p.locator(".rt-sound").focus(); await p.keyboard.press("Enter");
  assert.match(await p.evaluate(() => document.activeElement.className), /rt-sound/, "per Tastatur bleibt der Fokus am Knopf");
  assert.deepEqual(errs, []); await ctx.close();
});

test("F3: das letzte Bild zeigt den Endstand (Leinwand und Ansage = Stand der Partie)", async () => {
  const { ctx, p, errs } = await openStage({ card: "arcade-ziegel", mode: "bot", seed: "endstand", fast: 24 }, "desk1280");
  await p.waitForFunction(() => globalThis.__arcDone === true, null, { timeout: 120000 });
  await p.waitForTimeout(100);
  const r = await p.evaluate(() => ({ st: globalThis.__arc.status(), drawn: globalThis.__arc.stage.last.info.status, label: document.querySelector("canvas.rt-canvas").getAttribute("aria-label") }));
  assert.ok(r.st.over && r.drawn.over, "das gezeichnete Bild ist das Ende: " + JSON.stringify(r.drawn));
  assert.deepEqual(r.drawn.score, r.st.score, "gezeichneter Stand = Endstand");
  assert.ok(r.label.includes(r.st.score[0] + " : " + r.st.score[1]), "Leinwand nennt den Endstand: " + r.label + " / " + r.st.score);
  assert.deepEqual(errs, []); await ctx.close();
});

test("F10: Handy - die Hauptaktion hat einen grossen Knopf am Feld (Kick, Volley, Schnee, Panzer, Elfer, Stock, Murmel)", async () => {
  for (const [id, label] of [["arcade-kick", "Kicken"], ["arcade-volley", "Springen"], ["arcade-snow", "Werfen"], ["arcade-panzer", "Feuer"], ["arcade-elfer", "Schießen"], ["arcade-stock", "Werfen"], ["arcade-murmel", "Werfen"]]) {
    const { ctx, p, errs } = await openStage({ card: id, mode: "bot", seed: "knopf" }, "phone390");
    const btn = p.locator(".rt-controls .rt-btn", { hasText: label });
    assert.equal(await btn.count(), 1, id + ": Knopf " + label);
    const r = await btn.boundingBox();
    assert.ok(r.height >= 60 && r.width >= 60, id + ": gross genug " + JSON.stringify(r));
    assert.deepEqual(errs, [], id); await ctx.close();
  }
});

for (const card of ["flug", "lauf"]) test("F5/F8 (" + card + ", Handy): am Ende stehen Ergebnis und „Nochmal“ im ersten Bildschirm, keine Steuerknoepfe; gegen den Computer heisst der Sieger Computer", async () => {
  const { p, errs, ctx } = await open(b, { view: "phone390" });
  await act(p, "open-" + card); await waitScreen(p, "card-view"); await pickMode(p, "de", "bot");
  await act(p, "go"); await waitScreen(p, "card-rt-over", 180000);
  const r = await p.evaluate(() => { scrollTo(0, 0); const a = document.querySelector('[data-act="again"]').getBoundingClientRect();
    return { vh: innerHeight, again: a.bottom, res: document.querySelector(".result").textContent, ctl: document.querySelectorAll(".rt-controls, .rt-key").length }; });
  assert.ok(r.again <= r.vh, card + ": „Nochmal“ sichtbar ohne Scrollen: " + Math.round(r.again) + " > " + r.vh);
  assert.equal(r.ctl, 0, "keine Steuerknoepfe nach dem Ende");
  assert.doesNotMatch(r.res, /gewinnt: \d/, "kein Sitz als Zahl: " + r.res);
  if (/gewinnt/.test(r.res)) assert.match(r.res, /gewinnt: Computer\./);
  assert.deepEqual(errs, []); await ctx.close();
});
