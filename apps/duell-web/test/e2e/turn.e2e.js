"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const shot = process.env.SHOT_DIR;
const hash = (u) => "#" + u.split("#")[1];

async function setup() {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), errs = [];
  ctx.setDefaultTimeout(15000);
  const open = async (h) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(page + h); return p; };
  return { b, open, errs };
}
const url = (p) => p.evaluate(() => window.DailyDebug.result().url);
const next = (p) => p.getByRole("button", { name: "Weiter", exact: true }).click();
const slide = (p, v) => p.locator("#panel input[type=range]").evaluate((r, x) => { r.value = x; r.dispatchEvent(new Event("input", { bubbles: true })); }, v);
const send = (p) => p.locator("#edmain").click();

test("Zwei Geraete: Keks-Deal laeuft nur ueber Links bis zum Ergebnisbild", async () => {
  const { b, open, errs } = await setup();
  const a = await open("#i=zug-deal"); await a.locator("#go").click();
  assert.match(await a.locator("#edmain").textContent(), /Erst deinen Zug/);
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
  const f = await open("#i=raum-finger"); await f.locator("#go").click();
  await f.locator(".touchpad").evaluate((pad) => { [1, 2].forEach((id) => pad.dispatchEvent(new PointerEvent("pointerdown", { pointerId: id, clientX: 40 * id, clientY: 40, bubbles: true }))); });
  await f.locator("#panel").getByText("Ein Finger hat entschieden").waitFor();
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
test("Alle Eingabearten: Einigung, Wortfeld, Auktion, Kapsel und die Spieleauswahl", async () => {
  const { b, open, errs } = await setup();
  const m = await open(""); await m.getByRole("button", { name: /Zu zweit/ }).click();
  assert.equal(await m.locator("#shbody .mech").count(), 26);
  await m.getByRole("button", { name: /Worauf einigen/ }).click();
  const fs = m.locator("#panel input.field"); for (let i = 0; i < 5; i++) await fs.nth(i).fill("Film" + "ABCDE"[i]);
  await next(m);
  for (const n of ["FilmA", "FilmB", "FilmC", "FilmD", "FilmE"]) await m.getByRole("button", { name: n }).click();
  await next(m); await send(m); await m.locator("#share").waitFor();
  const e = await open(hash(await url(m))); await e.locator("#go").click();
  for (const n of ["FilmE", "FilmD", "FilmC", "FilmB", "FilmA"]) await e.getByRole("button", { name: n, exact: true }).click();
  await next(e); await send(e); await e.locator("#share").waitFor();
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
