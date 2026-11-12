// Mal & Rat im echten Browser, zwei Seiten per Link: A waehlt ein Wort des Tages, zeichnet per Touch (Telefon) bzw.
// Maus (Desktop) und schickt; B oeffnet den Link, die Striche spielen ab (reduzierte Bewegung: alle sofort), B raet per
// Tastatur, wird als richtig erkannt und zeichnet zurueck; A bekommt das Gegenbild. Je Zustand: nichts verdeckt, axe 0.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, noOverflow, waitScreen, screen } from "./lib/grund.mjs";
import { texts } from "../../src/app/texts.js";
import M from "../../src/engines/malrat/malrat.json" with { type: "json" };

// Haengt an zwei Befunden in Strang F (Stand 3c80c38), nicht in der Karte: (1) src/render/widgets.js wrap() gibt der
// Widget-Sektion die Klasse "w-draw" (bzw. "w-aim"), widgets.css setzt fuer .w-draw aspect-ratio 1/1 -> die Sektion
// blaest die Seite auf ~1135 px auf, Knoepfe werden verdeckt; (2) src/broker/storage.js speichert entry.pub nicht, damit
// lehnt game.receive jeden Rueckweg einer Snapshot-Karte als "manipuliert" ab. Mit beidem lokal behoben laeuft der Ablauf
// auf allen vier Ansichten durch (axe 0, nichts verdeckt). Der Test laeuft als todo mit, bis F das liefert.
const WAIT_F = "wartet auf Strang F: Klasse w-draw an der Widget-Sektion (widgets.js wrap/widgets.css) und entry.pub in broker/storage.js";
let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const settle = (p) => p.evaluate(() => new Promise((res) => {
  let t; const done = () => { mo.disconnect(); res(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 250); });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(done, 250); setTimeout(done, 3000);
}));
const covered = (p) => p.evaluate(async () => {
  const out = [];
  const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio]")].filter((e) => e.checkVisibility({ visibilityProperty: true }) && !e.closest(".liveframe"));
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
async function audit(p, label, bad) {
  await settle(p);
  for (const x of await covered(p)) bad.push(label + ": " + x);
  bad.push(...(await axe(p, label)));
  if (!(await noOverflow(p))) bad.push(label + ": waagerechter Ueberlauf");
}
const linkOf = (p) => p.locator("#linkfield").inputValue().then((u) => u.slice(u.indexOf("#")));

// Strich ueber echte Eingabe: Touch per CDP (erzeugt Pointer-Events mit pointerType "touch"), sonst Maus
async function stroke(p, touch, pts) {
  const surf = p.locator("section.w-draw div.w-draw").first();
  await surf.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const box = await surf.boundingBox();
  const at = ([x, y]) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  if (touch) {
    const c = await p.context().newCDPSession(p);
    await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at(pts[0])] });
    for (const q of pts.slice(1)) await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at(q)] });
    await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await c.detach();
  } else {
    const a = at(pts[0]); await p.mouse.move(a.x, a.y); await p.mouse.down();
    for (const q of pts.slice(1)) { const z = at(q); await p.mouse.move(z.x, z.y, { steps: 3 }); }
    await p.mouse.up();
  }
}
// Wort waehlen (erstes Wort des Tages), zwei Striche zeichnen, schicken; liefert das Wort
async function drawTurn(P, lang, touch, bad, label) {
  const T = M.text[lang];
  const opt = P.p.locator(".choice .opt").filter({ hasText: T.mr_lvl_0 + ": " }).first();
  const word = (await opt.textContent()).split(": ").pop();
  await opt.click();
  await P.p.locator("section.w-draw div.w-draw").first().waitFor();
  if (bad) await audit(P.p, label + " zeichnen", bad);
  await stroke(P.p, touch, [[0.2, 0.2], [0.5, 0.4], [0.8, 0.8]]);
  await P.p.locator("section.w-draw polyline").first().waitFor();
  await P.p.getByRole("radio", { name: /3$/ }).last().click(); // dickster Stift (Breite 3)
  await stroke(P.p, touch, [[0.2, 0.8], [0.8, 0.2]]);
  await P.p.waitForFunction(() => document.querySelectorAll("section.w-draw polyline").length >= 2);
  await P.p.locator('[data-act="w-bild"]').click();
  await waitScreen(P.p, "card-play-send");
  return word;
}
async function guessTurn(P, lang, word, reduced, bad, label) {
  const T = M.text[lang];
  // Abspielen: mit reduzierter Bewegung sofort alle Striche, sonst Strich fuer Strich bis alle stehen
  if (reduced) assert.equal(await P.p.locator("section.w-strokes polyline").count(), 2, label + ": alle Striche sofort");
  await P.p.waitForFunction(() => document.querySelectorAll("section.w-strokes polyline").length === 2, null, { timeout: 8000 });
  if (bad) await audit(P.p, label + " raten", bad);
  const field = P.p.getByLabel(T.mr_guess_h, { exact: true }).locator("visible=true").first();
  await field.focus(); await P.p.keyboard.type(word.toLowerCase());
  await P.p.waitForTimeout(400); // Feld entprellt 150 ms
  await P.p.locator(".choice .opt").filter({ hasText: T.mr_try }).click();
  await P.p.locator("p").filter({ hasText: word }).filter({ hasText: /Richtig|Right|Correct/ }).first().waitFor();
  await P.p.locator(".choice .opt").filter({ hasText: T.mr_back }).click();
}

for (const [view, lang] of [["phone360", "de"], ["phone390", "de"], ["phone412", "en"], ["desk1280", "en"]]) {
  test("Mal & Rat per Link: zeichnen, abspielen, raten, zurueckzeichnen – " + view + "/" + lang, { todo: WAIT_F }, async () => {
    const touch = view !== "desk1280", reduced = view === "phone390", bad = [];
    const A = await open(b, { view, lang });
    await act(A.p, "open-zug-malrat"); await waitScreen(A.p, "card-view");
    await A.p.getByRole("radio", { name: texts(lang).modes.link, exact: true }).click(); await act(A.p, "go");
    await waitScreen(A.p, "card-play-turn");
    const word = await drawTurn(A, lang, touch, bad, "A");
    const link = await linkOf(A.p);
    assert.match(link, /^#v2\.challenge\./);
    await act(A.p, "sent"); await waitScreen(A.p, "card-play-wait");

    const B = await open(b, { view, lang, reduced, hash: link });
    await waitScreen(B.p, "receive-show"); await act(B.p, "accept"); await waitScreen(B.p, "card-play-turn");
    await guessTurn(B, lang, word, reduced, bad, "B");
    const word2 = await drawTurn(B, lang, touch, null, "B");
    assert.ok(word2);
    const back = await linkOf(B.p); await act(B.p, "sent");
    await A.p.goto(A.p.url().split("#")[0] + back);
    await waitScreen(A.p, "receive-show"); await act(A.p, "accept");
    assert.equal(await screen(A.p), "card-play-turn", "A raet das Gegenbild");
    await A.p.waitForFunction(() => document.querySelectorAll("section.w-strokes polyline").length === 2, null, { timeout: 8000 });
    assert.deepEqual(bad, []);
    assert.deepEqual([...A.errs, ...B.errs], []);
    await A.ctx.close(); await B.ctx.close();
  });
}
