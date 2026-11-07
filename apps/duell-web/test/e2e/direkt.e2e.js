"use strict";
// Editor E1 (editor concept, wave E1): the part direkt (one undo, stickers without dragging, layer list, description,
// plain language), the part regler (named steps), and the core fixes (tab pattern, every tab in sight, locked button
// contrast, beat grid, seed instead of Math.random, held preview). Gestures on the four screens, one run with the
// keyboard only, and axe-core (a test tool only, never shipped) with no violation in 18 editor states.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const G = require("./lib/grund.js");
const R = require("../../src/regeln.js");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const blank = (k) => "window.DailyApp.openEditor(window.Daily.blankDoc('" + k + "', window.DailyApp.me(), window.Kit.lang), { own: true })";
async function editor(p, kind) { await p.evaluate(blank(kind)); await p.locator("#editor").waitFor(); await p.waitForFunction(() => window.Direkt && document.getElementById("dkbar")); }
const doc = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.DailyDebug.doc())));
const tabTo = (p, k) => p.locator('#tabs [data-k="' + k + '"]').click();
// the centre of sticker i on the screen
const at = (p, i) => p.evaluate((i) => { const r = document.getElementById("stage").getBoundingClientRect(), s = window.DailyDebug.doc().sk[i]; return { x: r.left + s.x * r.width, y: r.top + s.y * r.height, w: r.width, h: r.height, l: r.left, t: r.top }; }, i);
function ratio(a, b) {
  const L = (s) => { const c = s.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("Gesten auf vier Bildschirmen: Tippen waehlt, Ziehen und Pinch, Verschieben per Tipp, Pfeilknoepfe, ein Undo/Redo ueber 10 Schritte", async () => {
  const b = await G.launch();
  try {
    for (const view of ["phone390", "phone328", "quer", "zoom200"]) {
      const ctx = await G.person(b, { view, lang: "de" }), p = await G.open(ctx, "");
      await editor(p, "card");
      // the undo buttons never lie over the tabs, the preview or the header (WCAG 1.4.4, 2.4.11), also at 200 %
      const over = await p.evaluate(() => { const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return [...document.querySelectorAll("#dkbar button")].flatMap((x) => ["#tabs", "#stage", "#editor > .bar"].filter((s) => hit(x.getBoundingClientRect(), document.querySelector(s).getBoundingClientRect()))); });
      assert.deepEqual(over, [], view + ": Undo-Leiste verdeckt");
      await tabTo(p, "Sticker");
      await p.locator('#panel [data-dk="add0"]').click();
      let d = await doc(p); assert.equal(d.sk.length, 1, view);
      // a tap next to the sticker drops the choice, a tap on it chooses it again
      let s = await at(p, 0);
      const free = { x: s.l + (s.x - s.l < s.w / 2 ? 0.9 : 0.1) * s.w, y: s.t + 0.9 * s.h };
      await p.mouse.click(free.x, free.y);
      assert.equal(await p.evaluate(() => window.DailyApp.ed().sel), -1, view + ": daneben getippt");
      await p.mouse.click(s.x, s.y);
      if (await p.evaluate(() => window.DailyApp.ed().sel) !== 0) await p.locator("#panel [role=option]").nth(1).click();   // tiny preview: the list picks it
      assert.equal(await p.evaluate(() => window.DailyApp.ed().sel), 0, view + ": Sticker gewaehlt");
      assert.match(await p.locator("#panel [role=option][aria-selected=true]").textContent(), /^Sticker /, view + ": die Liste zeigt die Wahl");
      // drag with the mouse: one gesture, one undo step. At 200 % zoom the preview is ~55 px wide and the grip covers the
      // sticker's centre: there the buttons and Move-by-tap below are the way (that is what they are for).
      const free2 = await p.evaluate(([x, y]) => document.elementFromPoint(x, y) === document.getElementById("stage"), [s.x - 12, s.y + 15]);
      if (free2) {
      const before = await doc(p);
      await p.mouse.move(s.x, s.y); await p.mouse.down();
      for (let i = 1; i <= 6; i++) await p.mouse.move(s.x - i * 4, s.y + i * 5);
      await p.mouse.up(); await p.waitForTimeout(60);
      d = await doc(p); assert.ok(d.sk[0].y > before.sk[0].y, view + ": gezogen");
      await p.locator("#dkbar button").first().click();
      assert.deepEqual((await doc(p)).sk, before.sk, view + ": ein Undo nimmt die ganze Ziehgeste zurueck");
      await p.locator("#dkbar button").nth(1).click();
      assert.deepEqual((await doc(p)).sk, d.sk, view + ": Redo");
      } else assert.equal(view, "zoom200", "nur bei 200 % ist die Vorschau zu klein zum Ziehen");
      // pinch with two fingers (touch screens): bigger
      if (G.VIEWS[view].hasTouch) {
        s = await at(p, 0);
        const cdp = await ctx.newCDPSession(p), z0 = (await doc(p)).sk[0].z;
        const tp = (type, dx) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: s.x - dx, y: s.y, id: 1 }, { x: s.x + dx, y: s.y, id: 2 }] });
        await tp("touchStart", 10); for (const dx of [14, 18, 22, 26]) await tp("touchMove", dx); await tp("touchEnd", 26);
        await p.waitForTimeout(60);
        assert.ok((await doc(p)).sk[0].z > z0 * 1.5, view + ": Pinch vergroessert " + z0 + " -> " + (await doc(p)).sk[0].z);
      }
      // Move, then a tap on the card (WCAG 2.5.7): no drag needed
      await p.locator('#panel [data-dk="move"]').click();
      assert.equal(await p.locator('#panel [data-dk="move"]').getAttribute("aria-pressed"), "true");
      s = await at(p, 0);
      await p.mouse.click(s.l + 0.8 * s.w, s.t + 0.75 * s.h);
      d = await doc(p);
      assert.ok(Math.abs(d.sk[0].x - 0.8) < 0.02 && Math.abs(d.sk[0].y - 0.75) < 0.02, view + ": per Tipp platziert " + JSON.stringify(d.sk[0]));
      assert.equal(await p.locator('#panel [data-dk="move"]').getAttribute("aria-pressed"), "false", "Verschieben endet nach dem Tipp");
      // 10 steps with the buttons, 10 times undo, 10 times redo
      const states = [await doc(p)];
      const btns = ["left", "up", "left", "small", "turn", "up", "big", "left", "down", "turn"];
      for (const k of btns) { await p.locator('#panel [data-dk="' + k + '"]').click(); states.push(await doc(p)); }
      for (let i = 1; i < states.length; i++) assert.notDeepEqual(states[i].sk, states[i - 1].sk, view + ": Schritt " + i);
      for (let i = 9; i >= 0; i--) { await p.locator("#dkbar button").first().click(); assert.deepEqual(await doc(p), states[i], view + ": Undo bis Stand " + i); }
      for (let i = 1; i <= 10; i++) { await p.locator("#dkbar button").nth(1).click(); assert.deepEqual(await doc(p), states[i], view + ": Redo bis Stand " + i); }
      assert.equal(await p.locator("#dkbar button").nth(1).getAttribute("aria-disabled"), "true");
      // a step and at once an undo (inside the 16 ms redraw): the step is not lost
      await p.evaluate(() => { document.querySelector('#panel [data-dk="up"]').click(); window.Direkt.go(-1); });
      assert.deepEqual(await doc(p), states[10], view + ": schnelles Undo nimmt genau den neuen Schritt zurueck");
      await p.evaluate(() => window.Direkt.go(1)); assert.notDeepEqual((await doc(p)).sk, states[10].sk);
      await p.evaluate(() => window.Direkt.go(-1));
      // typing a word is one step; Ctrl+Z outside the field undoes it, Ctrl+Shift+Z brings it back
      await tabTo(p, "Text");
      const x0 = (await doc(p)).x, f = p.locator("#panel textarea").first();
      await f.fill(""); await f.pressSequentially("Hallo Oma", { delay: 30 });
      assert.equal((await doc(p)).x, "Hallo Oma");
      await p.waitForTimeout(80); await p.locator("#tabs [aria-selected=true]").focus();
      await p.keyboard.press("Control+z"); assert.equal((await doc(p)).x, x0, view + ": ein Undo fuer Leeren und Tippen ohne Pause");
      await p.keyboard.press("Control+Shift+z"); assert.equal((await doc(p)).x, "Hallo Oma");
      assert.deepEqual(p.errs, [], view);
      await ctx.close();
    }
  } finally { await b.close(); }
});

test("Reiter: Pfeiltasten, ein Tab-Stopp, aria-controls/tabpanel; kein Reiter ausserhalb des Bildes (Duell 390 und 328 px)", async () => {
  const b = await G.launch();
  try {
    for (const view of ["phone390", "phone328"]) for (const kind of ["duel", "photo", "card", "game", "sound"]) {
      const ctx = await G.person(b, { view, lang: "de" }), p = await G.open(ctx, "");
      await editor(p, kind);
      const r = await p.evaluate(() => {
        const tabs = [...document.querySelectorAll("#tabs [role=tab]")], W = innerWidth, panel = document.getElementById("panel");
        return { n: tabs.length, out: tabs.filter((x) => { const q = x.getBoundingClientRect(); return q.left < -0.5 || q.right > W + 0.5 || q.width < 20; }).map((x) => x.textContent),
          zero: tabs.filter((x) => x.tabIndex === 0).length, ctl: tabs.every((x) => x.getAttribute("aria-controls") === "panel"), role: panel.getAttribute("role"),
          by: panel.getAttribute("aria-labelledby"), sel: tabs.find((x) => x.getAttribute("aria-selected") === "true").id, small: tabs.filter((x) => x.getBoundingClientRect().height < 44 || x.getBoundingClientRect().width < 44).length };
      });
      assert.deepEqual(r.out, [], view + " " + kind + ": unsichtbare Reiter");
      assert.equal(r.zero, 1, "roving tabindex"); assert.ok(r.ctl); assert.equal(r.role, "tabpanel"); assert.equal(r.by, r.sel); assert.equal(r.small, 0);
      await p.locator("#tabs [aria-selected=true]").focus();
      const first = await p.evaluate(() => document.activeElement.dataset.k);
      await p.keyboard.press("ArrowRight");
      const k2 = await p.evaluate(() => [document.activeElement.dataset.k, document.querySelector("#tabs [aria-selected=true]").dataset.k, document.activeElement.tabIndex]);
      assert.notEqual(k2[0], first); assert.equal(k2[0], k2[1], "Pfeil oeffnet den Reiter"); assert.equal(k2[2], 0);
      await p.keyboard.press("End"); assert.equal(await p.evaluate(() => document.activeElement === document.querySelector("#tabs").lastElementChild && document.activeElement.getAttribute("aria-selected")), "true");
      await p.keyboard.press("ArrowRight"); assert.equal(await p.evaluate(() => document.activeElement === document.querySelector("#tabs").firstElementChild), true, "rundum");
      await p.keyboard.press("ArrowLeft"); await p.keyboard.press("Home"); assert.equal(await p.evaluate(() => document.activeElement === document.querySelector("#tabs").firstElementChild), true);
      assert.deepEqual(p.errs, []);
      await ctx.close();
    }
  } finally { await b.close(); }
});

test("Beat-Raster: Ziele ab 44 px auf 328 px, Namen 'Trommel, Schritt 1', aria-pressed folgt dem Zustand, vier Seiten", async () => {
  const b = await G.launch();
  try {
    for (const view of ["phone328", "phone390"]) {
      const ctx = await G.person(b, { view, lang: "de" }), p = await G.open(ctx, "");
      await editor(p, "sound"); await tabTo(p, "Sound");
      const steps = p.locator("#panel .step");
      assert.equal(await steps.count(), 16);
      assert.deepEqual(await G.smallTargets(p, "#panel .grid"), [], view);
      const s0 = steps.first();
      assert.equal(await s0.getAttribute("aria-label"), "Trommel, Schritt 1");
      const was = (await doc(p)).p.k[0] === "x";
      assert.equal(await s0.getAttribute("aria-pressed"), String(was));
      await s0.click();
      assert.equal(await s0.getAttribute("aria-pressed"), String(!was)); assert.equal((await doc(p)).p.k[0] === "x", !was);
      await p.getByRole("button", { name: "Schritt 13–16" }).click();
      assert.equal(await p.locator("#panel .step").first().getAttribute("aria-label"), "Trommel, Schritt 13");
      assert.equal(await p.getByRole("button", { name: "Schritt 13–16" }).getAttribute("aria-pressed"), "true");
      await p.locator("#dkbar button").first().click();
      assert.equal((await doc(p)).p.k[0] === "x", was, "auch der Beat hat Undo");
      assert.deepEqual(p.errs, []);
      await ctx.close();
    }
  } finally { await b.close(); }
});

test("Flugspiel: Regler mit Namen statt Zahlen, Schieben setzt den Wert der Stufe; ohne Teil regler bleiben die Zahlen", async () => {
  const b = await G.launch();
  try {
    const ctx = await G.person(b, { view: "phone390", lang: "de" }), p = await G.open(ctx, "");
    await editor(p, "game"); await tabTo(p, "Rules");
    await p.waitForFunction(() => window.Regeln && document.querySelector('#panel input[type=range]').max === "4");
    const r = await p.evaluate(() => [...document.querySelectorAll("#panel .slide")].map((x) => ({ t: x.querySelector("b").textContent, v: x.querySelector("input").getAttribute("aria-valuetext"), k: x.querySelector("input").dataset.k })));
    assert.equal(r.length, 4);
    for (const x of r) { assert.doesNotMatch(x.t, /\d/, "kein Zahlenwert: " + x.t); assert.equal(x.t, x.v); }
    const g = p.locator('#panel input[data-k="gravity"]');
    await g.focus(); await p.keyboard.press("Home");
    assert.equal((await doc(p)).g.params.gravity, R.value("gravity", 0)); assert.equal(await g.getAttribute("aria-valuetext"), "Mond");
    await p.keyboard.press("End"); assert.equal((await doc(p)).g.params.gravity, R.value("gravity", 4)); assert.equal(await g.getAttribute("aria-valuetext"), "Jupiter");
    assert.deepEqual(p.errs, []);
    await ctx.close();
    // without the part: the core's number sliders, nothing broken
    const c2 = await G.person(b, { view: "phone390", lang: "de" }), q = await G.open(c2, "");
    await q.evaluate(() => { delete window.DailyParts.regler; delete window.DailyParts.direkt; });
    await q.evaluate(blank("game")); await q.locator("#editor").waitFor(); await tabTo(q, "Rules");
    assert.match(await q.locator("#panel .slide b").first().textContent(), /^\d+$/);
    await tabTo(q, "Figure"); await tabTo(q, "World");
    assert.equal(await q.locator("#dkbar").count(), 0); assert.deepEqual(q.errs, []);
    await c2.close();
  } finally { await b.close(); }
});

test("Ohne Teil direkt: die heutigen Reiter bleiben, Sticker per Panel, kein Fehler; mit Teil: Beschreibung, Farbnamen, Liste", async () => {
  const b = await G.launch();
  try {
    const ctx = await G.person(b, { view: "phone390", lang: "de" }), p = await G.open(ctx, "");
    await p.evaluate(() => { delete window.DailyParts.direkt; });
    await p.evaluate(blank("card")); await p.locator("#editor").waitFor();
    await tabTo(p, "Sticker"); await p.locator("#panel .chip.em").first().click();
    await p.getByRole("button", { name: "Sticker größer" }).click();
    assert.equal((await doc(p)).sk.length, 1); assert.equal(await p.locator("#dkbar").count(), 0);
    assert.equal(await p.locator("#stage").getAttribute("aria-describedby"), null);
    assert.deepEqual(p.errs, []); await ctx.close();

    const c2 = await G.person(b, { view: "phone390", lang: "en" }), q = await G.open(c2, "");
    await editor(q, "card"); await tabTo(q, "Sticker"); await q.locator('#panel [data-dk="add0"]').click();
    const desc = await q.evaluate(() => { const c = document.getElementById("stage"); return [c.getAttribute("role"), document.getElementById(c.getAttribute("aria-describedby")).textContent]; });
    assert.equal(desc[0], "img"); assert.match(desc[1], /^Card\. Text: “.+”\. Background: \w+ and \w+, style .+\. 1 stickers?: Sticker .+, (top|bottom|left|right|in the middle)/); assert.doesNotMatch(desc[1], /#[0-9a-f]{3}/i);
    const opts = await q.locator("#panel [role=listbox] [role=option]").allTextContents();
    assert.equal(opts.length, 3); assert.match(opts[1], /^Sticker /);
    await tabTo(q, "Color");
    const sw = await q.locator("#panel .sw").evaluateAll((xs) => xs.map((x) => x.getAttribute("aria-label")));
    assert.ok(sw.length >= 8 && sw.every((l) => /^[a-z ]+ and [a-z ]+$/.test(l)), sw.join(" | "));
    assert.match(await q.locator("#panel input[type=color]").first().getAttribute("aria-label"), /^Custom colour 1, now [a-z ]+$/);
    assert.deepEqual(q.errs, []); await c2.close();
  } finally { await b.close(); }
});

test("Gesperrter Hauptknopf: Kontrast ab 4,5:1, bleibt antippbar; reduzierte Bewegung haelt die Spielvorschau an, Knopf startet sie", async () => {
  const b = await G.launch();
  try {
    for (const view of ["phone390", "phone328"]) {
      const ctx = await G.person(b, { view, lang: "de" }), p = await G.open(ctx, "");
      await editor(p, "card");
      const c = await p.evaluate(() => { const s = getComputedStyle(document.getElementById("edmain")); return { wait: document.getElementById("edmain").classList.contains("wait"), fg: s.color, bg: s.backgroundColor, op: s.opacity, dis: document.getElementById("edmain").getAttribute("aria-disabled") }; });
      assert.equal(c.wait, true); assert.equal(c.op, "1"); assert.equal(c.dis, "true");
      assert.ok(ratio(c.fg, c.bg) >= 4.5, "Kontrast " + ratio(c.fg, c.bg).toFixed(2) + " " + c.fg + " auf " + c.bg);
      await p.locator("#edmain").click({ force: true });   // aria-disabled, but a tap still leads to the open field
      assert.equal(await p.evaluate(() => document.activeElement.tagName), "INPUT", "Tipp springt zum offenen Feld");
      assert.equal(await G.inView(p, "#edmain"), true);
      await ctx.close();
    }
    const ctx = await b.newContext(Object.assign({}, G.VIEWS.phone390, { reducedMotion: "reduce", locale: "de-DE" }));
    const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
    await p.goto("file://" + require("node:path").join(G.DIST, "index.html")); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
    await editor(p, "game"); await p.locator(".dkhold").waitFor();
    const y = () => p.evaluate(() => window.DuellDebug.snap().y);
    assert.equal(await p.locator(".dkhold").getAttribute("aria-pressed"), "true", "steht bei reduzierter Bewegung");
    const y0 = await y(); await p.waitForTimeout(500); assert.equal(await y(), y0, "nichts bewegt sich");
    await p.locator(".dkhold").click(); assert.equal(await p.locator(".dkhold").getAttribute("aria-pressed"), "false");
    await p.waitForTimeout(500); assert.notEqual(await y(), y0, "laeuft nach dem Knopf");
    await p.locator(".dkhold").click(); assert.equal(await p.locator(".dkhold").getAttribute("aria-label"), "Vorschau anhalten");
    assert.deepEqual(p.errs, []); await ctx.close();
  } finally { await b.close(); }
});

test("Einfache Sprache: Schalter in Mein Stil, standardmaessig aus, bleibt nach dem Neuladen, aendert Woerter im Editor, de und en", async () => {
  const b = await G.launch();
  try {
    for (const [lang, on, off, word] of [["de", "An", "Aus", "Titel"], ["en", "On", "Off", "Title"]]) {
      const ctx = await G.person(b, { view: "phone390", lang }), p = await G.open(ctx, "");
      const before = await (async () => { await editor(p, "card"); return p.locator('#tabs [data-k="Idea"]').textContent(); })();
      await p.locator("#edback").click(); await p.locator("#me").click();
      const grp = p.getByRole("group", { name: lang === "de" ? "Einfache Sprache" : "Plain language" });
      await grp.waitFor();
      assert.equal(await grp.getByRole("button", { name: off }).getAttribute("aria-pressed"), "true", "standardmaessig aus");
      await grp.getByRole("button", { name: on }).click();
      assert.equal(await grp.getByRole("button", { name: on }).getAttribute("aria-pressed"), "true");
      await p.reload(); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
      await editor(p, "card"); await p.waitForFunction((w) => document.querySelector('#tabs [data-k="Idea"]').textContent === w, word);
      assert.notEqual(before, word);
      await p.locator("#edback").click(); await p.locator("#me").click();
      await p.getByRole("group", { name: lang === "de" ? "Einfache Sprache" : "Plain language" }).getByRole("button", { name: off }).click();
      await p.locator("#shback").click(); await editor(p, "card");
      assert.equal(await p.locator('#tabs [data-k="Idea"]').textContent(), before, "aus: wieder die alten Woerter");
      assert.deepEqual(p.errs, []); await ctx.close();
    }
  } finally { await b.close(); }
});

test("Nur Tastatur: eigene Karte mit Titel und Sticker bauen, verschieben, fertig; Tab-Stopps bis Fertig gezaehlt", async () => {
  const b = await G.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1024, height: 768 }, locale: "de-DE" }), p = await ctx.newPage();
    p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
    await ctx.addInitScript(() => { try { localStorage.setItem("daily.v1", JSON.stringify({ lang: "de" })); } catch (e) {} });
    await p.goto("file://" + require("node:path").join(G.DIST, "index.html")); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
    const active = () => p.evaluate(() => { const a = document.activeElement; return a.id || (a.dataset && (a.dataset.dk || a.dataset.k)) || a.getAttribute("role") || a.tagName; });
    async function tabUntil(test, max, key) { for (let i = 0; i < (max || 60); i++) { await p.keyboard.press(key || "Tab"); if (await p.evaluate(test)) return i + 1; } throw new Error("nicht erreicht: " + test + " bei " + (await active())); }
    await tabUntil(() => document.activeElement.id === "own"); await p.keyboard.press("Enter");
    await tabUntil(() => /Karte/.test(document.activeElement.textContent) && document.activeElement.classList.contains("mech")); await p.keyboard.press("Enter");
    await p.locator("#editor").waitFor(); await p.waitForFunction(() => window.Direkt);
    // the title (tab Aufgabe is open first)
    await tabUntil(() => document.activeElement.tagName === "INPUT"); await p.keyboard.type("Für Oma");
    // back to the tabs, along to Sticker with the arrows
    await tabUntil(() => document.activeElement.dataset.k === "Idea", 10, "Shift+Tab");
    await p.keyboard.press("End"); assert.equal(await active(), "tabSticker");
    await tabUntil(() => document.activeElement.dataset.dk === "add0"); await p.keyboard.press("Enter");
    assert.equal((await doc(p)).sk.length, 1);
    const x0 = (await doc(p)).sk[0].x;
    await tabUntil(() => document.activeElement.dataset.dk === "right"); await p.keyboard.press("Enter"); await p.keyboard.press("Enter");
    assert.equal(await active(), "right", "der Fokus bleibt auf dem Knopf");
    await p.keyboard.press("Shift+ArrowLeft");
    const x1 = (await doc(p)).sk[0].x; assert.ok(Math.abs(x1 - (x0 + 0.1 - 0.1)) < 0.011, x0 + " -> " + x1);
    await tabUntil(() => document.activeElement.dataset.dk === "big"); await p.keyboard.press("Enter");
    await p.keyboard.press("Control+z"); await p.keyboard.press("Control+Shift+z");
    // the list: choose the sticker row with the arrows
    await tabUntil(() => document.activeElement.dataset.dk === "list", 15, "Shift+Tab");
    await p.keyboard.press("Home"); assert.equal(await p.evaluate(() => window.DailyApp.ed().sel), -1);
    await p.keyboard.press("ArrowDown"); assert.equal(await p.evaluate(() => window.DailyApp.ed().sel), 0, "Pfeil waehlt den Sticker");
    // count the stops from close to the main button
    await p.locator("#edback").focus();
    const stops = await tabUntil(() => document.activeElement.id === "edmain");
    await p.keyboard.press("Enter");
    await p.locator("#share").waitFor();
    const d = await p.evaluate(() => window.DailyDebug.doc());
    assert.equal(d.t, "Für Oma"); assert.equal(d.sk.length, 1);
    console.log("# Tab-Stopps von Schliessen bis Fertig (Reiter Sticker, ein Sticker gewaehlt): " + stops);
    assert.ok(stops <= 26, "Tab-Stopps " + stops + " (Ziel unter 8 erst mit der Leiste in E2)");
    assert.deepEqual(p.errs, []); await ctx.close();
  } finally { await b.close(); }
});

test("axe-core: keine Verstoesse (wcag2a/aa, 21aa, 22aa) im Editor, 18 Zustaende ueber 6 Kartenarten, de", async () => {
  const b = await G.launch();
  try {
    const ctx = await G.person(b, { view: "phone390", lang: "de" }), p = await G.open(ctx, "");
    await p.addScriptTag({ content: AXE });
    const states = { card: ["Idea", "Sticker", "Color"], photo: ["Photo", "Text", "Sticker"], sound: ["Sound", "Text", "Color"], game: ["Rules", "Figure", "World"], duel: ["Agent", "Rival", "Arena"], quest: ["Riddle", "End", "Color"] };
    const found = [];
    for (const [kind, tabs] of Object.entries(states)) {
      await editor(p, kind);
      for (const k of tabs) {
        await tabTo(p, k); await p.waitForTimeout(150);
        if (k === "Sticker") { await p.locator('#panel [data-dk="add0"]').click(); await p.locator('#panel [data-dk="add1"]').click(); }
        const v = await p.evaluate(() => window.axe.run(document.getElementById("editor"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })
          .then((r) => r.violations.map((x) => x.id + ": " + x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", "))));
        for (const x of v) found.push(kind + "/" + k + " " + x);
      }
      await p.locator("#edback").click();
    }
    assert.deepEqual(found, []);
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});
