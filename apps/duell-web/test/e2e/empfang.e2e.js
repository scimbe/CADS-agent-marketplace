"use strict";
// Redesign wave 1, flows 3 and 4: sharing with one tap (the short link is made at "Fertig", "An {Name} schicken" opens the
// share menu at once, the long link when the short one is not there, an honest line about the link) and receiving ("Von
// {Name}, für dich", the card big, one main action by kind, "Selbst eine machen" and "Melden" quiet, a reply that fits).
// axe, no covered or small target at 328, 390, 820, 1280 px and 200 %; the shared link carries what was made.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const G = require("./lib/grund.js");
const C = require("../../src/core.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");

const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
const ORIGIN = new URL(C.DEFAULT_API).origin;
const DAY = "2026-11-08T10:00:00Z";

async function axe(p, sel) {
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
  return p.evaluate(([s, o]) => window.axe.run(document.querySelector(s), o).then((r) => r.violations.map((x) => x.id + " (" + x.nodes.length + "): " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "))), [sel, RULES]);
}
// A person whose phone has a share sheet (recorded, nothing leaves) and maybe a nickname; short: own answer for /api/s.
async function phone(b, o) {
  const ctx = await G.person(b, { lang: o.lang || "de", view: o.view || "phone390", time: DAY });
  await ctx.addInitScript((nick) => {
    window.__shared = []; navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); };
    if (nick) { const s = JSON.parse(localStorage.getItem("daily.v1") || "{}"); s.me = Object.assign({}, s.me, { nick }); localStorage.setItem("daily.v1", JSON.stringify(s)); }
  }, o.nick || "");
  ctx.sent = [];
  ctx.on("request", (r) => { if (r.url().startsWith(ORIGIN)) ctx.sent.push({ url: r.url(), method: r.method(), body: r.postData() || "" }); });
  if (o.short) await ctx.route(ORIGIN + "/api/s", o.short);
  return ctx;
}
const stats = (ctx) => ctx.sent.filter((x) => x.url.endsWith("/api/duell/stat") && /"e":"share"/.test(x.body));
const posts = (ctx) => ctx.sent.filter((x) => x.url.endsWith("/api/s") && x.method === "POST");
// A feel-good card, finished with its one tap (the name in front when given): the finished screen.
async function made(ctx, id, to) {
  const p = await G.open(ctx, "#i=" + (id || "warm-toll"));
  if (to) await p.locator("#warmname").fill(to);
  await p.locator("#go").click(); await p.locator("#done:not([hidden])").waitFor();
  return p;
}

test("Teilen: Kurzlink schon bei Fertig, „An Lea schicken“ oeffnet mit einem Tipp das Teilen-Menue mit dem Kurzlink; Statistik erst beim Teilen; axe 0", async () => {
  ensureBuilt("");
  const b = await G.launch(), bad = [];
  for (const view of ["phone390", "phone328", "tablet820", "desk1280", "zoom200"]) {
    const ctx = await phone(b, { view, nick: "Ana" }), p = await made(ctx, "warm-toll", "Lea");
    assert.equal(await p.locator("#donetitle").textContent(), "Fertig. Wer bekommt sie?");
    assert.equal(await p.locator("#share").textContent(), "An Lea schicken");
    await p.waitForFunction(() => window.DailyDebug.result().link && window.DailyDebug.result().link.short);
    assert.equal(posts(ctx).length, 1, view + ": der Kurzlink entstand bei Fertig, ohne Tipp auf Teilen");
    assert.equal(stats(ctx).length, 0, view + ": Anlegen ist noch kein Teilen");
    await p.locator("#shnote").filter({ hasText: "beim Tippen auf „Fertig“" }).waitFor();
    assert.match(await p.locator("#shnote").textContent(), /90 Tage/);
    (await axe(p, "#done")).forEach((v) => bad.push(view + " axe: " + v));
    (await G.smallTargets(p, "#done")).forEach((v) => bad.push(view + " zu klein: " + v));
    // one tap: the share sheet, with the short link
    await p.locator("#share").click();
    await p.waitForFunction(() => window.__shared.length === 1);
    const sh = (await p.evaluate(() => window.__shared))[0], r = await p.evaluate(() => window.DailyDebug.result());
    assert.equal(sh.url, r.link.url); assert.ok(sh.url.startsWith(C.SHORT_BASE), sh.url);
    assert.match(r.keep.doc.x, /^Lea, ich wollte dir nur mal sagen/, "der Link traegt, was gemacht wurde");
    await p.waitForTimeout(300); assert.equal(stats(ctx).length, 1, view + ": einmal gezaehlt, beim Teilen");
    assert.equal(posts(ctx).length, 1, "kein zweiter Kurzlink");
    await p.locator("#copylink").click(); await p.locator("#toast").filter({ hasText: /Link kopiert|nicht/ }).waitFor();
    assert.deepEqual(p.errs, [], view); await ctx.close();
  }
  await b.close();
  assert.deepEqual(bad, []);
});

test("Teilen ohne Kurzlink: Server weg -> langer Link, ehrlich gesagt; Server langsam -> der Tipp wartet nicht; ein 24-Stunden-Link wird so genannt", async () => {
  ensureBuilt("");
  const b = await G.launch();
  let ctx = await phone(b, { short: (r) => r.abort() }), p = await made(ctx);
  await p.locator("#shnote").filter({ hasText: "Kein kurzer Link" }).waitFor();
  await p.locator("#share").click(); await p.waitForFunction(() => window.__shared.length === 1);
  let sh = (await p.evaluate(() => window.__shared))[0];
  assert.match(sh.url, /#c=/, "der lange Link"); assert.equal(sh.url, await p.evaluate(() => window.DailyDebug.result().url));
  assert.deepEqual(p.errs, []); await ctx.close();
  // a slow server: sharing needs a fresh tap, so the tap does not wait and sends the long link at once
  let hold = null;
  ctx = await phone(b, { short: (r) => new Promise((ok) => { hold = () => ok(r.abort()); }) }); p = await made(ctx);
  assert.match(await p.locator("#shnote").textContent(), /wird gerade angelegt/);
  const t0 = Date.now(); await p.locator("#share").click(); await p.waitForFunction(() => window.__shared.length === 1);
  assert.ok(Date.now() - t0 < 1500, "sofort");
  sh = (await p.evaluate(() => window.__shared))[0]; assert.match(sh.url, /#c=/);
  if (hold) hold(); assert.deepEqual(p.errs, []); await ctx.close();
  // the server says 24 hours (nobody opened it yet): the note says the same
  ctx = await phone(b, { short: (r) => r.fulfill({ status: 201, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ id: "abcdefgh", url: C.SHORT_BASE + "abcdefgh", token: "t-24", exp: Date.now() + 86400000 }) }) });
  p = await made(ctx);
  await p.locator("#shnote").filter({ hasText: "nach 24 Stunden" }).waitFor();
  assert.match(await p.locator("#shnote").textContent(), /ab dem ersten Öffnen bleibt er 90 Tage/);
  assert.deepEqual(p.errs, []); await ctx.close(); await b.close();
});

test("Empfang: „Von Ana, für dich“, die Karte gross, Antworten als Hauptaktion, Selbst eine machen und Melden leise; ohne Namen „Jemand“; axe 0 auf allen Bildschirmen", async () => {
  ensureBuilt("");
  const b = await G.launch(), bad = [];
  const ana = await phone(b, { nick: "Ana" }), s = await made(ana, "warm-toll", "Lea"), url = await s.evaluate(() => window.DailyDebug.result().url);
  const anon = await phone(b, {}), s2 = await made(anon, "warm-toll"), url2 = await s2.evaluate(() => window.DailyDebug.result().url);
  for (const view of ["phone390", "phone328", "tablet820", "desk1280", "zoom200"]) {
    const ctx = await phone(b, { view }), p = await G.open(ctx, url.slice(url.indexOf("#")));
    await p.locator("#recvhead").waitFor();
    // the received card arrives with an animation (scale .9 -> 1, style.css lift): measure once it has landed
    await p.waitForFunction(() => !document.getElementById("leaf").getAnimations({ subtree: true }).some((x) => x.playState === "running"), null, { polling: 50 });
    assert.equal(await p.locator("#recvwho").textContent(), "Von Ana, für dich");
    assert.equal(await p.locator("#recvhead .recvav").textContent(), "A");
    assert.equal(await p.locator("#go").textContent(), "Antworten");
    assert.equal(await p.locator("#selbst").textContent(), "Selbst eine machen");
    assert.equal(await p.locator("#kireport").textContent(), "Melden");
    assert.equal(await p.locator("#startbox").isVisible(), false, "kein Start, keine Leiste auf der Empfangsseite");
    assert.equal(await p.locator("#from").isVisible(), false, "der Absender steht einmal, oben");
    // the card big: drawn, no "Vorschau" needed, main button on the first screen (rule A4)
    const card = await p.evaluate(() => { const c = document.querySelector("#leaf .pvcard"), r = c.getBoundingClientRect(); return { h: Math.round(r.height), peek: !document.getElementById("pvpeek").hidden }; });
    assert.ok(card.h >= (view === "zoom200" ? 80 : 100) && !card.peek, view + ": Karte sichtbar " + JSON.stringify(card));
    assert.equal(await G.inView(p, "#go"), true, view + ": Antworten ohne Scrollen");
    const bg = await p.evaluate(() => [getComputedStyle(document.getElementById("kireport")).backgroundColor, getComputedStyle(document.getElementById("go")).backgroundColor]);
    assert.notEqual(bg[0], bg[1], "Melden ist leise, kein zweiter Hauptknopf");
    (await axe(p, "#home")).forEach((v) => bad.push(view + " axe: " + v));
    (await G.smallTargets(p, "#home")).forEach((v) => bad.push(view + " zu klein: " + v));
    for (const c of await G.covered(p)) bad.push(view + " verdeckt: " + c);
    assert.deepEqual(p.errs, [], view); await ctx.close();
  }
  const ctx = await phone(b, {}), p = await G.open(ctx, url2.slice(url2.indexOf("#")));
  assert.equal(await p.locator("#recvwho").textContent(), "Von Jemand, für dich");
  // "Selbst eine machen": the day's own start page
  await p.locator("#selbst").click(); await p.locator("#startbox").waitFor();
  assert.equal(await p.locator("#recvhead").isVisible(), false);
  assert.deepEqual(p.errs, []);
  await b.close();
  assert.deepEqual(bad, []);
});

test("Antwort mit Bezug: auf einen Gruss ein Gegengruss, auf Du bist toll ein Danke, an die Absenderin; zwei Tipps bis zum Teilen", async () => {
  ensureBuilt("");
  const b = await G.launch(), ana = await phone(b, { nick: "Ana" });
  for (const [id, want] of [["warm-gruss", "warm-gruss"], ["warm-toll", "warm-danke"], ["warm-denke", "warm-denke"], ["warm-sorry", "warm-freunde"]]) {
    const s = await made(ana, id), url = await s.evaluate(() => window.DailyDebug.result().url); await s.close();
    const ctx = await phone(b, {}), p = await G.open(ctx, url.slice(url.indexOf("#")));
    await p.locator("#go").filter({ hasText: "Antworten" }).click();                // tap 1
    await p.locator("#warmname").waitFor();
    assert.equal(await p.evaluate(() => window.DailyDebug.home().idea.id), want, id);
    assert.equal(await p.locator("#warmname").inputValue(), "Ana", id + ": an die Absenderin");
    await p.locator("#go").click(); await p.locator("#done:not([hidden])").waitFor();   // tap 2: finished
    assert.equal(await p.locator("#share").textContent(), "An Ana schicken");
    assert.match(await p.evaluate(() => window.DailyDebug.result().keep.doc.x), /^Ana, /);
    assert.deepEqual(p.errs, [], id); await ctx.close();
  }
  await b.close();
});

test("Empfang je Art: ein Spiel heisst Mitspielen", async () => {
  ensureBuilt("");
  const b = await G.launch(), ana = await phone(b, { nick: "Ana" });
  const s = await G.open(ana, "#i=spiel-lava"); await s.locator("#go").click(); await s.locator("#editor:not([hidden])").waitFor();
  // finished as the app does it, with the trail entry that names who changed it (D.withTrail, as app.js edmain)
  await s.evaluate(() => window.DailyApp.finish(window.Daily.withTrail(window.DailyApp.ed().doc, window.DailyApp.me().nick, ["regeln"]))); await s.locator("#done:not([hidden])").waitFor();
  const url = await s.evaluate(() => window.DailyDebug.result().url);
  const ctx = await phone(b, {}), p = await G.open(ctx, url.slice(url.indexOf("#")));
  await p.locator("#recvhead").waitFor();
  assert.equal(await p.locator("#go").textContent(), "Mitspielen");
  assert.equal(await p.locator("#recvwho").textContent(), "Von Ana, für dich");
  assert.deepEqual(p.errs, []); await b.close();
});
