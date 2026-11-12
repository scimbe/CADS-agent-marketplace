// Tisch (Skat, Doppelkopf, Bauernskat) ueber die sichtbare UI: Bot-Partie, Live zu zweit (Fake-Live), Verdeckung,
// axe, Tastatur, kein verdecktes Bedienelement. Karten werden ueber ihren Namen (aria-label) angesprochen.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, screen, waitScreen, axe, noOverflow } from "./lib/grund.mjs";
import { pickMode, liveInvite } from "./lib/scenarios.mjs";
import { fakeLive } from "./lib/fakelive.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const SUIT = "(Kreuz|Pik|Herz|Karo)", RANK = "(Ass|Zehn|König|Dame|Bube|Neun|Acht|Sieben)";
const CARD = new RegExp("^" + SUIT + "-" + RANK + "$");
const handCards = (p) => p.locator('[data-part="hand"] button[aria-label]');
// alle Kartennamen im DOM (sichtbar oder fuer Screenreader)
const allNames = (p) => p.evaluate(() => [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")));

/** Ein menschlicher Zug: zuerst eine spielbare Karte, sonst Druecken (zwei Karten + Bestaetigen), sonst die erste Wahl. */
async function humanStep(p, { keyboard = false } = {}) {
  const s = await screen(p);
  if (s !== "card-play-turn") return s;
  const cards = handCards(p);
  if (await cards.count()) {
    const c = cards.first();
    if (keyboard) { await c.focus(); await p.keyboard.press("Enter"); } else await c.click();
    return "played";
  }
  const pick = p.locator(".pickn");
  if (await pick.count()) {
    const items = pick.locator("button[aria-pressed]");
    await items.nth(0).click(); await items.nth(1).click();
    await pick.locator("button:not([aria-pressed])").last().click();
    return "pushed";
  }
  // Reizen/Passen/Ansagen: „Passe" bzw. die letzte Option, damit Partien kurz bleiben
  const opts = p.locator(".choice .opt");
  const pass = opts.filter({ hasText: /^Passe$|^Gesund$|^Nächstes Spiel$/ });
  if (await pass.count()) await pass.first().click(); else await opts.first().click();
  return "chose";
}
async function playToEnd(p, { max = 400, onTurn } = {}) {
  for (let i = 0; i < max; i++) {
    const s = await screen(p);
    if (s === "card-play-over") return s;
    if (s === "card-play-turn") { if (onTurn) await onTurn(p); await humanStep(p); }
    else await p.waitForTimeout(40);
  }
  return screen(p);
}

for (const [id, seats] of [["tisch-bauernskat", 2], ["tisch-skat", 3], ["tisch-doko", 4]]) {
  test(id + ": Partie gegen " + (seats - 1) + " Bot(s) bis zum Ende – nur die eigene Hand im DOM, Ergebnis geprueft, axe 0", async () => {
    const A = await open(b, { view: "phone390", lang: "de" });
    await act(A.p, "open-" + id); await pickMode(A.p, "de", "bot"); await act(A.p, "go");
    let turns = 0, axeDone = false;
    const bad = [];
    const end = await playToEnd(A.p, { onTurn: async (p) => {
      turns++;
      if (seats > 2) {
        // Verdeckung: auf dem Bildschirm stehen nur eigene Karten, der Stich und (Skat) eine offen gelegte Hand
        const own = await handCards(p).count(), names = (await allNames(p)).filter((x) => CARD.test(x));
        assert.ok(new Set(names).size <= own + 12 + seats, "zu viele Kartennamen sichtbar: " + names.length);
      }
      if (!axeDone && (await handCards(p).count())) { bad.push(...(await axe(p, id + " Zug"))); axeDone = true; assert.ok(await noOverflow(p)); }
    } });
    assert.equal(end, "card-play-over");
    assert.ok(turns > 3, "menschliche Zuege: " + turns);
    const text = await A.p.locator("main").innerText();
    assert.match(text, /Alle Karten nachgeprüft|Eingepasst|geschummelt/);
    assert.doesNotMatch(text, /geschummelt|Regelverstoß/, "ehrliche Partie wird nicht als Betrug gemeldet");
    bad.push(...(await axe(A.p, id + " Ende")));
    assert.deepEqual(bad, []);
    assert.deepEqual(A.errs, []);
  });
}

test("Bauernskat live zu zweit (Fake-Live): beide sehen dasselbe Ende, das Netz sieht keine verdeckte Karte vor dem Aufdecken", async () => {
  const { A, B, net } = await liveInvite(b, { view: "phone390", lang: "de" }, "tisch-bauernskat");
  for (let i = 0; i < 600; i++) {
    const [sa, sb] = [await screen(A.p), await screen(B.p)];
    if (sa === "card-play-over" && sb === "card-play-over") break;
    await humanStep(A.p); await humanStep(B.p); await A.p.waitForTimeout(30);
  }
  await waitScreen(A.p, "card-play-over"); await waitScreen(B.p, "card-play-over");
  // gleicher Endstand auf beiden Geraeten (Namen sind aus Sicht des Geraets: „Du" bzw. „Platz n")
  const nums = async (p) => (await p.locator(".t-big").last().textContent()).match(/-?\d+(?=\s*(·|$))/g);
  assert.deepEqual(await nums(A.p), await nums(B.p));
  // Im Kanal stehen nur Punkte, Schluessel und Zuege – nie ein Salz vor der Aufloesung
  const msgs = net.wire.dc.map((x) => x.s), firstReveal = msgs.findIndex((m) => m.includes('"reveal"'));
  assert.ok(firstReveal > 0);
  for (const m of msgs.slice(0, firstReveal)) assert.doesNotMatch(m, /"salt"/);
  assert.deepEqual([...A.errs, ...B.errs], []);
});

// Ausgesetzt mit Grund: test/e2e/lib/fakelive.mjs (Strang F) verbindet nur zwei Seiten (a/b); der Gastgeber einer Gruppe
// braucht je Gast eine eigene Verbindung. Ohne sie lehnt der Gast ab („Verbindung kommt nicht zustande“). Die Gruppenpartie
// selbst ist in test/tisch-live.test.js mit 3 und 4 Geraeten ueber die echte Laufzeit belegt.
test("Skat live zu dritt (Gruppen-Live, Fake-Live): ein Link je Gast, ganze Partie, gleicher Endstand, axe 0 am Tisch", { skip: "wartet auf Gruppen-Fake-Live im Browser (fakelive.mjs, Strang F)" }, async () => {
  const net = fakeLive(), o = { view: "phone390", lang: "de" };
  const H = await open(b, { ...o, before: (ctx, p) => net.attach(ctx, p, "h") });
  await act(H.p, "open-tisch-skat"); await pickMode(H.p, "de", "live"); await act(H.p, "go");
  await waitScreen(H.p, "card-lobby");
  await H.p.waitForFunction(() => document.querySelectorAll(".invite .linkfield").length === 2, null, { timeout: 20000 });
  const links = await H.p.$$eval(".invite .linkfield", (xs) => xs.map((x) => x.value.slice(x.value.indexOf("#"))));
  const G = [];
  for (const [i, l] of links.entries()) { const g = await open(b, { ...o, hash: l, before: (ctx, p) => net.attach(ctx, p, "g" + i) }); await waitScreen(g.p, "receive-live"); await act(g.p, "accept"); G.push(g); }
  const all = [H, ...G], bad = [];
  let axed = false;
  for (let i = 0; i < 3000; i++) {
    const ss = await Promise.all(all.map((d) => screen(d.p)));
    if (ss.every((x) => x === "card-play-over")) break;
    for (const d of all) {
      if (!axed && (await screen(d.p)) === "card-play-turn" && (await handCards(d.p).count())) { bad.push(...(await axe(d.p, "Skat live"))); axed = true; }
      await humanStep(d.p);
    }
  }
  const state = async () => (await Promise.all(all.map(async (d) => (await screen(d.p)) + ": " + (await d.p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 160)))).join(" || ");
  for (const d of all) await waitScreen(d.p, "card-play-over", 60000).catch(async (e) => { throw new Error(e.message + " – " + (await state())); });
  const nums = async (p) => (await p.locator(".t-big").last().textContent()).match(/-?\d+(?=\s*(·|$))/g);
  const first = await nums(H.p);
  for (const g of G) assert.deepEqual(await nums(g.p), first);
  assert.deepEqual(bad, []);
  assert.deepEqual(all.flatMap((d) => d.errs), []);
});

test("Tastatur: Karten sind Knoepfe mit Namen, Tab erreicht sie, Enter spielt", async () => {
  const A = await open(b, { view: "desk1280", lang: "de" });
  await act(A.p, "open-tisch-bauernskat"); await pickMode(A.p, "de", "bot"); await act(A.p, "go");
  for (let i = 0; i < 200; i++) {
    const s = await screen(A.p);
    if (s === "card-play-turn" && (await handCards(A.p).count())) break;
    if (s === "card-play-turn") await humanStep(A.p); else await A.p.waitForTimeout(40);
  }
  const label = await handCards(A.p).first().getAttribute("aria-label");
  assert.match(label, CARD);
  await humanStep(A.p, { keyboard: true });
  // die gespielte Karte liegt danach im Stich, nicht mehr auf den eigenen Stapeln (jede Karte gibt es einmal)
  await A.p.waitForFunction((l) => ![...document.querySelectorAll('[data-part="hand"] [aria-label]')].some((e) => e.getAttribute("aria-label") === l), label);
  assert.deepEqual(A.errs, []);
});

for (const view of ["phone360", "phone390", "phone412", "desk1280"]) {
  test("Tisch-Ansicht: kein waagerechter Ueberlauf und eigene Karten im ersten Bildschirm erreichbar: " + view, async () => {
    const A = await open(b, { view, lang: "de" });
    await act(A.p, "open-tisch-skat"); await pickMode(A.p, "de", "bot"); await act(A.p, "go");
    for (let i = 0; i < 200 && (await screen(A.p)) !== "card-play-turn"; i++) await A.p.waitForTimeout(40);
    assert.ok(await noOverflow(A.p), "kein waagerechter Ueberlauf");
    const r = await A.p.evaluate(() => { const c = document.querySelector('[data-part="hand"]'); return c ? c.getBoundingClientRect().top : -1; });
    assert.ok(r >= 0 && r < (await A.p.evaluate(() => innerHeight)) * 1.5, "Hand erreichbar: " + r);
    assert.deepEqual(A.errs, []);
  });
}
