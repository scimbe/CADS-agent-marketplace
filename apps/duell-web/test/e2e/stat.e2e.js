"use strict";
// Card numbers and thumbs (src/stat.js, app.js votes): what goes to /api/duell/stat on share, open and vote, and that no
// run reaches the live short-link service (test/e2e/lib/nolive.js, also loaded by `npm run test:e2e` for every file).
const test = require("node:test");
const assert = require("node:assert/strict");
const NL = require("./lib/nolive.js");   // standalone too: the hook patches once
const G = require("./lib/grund.js");
const C = require("../../src/core.js");

const STAT = NL.ORIGIN + "/api/duell/stat";
// plan-09 as a friend sends it (home.e2e.js): a card of the catalog, received.
const GOT = "#c=eyJ2IjoxLCJkIjp7ImsiOiJjYXJkIiwiY29sIjpbIiNmZmQ0MDAiLCIjZmYzYjFkIl0sImJ5IjpbXSwiaSI6InBsYW4tMDkiLCJ4IjoiSGV1dGUgMjAgVWhyLiBWaWRlbyBhbi4gS2VpbmUgQXVzcmVkZW4uIiwic3QiOiJzdGVtcGVsIiwic2siOltdfX0";
const TIME = "2026-11-05T10:00:00Z";
// Every stat request of a context, as sent (the test's own route wins over the hook's).
async function stats(ctx) {
  const got = []; await ctx.route(STAT, (r) => { got.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": r.request().headers().origin || "*", "Access-Control-Allow-Credentials": "true" } }); });
  return got;
}
const until = async (fn, ms) => { const end = Date.now() + (ms || 5000); while (!fn()) { if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } return true; };
const decode = (f) => JSON.parse(Buffer.from(f.replace(/^c=/, ""), "base64url").toString("utf8")).d;

test("Kein Live-Dienst: jeder Request an /api/s bekommt die Antwort des Hooks, eigene Routen eines Tests gehen vor", async () => {
  assert.equal(globalThis.__nolive, true);
  const b = await G.launch(), ctx = await G.person(b, { time: TIME }), seen = [];
  ctx.on("response", (r) => { if (r.url().startsWith(NL.ORIGIN + "/api/")) seen.push([r.request().method(), new URL(r.url()).pathname, r.headers()["x-nolive"]]); });
  const p = await G.open(ctx, "#i=quiz-chaos");
  await p.locator("#go").click(); await p.locator("#edmain").click(); await p.locator("#share").click();
  await p.waitForFunction(() => { const r = window.DailyDebug.result(); return r && r.link; });
  const link = await p.evaluate(() => window.DailyDebug.result().link);
  assert.equal(link.short, true); assert.match(link.url, new RegExp("^" + C.SHORT_BASE + "[2-9a-km-np-zA-HJ-NP-Z]{8}$"), "der Fake ist ein gueltiger Kurzlink");
  assert.ok(await until(() => seen.some((s) => s[1] === "/api/s")), "POST /api/s: " + JSON.stringify(seen));
  for (const s of seen) assert.equal(s[2], "1", "nicht vom Live-Host: " + s.join(" "));
  // A page route of the test (like home.e2e.js:156) comes first: the hook does not answer it.
  let mine = 0; await p.route("**/api/s", (r) => { mine++; return r.fulfill({ status: 201, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ id: "aB3dE5gH", url: C.SHORT_BASE + "aB3dE5gH", token: "t", exp: Date.now() + 864e6 }) }); });
  const q = await p.evaluate(async () => window.ShortLink.shorten(window.DuellCore.SHARE_BASE + "#i=karte-spruch", { k: "card", l: "de" }, {}));
  assert.equal(mine, 1); assert.equal(q.id, "aB3dE5gH");
  assert.deepEqual(p.errs, []); await b.close();
});

test("Teilen schickt share mit den geaenderten Bereichen des letzten Trail-Eintrags, einmal je Link", async () => {
  const b = await G.launch(), ctx = await G.person(b, { time: TIME }), got = await stats(ctx);
  let sent = null; await ctx.route(NL.ORIGIN + "/api/s", (r) => { sent = JSON.parse(r.request().postData()); return r.fallback(); });
  const p = await G.open(ctx, GOT);
  await p.locator("#leaf.got").waitFor(); await until(() => got.length);
  got.length = 0;
  await p.locator("#wishgo").tap(); await p.getByRole("button", { name: "🎲 Würfeln" }).tap(); await p.locator(".aicount", { hasText: "Geändert" }).waitFor();
  await p.locator("#edmain").click(); await p.locator("#share").click();
  await p.waitForFunction(() => { const r = window.DailyDebug.result(); return r && r.link; });
  assert.ok(await until(() => got.length), "share kam an");
  const doc = decode(sent.f), w = doc.by[doc.by.length - 1].w;
  assert.ok(w.length > 0, "der Wurf hat etwas geaendert");
  assert.deepEqual(got, [{ i: "plan-09", e: "share", w }]);
  await p.locator("#share").click(); await p.waitForTimeout(300);
  assert.equal(got.length, 1, "der zweite Tipp teilt denselben Link, kein neues share");
  assert.deepEqual(p.errs, []); await b.close();
});

test("Eine empfangene Karte meldet open einmal je Link und Geraet; ein anderes Geraet zaehlt", async () => {
  const b = await G.launch(), ctx = await G.person(b, { time: TIME }), got = await stats(ctx);
  const p = await G.open(ctx, GOT); await p.locator("#leaf.got").waitFor();
  assert.ok(await until(() => got.length)); assert.deepEqual(got, [{ i: "plan-09", e: "open" }]);
  await p.locator("#lang").click(); await p.locator("#lang").click();   // the sheet is drawn again: still one
  await p.reload(); await p.locator("#leaf.got").waitFor();
  const p2 = await G.open(ctx, GOT); await p2.locator("#leaf.got").waitFor(); await p2.waitForTimeout(400);
  assert.equal(got.length, 1, "derselbe Link auf demselben Geraet: " + JSON.stringify(got));
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).seen.length === 1));
  const day = await G.open(ctx, ""); await day.waitForTimeout(400);
  assert.equal(got.length, 1, "die Tageskarte ist nichts Empfangenes");
  const ctx2 = await G.person(b, { time: TIME }), got2 = await stats(ctx2);
  const q = await G.open(ctx2, GOT); await q.locator("#leaf.got").waitFor();
  assert.ok(await until(() => got2.length)); assert.deepEqual(got2, [{ i: "plan-09", e: "open" }]);
  assert.deepEqual([...p.errs, ...p2.errs, ...q.errs], []); await b.close();
});

test("Daumen: setzen, wechseln, zuruecknehmen schickt v und p, bleibt lokal, ohne Zahlen; auch fuer empfangene Karten", async () => {
  const b = await G.launch(), ctx = await G.person(b, { time: TIME }), got = await stats(ctx);
  const p = await G.open(ctx, "");
  const id = await p.evaluate(() => window.DailyDebug.home().idea.id);
  const up = p.locator("#voteup"), down = p.locator("#votedown");
  await up.waitFor();
  assert.equal(await up.getAttribute("aria-label"), "Gefällt mir"); assert.equal(await down.getAttribute("aria-label"), "Gefällt mir nicht");
  assert.equal(await p.locator("#votes").getAttribute("aria-label"), "Wie findest du diese Karte?");
  const pressed = async () => [await up.getAttribute("aria-pressed"), await down.getAttribute("aria-pressed")];
  assert.deepEqual(await pressed(), ["false", "false"]);
  await up.tap(); assert.deepEqual(await pressed(), ["true", "false"]);
  await down.tap(); assert.deepEqual(await pressed(), ["false", "true"]);
  await down.tap(); assert.deepEqual(await pressed(), ["false", "false"]);
  await up.tap();
  assert.ok(await until(() => got.length >= 4));
  assert.deepEqual(got, [{ i: id, e: "vote", v: 1, p: 0 }, { i: id, e: "vote", v: -1, p: 1 }, { i: id, e: "vote", v: 0, p: -1 }, { i: id, e: "vote", v: 1, p: 0 }]);
  assert.equal(await p.evaluate(() => window.DailyDebug.home().idea && document.body.getAttribute("data-state")), "home", "ein Daumen oeffnet die Karte nicht");
  assert.deepEqual(await p.evaluate((k) => JSON.parse(localStorage.getItem("daily.v1")).votes[k], id), 1);
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll("#votes button")].map((x) => x.textContent)), ["👍", "👎"], "keine Zaehler");
  await p.reload(); await up.waitFor(); assert.deepEqual(await pressed(), ["true", "false"], "die Stimme bleibt auf dem Geraet");
  assert.equal(await p.locator("#pad .ghost .votes").count(), 0, "das graue Blatt darunter hat keine Daumen");
  // A received card: its own vote, under its catalog id; English labels.
  const ctx2 = await G.person(b, { time: TIME, lang: "en" }), got2 = await stats(ctx2), q = await G.open(ctx2, GOT);
  await q.locator("#leaf.got").waitFor(); await until(() => got2.length); got2.length = 0;
  assert.equal(await q.locator("#votedown").getAttribute("aria-label"), "Not for me");
  await q.locator("#votedown").tap(); assert.ok(await until(() => got2.length));
  assert.deepEqual(got2, [{ i: "plan-09", e: "vote", v: -1, p: 0 }]);
  assert.deepEqual([...p.errs, ...q.errs], []); await b.close();
});

test("Layout: die Daumen liegen frei auf dem Blatt und verdecken bei 390x844 und 512x384 nichts", async () => {
  const b = await G.launch(), bad = [];
  for (const view of ["phone390", "zoom200"]) for (const lang of G.LANGS) for (const hash of ["", GOT]) {
    const ctx = await G.person(b, { view, lang, time: TIME }), p = await G.open(ctx, hash), at = [view, lang, hash ? "empfangen" : "Tag"].join(" ");
    await p.locator("#voteup").waitFor(); await p.waitForTimeout(700);   // the sheet's entry animation
    if (!(await G.inView(p, "#go"))) bad.push(at + ": #go nicht sichtbar");
    for (const c of await G.covered(p)) bad.push(at + ": " + c);
    const free = await p.evaluate(() => {
      const leaf = document.getElementById("leaf").getBoundingClientRect(), go = document.getElementById("go").getBoundingClientRect();
      return ["voteup", "votedown"].map((id) => {
        const e = document.getElementById(id), r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const inLeaf = r.top >= leaf.top - 1 && r.bottom <= leaf.bottom + 1 && r.left >= leaf.left - 1 && r.right <= leaf.right + 1;
        const overGo = r.bottom > go.top && r.top < go.bottom && r.right > go.left && r.left < go.right;
        return [id, hit === e, inLeaf, !overGo, Math.round(r.width) >= 44 && Math.round(r.height) >= 44];
      });
    });
    for (const f of free) if (f.slice(1).some((x) => !x)) bad.push(at + ": " + f.join(" "));
    assert.deepEqual(p.errs, [], at);
    await ctx.close();
  }
  assert.deepEqual(bad, []);
  await b.close();
});
