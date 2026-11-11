"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const G = require("./lib/grund.js");
let page;
// Web route (lib/grund.js): pages here are reloaded or a device opens several pages; under file:// such a page now and then starts with an empty storage of its own.
test.before(async () => { page = await G.webUrl("index.html"); });
const shot = process.env.SHOT_DIR;
const hash = (u) => "#" + u.split("#")[1];

async function setup(o) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), errs = [];
  ctx.setDefaultTimeout(15000);
  // macOS gives a headless browser no microphone: a test tone from the audio graph stands in, the recording path stays the real one.
  await ctx.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { const a = window.Kit.audio(true), o = a.createOscillator(), d = a.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; }; });
  const base = page;
  const open = async (h) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(base + h); return p; };
  return { b, open, errs };
}
const url = (p) => p.evaluate(() => window.DailyDebug.result().url);
const next = (p) => p.getByRole("button", { name: "Weiter", exact: true }).click();
const slide = (p, v) => p.locator("#panel input[type=range]").evaluate((r, x) => { r.value = x; r.dispatchEvent(new Event("input", { bubbles: true })); }, v);
const send = (p) => p.locator("#edmain").click();

test("Zwei Geraete: Keks-Deal laeuft nur ueber Links bis zum Ergebnisbild", async () => {
  const { b, open, errs } = await setup();
  const a = await open("#i=zug-deal"); await a.locator("#go").click();
  assert.equal(await a.locator("#edmain").textContent(), "Weiter");   // the step's Weiter sits in the footer, locked until answered
  assert.equal(await a.locator("#edmain").getAttribute("aria-disabled"), "false");   // the slider starts with a value
  await slide(a, 4); await next(a); await a.getByText("Zug steht").waitFor(); await send(a); await a.locator("#share").waitFor();
  const one = await url(a); assert.ok(!/"?offer/.test(one));
  const c = await open(hash(one));
  assert.match(await c.locator("#from").textContent(), /Du bist dran. Zug 2 von 3/);
  assert.match(await c.locator("#hero").textContent(), /Zehn Kekse/);
  await c.locator("#go").click(); await slide(c, 3); await next(c);
  await c.getByText(/4 abgegeben, ab 3 angenommen/).waitFor(); await slide(c, 6); await next(c); await send(c); await c.locator("#share").waitFor();
  const a2 = await open(hash(await url(c)));
  await a2.locator("#go").click(); await slide(a2, 5); await next(a2); await send(a2); await a2.locator("#share").waitFor();
  const back = await open(hash(await url(a2)));
  assert.match(await back.locator("#from").textContent(), /fertig/);
  await back.locator("#go").click(); await back.getByText("Beide Deals stehen").first().waitFor();
  if (shot) await back.screenshot({ path: shot + "/deal.png" });
  await send(back); await back.locator("#share").waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Termin finden: Uhrzeit und Tage antippen, Gruppe stimmt ueber Links ab, Karte nennt den besten Termin", async () => {
  const { b, open, errs } = await setup();
  const a = await open("#i=zug-termin"); await a.locator("#go").click();
  const rows = a.locator("#panel .chips");
  await a.getByRole("button", { name: "18 Uhr", exact: true }).click();
  await rows.nth(1).locator(".chip").nth(1).click(); await rows.nth(1).locator(".chip").nth(2).click();
  await a.getByRole("button", { name: "20 Uhr", exact: true }).click(); await rows.nth(1).locator(".chip").nth(2).click();
  assert.equal(await rows.nth(2).locator(".chip").count(), 3);
  await a.locator("#panel input.field").fill("Mia"); await next(a); await a.getByText("Fertig. Schick es in die Gruppe.").waitFor();
  await a.locator("#edmain").filter({ hasText: "In die Gruppe schicken" }).waitFor();
  await send(a); await a.locator("#share").waitFor();
  const c = await open(hash(await url(a)));
  assert.match(await c.locator("#from").textContent(), /Tipp, wann du kannst. Abgestimmt: 1/);
  await c.locator("#go").click(); await c.locator("#panel").getByText(/^Zur Wahl: /).waitFor();
  await c.locator("#panel input.field").fill("mia"); await c.locator("#panel").getByText("Den Namen gibt es schon").waitFor();
  await c.locator("#panel input.field").fill("Ben");
  assert.equal(await c.getByRole("button", { name: "Weiter", exact: true }).isDisabled(), true);   // no answer is set in advance
  await c.getByRole("button", { name: "Alle Ja" }).click();
  await c.locator("#panel .chips").nth(1).getByRole("button", { name: "Vielleicht" }).click(); await c.locator("#panel .chips").nth(2).getByRole("button", { name: "Nein" }).click();
  await next(c); await send(c); await c.locator("#share").waitFor();
  const d = await open(hash(await url(c)));
  assert.match(await d.locator("#from").textContent(), /Abgestimmt: 2/);
  await d.locator("#go").click(); await d.locator("#panel").getByText(/^Alle können: \S+ \d+\.\d+\., 18 Uhr$/).waitFor();
  if (shot) await d.screenshot({ path: shot + "/termin.png" });
  assert.deepEqual(errs, []); await b.close();
});
test("Ein Tipp reicht: Pizza oder Pommes springt von Frage zu Frage, Luecke zeigt die Geschichte erst am Ende", async () => {
  const { b, open, errs } = await setup();
  const a = await open("#i=zug-snack"); await a.locator("#go").click();
  for (let i = 0; i < 10; i++) await a.locator("#panel .chip").first().click();
  await a.getByText("Zug steht").waitFor(); await send(a); await a.locator("#share").waitFor();
  const c = await open(hash(await url(a))); await c.locator("#go").click();
  for (let i = 0; i < 10; i++) await c.locator("#panel .chip").first().click();
  await send(c); await c.locator("#share").waitFor();
  const r = await open(hash(await url(c))); await r.locator("#go").click(); await r.locator("#panel").getByText("10 von 10 gleich").waitFor();
  const l = await open("#i=zug-luecke"); await l.locator("#go").click(); await l.locator("#panel .chip").first().click(); await next(l); await send(l); await l.locator("#share").waitFor();
  const m = await open(hash(await url(l))); await m.locator("#go").click();
  const fs = m.locator("#panel input.field"), w = ["Lama", "Nudeln", "Knopf", "Heissa", "tanzen", "Riese"];
  for (let i = 0; i < 6; i++) await fs.nth(i).fill(w[i]);
  assert.equal(await m.locator("#panel").getByText("vor der Tür").count(), 0);
  await next(m); await send(m); await m.locator("#share").waitFor();
  const e = await open(hash(await url(m))); await e.locator("#go").click(); await e.locator("#panel").getByText(/Lama.*Riese/).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Selbes Handy: Weitergeben statt Link, Streichen endet im Beschluss", async () => {
  const { b, open, errs } = await setup();
  const d = await open("#i=zug-deal"); await d.locator("#go").click(); await slide(d, 4); await next(d);
  await d.getByRole("button", { name: /Selbes Handy/ }).click(); await d.getByRole("button", { name: "Ich bin dran" }).click();
  await slide(d, 3); await d.locator("#panel").getByText("Ab wie viel").waitFor();
  const s = await open("#i=raum-streichen"); await s.locator("#go").click();
  for (let i = 0; i < 6; i++) { await s.locator("#panel .chip").first().click(); if (i < 5) await s.getByRole("button", { name: "Ich bin dran" }).click(); }
  await s.locator("#panel").getByText(/Beschluss: /).waitFor();
  // Alle Finger aufs Handy (raum-finger): struck with the shelf clean-up (2026-11, konzept2 section 4); its rules stay covered by test/turns.test.js (fixture)
  const r = await open("#i=raum-sorry"); await r.locator("#go").click();
  for (let i = 0; i < 3; i++) await r.locator("#panel .chip").first().click();
  await r.getByRole("button", { name: "Kopieren" }).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Karten: Ausrede mit Stempel, Rubbellos mit drei Versuchen, Gutschein, Urkunde", async () => {
  const { b, open, errs } = await setup();
  const a = await open("#i=karte-ausrede"); await a.locator("#go").click();
  for (let i = 0; i < 3; i++) await a.locator("#panel .chip").first().click();
  await send(a); await a.locator("#share").waitFor();
  const a2 = await open(hash(await url(a))); await a2.locator("#go").click(); await a2.getByRole("button", { name: "Na gut" }).click(); await send(a2); await a2.locator("#share").waitFor();
  const a3 = await open(hash(await url(a2))); await a3.locator("#go").click(); await a3.locator("#panel").getByText("Na gut").waitFor();
  const r = await open("#i=zug-rubbellos"); await r.locator("#go").click(); await r.locator("#panel .chip").first().click(); await next(r); await r.getByRole("button", { name: "Feld 2" }).click(); await next(r); await send(r); await r.locator("#share").waitFor();
  const r2 = await open(hash(await url(r))); await r2.locator("#go").click(); for (const n of ["Feld 1", "Feld 2", "Feld 3"]) await r2.getByRole("button", { name: n }).click();
  await next(r2); await send(r2); await r2.locator("#share").waitFor();
  const r3 = await open(hash(await url(r2))); await r3.locator("#go").click(); await r3.locator("#panel").getByText(/Treffer: /).waitFor();
  const g = await open("#i=zug-gutschein"); await g.locator("#go").click(); for (let i = 0; i < 3; i++) await g.locator("#panel .chip").nth(i).click();
  await next(g); await send(g); await g.locator("#share").waitFor();
  const g2 = await open(hash(await url(g))); await g2.locator("#go").click(); assert.equal(await g2.locator("#panel .chip").count(), 3);
  const u = await open("#i=karte-urkunde"); await u.locator("#go").click(); await u.locator("#panel .chip").first().click(); await next(u);
  for (let i = 0; i < 3; i++) { await slide(u, 10); await next(u); }
  await u.locator("#panel").getByText("Urkunde: Gold").waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Freitext-Blaetter: Luege, Blitz und Urteil bis zum Ergebnis, Filter sperrt verletzende Saetze", async () => {
  const { b, open, errs } = await setup();
  const l = await open("#i=zug-luege"); await l.locator("#go").click();
  const fs = l.locator("#panel input.field"); await fs.nth(0).fill("Niemand mag dich"); await fs.nth(1).fill("Ich kann pfeifen"); await fs.nth(2).fill("Ich war am Mond");
  assert.equal(await l.getByRole("button", { name: "Weiter", exact: true }).isDisabled(), true);
  await fs.nth(0).fill("Ich mag Toast"); await next(l); await l.getByRole("button", { name: "Ich war am Mond" }).click(); await next(l); await send(l); await l.locator("#share").waitFor();
  const l2 = await open(hash(await url(l))); await l2.locator("#go").click(); await l2.getByRole("button", { name: "Ich war am Mond" }).click(); await next(l2); await send(l2); await l2.locator("#share").waitFor();
  const l3 = await open(hash(await url(l2))); await l3.locator("#go").click(); await l3.locator("#panel").getByText("Durchschaut").waitFor();
  const z = await open("#i=zug-blitz"); await z.locator("#go").click(); await next(z); await send(z); await z.locator("#share").waitFor();
  const z2 = await open(hash(await url(z))); await z2.locator("#go").click(); await next(z2); await send(z2); await z2.locator("#share").waitFor();
  const z3 = await open(hash(await url(z2))); await z3.locator("#go").click(); await z3.locator("#panel").getByText("0 zu 0 Wörter").first().waitFor();
  const r = await open("#i=zug-recht"); await r.locator("#go").click(); await r.locator("#panel input.field").fill("Toast ist Brot"); await next(r); await send(r); await r.locator("#share").waitFor();
  const r2 = await open(hash(await url(r))); await r2.locator("#go").click(); await r2.locator("#panel input.field").fill("Toast ist Kunst"); await next(r2); await send(r2); await r2.locator("#share").waitFor();
  const r3 = await open(hash(await url(r2))); await r3.locator("#go").click(); await r3.locator("#panel .chip").first().click(); await next(r3); await r3.locator("#panel .chip").first().click(); await next(r3); await send(r3); await r3.locator("#share").waitFor();
  const r4 = await open(hash(await url(r3))); await r4.locator("#go").click(); await r4.locator("#panel").getByText(/Urteil: /).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Geschenke: Umschlag zeigt nur den gewaehlten Satz, Rad zieht eine von drei Vorhersagen", async () => {
  const { b, open, errs } = await setup();
  const u = await open("#i=zug-umschlag"); await u.locator("#go").click();
  for (const x of ["Spiel was", "Atme durch", "Zähl Enten"]) { await u.locator("#panel input.field").fill(x); await next(u); }
  await send(u); await u.locator("#share").waitFor();
  const u2 = await open(hash(await url(u))); await u2.locator("#go").click(); await u2.locator("#panel .chip").nth(1).click(); await next(u2); await send(u2); await u2.locator("#share").waitFor();
  const u3 = await open(hash(await url(u2))); await u3.locator("#go").click(); await u3.locator("#panel").getByText("Atme durch").waitFor();
  assert.equal(await u3.locator("#panel").getByText("Spiel was").count(), 0);
  // Dein Schicksal von mir (zug-rad): struck with the shelf clean-up (2026-11, konzept2 section 4); its rules stay covered by test/turns.test.js (fixture)
  assert.deepEqual(errs, []); await b.close();
});
test("Gleiche Steine: zwei Seiten, gleiche Partie, Ergebnis nachgerechnet", async () => {
  const { b, open, errs } = await setup();
  const play = async (p) => { await p.locator("#go").click(); const c = p.locator(".bcell"); assert.equal(await c.count(), 64); await c.nth(0).click(); await c.nth(36).click(); await p.getByRole("button", { name: "Fertig", exact: true }).click(); await send(p); await p.locator("#share").waitFor(); };
  const a = await open("#i=zug-steine"); await play(a);
  const c = await open(hash(await url(a))); await play(c);
  const r = await open(hash(await url(c))); await r.locator("#go").click(); await r.locator("#panel").getByText("nachgerechnet").waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Export: Sticker erscheinen nicht im veroeffentlichten Bild, im Editor schon", async () => {
  const { b, open, errs } = await setup();
  const p = await open("");
  const same = await p.evaluate(async () => {
    await document.fonts.load("900 40px Anton"); await document.fonts.ready;
    const draw = (sk, ex) => { const c = document.createElement("canvas"); c.width = 540; c.height = 675; window.Render.exporting = ex; window.Render.draw(c, { k: "card", st: "druck", x: "Hallo", col: ["#ffd400", "#ff3b1d"], sk, by: [] }, { me: { nick: "", emoji: "" } }); window.Render.exporting = false; return c.toDataURL(); };
    const s = [{ e: "🍕", x: 0.5, y: 0.5, r: 0, z: 2 }];
    draw(s, false); draw(s, true); draw([], true); await document.fonts.ready; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));   // the first draw is what asks for the fonts of this style
    return { export: draw(s, true) === draw([], true), editor: draw(s, false) === draw([], false) };
  });
  assert.deepEqual(same, { export: true, editor: false });
  assert.deepEqual(errs, []); await b.close();
});
test("Raum: Damals endet im Ergebnis", async () => {
  const { b, open, errs } = await setup();
  // Sei unberechenbar (raum-unlesbar): struck with the shelf clean-up (2026-11, konzept2 section 4); its rules stay covered by test/turns.test.js (fixture)
  const d = await open("#i=raum-damals"); await d.locator("#go").click();
  await d.locator("#panel").getByText("Lieblingsessen").waitFor();
  for (const x of ["Pudding", "Lesen", "Schlager", "Kaugummi", "Video"]) { await d.locator("#panel input.field").fill(x); await next(d); }
  await d.locator("#panel").getByText(/Pudding/).first().waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Stufe 3: Hoeflich, Kreis, Woerterbuch und Abfragen starten und nehmen Zuege", async () => {
  const { b, open, errs } = await setup();
  const h = await open("#i=zug-hoeflich"); await h.locator("#go").click();
  await h.locator("#panel").getByText("Pegel: 0").waitFor(); await h.locator("#panel .chip").nth(1).click();
  await h.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor();
  const k = await open("#i=zug-kreis"); await k.locator("#go").click();
  const fs5 = k.locator("#panel input.field");
  for (let i = 0; i < 5; i++) await fs5.nth(i).fill(["Toast", "Hai", "Mond", "Kuh", "Wind"][i]);
  await next(k); for (let i = 0; i < 4; i++) await k.locator("#panel .chip").nth(i).click();
  await k.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor(); assert.equal(await k.locator("#panel input.field").count(), 0);
  const w = await open("#i=zug-woerter"); await w.locator("#go").click();
  await w.locator("#panel .chip").first().click(); await w.locator("#panel").getByText("Für welchen Moment").waitFor();
  const f = await open("#i=zug-abfragen"); await f.locator("#go").click();
  const qs = f.locator("#panel input.field"); for (let i = 0; i < 4; i++) await qs.nth(i).fill("Frage " + "abcd"[i]);
  await next(f); const as = f.locator("#panel input.field"); for (let i = 0; i < 4; i++) await as.nth(i).fill("ja");
  await next(f); assert.equal(await f.locator("#panel input.field").count(), 0);
  assert.deepEqual(errs, []); await b.close();
});
test("Runde im Raum: Verkaufen, Maschine und Such-Zettel laufen bis zum Ergebnis", async () => {
  const { b, open, errs } = await setup(); const hand = (p) => p.getByRole("button", { name: require("../../src/turn.json").text.de.hand_go }).click();
  const names = async (p) => { const f = p.locator("#panel input.field"); for (let i = 0; i < 3; i++) await f.nth(i).fill(["Ana", "Ben", "Cem"][i]); await next(p); await hand(p); };
  const w = await open("#i=mut-werbung"); await w.locator("#go").click(); await names(w);
  // no clock before "Los": the pitch's 30 s start after a tap and 3-2-1 (PLAN D1 Nr. 8)
  for (let i = 0; i < 3; i++) { await w.getByRole("button", { name: "▶ Los" }).click(); await w.getByRole("button", { name: "Fertig", exact: true }).click(); await hand(w); }
  for (let i = 0; i < 3; i++) { await w.locator("#panel .chip").first().click(); if (i < 2) await hand(w); }
  await w.locator("#panel").getByText("Ana: 2").waitFor();
  const m = await open("#i=raum-maschine"); await m.locator("#go").click(); await names(m);
  for (let i = 0; i < 3; i++) { for (let q = 0; q < 6; q++) await m.locator("#panel .chip").nth(i % 2).click(); await hand(m); }
  for (let i = 0; i < 3; i++) { await m.locator("#panel .chip").first().click(); if (i < 2) await hand(m); }
  await m.locator("#panel").getByText(/von 3 reingelegt/).waitFor();
  const s = await open("#i=raum-suche"); await s.locator("#go").click();
  const words = await s.locator("#panel p.qtext").allTextContents(); await next(s);
  const h = s.locator("#panel input.field"); for (let i = 0; i < 4; i++) await h.nth(i).fill("Ort " + "abcd"[i]); await next(s); await hand(s);
  for (const x of words) await s.locator("#panel input.field").fill(x);
  await s.locator("#panel").getByText(/in \d+ Sekunden/).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Wichteln zeigt den Zettel und schickt nichts weiter, Schaetzen endet im Ergebnis", async () => {
  const { b, open, errs } = await setup();
  const w = await open("#i=zug-wichteln"); await w.locator("#go").click();
  const f = w.locator("#panel input.field"); for (let i = 0; i < 3; i++) await f.nth(i).fill(["Ana", "Ben", "Cem"][i]);
  await next(w); await w.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor();
  const s = await open("#i=raum-schaetzen"); await s.locator("#go").click();
  for (let i = 0; i < 5; i++) { await s.locator("#panel input[type=range]").fill("1"); await next(s); }
  await s.locator("#panel").getByText(/Im Schnitt \d+ Prozent/).waitFor(); await s.locator("#panel p.note").getByText(/\?\s\d+/).first().waitFor();
  const r = await open("#i=zug-rangliste"); await r.locator("#go").click();
  for (let i = 0; i < 7; i++) await r.locator("#panel .chip").nth(i).click();
  await r.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor();
  const c = await open("#i=zug-reihum"); await c.locator("#go").click(); await c.locator("#panel .chip").first().click();
  await c.locator("#panel input.field").fill("dein Lachen"); await next(c); await c.locator("#panel input.field").fill("Ana"); await next(c);
  await c.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Kerzen ohne Mikro, Geheimschrift und Danke", async () => {
  const { b, open, errs } = await setup();
  const k = await open("#i=zug-kerzen"); await k.locator("#go").click(); await k.locator("#panel input.field").fill("Alles Gute"); await next(k);
  await k.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor();
  const t = await open("#i=raum-tunnel"); await t.locator("#go").click(); await t.locator("#panel input.field").fill("Pommes"); await next(t);
  await t.locator("#panel").getByText(/^A .   +B /).waitFor();
  const d = await open("#i=karte-danke"); await d.locator("#go").click(); await d.locator("#panel input.field").fill("du da warst"); await next(d);
  await d.locator("#panel input.field").fill("Ana"); await next(d); await d.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Fallpreis und Socken nehmen den ersten Zug", async () => {
  const { b, open, errs } = await setup(); const ready = require("../../src/turn.json").text.de.ready;
  const a = await open("#i=zug-fallpreis"); await a.locator("#go").click();
  for (let i = 0; i < 4; i++) { await a.getByRole("button", { name: "Start" }).click(); await a.waitForTimeout(300); await a.getByRole("button", { name: "Jetzt kaufen" }).click(); }
  await a.locator("#panel").getByText(ready).waitFor();
  const s = await open("#i=zug-socken"); await s.locator("#go").click();
  await s.locator("#panel .bcell").nth(3).click(); await s.locator("#panel .bcell").nth(17).click(); await next(s);
  await s.locator("#panel").getByText(ready).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Rap und Adventskalender nehmen den ersten Zug", async () => {
  const { b, open, errs } = await setup(); const ready = require("../../src/turn.json").text.de.ready;
  const r = await open("#i=zug-rap"); await r.locator("#go").click(); await r.locator("#panel .chip").first().click(); await r.locator("#panel .chip").first().click();
  await r.locator("#panel").getByText(ready).waitFor();
  const a = await open("#i=zug-advent"); await a.locator("#go").click(); await a.locator("#panel input.field").first().fill("Hallo"); await next(a);
  await a.locator("#panel").getByText(ready).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Statue spielt und stoppt, Stimmen-Raetsel zaehlt beim Raten", async () => {
  const { b, open, errs } = await setup();
  const d = await open("#i=beat-disco"); await d.locator("#go").click(); await d.locator("#panel .chip").first().click();
  await d.getByRole("button", { name: "Musik" }).click(); await d.locator("#panel").getByText(/Statue:/).waitFor({ timeout: 15000 });
  await d.getByRole("button", { name: "Ende", exact: true }).click(); await d.locator("#panel").getByText(/1 Runden Statue/).waitFor();
  const s = await open("#i=zug-stimme"); await s.locator("#go").click(); await next(s);
  await s.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Drueck mich spielt einmal und loescht, Tier-Aufstellung endet im Ergebnis", async () => {
  const { b, open, errs } = await setup(); const X = require("../../src/turn.json").text.de, hand = (p) => p.getByRole("button", { name: X.hand_go }).click();
  const m = await open("#i=raum-maus"); await m.locator("#go").click(); await m.locator("#panel input.field").fill("Oma"); await next(m);
  await m.locator("#panel .chip").first().click(); await m.getByRole("button", { name: /Aufnehmen/ }).click(); await hand(m);
  await m.getByRole("button", { name: /Drück mich/ }).click(); await m.locator("#panel").getByText(X.mau_gone).first().waitFor();
  assert.equal(await m.evaluate(() => window.TurnVoice.has("maus")), false);
  const t = await open("#i=mut-tierstory"); await t.locator("#go").click();
  const f = t.locator("#panel input.field"); for (let i = 0; i < 3; i++) await f.nth(i).fill(["Ana", "Ben", "Cem"][i]); await next(t); await hand(t);
  for (let i = 0; i < 3; i++) { await t.getByRole("button", { name: /Aufnehmen/ }).click(); await hand(t); }
  for (let i = 0; i < 3; i++) await t.locator("#panel .chips .chip").first().click();
  await t.locator("#panel").getByText(/von 3 erkannt/).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Stufe 5: Uhr und Pokal messen", async () => {
  const { b, open, errs } = await setup();
  // Letzte Pommes (raum-pommes): struck with the shelf clean-up (2026-11, konzept2 section 4); its rules stay covered by test/turns.test.js (fixture)
  const u = await open("#i=raum-uhr"); await u.locator("#go").click();
  // each round starts on a tap, the target stays in sight (PLAN D1 Nr. 8)
  for (let i = 0; i < 5; i++) { await u.getByRole("button", { name: "▶ Los" }).click(); await u.waitForTimeout(600); await u.getByRole("button", { name: "Stopp" }).click(); }
  await u.locator("#panel").getByText(/im Schnitt|auf den Punkt/).waitFor();
  const k = await open("#i=zug-pokal"); await k.locator("#go").click();
  for (let i = 0; i < 3; i++) { await k.getByRole("button", { name: "▶ Los" }).click(); await k.waitForTimeout(2100); await k.getByRole("button", { name: "Stopp" }).click(); }
  await k.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Tippen aufs Blatt oeffnet die Tageskarte, eine Karte geht unveraendert raus", async () => {
  const { b, open, errs } = await setup();
  const h = await open("#i=karte-einladung"); await h.locator("#leaf").click(); await h.locator("#edmain").waitFor();   // a fixed card: today's may be a game on a layer
  const c = await open("#i=quiz-chaos"); await c.locator("#go").click(); await c.locator("#edmain").click(); await c.locator("#share").waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Nutzertest: Weiter nach automatischem Weiter zaehlt nicht doppelt, Teilen in zwei Schritten", async () => {
  const { b, open, errs } = await setup(); const X = require("../../src/turn.json").text.de;
  const k = await open("#i=zug-kreis"); await k.locator("#go").click();
  const f = k.locator("#panel input.field"); for (let i = 0; i < 5; i++) await f.nth(i).fill(["Toast", "Hai", "Mond", "Kuh", "Wind"][i]);
  await next(k); for (let i = 0; i < 4; i++) await k.locator("#panel .chip").nth(i).click();
  await k.getByRole("button", { name: "Weiter", exact: true }).click().catch(() => {});   // a human taps on as well
  await k.locator("#panel").getByText(X.ready).waitFor(); await k.waitForFunction((s) => document.querySelector("#edmain").textContent.trim() === s, X.send);
  await k.getByRole("tab", { name: "Text" }).click(); await k.getByRole("tab", { name: /Zug/ }).click(); await k.locator("#panel").getByText(X.ready).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Tuersteher: Wesen an der Tuer, Rein und Raus bis zum Ende", async () => {
  const { b, open, errs } = await setup();
  const p = await open("#i=raum-tuer"); await p.locator("#go").click();
  await p.getByRole("button", { name: "▶ Los" }).click(); await p.locator(".bface").waitFor();
  for (let i = 0; i < 12; i++) { await p.getByRole("button", { name: i % 2 ? "✋ Raus" : "✅ Rein" }).click(); await p.waitForTimeout(650); }
  await p.locator("#panel").getByText(/Regeln geknackt/).waitFor({ timeout: 70000 }); await p.locator("#panel").getByText(/von \d+ richtig/).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Alle Eingabearten: Einigung, Wortfeld, Auktion, Kapsel und die Spieleauswahl", async () => {
  const { b, open, errs } = await setup();
  const m = await open(""); await G.alle(m); await m.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  assert.equal(await m.locator("#shbody .mech:not(.arctile)").count(), await m.evaluate(() => window.Daily.IDEAS.filter((i) => i.kind === "turn").length));
  assert.equal(await m.locator("#shbody .arctile").count(), await m.evaluate(() => window.Daily.IDEAS.filter((i) => i.kind === "arcade").length));
  await m.getByRole("button", { name: /Worauf einigen/ }).click();
  const fs = m.locator("#panel input.field"); for (let i = 0; i < 5; i++) await fs.nth(i).fill("Film" + "ABCDE"[i]);
  await next(m);
  for (const n of ["FilmA", "FilmB", "FilmC", "FilmD"]) await m.getByRole("button", { name: n, exact: true }).click();   // the last place sets itself, then it goes on
  await m.locator("#panel").getByText(require("../../src/turn.json").text.de.ready).waitFor(); await send(m); await m.locator("#share").waitFor();
  const e = await open(hash(await url(m))); await e.locator("#go").click();
  for (const n of ["FilmE", "FilmD", "FilmC", "FilmB"]) await e.getByRole("button", { name: n, exact: true }).click();
  await e.getByText("Einigung: FilmC").first().waitFor();   // the last move shows the result at once
  await send(e); await e.locator("#share").waitFor();
  const r = await open(hash(await url(e))); await r.locator("#go").click(); await r.getByText("Einigung: FilmC").first().waitFor();

  const w = await open("#i=zug-wort"); await w.locator("#go").click();
  const chips = w.locator("#panel .chip"); assert.equal(await chips.count(), 9);
  for (let i = 0; i < 3; i++) await chips.nth(i).click();
  await next(w); await w.locator("#panel input.field").fill("Qqqq"); await next(w); await send(w); await w.locator("#share").waitFor();
  const w2 = await open(hash(await url(w))); await w2.locator("#go").click(); await w2.getByText("Qqqq").first().waitFor();
  const c2 = w2.locator("#panel .chip"); for (let i = 0; i < 3; i++) await c2.nth(i).click();
  await next(w2); await send(w2); await w2.locator("#share").waitFor();
  const w3 = await open(hash(await url(w2))); await w3.locator("#go").click(); await w3.getByText("Drei von drei").first().waitFor();

  const k = await open("#i=zug-kapsel"); await k.locator("#go").click();
  await k.locator("#panel .chip").first().click(); await next(k); await slide(k, 3); await next(k); await send(k); await k.locator("#share").waitFor();
  const k2 = await open(hash(await url(k)));
  assert.match(await k2.locator("#from").textContent(), /Noch 3 Tage/);
  await k2.locator("#go").click(); await k2.locator("#panel").getByText("Noch 3 Tage").waitFor();
  assert.equal(await k2.getByRole("button", { name: "Weiter", exact: true }).count(), 0);

  const au = await open("#i=zug-auktion"); await au.locator("#go").click();
  const plus = au.locator("#panel .chip", { hasText: "+" }); assert.equal(await plus.count(), 5);
  for (let i = 0; i < 11; i++) await plus.first().click();
  await au.getByText("Noch 0 Münzen").waitFor(); await next(au); await send(au); await au.locator("#share").waitFor();
  assert.deepEqual(errs, []); await b.close();
});
test("Geld einsammeln: Name, Zweck, Personen, Betrag mit Cent; alle oeffnen denselben Link, PayPal-Link nur ab 18", async () => {
  const { b, open, errs } = await setup({ web: true });   // several pages of one device, one of them reloaded
  const a = await open("#i=zug-sammeln"); await a.locator("#go").click();
  const f = a.locator("#panel input.field"), weiter = a.getByRole("button", { name: "Weiter", exact: true });
  await f.fill("max muster"); assert.equal(await weiter.isDisabled(), true);
  await f.fill("maxmuster"); await next(a);
  await a.locator("#panel input.field").fill("Pizza-Abend"); await next(a);
  await slide(a, 4); await a.locator("#panel").getByText("4 👤").waitFor(); await next(a);
  const eur = a.locator("#panel input.field");
  assert.equal(await eur.getAttribute("inputmode"), "decimal");
  await eur.fill("abc"); assert.equal(await weiter.isDisabled(), true);
  await eur.fill("37,50"); await a.locator("#panel").getByText("37,50 € geteilt durch 4 · 9,37 € pro Person · Rest 2 ct übernimmt, wer sammelt").waitFor();
  if (shot) await a.screenshot({ path: shot + "/wa-sammeln-betrag.png" });
  await next(a);
  await a.getByText("Zug steht").waitFor(); await send(a); await a.locator("#share").waitFor();
  const one = await url(a); assert.ok(!/maxmuster|paypal/i.test(one), "Name steht nicht lesbar im Link");
  // someone without an age in the profile: a note, no link, one tap to say 18+
  const c = await open(hash(one)); await c.locator("#go").click();
  await c.locator("#panel").getByText("Pizza-Abend: 9,37 € pro Person an paypal.me/maxmuster").waitFor();
  await c.locator("#panel").getByText("37,50 € geteilt durch 4 · Rest 2 ct übernimmt, wer sammelt").waitFor();
  await c.locator("#panel").getByText(/nur an Leute, die du kennst.*erst ab 18/).waitFor();
  assert.equal(await c.locator("#paylink").count(), 0, "ohne Alter kein PayPal-Link");
  await c.locator("#panel").getByText("Den PayPal-Link zeigen wir ab 18. Deine Angabe wird in deinen Vorgaben gemerkt, dort kannst du sie wieder abwählen.").waitFor();
  if (shot) await c.screenshot({ path: shot + "/wa-sammeln-alter.png" });
  await c.getByRole("button", { name: "Ich bin 18 oder älter" }).click();
  const pay = c.locator("#paylink");
  assert.equal(await pay.getAttribute("href"), "https://paypal.me/maxmuster/9.37EUR");
  assert.equal(await pay.getAttribute("target"), "_blank"); assert.equal(await pay.getAttribute("rel"), "noopener noreferrer");
  assert.match(await pay.textContent(), /9,37 € mit PayPal zahlen/);
  assert.equal(await c.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).me.pref.age), "a18", "nur lokal gemerkt");
  assert.equal(await c.getByRole("button", { name: "Weiter", exact: true }).count(), 0, "nach dem Bezahlen kein Weiter, kein Druck");
  assert.equal(await c.locator("#edmain").isVisible(), false);
  await c.context().route("https://paypal.me/**", (r) => r.abort());
  const popup = c.waitForEvent("popup"); await pay.click(); await popup;
  await c.locator("#panel").getByText("Fertig. Den Link teilen kannst du, wenn du magst.").waitFor();
  if (shot) await c.screenshot({ path: shot + "/wa-sammeln-zahlen.png" });
  // a known 16-17: no link and no way around it; creating one is not offered either
  const y = await open(hash(one)); await y.evaluate(() => { const s = JSON.parse(localStorage.getItem("daily.v1")); s.me.pref = { age: "u18" }; localStorage.setItem("daily.v1", JSON.stringify(s)); });
  await y.reload(); await y.locator("#go").click();
  await y.locator("#panel").getByText(/^PayPal gibt es erst ab 18/).waitFor();
  assert.equal(await y.locator("#paylink").count(), 0); assert.equal(await y.getByRole("button", { name: "Ich bin 18 oder älter" }).count(), 0);
  const y2 = await open("#i=zug-sammeln"); await y2.locator("#go").click(); await y2.locator("#panel").getByText(/^PayPal gibt es erst ab 18/).waitFor();
  assert.equal(await y2.locator("#panel input.field").count(), 0);
  assert.deepEqual(errs, []); await b.close();
});
test("Einkaufszettel: zwei Handys, Antwort und eigene Ergaenzung werden beim Ersteller zusammengefuehrt", async () => {
  // Two browser contexts are two phones: separate storage, only the links travel between them.
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), errs = [];
  const phone = async () => { const c = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); c.setDefaultTimeout(15000); return c; };
  const mia = await phone(), ben = await phone();
  const open = async (c, h) => { const p = await c.newPage(); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(page + h); return p; };
  const add = async (p, s) => { const f = p.locator("#panel form.shopadd input"); await f.fill(s); await f.press("Enter"); };
  const rows = (p) => p.evaluate(() => window.Turns.shopRows(window.Turns.moves(window.DailyDebug.doc())[0][0]).map((r) => [r.label, r.bought.map((x) => x[0]).join(), r.bring.map((x) => x[0]).join()]));
  const share = async (p) => { await p.locator("#edmain").filter({ hasText: "Liste teilen" }).click(); await p.locator("#share").waitFor(); return url(p); };
  // Mia: open, four items with Enter, share. The first link is three taps away: open, share, send.
  const a = await open(mia, "#i=zug-einkauf"); await a.locator("#go").click();
  assert.equal(await a.getByRole("button", { name: "Weiter", exact: true }).count(), 0, "kein Weiter: was auf der Liste steht, geht raus");
  for (const s of ["2× Milch", "Brot", "Käse", "6 Äpfel"]) await add(a, s);
  await add(a, "<img src=x onerror=alert(1)>");
  assert.equal(await a.locator("#panel img").count(), 0, "kein HTML aus der Eingabe");
  await a.getByRole("button", { name: /^Wieder streichen: .*img/ }).click();
  assert.equal(await a.locator("#panel .shoprow").count(), 4);
  if (shot) await a.screenshot({ path: shot + "/einkauf-creator.png" });
  const one = await share(a); assert.ok(!/Milch/.test(Buffer.from(one.split("#c=")[1], "base64url").toString()), "Liste steht nicht lesbar im Link");
  // Ben, on his own phone: name, bring the milk, bought the cheese, add chips, send back.
  const c = await open(ben, hash(one));
  assert.match(await c.locator("#from").textContent(), /Abhaken, mitbringen, dazuschreiben/);
  if (shot) await c.screenshot({ path: shot + "/einkauf-received.png" });
  await c.locator("#go").click();
  await c.getByRole("button", { name: "Bring ich mit: 2× Milch" }).click(); await c.getByText("Erst deinen Namen eintragen.").waitFor();
  await c.getByRole("textbox", { name: /Dein Name/ }).fill("Ben");
  await c.getByRole("button", { name: "Bring ich mit: 2× Milch" }).click(); await c.getByRole("button", { name: "Hab ich gekauft: Käse" }).click();
  await add(c, "Chips");
  await c.locator("#panel").getByText("bringt: 🐸 Ben").waitFor(); await c.locator("#panel").getByText("gekauft: 🐸 Ben").waitFor();
  await c.waitForFunction(() => !document.getElementById("toast").classList.contains("show"));
  if (shot) await c.screenshot({ path: shot + "/einkauf-recipient.png" });
  const reply = await share(c);
  // Meanwhile Mia adds butter on the first link: her phone now knows a list Ben's reply does not have.
  const a2 = await open(mia, hash(one)); await a2.locator("#go").click(); await add(a2, "Butter"); await share(a2);
  // Ben's reply arrives: nothing of either side is lost.
  const back = await open(mia, hash(reply)); await back.locator("#go").click();
  assert.deepEqual(await rows(back), [["2× Milch", "", "Ben"], ["Brot", "", ""], ["Käse", "Ben", ""], ["6× Äpfel", "", ""], ["Butter", "", ""], ["Chips", "", ""]]);
  await back.locator("#panel").getByText("bringt: 🐸 Ben").waitFor();
  // the same reply opened a second time on Mia's phone changes nothing
  const again = await open(mia, hash(reply)); await again.locator("#go").click(); assert.equal((await rows(again)).length, 6);
  await share(again);
  if (shot) {
    const png = await again.evaluate(async () => { const r = new FileReader(); return await new Promise((ok) => { r.onload = () => ok(r.result); r.readAsDataURL(window.DailyDebug.result().png); }); });
    require("node:fs").writeFileSync(shot + "/einkauf-share.png", Buffer.from(png.split(",")[1], "base64"));
  }
  assert.deepEqual(errs, []); await b.close();
});
test("Aufgaben aus dem Protokoll: Link oeffnet die Liste, Namen nur wo genannt, uebernehmen, .ics-Fristen, Folgetermin, Antwort wird zusammengefuehrt", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), errs = [];
  const phone = async () => { const c = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE", acceptDownloads: true }); c.setDefaultTimeout(15000); return c; };
  const mia = await phone(), cem = await phone();
  const open = async (c, h) => { const p = await c.newPage(); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(page + h); return p; };
  const day = Math.floor(Date.UTC(2026, 10, 14) / 864e5);
  const payload = { t: "Sommerfest", i: [["Getränke besorgen", "Anna", day], ["Raum buchen", "", 0], ["Treffen am Bahnhof", "", 0]] };
  const a = await open(mia, "#todo=" + Buffer.from(JSON.stringify(payload)).toString("base64url"));
  await a.locator("#panel .shoprow").first().waitFor();
  assert.equal(await a.evaluate(() => location.hash), "", "der Inhalt verschwindet sofort aus der Adresse");
  await a.getByText("Nicht im Link: 1 (Text gefiltert oder kein Platz).").waitFor();
  const rows = () => a.locator("#panel .shoprow").allInnerTexts();
  assert.deepEqual((await rows()).map((s) => s.split("\n")[0]), ["Getränke besorgen", "Raum buchen"]);
  await a.locator("#panel").getByText("macht: 🐸 Anna · bis Sa 14.11.").waitFor();
  await a.locator("#panel .shoprow", { hasText: "Raum buchen" }).getByText("offen").waitFor();
  if (shot) await a.screenshot({ path: shot + "/wa-aufgaben.png" });
  // the deadlines as a calendar file
  const dl = a.waitForEvent("download"); await a.getByRole("button", { name: "📅 Fristen (.ics)" }).click(); const file = await dl;
  assert.equal(file.suggestedFilename(), "aufgaben.ics");
  const ics = require("node:fs").readFileSync(await file.path(), "utf8");
  assert.match(ics, /SUMMARY:Getränke besorgen \(Anna\)/); assert.match(ics, /DTSTART;VALUE=DATE:20261114/); assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  // the next meeting's agenda from the open tasks
  await a.getByRole("button", { name: "🗓 Folgetermin" }).click();
  await a.locator(".agendatext").getByText(/Folgetermin: Sommerfest\s+1\. Rückblick: 0 von 2 erledigt\s+2\. Getränke besorgen \(Anna, bis Sa 14\.11\.\)\s+3\. Raum buchen \(offen\)\s+4\. Neue Punkte/).waitFor();
  if (shot) await a.screenshot({ path: shot + "/wa-folgetermin.png" });
  await a.locator("#edmain").filter({ hasText: "Aufgaben teilen" }).click(); await a.locator("#share").waitFor();
  const one = await url(a);
  // Cem takes the room on his phone and sends it back; Mia's phone merges it
  const c = await open(cem, hash(one)); await c.locator("#go").click();
  await c.getByRole("textbox", { name: /Dein Name/ }).fill("Cem");
  await c.getByRole("button", { name: "Mach ich: Raum buchen" }).click();
  await c.locator("#panel").getByText("macht: 🐸 Cem").waitFor();
  await c.locator("#edmain").filter({ hasText: "Aufgaben teilen" }).click(); await c.locator("#share").waitFor();
  const back = await open(mia, hash(await url(c))); await back.locator("#go").click();
  await back.locator("#panel .shoprow", { hasText: "Raum buchen" }).getByText("macht: 🐸 Cem").waitFor();
  await back.locator("#panel .shoprow", { hasText: "Getränke besorgen" }).getByText(/macht: 🐸 Anna/).waitFor();
  const bad = await open(mia, "#todo=" + Buffer.from("{kaputt").toString("base64url"));
  await bad.locator("#go").waitFor(); assert.equal(await bad.locator("#panel .shoprow").count(), 0);
  assert.deepEqual(errs, []); await b.close();
});
test("Profil: Vorgaben als Chips, abwaehlbar, nur lokal; Essen erst ab 16, PayPal-Name ab 18 fuellt Geld einsammeln vor", async () => {
  const { b, open, errs } = await setup();
  const p = await open(""); await p.locator("#me").click();
  await p.getByText("Meine Vorgaben").click(); await p.getByText("Noch keine.").waitFor();   // a closed section in My style
  await p.getByText("Essen fragen wir erst ab 16.").waitFor(); await p.getByText("PayPal gibt es erst ab 18.").waitFor();
  const box = p.locator(".pfbox");
  await box.getByRole("button", { name: "13–15", exact: true }).click();
  await box.getByRole("button", { name: "4", exact: true }).click();
  await box.getByRole("button", { name: "sonntags", exact: true }).click();
  assert.equal(await box.getByRole("button", { name: "vegetarisch", exact: true }).count(), 0, "unter 16 keine Frage nach dem Essen");
  await box.getByRole("button", { name: "16–17", exact: true }).click();
  await box.getByRole("button", { name: "vegetarisch", exact: true }).click();
  await box.getByRole("button", { name: "Alter 16–17 ✕" }).waitFor(); await box.getByRole("button", { name: "vegetarisch ✕" }).waitFor();
  await box.getByRole("button", { name: "18+ (eigene Angabe)", exact: true }).click();   // a self-declaration, like 16+
  await box.getByRole("textbox", { name: "PayPal.me-Name" }).fill("paypal.me/miaMuster"); await box.getByRole("textbox", { name: "PayPal.me-Name" }).press("Enter");
  await box.getByRole("button", { name: "paypal.me/miaMuster ✕" }).waitFor();
  if (shot) await p.screenshot({ path: shot + "/wa-profil.png", fullPage: true });
  assert.equal(await p.evaluate(() => window.DailyApp.prefContext()), "Haushalt 4 Personen; vegetarisch; keine Zeit sonntags");
  await box.getByRole("button", { name: "Keine Zeit sonntags ✕" }).click();
  assert.equal(await p.evaluate(() => window.DailyApp.prefContext(["hh", "no"])), "Haushalt 4 Personen");
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).me.pref);
  assert.deepEqual(stored, { age: "a18", hh: 4, diet: "veg", pp: "miaMuster" });
  const s = await open("#i=zug-sammeln"); await s.locator("#go").click();
  assert.equal(await s.locator("#panel input.field").inputValue(), "miaMuster", "eigener PayPal-Name steht schon drin");
  assert.equal(await s.getByRole("button", { name: "Weiter", exact: true }).isDisabled(), false);
  assert.deepEqual(errs, []); await b.close();
});
test("Agent-Duell: nach dem Match steht, warum es so ausging, ohne KI und ohne Netz", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE", reducedMotion: "reduce" }), errs = [], hosts = new Set();
  ctx.setDefaultTimeout(15000); ctx.on("request", (r) => { if (/^https?:/.test(r.url()) && !G.isLocal(r.url())) hosts.add(new URL(r.url()).host); });   // the page itself comes from the web route
  // the auction and rap duels against an agent were struck (2026-11); the merged ones (into duell-liest) still open by link
  for (const id of ["duell-ssp", "auktion-quatsch", "rap-hoeflich"]) {
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(page + "#i=" + id);
    await p.locator("#go").click(); await p.locator("#edmain").click();
    await p.locator(".duelres").waitFor(); const why = p.locator(".duelwhy").first(); await why.waitFor();
    assert.match(await why.textContent(), /^❓ \S/); assert.ok(!/\{\w+\}|undefined/.test(await p.locator("#panel").innerText()));
    if (shot && id === "auktion-quatsch") await p.screenshot({ path: shot + "/wa-duell-warum.png" });
  }
  assert.deepEqual([...hosts], [], "keine Anfrage ins Netz"); assert.deepEqual(errs, []); await b.close();
});
