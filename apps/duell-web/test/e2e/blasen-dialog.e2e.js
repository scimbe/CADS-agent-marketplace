"use strict";
// A bubble's sheet as an overlay dialog grown from the bubble (src/blasen-dialog.js), at 390x844 and 1280x800: on Flug,
// Lauf, Karte, Meme, a quiz card and a turn card every bubble opens its dialog next to it, the sheet works there (the
// picture changes live), and ✕, the scrim, Escape and the back gesture each close it into its bubble (focus back there).
// With bubbles on there is no tab bar; the brush in the header hides and shows them. Magie and Roboter appear only with
// their parts (stubbed here), and where the robot is there the red wish steps back.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const E = require("../../src/lauf-engine.js");
const SHOT = process.env.BLASEN_SHOT || "";
const LAUF = { k: "lauf", col: ["#ffd400", "#ff3b1d"], by: [], t: "Zweierrennen", l: E.build({ mode: "endlos", world: "bruecke", level: "normal", figure: "🦊", obstacle: "📦", coin: "🪙", foe: "🐦", has: ["hindernisse", "muenzen", "gegner"], foes: ["geh", "flug"] }, 12345) };
const VIEWS = { "390x844": "phone390", "1280x800": "desk1280" };
let b, url;
test.before(async () => { b = await G.launch(); url = await G.webUrl("index.html"); });
test.after(async () => { await b.close(); });

async function phone(view, init) {
  const ctx = await G.person(b, { view, web: true });
  await ctx.addInitScript(() => localStorage.setItem("daily.blasen", "an"));
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); await p.waitForFunction(() => window.Daily && window.Daily.full(), null, { timeout: 15000 });
  return { p, errs, ctx };
}
const open = async (p, what) => {
  await p.evaluate((w) => {
    const D = window.Daily, A = window.DailyApp;
    if (w.id) { const i = D.byId(w.id); A.openEditor(D.docFromIdea(i, A.me(), "de"), { idea: i }); }
    else if (w.doc) A.openEditor(w.doc, { own: true });
    else A.openEditor(Object.assign(D.blankDoc(w.kind, A.me(), "de"), w.set || {}), { own: true });
  }, what);
  await p.locator("#blasen .blase").first().waitFor({ timeout: 10000 }); await p.waitForTimeout(700);
};
const bubbles = (p) => p.evaluate(() => [...document.querySelectorAll("#blasen .blase")].filter((e) => e.offsetParent).map((e) => e.dataset.blase));
const box = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
async function tap(p, id) { const q = await box(p, `#blasen .blase[data-blase="${id}"]`); await p.mouse.click(q.x + q.w / 2, q.y + q.h / 2); }
const WAYS = ["x", "scrim", "esc", "back"];
async function shut(p, way) {
  if (way === "x") await p.locator("#bdlg .bdx").click();
  else if (way === "scrim") { const s = await box(p, "#bscrim"), d = await box(p, "#bdlg"); const y = d.y > s.y + 40 ? s.y + 10 : s.y + s.h - 10; await p.mouse.click(d.x > 60 ? 20 : s.w - 20, y); }
  else if (way === "esc") await p.keyboard.press("Escape");
  else await p.goBack();
  await p.locator("#bdlg").waitFor({ state: "hidden" });
}
// every bubble with a sheet: dialog visible next to it, the sheet's tab active, closed one of four ways, focus back on it
async function each(p, name, view) {
  const ids = (await bubbles(p)).filter((x) => x !== "magie" && x !== "roboter");
  assert.ok(ids.length >= 2, name + ": Blasen " + ids);
  assert.equal(await p.locator("#tabs").isVisible(), false, name + ": keine Reiterleiste mit Blasen");
  let n = 0;
  for (const id of ids) {
    const panel = await p.locator(`#blasen .blase[data-blase="${id}"]`).getAttribute("data-blatt"), bq = await box(p, `#blasen .blase[data-blase="${id}"]`);
    await tap(p, id);
    await p.locator("#bdlg:not([hidden]) #panel").waitFor();
    await p.waitForTimeout(320);   // the morph has ended
    assert.equal(await p.evaluate((k) => document.getElementById("tab" + k).getAttribute("aria-selected"), panel), "true", name + " " + id);
    const d = await box(p, "#bdlg"), cx = bq.x + bq.w / 2, cy = bq.y + bq.h / 2;
    const gap = Math.max(0, d.x - cx, cx - d.x - d.w) + Math.max(0, d.y - cy, cy - d.y - d.h);
    // next to its bubble; where the sheet steps past the part the bubble changes (to keep it in sight), by that part more
    const part = await p.evaluate((i) => { const e = document.querySelector(`#blasen .blase[data-blase="${i}"]`); return e.dataset.pt ? +e.dataset.pb - +e.dataset.pt : 0; }, id);
    assert.ok(gap <= bq.h / 2 + 30 + part, name + " " + id + ": Dialog neben seiner Blase (" + view + ") " + JSON.stringify({ d, bq }));
    assert.ok(d.x >= 0 && d.x + d.w <= (await p.evaluate(() => innerWidth)) + 0.5, name + " " + id + ": im Bild");
    assert.equal(await p.locator("#bdlg").getAttribute("role"), "dialog"); assert.equal(await p.locator("#bdlg").getAttribute("aria-modal"), "true");
    assert.ok((await p.locator("#bdlg #panel").innerText()).trim().length > 0 || await p.locator("#bdlg #panel *").count() > 0, name + " " + id + ": Blatt hat Inhalt");
    const way = WAYS[n++ % WAYS.length];
    await shut(p, way);
    assert.equal(await p.locator("#editor").isVisible(), true, name + " " + id + ": " + way + " schliesst nur den Dialog");
    if (way !== "back") assert.equal(await p.evaluate((i) => document.activeElement && document.activeElement.dataset.blase, id), id, name + " " + id + ": Fokus zurueck auf die Blase (" + way + ")");
  }
}

for (const [view, v] of Object.entries(VIEWS)) {
  test(`Jede Blase oeffnet ihr Blatt als Dialog neben sich; ✕, Hintergrund, Escape, Zurueck schliessen (${view})`, async () => {
    const { p, errs, ctx } = await phone(v);
    for (const [name, what] of [["Flug", { kind: "game" }], ["Lauf", { doc: LAUF }], ["Karte", { kind: "card", set: { st: "druck", x: "Danke für alles", sk: [] } }],
      ["Meme", { kind: "photo", set: { st: "meme", x: "Montag", y: "schon wieder" } }], ["Quiz", { id: "quiz-preis" }], ["Zug", { id: "zug-einig" }]]) {
      await open(p, what); await each(p, name, view);
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  });
}

test("Das Blatt im Dialog wirkt sofort: Farbe aendert das Bild, Figur das Spiel, Zug-Felder nehmen Text an (390x844)", async () => {
  const { p, errs, ctx } = await phone("phone390");
  await open(p, { kind: "card", set: { st: "druck", x: "Danke", sk: [] } });
  const pic = () => p.evaluate(() => document.getElementById("stage").toDataURL().length + ":" + window.DailyApp.ed().doc.col.join());
  const before = await pic();
  await tap(p, "farbe"); await p.locator("#bdlg #panel .sw").nth(3).click();
  assert.notEqual(await pic(), before, "die Karte hinter dem Dialog aendert sich");
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  await open(p, { kind: "game" });
  const e0 = await p.evaluate(() => window.DailyApp.ed().doc.g.emoji);
  await tap(p, "figur"); await p.locator("#bdlg #panel .chip.em:not(.on)").nth(2).click();
  assert.notEqual(await p.evaluate(() => window.DailyApp.ed().doc.g.emoji), e0);
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  await open(p, { id: "zug-einig" });
  await tap(p, "zug"); const f = p.locator("#bdlg #panel input").first(); await f.fill("Pizza");
  assert.equal(await f.inputValue(), "Pizza");
  // the morph as a short sequence of frames (one bubble), and the brush in the header both ways
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" }); await p.waitForTimeout(300);
  if (SHOT) {
    const q = await box(p, '#blasen .blase[data-blase="titel"]');
    await p.screenshot({ path: SHOT + "-morph-0.png" });
    await p.mouse.click(q.x + q.w / 2, q.y + q.h / 2);
    for (const t of [70, 150, 320]) { await p.waitForTimeout(t === 70 ? 70 : 80 + (t === 320 ? 90 : 0)); await p.screenshot({ path: SHOT + "-morph-" + t + ".png" }); }
    await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  }
  const brush = p.locator("#editor>.bar #blasenan");
  assert.equal(await brush.getAttribute("aria-label"), "Bearbeiten-Blasen ausblenden"); assert.equal(await brush.getAttribute("title"), "Bearbeiten-Blasen ausblenden");
  const bb = await brush.boundingBox(); assert.ok(bb.width >= 44 && bb.height >= 44, "Trefferflaeche >= 44 px");
  await brush.click();
  assert.equal(await brush.getAttribute("aria-pressed"), "true"); assert.equal(await brush.getAttribute("aria-label"), "Bearbeiten-Blasen einblenden");
  assert.equal(await p.locator("#blasen .blase").first().isVisible(), false); assert.equal(await p.locator("#tabs").isVisible(), true);
  assert.equal(await p.evaluate(() => localStorage.getItem("daily.blasen")), "aus", "auf diesem Geraet gemerkt");
  await brush.click();
  assert.equal(await brush.getAttribute("aria-pressed"), "false"); assert.equal(await p.locator("#blasen .blase").first().isVisible(), true); assert.equal(await p.locator("#tabs").isVisible(), false);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Tastatur: 'Alle Einstellungen' ist der erste Tab-Stopp nach der Kopfzeile, oeffnet die Liste; Fokus bleibt im Dialog und kehrt zurueck", async () => {
  const { p, errs, ctx } = await phone("phone390");
  await open(p, { kind: "card", set: { st: "druck", x: "Danke", sk: [] } });
  const order = await p.evaluate(() => [...document.querySelectorAll("#editor button, #editor [tabindex='0'], #editor input")].filter((e) => e.offsetParent || e.id === "ballset").filter((e) => e.tabIndex >= 0).map((e) => e.id || e.className));
  const h = order.indexOf("edstyle"); assert.equal(order[h + 1], "ballset", order.join(" "));
  await p.locator("#ballset").focus(); assert.ok((await box(p, "#ballset")).w > 40, "sichtbar mit Fokus");
  await p.keyboard.press("Enter");
  await p.locator("#bdlg #tabs [role=tab]").first().waitFor();
  for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); assert.equal(await p.evaluate(() => !!document.activeElement.closest("#bdlg")), true, "Fokus bleibt im Dialog"); }
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  assert.equal(await p.evaluate(() => document.activeElement.id), "ballset");
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Magie und Roboter (gestubbt): nur mit ihren Teilen; mit Roboter tritt der rote Wunsch zurueck; auch auf der Tageskarte", async () => {
  const { p, errs, ctx } = await phone("phone390", () => {
    window.Magic = { can: (d) => !!d, fill: (d) => { d.x = (d.x || "") + " ✨"; window.__magic = (window.__magic || 0) + 1; } };
    window.FreeFromCard = { can: (d) => !!d, open: () => { window.__robot = (window.__robot || 0) + 1; } };
  });
  await open(p, { kind: "sound" });
  const ids = await bubbles(p);
  assert.ok(ids.includes("magie") && ids.includes("roboter"), ids.join());
  assert.ok(!ids.includes("wunsch"), "mit Roboter kein zweiter KI-Weg");
  await tap(p, "magie"); assert.equal(await p.evaluate(() => window.__magic), 1); assert.equal(await p.locator("#bdlg").isVisible(), false);
  await tap(p, "roboter"); assert.equal(await p.evaluate(() => window.__robot), 1);
  // without the parts: neither, and the wish is back
  await p.evaluate(() => { delete window.Magic; delete window.FreeFromCard; }); await p.waitForTimeout(400);
  const ids2 = await bubbles(p);
  assert.ok(!ids2.includes("magie") && !ids2.includes("roboter") && ids2.includes("wunsch"), ids2.join());
  assert.deepEqual(errs, []);
  await ctx.close();
  const s = await phone("phone390", () => { window.Magic = { can: () => true, fill: () => {} }; window.FreeFromCard = { can: () => true, open: () => { window.__robot = 1; } }; });
  await s.p.locator("#hblasenday .blase").first().waitFor({ timeout: 15000 });
  const day = await s.p.evaluate(() => [...document.querySelectorAll("#hblasenday .blase")].map((e) => e.dataset.blase));
  assert.ok(day.includes("day:magie") && day.includes("day:roboter"), day.join());
  await s.ctx.close();
});

test("prefers-reduced-motion: der Dialog blendet nur ein, ohne Wachsen aus der Blase", async () => {
  const { p, errs, ctx } = await phone("phone390");
  await p.emulateMedia({ reducedMotion: "reduce" });
  await open(p, { kind: "card", set: { st: "druck", x: "Danke", sk: [] } });
  await tap(p, "farbe");
  const k = await p.evaluate(() => document.getElementById("bdlg").getAnimations().map((a) => a.effect.getKeyframes().map((f) => [f.transform || "", f.opacity])));
  assert.ok(k.length >= 1 && k.every((a) => a.every((f) => !f[0] || f[0] === "none")), "kein transform: " + JSON.stringify(k));
  await p.keyboard.press("Escape"); await p.locator("#bdlg").waitFor({ state: "hidden" });
  assert.deepEqual(errs, []);
  await ctx.close();
});
