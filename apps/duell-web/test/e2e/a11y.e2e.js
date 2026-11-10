"use strict";
// Accessibility basics of the shell: zoom is free, the colour scheme is stated, screen reader names follow the language,
// the sound switch has a state, the ticker waits, stops for good under a finger and has a pause switch, and the
// contrast fixes on the leaf and in Business hold.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const daily = "file://" + path.resolve(__dirname, "../../dist/index.html");
const biz = "file://" + path.resolve(__dirname, "../../dist/business/index.html");
const launch = () => chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
// WCAG contrast of two "rgb(r, g, b)" strings
function ratio(a, b) {
  const L = (s) => { const c = s.match(/\d+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("Zoom frei, color-scheme gesetzt, Burst-Text AA, Labels in EN, Ton-Schalter mit Zustand", async () => {
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "en-US" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(daily);
  const v = await p.evaluate(() => ({ vp: document.querySelector("meta[name=viewport]").content, cs: document.querySelector("meta[name=color-scheme]").content, css: getComputedStyle(document.documentElement).colorScheme }));
  assert.doesNotMatch(v.vp, /user-scalable|maximum-scale/); assert.equal(v.cs, "light dark"); assert.equal(v.css, "light dark");
  const burst = await p.evaluate(() => { const s = getComputedStyle(document.getElementById("dkind")); return [s.color, s.backgroundColor]; });
  assert.ok(ratio(burst[0], burst[1]) >= 4.5, "Burst " + burst.join(" auf "));
  const name = (id) => p.locator("#" + id).getAttribute("aria-label");
  assert.equal(await name("lang"), "Language: English, switch to German");
  for (const [id, want] of [["edback", "Close"], ["shback", "Close"], ["gback", "Close"], ["me", "My style"], ["cv", "Playing field"], ["coqr", "QR code"], ["feat", "Features"], ["edsave", "Keep"]]) assert.equal(await name(id), want, id);
  // the day's drawn card is named by what it shows (P-A), in the page's language; "Preview" only when it shows nothing
  const card = await p.evaluate(() => { const c = document.getElementById("pvcard"); return { label: c.getAttribute("aria-label"), role: c.getAttribute("role") }; });
  assert.equal(card.role, "img"); assert.ok(card.label && card.label !== "Vorschau", JSON.stringify(card));
  const none = await p.evaluate(() => Array.from(document.querySelectorAll("[aria-label]")).map((e) => e.getAttribute("aria-label")).filter((l) => /Schließen|Sprache|Vorschau|Spielfeld|Mein Stil|Merken/.test(l)));
  assert.deepEqual(none, [], "kein deutsches Label in EN");
  assert.equal(await name("mute"), "Mute"); assert.equal(await p.locator("#mute").getAttribute("aria-pressed"), "false");
  await p.locator("#mute").click();
  assert.equal(await p.locator("#mute").getAttribute("aria-pressed"), "true"); assert.equal(await name("mute"), "Mute", "der Name bleibt, der Zustand wechselt");
  await p.locator("#lang").click();
  assert.equal(await name("edback"), "Schließen"); assert.equal(await name("mute"), "Ton aus"); assert.equal(await name("lang"), "Sprache: Deutsch, zu Englisch wechseln");
  assert.deepEqual(errs, []);
  await b.close();
});

test("Laufband: steht 3 s, laeuft dann, Beruehrung haelt es dauerhaft an Ort und Stelle, Schalter startet es wieder", async () => {
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" });
  await ctx.addInitScript(() => localStorage.setItem("daily.v1", JSON.stringify({ alle: true })));   // "Alle Karten" open (redesign wave 1): no tap needed, so the strip may still start
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-11-05T10:00:00Z") });
  await p.goto(daily);
  const st = () => p.evaluate(() => { const f = document.getElementById("feat"), tr = f.querySelector(".track"), sw = document.getElementById("tickpause");
    return { anim: getComputedStyle(tr).animationName, copies: Array.from(tr.querySelectorAll("[aria-hidden=true]")).filter((x) => getComputedStyle(x).display !== "none").length, all: tr.children.length, pressed: sw.getAttribute("aria-pressed"), label: sw.getAttribute("aria-label"), h: sw.getBoundingClientRect().height, w: sw.getBoundingClientRect().width }; });
  let s = await st();
  assert.equal(s.anim, "none", "steht zuerst"); assert.equal(s.copies, 0, "keine Kopie, solange es steht");
  assert.equal(s.label, "Laufband anhalten"); assert.equal(s.pressed, "false"); assert.ok(s.h >= 44 && s.w >= 44, "Schalter 44 px");
  await p.clock.runFor(2000); await p.keyboard.press("Shift");   // a key starts the 3 s again
  await p.clock.runFor(2500); assert.equal((await st()).anim, "none");
  await p.clock.runFor(1000); s = await st();
  assert.equal(s.anim, "ticker", "laeuft nach 3 s ohne Beruehrung"); assert.equal(s.copies * 2, s.all, "zweite Kopie nur fuers Auge");
  await p.waitForTimeout(1500);   // the CSS animation runs in real time
  // a finger comes down on the moving strip: in the same frame the buttons must not jump
  const jump = await p.evaluate(() => {
    const lane = document.querySelector("#feat .lane"), btn = lane.querySelectorAll("button")[1], x0 = btn.getBoundingClientRect().left;
    lane.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return Math.abs(btn.getBoundingClientRect().left - x0);
  });
  assert.ok(jump < 2, "die Knoepfe bleiben, wo sie waren: " + jump);
  s = await st(); assert.equal(s.anim, "none", "nach der Beruehrung steht es"); assert.equal(s.pressed, "true");
  await p.locator("#feat .lane button:not([aria-hidden])", { hasText: "Karte" }).tap(); await p.locator("#editor").waitFor();   // stands still: one tap hits
  await p.locator("#edback").click(); await p.locator("#home").waitFor();
  await p.clock.runFor(10000); assert.equal((await st()).anim, "none", "dauerhaft");
  await p.locator("#tickpause").tap(); s = await st();
  assert.equal(s.anim, "ticker"); assert.equal(s.pressed, "false");
  await p.locator("#tickpause").tap(); assert.equal((await st()).anim, "none");
  assert.deepEqual(errs, []);
  await b.close();
});

test("Business: ein Eintrag ohne Laufband und ohne Kopie, Tabs voll deckend, Fokusring in der Firmenfarbe", async () => {
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-11-05T10:00:00Z") });
  await p.goto(biz); await p.clock.runFor(5000);
  const f = await p.evaluate(() => ({ n: document.querySelectorAll("#feat .track button").length, anim: getComputedStyle(document.querySelector("#feat .track")).animationName, sw: !!document.getElementById("tickpause") }));
  assert.deepEqual(f, { n: 1, anim: "none", sw: false });
  await p.locator("#go").tap(); await p.locator("#editor").waitFor();
  const tabs = await p.evaluate(() => Array.from(document.querySelectorAll("#tabs button")).map((x) => { const s = getComputedStyle(x); return [s.opacity, s.color, getComputedStyle(document.getElementById("tabs")).backgroundColor]; }));
  for (const [o, c, bg] of tabs) { assert.equal(o, "1"); assert.ok(ratio(c, bg) >= 4.5, c + " auf " + bg); }
  const field = p.locator("#panel .field").first();
  if (await field.count()) {
    await field.focus();
    const ring = await field.evaluate((e) => [getComputedStyle(e).outlineColor, getComputedStyle(document.body).getPropertyValue("--org").trim()]);
    assert.ok(ratio(ring[0], "rgb(255, 255, 255)") >= 3, "Fokusring 3:1: " + ring[0]);
  }
  assert.deepEqual(errs, []);
  await b.close();
});
