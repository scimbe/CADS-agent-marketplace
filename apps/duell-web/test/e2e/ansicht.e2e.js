"use strict";
// The card's picture in the editor (#stagewrap, #stage) for every turn card of the shelf, on a phone (390x844): a timed
// game ("Wer zuckt zuerst?", "Erklär's mir") hid it already before "Los", so the editor showed tabs, the panel and an
// empty area, no card. And the day's sheet: a turn card shows the card as it opens, not its picture of a finished game.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const TURNS = require("../../src/ideas.json").ideas.filter((i) => i.kind === "turn");
let b;
test.before(async () => { b = await G.launch(); });
test.after(async () => { await b.close(); });

const stage = (p) => p.evaluate(() => {
  const w = document.getElementById("stagewrap"), s = document.getElementById("stage"), r = w.getBoundingClientRect(), q = s.getBoundingClientRect();
  return { shown: getComputedStyle(w).display !== "none" && r.top >= 0 && r.bottom <= innerHeight + 0.5, wrap: Math.round(r.height), stage: Math.round(q.height) };
});

test("Jede Zug-Karte zeigt im Editor ihr Bild (390x844): Bühne sichtbar, Höhe > 0", async () => {
  const ctx = await G.person(b, { lang: "de", view: "phone390" }), bad = [];
  assert.ok(TURNS.length >= 40, "Zug-Karten im Regal: " + TURNS.length);
  for (const i of TURNS) {
    const p = await G.open(ctx, "#i=" + i.id);
    try {
      await p.locator("#go").click(); await p.locator("#editor:not([hidden])").waitFor();
      await G.poll(() => p.locator("#panel").evaluate((x) => x.childElementCount), (n) => n > 0, { what: i.id + ": Feld" });
      const s = await stage(p);
      if (!s.shown || !(s.wrap > 100) || !(s.stage > 100)) bad.push(i.id + " (" + i.turn.g + "): " + JSON.stringify(s));
      if (p.errs.length) bad.push(i.id + ": " + p.errs.join());
    } finally { await p.close(); }
  }
  assert.deepEqual(bad, []);
});

test("Wer zuckt zuerst?: das Bild steht bis „Los“, erst das laufende Spiel bekommt den ganzen Platz", async () => {
  const ctx = await G.person(b, { lang: "de", view: "phone390" });
  const p = await G.open(ctx, "#i=zug-reaktion");
  await p.locator("#go").click();
  const go = p.locator("#panel .timed button");
  await go.waitFor();
  assert.ok((await stage(p)).shown, "vor Los: die Karte ist zu sehen");
  assert.ok(await G.inView(p, "#panel .timed button"), "Los ist im Bild");
  await go.click();
  await G.poll(() => stage(p), (s) => !s.shown, { what: "Spiel läuft ohne Karte darüber" });
  assert.deepEqual(p.errs, []);
});

test("Tageskarte Zug (Wer beschenkt wen?): das Blatt zeigt die Karte so, wie sie aufgeht, nicht das Bild der fertigen Partie", async () => {
  for (const view of ["phone390", "desk1280"]) {
    const ctx = await G.person(b, { lang: "de", view, time: "2026-11-28T10:00:00Z", web: true });
    const p = await G.open(ctx, ""); await p.locator("#startbox").waitFor();
    assert.equal(await p.evaluate(() => window.DailyDebug.home().idea.id), "zug-wichteln");
    await p.waitForTimeout(800);   // the picture's part would have come by now
    assert.equal(await p.locator("#pvcard[data-shot]").count(), 0, view + ": kein Spielbild über der Karte");
    assert.deepEqual(p.errs, []);
    await ctx.close();
  }
});
