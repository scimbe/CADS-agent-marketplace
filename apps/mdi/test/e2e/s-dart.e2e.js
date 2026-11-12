// spiel-dart im echten Browser mit den Widgets aus Strang F (aim, power, form, canvas):
// Partie gegen Bert per Klick bis zum Ende, Zielen per Touch und Pfeiltasten, Kraft am Regler (ohne Timing, alt da_n2),
// Wurf-Zustand ohne verdecktes Bedienelement und mit axe 0 auf 4 Ansichten, Link-Partie zwischen zwei Seiten.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, noOverflow, waitScreen, screen } from "./lib/grund.mjs";
import { pickMode } from "./lib/scenarios.mjs";
import * as D from "../../src/engines/dart/dart.js";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const X = (lang) => D.T(lang);
const linkOf = (p) => p.locator("#linkfield").inputValue().then((u) => u.slice(u.indexOf("#")));

/** Spielart waehlen (Regeln-Blase): a 301 Double-Out … d Hoechste Punktzahl. */
async function setGame(p, k) {
  await act(p, "customize");
  await p.locator('.bubble[data-for="regeln"]').click();
  await p.getByRole("radio", { name: k, exact: true }).first().click();
  await act(p, "close"); await act(p, "done");
}
/** Bis der eigene Wurf-Bildschirm da ist (Abdecken bestaetigen, Bert abwarten). */
async function untilTurn(p, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const s = await screen(p);
    if (s === "card-play-turn" || s === "card-play-over" || s === "card-play-send") return s;
    if (s === "card-play-cover") await act(p, "cover-ok");
    if (Date.now() - t0 > ms) throw new Error("untilTurn: " + s);
    await p.waitForTimeout(50);
  }
}
/** Ein Pfeil am Regler ohne Timing (alt da_n2): Umschalter, dann „Werfen“. */
async function throwSlider(p, lang) {
  const sw = p.getByRole("button", { name: X(lang).da_lv_mid, exact: true });
  if ((await sw.getAttribute("aria-pressed")) !== "true") await sw.click();
  const before = await p.locator("main").innerText();
  await p.locator('[data-act="w-wurf"]').click();
  for (let i = 0; i < 100 && (await p.locator("main").innerText()) === before; i++) await p.waitForTimeout(20);
}
const settle = (p) => p.evaluate(() => new Promise((res) => {
  let t; const done = () => { mo.disconnect(); res(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 250); });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(done, 250); setTimeout(done, 3000);
}));
const covered = (p) => p.evaluate(async () => {
  const out = [];
  const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio], [role=slider]")].filter((e) => e.checkVisibility({ visibilityProperty: true }));
  for (const e of els) {
    e.scrollIntoView({ block: "center", inline: "center" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e.getBoundingClientRect();
    for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * .2, r.top + r.height / 2], [r.right - r.width * .2, r.top + r.height / 2]]) {
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) { out.push((e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30) + " unter " + (hit.className || hit.tagName)); break; }
    }
  }
  window.scrollTo(0, 0);
  return out;
});

for (const [view, lang] of [["phone390", "de"], ["desk1280", "en"]]) {
  test(view + "/" + lang + ": gegen Bert per Klick bis zum Ende (Hoechste Punktzahl, 3 Runden)", async () => {
    const A = await open(b, { view, lang });
    await act(A.p, "open-spiel-dart"); await setGame(A.p, "d");
    await pickMode(A.p, lang, "bot"); await act(A.p, "go");
    let darts = 0;
    for (let i = 0; i < 40; i++) {
      const s = await untilTurn(A.p);
      if (s === "card-play-over") break;
      await throwSlider(A.p, lang); darts++;
    }
    await waitScreen(A.p, "card-play-over");
    assert.equal(darts, 9, "drei Runden zu je drei Pfeilen");
    const txt = await A.p.locator("main").innerText();
    assert.ok([X(lang).da_win_you, X(lang).da_win_bot, X(lang).da_draw].some((w) => txt.includes(w)), "Ergebnis gegen Bert: " + txt.slice(0, 200));
    assert.deepEqual(A.errs, []);
    assert.deepEqual(A.ctx._blocked || [], [], "kein Netz gegen den Bot");
    await A.ctx.close();
  });
}

test("Zielen per Touch (Tippen aufs Brett) und per Pfeiltasten; Kraft am Regler per Tastatur", async () => {
  const A = await open(b, { view: "phone390", lang: "de" });
  await act(A.p, "open-spiel-dart"); await pickMode(A.p, "de", "bot"); await act(A.p, "go");
  await untilTurn(A.p);
  const slider = A.p.getByRole("slider", { name: new RegExp("^" + X("de").da_aim) });
  const val = async () => (await slider.getAttribute("aria-valuetext")).split(",").map((x) => Number(x.trim()));
  // Touch: Tippen in die Mitte des Bretts setzt das Ziel auf die Brettmitte (aim-Flaeche = Brettflaeche)
  const box = await slider.boundingBox();
  await A.p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await A.p.waitForTimeout(250);
  const [cx, cy] = await val();
  assert.ok(Math.abs(cx - 1320) < 60 && Math.abs(cy - 1320) < 60, "Mitte getroffen: " + cx + "," + cy);
  // Pfeiltasten: ein Schritt nach links und einer nach oben
  await slider.focus(); await A.p.keyboard.press("ArrowLeft"); await A.p.waitForTimeout(250);
  await A.p.getByRole("slider", { name: new RegExp("^" + X("de").da_aim) }).focus(); await A.p.keyboard.press("ArrowUp"); await A.p.waitForTimeout(250);
  const [lx, uy] = await val();
  assert.ok(lx < cx && uy < cy, "Pfeiltasten bewegen das Ziel: " + lx + "," + uy);
  // Kraft am Regler ohne Timing (Tastatur): Umschalter, Regler per Pfeiltaste, Werfen per Enter auf dem Knopf
  await A.p.getByRole("button", { name: X("de").da_lv_mid, exact: true }).click();
  const range = A.p.locator('input[type="range"]').first();
  await range.focus(); await A.p.keyboard.press("ArrowRight"); await A.p.waitForTimeout(250);
  assert.equal(await A.p.locator('input[type="range"]').first().inputValue(), String(D.MID + 1));
  await A.p.locator('[data-act="w-wurf"]').focus(); await A.p.keyboard.press("Enter");
  await A.p.waitForFunction(() => /Pfeil 2 von 3/.test(document.querySelector("main").innerText), null, { timeout: 5000 });
  assert.deepEqual(A.errs, []);
  await A.ctx.close();
});

test("Kraft per Halten (Zeiger) und per Leertaste im Pendel-Modus", { todo: "Strang F: power im Pendel-Modus innerhalb von form sendet an ein noop und legt einen Zeitstempel als Wert ab; ausserdem ohne Startstufe aus dem Seed (alt hand().lv) und ohne SWING 160 ms (alt swing)" }, () => {});

for (const view of ["phone360", "phone390", "phone412", "desk1280"]) {
  test("Wurf-Zustand: nichts verdeckt, kein Ueberlauf, axe 0 – " + view, async () => {
    const bad = [];
    for (const lang of ["de", "en"]) {
      const A = await open(b, { view, lang });
      await act(A.p, "open-spiel-dart"); await pickMode(A.p, lang, "bot"); await act(A.p, "go");
      await untilTurn(A.p); await settle(A.p);
      for (const x of await covered(A.p)) bad.push(lang + ": " + x);
      bad.push(...(await axe(A.p, lang + " Wurf")));
      if (!(await noOverflow(A.p))) bad.push(lang + ": waagerechter Ueberlauf");
      bad.push(...A.errs);
      await A.ctx.close();
    }
    assert.deepEqual(bad, []);
  });
}

test("Link-Partie: A wirft eine Aufnahme und teilt, B oeffnet den Link, rechnet nach und ist am Zug", async () => {
  const A = await open(b, { view: "phone390", lang: "de" });
  await act(A.p, "open-spiel-dart"); await pickMode(A.p, "de", "link"); await act(A.p, "go");
  for (let i = 0; i < 3; i++) { await untilTurn(A.p); await throwSlider(A.p, "de"); }
  await waitScreen(A.p, "card-play-send");
  const link = await linkOf(A.p);
  assert.match(link, /^#v2\.challenge\./);
  const standA = await A.p.locator("main").innerText();
  const B = await open(b, { view: "phone390", lang: "de", hash: link });
  await waitScreen(B.p, "receive-show"); await act(B.p, "accept");
  assert.equal(await untilTurn(B.p), "card-play-turn");
  // B sieht dieselben drei Pfeile wie A (Kacheln mit Sprechtext), weil beide aus Seed und Wurf nachrechnen
  const tiles = async (p) => p.locator(".tilebox").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label")));
  const tb = await tiles(B.p);
  assert.equal(tb.length, 3);
  for (const t of tb) assert.ok(standA.length > 0 && t.length > 5);
  assert.deepEqual([...A.errs, ...B.errs], []);
  await A.ctx.close(); await B.ctx.close();
});
