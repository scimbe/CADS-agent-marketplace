"use strict";
// The figure's animation (g.anim / l.anim, DuellCore.sanitizeAnim): the AI fills a small schema (kind welt, stubbed here,
// never the real model), the page plays it the same way everywhere; a value off the lists is dropped; the Figur sheet sets
// it by hand without AI; prefers-reduced-motion plays nothing. 390x844 phone.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const G = require("./lib/grund.js");
const E = require("../../src/lauf-engine.js");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOT = process.env.ANIM_SHOT || "";
const OPT = (anim) => ({ params: { gravity: 1500, flapPower: 420, pipeGap: 160, pipeSpeed: 120 }, theme: "day", title: "Hüpfflug", emoji: "🐸", anim,
  abschnitte: [{ physik: "ruhig", delta: {}, thema: "day", emoji: "🐸" }, { physik: "normal", delta: {}, thema: "sunset", emoji: "🌟" }, { physik: "schnell", delta: { pipeSpeed: 30 }, thema: "night", emoji: "🌙" }] });
const SEAL = "s2.welt.mw2y455c.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER";
const METER = { free: 7, remaining: 6, period: "week" };
const LAUF = { k: "lauf", col: ["#ffd400", "#ff3b1d"], by: [], t: "Zweierrennen", l: E.build({ mode: "endlos", world: "bruecke", level: "easy", figure: "🦊", obstacle: "📦", coin: "🪙", foe: "🐦", has: ["hindernisse", "muenzen"], foes: ["geh"] }, 12345) };
let b;
test.before(async () => { b = await G.launch(); });
test.after(async () => { await b.close(); });

async function phone(answer, o) {
  const ctx = await G.person(b, { view: "phone390" });
  const p = await ctx.newPage(), errs = [], sent = [];
  if (o && o.reduce) await p.emulateMedia({ reducedMotion: "reduce" });
  p.on("pageerror", (e) => errs.push(String(e)));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u.startsWith(API)) {
      const p0 = u.slice(API.length); sent.push({ path: p0, body: JSON.parse(r.request().postData() || "null") });
      if (p0 === "ai" && answer) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: "welt", options: [answer], seals: [SEAL], cost: 1, receipt: "rc-anim", meter: METER }) });
      if (p0.startsWith("ai/")) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ final: true, meter: METER }) });
    }
    return r.abort();
  });
  await p.goto("file://" + path.resolve(__dirname, "../../dist/index.html"));
  await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  return { p, errs, sent, ctx };
}
// the bird's pose over about a second of the editor's demo: [min y, max |r|, min scale y, min alpha]
const sample = (p, get) => p.evaluate(async (g) => {
  const out = [];
  for (let i = 0; i < 30; i++) { await new Promise((ok) => setTimeout(ok, 40)); out.push(g === "lauf" ? window.Lauf.pose : window.Game.pose()); }
  const q = out.filter(Boolean);
  return q.length ? [Math.min(...q.map((x) => x.y)), Math.max(...q.map((x) => Math.abs(x.r))), Math.min(...q.map((x) => x.sy)), Math.min(...q.map((x) => x.a))] : null;
}, get);
async function flug(p) {
  await p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('game', window.DailyApp.me(), 'de'), {own:true})");
  await p.getByLabel("Was willst du fliegen?").waitFor();
}

test("Wunsch 'lass die Figur hüpfen' (KI-Antwort gestubbt): die Figur hüpft im Editor, im Spiel und beim Freund über den Link", async () => {
  const { p, errs, sent, ctx } = await phone(OPT({ art: "huepfen", tempo: 1.5, staerke: 1 }));
  await flug(p);
  await p.getByLabel("Was willst du fliegen?").fill("lass die Figur hüpfen");
  await p.getByRole("button", { name: "✨ Bauen" }).tap();
  await p.locator(".weltpv").waitFor();
  assert.deepEqual(sent[0].body.input, { satz: "lass die Figur hüpfen" }, "nur der Satz geht raus");
  await p.getByRole("button", { name: "✓ Übernehmen" }).tap();
  await p.waitForFunction(() => window.DailyApp.ed().doc.ki);
  const doc = await p.evaluate(() => window.DailyApp.ed().doc);
  assert.deepEqual(doc.g.anim, { art: "huepfen", tempo: 1.5, staerke: 1 });
  assert.equal(doc.ki.k, "welt"); assert.equal(doc.ki.s, SEAL);
  const s = await sample(p, "game");
  assert.ok(s && s[0] < -8, "die Figur hüpft (y min " + (s && s[0]) + ")");
  if (SHOT) await p.screenshot({ path: SHOT + "-editor.png" });
  // the link carries it: a friend's game hops the same way
  const url = await p.evaluate(() => window.Daily.challengeUrl(window.Game.current(), 3));
  const back = await p.evaluate((u) => window.DuellCore.parseHash(u.slice(u.indexOf("#"))), url);
  assert.deepEqual(back.anim, { art: "huepfen", tempo: 1.5, staerke: 1 });
  await p.getByRole("button", { name: /SPIELEN|Spielen/ }).first().tap();
  await p.locator("#game:not([hidden])").waitFor();
  const g = await sample(p, "game");
  assert.ok(g && g[0] < -8, "auch im Spiel");
  if (SHOT) await p.screenshot({ path: SHOT + "-spiel.png" });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Unbekannte Werte der KI werden verworfen, nicht geraten; ohne anim in der Antwort bleibt die alte Bewegung", async () => {
  const { p, errs, ctx } = await phone(OPT({ art: "tanzen", tempo: 9, bei: "immer" }));
  await flug(p);
  await p.getByLabel("Was willst du fliegen?").fill("lass die Figur tanzen");
  await p.getByRole("button", { name: "✨ Bauen" }).tap(); await p.locator(".weltpv").waitFor();
  await p.getByRole("button", { name: "✓ Übernehmen" }).tap(); await p.waitForFunction(() => window.DailyApp.ed().doc.ki);
  assert.equal(await p.evaluate(() => window.DailyApp.ed().doc.g.anim), undefined, "art ausserhalb der Liste: keine Animation");
  // a valid art with a tempo off its range keeps the art, drops the tempo
  const v = await p.evaluate(() => window.DuellCore.sanitizeAnim({ art: "wackeln", tempo: 7, staerke: -1, bei: "nie" }));
  assert.deepEqual(v, { art: "wackeln" });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Figur-Blatt ohne KI (gelb): Wackeln einstellen, Tempo schieben, Keine nimmt sie weg", async () => {
  const { p, errs, ctx } = await phone(null);
  await flug(p);
  await p.getByRole("tab", { name: "Figur" }).tap();
  await p.locator(".animblock").waitFor();
  await p.locator(".animblock").getByRole("button", { name: "Wackeln", exact: true }).tap();
  assert.deepEqual(await p.evaluate(() => window.DailyApp.ed().doc.g.anim), { art: "wackeln" });
  await p.locator('.animblock input[data-anim="tempo"]').fill("18");
  await p.locator(".animblock").getByRole("button", { name: "Beim Sprung" }).tap();
  assert.deepEqual(await p.evaluate(() => window.DailyApp.ed().doc.g.anim), { art: "wackeln", tempo: 1.8, bei: "sprung" });
  const s = await sample(p, "game");
  assert.ok(s && s[1] > 0.05, "sie wackelt nach dem Flattern der Demo (r " + (s && s[1]) + ")");
  await p.locator(".animblock").getByRole("button", { name: "Keine" }).tap();
  assert.equal(await p.evaluate(() => window.DailyApp.ed().doc.g.anim), undefined);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Lauf: Hüpfen im Figur-Blatt, im Spiel hüpft der Läufer; prefers-reduced-motion spielt nichts ab", async () => {
  const { p, errs, ctx } = await phone(null);
  await p.evaluate((d) => window.DailyApp.openEditor(d, { own: true }), LAUF);
  await p.locator("#tabLFigure").waitFor(); await p.locator("#tabLFigure").tap();
  await p.locator(".animblock").getByRole("button", { name: "Hüpfen" }).tap();
  assert.deepEqual(await p.evaluate(() => window.DailyApp.ed().doc.l.anim), { art: "huepfen" });
  await p.locator("#edmain").tap();
  await p.locator("#lfcv").waitFor();
  const s = await sample(p, "lauf");
  assert.ok(s && s[0] < -5, "der Läufer hüpft (y min " + (s && s[0]) + ")");
  if (SHOT) await p.screenshot({ path: SHOT + "-lauf.png" });
  assert.deepEqual(errs, []);
  await ctx.close();
  const r = await phone(null, { reduce: true });
  await r.p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('game', window.DailyApp.me(), 'de'), {own:true})");
  await r.p.evaluate(() => { const d = window.DailyApp.ed().doc; d.g.anim = { art: "blinken" }; window.Game.update(window.DailyApp.gameState()); });
  await r.p.waitForTimeout(400);
  assert.equal(await r.p.evaluate(() => window.Game.pose()), null, "bei reduzierter Bewegung keine Animation");
  await r.ctx.close();
});
