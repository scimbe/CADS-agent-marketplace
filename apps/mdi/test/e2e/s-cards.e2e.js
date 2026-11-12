// Strang S im echten Browser: spiel-dart, zug-malrat, zug-abfragen (+ zug-quiz), zug-typen, quiz-preis (+ raum-schaetzen).
// Je Karte: Kartenansicht und Spielbeginn ohne verdecktes Bedienelement, ohne Ueberlauf, axe 0 (4 Ansichten);
// Link-Rundreise: ein in Node gespielter Stand kommt als #v2.challenge an, wird angenommen und gleich weitergerechnet.
// Bedienung der eigenen Oberflaechen (Zielen/Kraft, Zeichnen, Schieber, Bert-Partie per Klick, Touch und Tastatur)
// braucht die Widgets aus Strang F Stufe 2/3 (ADR 0001 c); bis dahin stehen diese Faelle als todo mit Grund.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, noOverflow, waitScreen } from "./lib/grund.mjs";
import { cardOf } from "../../src/cards/index.js";
import * as S from "../../src/contract/session.js";
import { defaults } from "../../src/contract/fields.js";
import { encode } from "../../src/app/link.js";

const IDS = ["spiel-dart", "zug-malrat", "zug-abfragen", "zug-typen", "quiz-preis"];
const VIEWS = ["phone360", "phone390", "phone412", "desk1280"];
const DAY = 20769;
const WIDGETS = "wartet auf die Widgets aus Strang F Stufe 2/3 (aim, power, draw, strokes, slide, pick, list; ADR 0001 c)";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const settle = (p) => p.evaluate(() => new Promise((res) => {
  let t; const done = () => { mo.disconnect(); res(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 250); });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(done, 250); setTimeout(done, 3000);
}));
// wie layout.e2e.js: jedes sichtbare Bedienelement an drei Punkten pruefen, ob etwas anderes darueber liegt
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

for (const view of VIEWS) {
  test("Kartenansicht der S-Karten: nichts verdeckt, kein Ueberlauf, axe 0 – " + view, async () => {
    const bad = [], errs = [];
    for (const id of IDS) for (const lang of ["de", "en"]) {
      const A = await open(b, { view, lang });
      await act(A.p, "open-" + id); await waitScreen(A.p, "card-view");
      await audit(A.p, id + "/" + lang + " ansehen", bad);
      errs.push(...A.errs); await A.ctx.close();
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errs, [], "Seitenfehler oder CSP-Verstoss");
  });
}

// Ein Stand nach dem ersten Zug von Sitz 0, mit Hinweiszuegen der Karte (moves/opening) in Node gespielt
function played(id) {
  const c = cardOf(id), all = [0, 1];
  let s = S.newSession(c, { params: defaults(c.manifest.params), seed: "5".repeat(32), mine: all, ...S.makeSecrets(c, all, () => "6".repeat(32)) });
  const first = c.moves(c.observe(s.state, 0), 0)[0] || (typeof c.opening === "function" ? c.opening(0, DAY) : null);
  assert.ok(first, id + ": erster Zug");
  const mv = c.manifest.inputDay ? { ...first, d: DAY } : first;
  s = S.apply(c, s, mv);
  // bis Sitz 1 am Zug ist (Mehrschritt-Zuege von Sitz 0, z. B. drei Pfeile)
  for (let i = 0; i < 12 && S.status(c, s).turn === 0; i++) { const m = c.moves(c.observe(s.state, 0), 0)[0]; s = S.apply(c, s, c.manifest.inputDay ? { ...m, d: DAY } : m); }
  return { c, s, hash: encode("challenge", { ...S.toWire(s, c), g: "7".repeat(16), h: S.pubHash(s) }) };
}

test("Link-Rundreise: Stand aus Node kommt an, wird angenommen, Empfaenger rechnet denselben Zustand", async () => {
  const errs = [];
  for (const id of IDS) {
    const { c, s, hash } = played(id);
    if (S.status(c, s).turn !== 1) continue; // Allein-Varianten haben keinen zweiten Sitz
    const B = await open(b, { view: "phone390", hash });
    await waitScreen(B.p, "receive-show");
    await act(B.p, "accept");
    await B.p.locator("main.s-card-play-turn, main.s-card-play-wait, main.s-card-play-over").first().waitFor();
    assert.equal(await B.p.evaluate(() => location.hash), "", id + ": Fragment entfernt");
    errs.push(...B.errs); await B.ctx.close();
  }
  assert.deepEqual(errs, []);
});

test("Spielbeginn je S-Karte: nichts verdeckt, axe 0 (Telefon 390, de)", async () => {
  const bad = [], errs = [];
  for (const id of IDS) {
    const { hash } = played(id);
    const B = await open(b, { view: "phone390", hash });
    await waitScreen(B.p, "receive-show"); await audit(B.p, id + " empfangen", bad);
    await act(B.p, "accept");
    await B.p.locator("main.s-card-play-turn, main.s-card-play-wait, main.s-card-play-over").first().waitFor();
    await audit(B.p, id + " am Zug", bad);
    errs.push(...B.errs); await B.ctx.close();
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(errs, []);
});

test("Dart gegen Bert per Klick bis zum Ende", { todo: WIDGETS }, () => {});
test("Dart: Zielen per Touch und per Pfeiltasten, Kraft per Halten und per Leertaste", { todo: WIDGETS }, () => {});
test("Mal & Rat: Zeichnen per Touch, Abspielen Strich fuer Strich, Raten per Tastatur", { todo: WIDGETS }, () => {});
test("Was kostet das? / Schaetzen: Schieber per Touch und Pfeiltasten", { todo: WIDGETS }, () => {});
