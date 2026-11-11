"use strict";
// The free card on the start page (11 Nov, user: "Erschaffe deine Karte muss präsenter, da es ein Kernfeature ist"): its
// own block (#frei) right under the day's main button, above "Wem willst du heute eine Freude machen?", static in the core
// (no request before it shows). Its categories open the making with that category chosen (the tap is the person's own
// choice), "Erschaffen" (#create) opens it as it is; without an account the way through the sign-in keeps the category.
// The strip "So sieht es aus" is gone. SHOT_DIR=<folder> keeps the screenshots.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const G = require("./lib/grund.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");

const DAY = "2026-11-11T10:00:00Z";
const out = process.env.SHOT_DIR;
const shot = (p, f) => (out ? p.screenshot({ path: path.join(out, f) }) : null);
const CREATE = { size: 5, remaining: 5, pot: "create", period: "ever", refundsLeft: 2, age16: true };

async function start(b, view, acc, o) {
  const ctx = await G.person(b, Object.assign({ lang: "de", view, time: DAY, web: true }, o));
  const asked = [];
  await ctx.route(/^https?:/, (r) => {
    const u = r.request().url();
    if (/\/api\/duell\/ai\/status$/.test(u)) { asked.push(u); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(acc ? { meter: {}, create: CREATE } : { meter: {} }) }); }
    return G.isLocal(u) ? r.continue() : r.abort();
  });
  const p = await G.open(ctx, (o && o.hash) || ""); await p.locator("#startbox").waitFor(); await p.waitForTimeout(300);
  return { ctx, p, asked };
}
const box = (p, s) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: r.left, right: r.right }; }, s);

test("Freie Karte: eigener Block direkt unter dem Hauptknopf, ueber der Frage, ohne Leiste; 390x844 ganz im ersten Bild, 1280x800 auch", async () => {
  ensureBuilt("");
  const b = await G.launch();
  try {
    for (const view of ["phone390", "desk1280"]) {
      const { ctx, p, asked } = await start(b, view, false);
      await shot(p, "frei-" + view + ".png");
      assert.equal(await p.locator(".stlook, .strail").count(), 0, view + ": keine Leiste So sieht es aus");
      assert.equal(await p.locator("#freih").textContent(), "Deine Idee. Deine Karte.");
      assert.equal(await p.locator("#freis").textContent(), "Ein Satz – die KI baut daraus Karte, Meme, Spiel oder Quiz.");
      assert.deepEqual(await p.locator("#freiarts button").allTextContents(), ["Karte", "Meme", "Spiel", "Quiz"]);
      assert.deepEqual(await p.locator("#freiarts button").evaluateAll((x) => x.map((e) => e.dataset.art)), ["card", "meme", "game", "quiz"]);
      assert.equal(await p.locator("#frei #create").textContent(), "Erschaffen");
      assert.equal(await p.locator("#homerow #create").count(), 0, "kein zweiter Knopf in der Reihe");
      const [go, fr, q] = await Promise.all([box(p, "#go"), box(p, "#frei"), box(p, "#starth")]);
      // right under the main button; only the row of the card's own extras (Look würfeln, two columns) may lie between
      const row = await p.evaluate(() => { const r = document.getElementById("homerow"); return r.getClientRects().length ? r.offsetHeight + 8 : 0; });
      assert.ok(fr.top >= go.bottom && fr.top - go.bottom < 30 + row, view + ": direkt unter dem Hauptknopf " + JSON.stringify({ go, fr, row }));
      assert.equal(await p.evaluate(() => document.getElementById("go").nextElementSibling.id + ">" + document.getElementById("homerow").nextElementSibling.id), "homerow>frei");
      assert.ok(q.top >= fr.bottom, view + ": die Frage folgt darunter");
      assert.equal(await G.inView(p, "#frei"), true, view + ": ganz im ersten Bild (oben " + fr.top + ", unten " + fr.bottom + ")");
      console.log(view + ": #go unten " + go.bottom + ", #frei " + fr.top + "-" + fr.bottom + ", Frage " + q.top);
      (await G.smallTargets(p, "#frei")).forEach((v) => assert.fail(view + " zu klein: " + v));
      assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 0.5)), "kein Querscrollen");
      assert.deepEqual(asked, [], view + ": kein Aufruf vor dem ersten Tipp");
      assert.deepEqual(p.errs, []); await ctx.close();
    }
  } finally { await b.close(); }
});

test("Freie Karte: ein Tipp auf eine Kategorie oeffnet das Erschaffen mit genau dieser Kategorie gewaehlt (390x844 und 1280x800)", async () => {
  ensureBuilt("");
  const b = await G.launch();
  try {
    for (const [view, art, label] of [["phone390", "game", "🕹 Spiel"], ["desk1280", "quiz", "❓ Quiz"], ["phone390", "meme", "📷 Meme"]]) {
      const { ctx, p } = await start(b, view, true);
      await p.locator('#freiarts button[data-art="' + art + '"]').click();
      await p.getByLabel("Deine Beschreibung").waitFor();
      const chip = p.locator("#shelf:not([hidden]) .chips[role=group] button", { hasText: label });
      await G.poll(() => chip.getAttribute("aria-pressed"), (v) => v === "true", { what: view + " " + art + " gewaehlt" });
      const on = await p.locator("#shelf:not([hidden]) .chips[role=group]").first().locator('button[aria-pressed="true"]').allTextContents();
      assert.deepEqual(on, [label], view + ": nur diese Kategorie");
      await shot(p, "frei-" + view + "-" + art + ".png");
      assert.deepEqual(p.errs, []); await ctx.close();
    }
    // "Erschaffen" opens the making as it is
    const { ctx, p } = await start(b, "phone390", true);
    await p.locator("#create").click(); await p.getByLabel("Deine Beschreibung").waitFor();
    assert.deepEqual(p.errs, []); await ctx.close();
  } finally { await b.close(); }
});

test("Freie Karte ohne Konto: der Tipp fuehrt in die Anmeldung, der Rueckweg (?go=erschaffen) kommt mit der Kategorie an", async () => {
  ensureBuilt("");
  const b = await G.launch();
  try {
    const { ctx, p } = await start(b, "phone390", false);
    await p.locator('#freiarts button[data-art="game"]').click();
    await p.locator("#shelf:not([hidden]) #createlogin").waitFor();
    assert.equal(await p.evaluate(() => sessionStorage.getItem("mdi.freiArt")), "game", "fuer den Rueckweg gemerkt");
    // signed in, back on the page: the free card opens with "Spiel" chosen
    await ctx.unroute(/^https?:/);
    await ctx.route(/^https?:/, (r) => { const u = r.request().url(); if (/\/api\/duell\/ai\/status$/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ meter: {}, create: CREATE }) }); return G.isLocal(u) ? r.continue() : r.abort(); });
    const u = new URL(p.url()); u.search = "?go=erschaffen"; u.hash = "";
    await p.goto(u.toString());
    await p.getByLabel("Deine Beschreibung").waitFor();
    const chip = p.locator("#shelf:not([hidden]) .chips[role=group] button", { hasText: "🕹 Spiel" });
    await G.poll(() => chip.getAttribute("aria-pressed"), (v) => v === "true", { what: "Spiel nach der Anmeldung" });
    assert.equal(await p.evaluate(() => sessionStorage.getItem("mdi.freiArt")), null, "danach vergessen");
    assert.deepEqual(p.errs, []); await ctx.close();
  } finally { await b.close(); }
});

test("Freie Karte auf Englisch", async () => {
  ensureBuilt("");
  const b = await G.launch();
  try {
    const { ctx, p } = await start(b, "phone390", false, { lang: "en" });
    assert.equal(await p.locator("#freih").textContent(), "Your idea. Your card.");
    assert.deepEqual(await p.locator("#freiarts button").allTextContents(), ["Card", "Meme", "Game", "Quiz"]);
    assert.equal(await p.locator("#create").textContent(), "Create");
    assert.deepEqual(p.errs, []); await ctx.close();
  } finally { await b.close(); }
});
