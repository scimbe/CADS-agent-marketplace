"use strict";
// A card's colour (Farbe in the editor) stays on that card: the editor shows it, the start page, the shelf opened from
// the editor and the browser bar (meta theme-color) keep the app's colours (My style), also after a reload. 390x844.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");

const A = "#2b4bff", B = "#7ee0ff";   // My style: blue/yellow; the card: light blue/orange (the last pair)
const SEED = { me: { nick: "Mira", emoji: "🦖", colors: [A, "#ffe600"], set: "tiere" } };

test("Farbe einer Karte faerbt nur die Karte, die Startseite behaelt das App-Schema", async () => {
  const b = await G.launch();
  try {
    const ctx = await G.person(b, { view: "phone390", web: true });
    await ctx.addInitScript((me) => { const s = JSON.parse(localStorage.getItem("daily.v1") || "{}"); if (!s.me) { s.me = me; localStorage.setItem("daily.v1", JSON.stringify(s)); } }, SEED.me);
    const p = await G.open(ctx, "");
    const look = (id) => p.evaluate((id) => ({ a: getComputedStyle(document.getElementById(id)).getPropertyValue("--a").trim(), bg: getComputedStyle(document.getElementById(id)).backgroundColor, bar: document.querySelector('meta[name="theme-color"]').content }), id);
    const rgb = (h) => "rgb(" + [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ") + ")";
    assert.deepEqual(await look("home"), { a: A, bg: rgb(A), bar: A }, "Start vorher");

    await p.locator("#go").click(); await p.locator("#editor:not([hidden])").waitFor();
    await p.evaluate(() => window.DailyApp.tab("Color"));
    await p.locator("#panel .sw").last().click();
    await G.poll(() => look("editor"), (v) => v.a === B, { what: "Editor in Farbe B" });
    assert.deepEqual(await look("editor"), { a: B, bg: rgb(B), bar: B }, "Editor zeigt die Kartenfarbe");

    // My style opened from the editor is an app screen: the app's colours, back in the editor the card's again
    await p.locator("#edstyle").click(); await p.locator("#shelf:not([hidden])").waitFor();
    const sh = await look("shelf"); assert.deepEqual({ a: sh.a, bar: sh.bar }, { a: A, bar: A }, "Regal aus dem Editor");
    await p.locator("#shback").click(); await p.locator("#editor:not([hidden])").waitFor();
    await G.poll(() => look("editor"), (v) => v.a === B && v.bar === B, { what: "zurueck im Editor" });

    await p.locator("#edback").click(); await p.locator("#home:not([hidden])").waitFor();
    assert.deepEqual(await look("home"), { a: A, bg: rgb(A), bar: A }, "Start nach dem Editor");
    assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), rgb(A), "Seitengrund (Desktop-Rand)");

    // the browser's back from the editor as well
    await p.locator("#go").click(); await p.locator("#editor:not([hidden])").waitFor();
    await p.evaluate(() => window.DailyApp.tab("Color")); await p.locator("#panel .sw").last().click();
    await G.poll(() => look("editor"), (v) => v.a === B, { what: "Editor wieder in Farbe B" });
    await p.goBack(); await p.locator("#home:not([hidden])").waitFor();
    assert.deepEqual(await look("home"), { a: A, bg: rgb(A), bar: A }, "Start nach Zurueck");

    await p.reload(); await p.waitForFunction(() => document.body.getAttribute("data-state") === "home");
    assert.deepEqual(await look("home"), { a: A, bg: rgb(A), bar: A }, "Start nach Neuladen");
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});
