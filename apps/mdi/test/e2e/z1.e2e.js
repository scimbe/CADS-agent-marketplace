// Z1-Zugkarten im Browser (DoD vorgehen.md Phase E): je Karte Kartenansicht, erster Spielschritt und Empfang eines echten
// Links (Fragment aus der Statechart in Node erzeugt), auf 360x740, 390x844, 412x915 und 1280x800:
// kein verdecktes Bedienelement, kein waagerechter Ueberlauf, axe WCAG 2.2 AA ohne Verstoss, keine Seitenfehler,
// Kernhandlung im ersten Bildschirm. Die Bedienung der Spielschritte haengt an den Draft-Knoten (field, go, link, copy,
// file, action, ai) aus ADR 0001 c (Renderer F Stufe 3); die Durchlaeufe selbst stehen in z1-play.e2e.js.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, noOverflow, waitScreen, screen, VIEWS } from "./lib/grund.mjs";
import { testRuntime, counter, until } from "../helpers.js";
import { cardOf } from "../../src/cards/index.js";
import { pickMode } from "./lib/scenarios.mjs";

const IDS = ["zug-sammeln", "zug-termin", "zug-einkauf", "zug-wichteln", "zug-reihum", "zug-einig", "zug-wunschzettel", "geschenk-finder", "karte-danke", "zug-umschlag", "zug-kapsel", "zug-gutschein", "raum-sorry"];
// erste Antwort je Karte fuer den Empfangs-Link (wie die Bildschirme sie schicken)
const FIRST = {
  "zug-sammeln": ["annaSammelt", "Pizza-Abend", 4, 3750], "zug-termin": [["Mia", [207716, 207726]]], "zug-einig": [["Pizza", "Kino", "Sauna", "Zoo", "Bowling"], [0, 1, 2, 3, 4]],
  "zug-wichteln": [["Ana", "Ben", "Cem", "", "", "", "", "", "", "", "", ""]], "zug-reihum": [[0], "für alles", "Ana"], "zug-gutschein": [[0, 1, 2]],
  "geschenk-finder": null, "karte-danke": ["immer für mich da bist", "Ana"], "zug-umschlag": ["dir langweilig ist", "du sauer bist", "du nicht schlafen kannst"],
  "zug-kapsel": [[1], 3], "zug-einkauf": [[[], [["Milch", 0, 2, []], ["Brot", 1, 1, []]]]], "zug-wunschzettel": [[[], [["Hörbuch", 0, 1, []], ["Schal", 1, 1, []]]]], "raum-sorry": null
};
async function linkFor(id) {
  const rt = testRuntime({ entropy: counter("e" + IDS.indexOf(id).toString(16)), async: true }), c = cardOf(id);
  rt.dispatch({ type: "OPEN", id }); rt.dispatch({ type: "MODE", mode: "link" }); rt.dispatch("GO");
  for (const a of FIRST[id]) { const s = rt.state.ctx.session; rt.dispatch({ type: "INPUT", input: c.answer(s.state.pub, c.status(s.state).turn, a), at: Date.UTC(2026, 10, 12, 12) }); }
  assert.equal(rt.state.ctx.error, null, id);
  const n = rt.shared.length; rt.dispatch("SHARE"); await until(() => rt.shared.length > n);
  return rt.shared[rt.shared.length - 1];
}
const covered = (p) => p.evaluate(async () => {
  const out = [];
  const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio]")].filter((e) => e.checkVisibility({ visibilityProperty: true }));
  for (const e of els) {
    e.scrollIntoView({ block: "center", inline: "center" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
    if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) out.push((e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30) + " unter " + (hit.className || hit.tagName));
  }
  window.scrollTo(0, 0);
  return out;
});
async function checkAll(p, label, bad) {
  await p.waitForTimeout(150);
  for (const x of await covered(p)) bad.push(label + ": verdeckt " + x);
  for (const x of await axe(p, label)) bad.push(x);
  if (!(await noOverflow(p))) bad.push(label + ": waagerechter Ueberlauf");
}
/** Kernhandlung im ersten Bildschirm: das erste bedienbare Element der Hauptflaeche liegt ohne Scrollen sichtbar. */
async function primaryInFirstScreen(p, sel) {
  return p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }, sel);
}

let b;
const LINKS = {};
test.before(async () => { b = await browser(); for (const id of IDS) if (FIRST[id]) LINKS[id] = await linkFor(id); });
test.after(async () => { await b.close(); });

for (const view of Object.keys(VIEWS)) {
  test("Z1 Kartenansicht und Empfang: verdeckt/axe/Ueberlauf/Kernhandlung – " + view, async () => {
    const bad = [], errs = [];
    for (const id of IDS) {
      const A = await open(b, { view, lang: view === "desk1280" ? "en" : "de" }); errs.push(...A.errs.map((e) => id + ": " + e));
      await act(A.p, "open-" + id); await waitScreen(A.p, "card-view");
      await checkAll(A.p, id + "/ansicht", bad);
      if (!(await primaryInFirstScreen(A.p, '[data-act="go"]'))) bad.push(id + "/ansicht: Hauptknopf nicht im ersten Bildschirm");
      await A.ctx.close();
      if (!LINKS[id]) continue;
      const R = await open(b, { view, hash: LINKS[id] }); errs.push(...R.errs.map((e) => id + "/empfang: " + e));
      await waitScreen(R.p, "receive-show");
      await checkAll(R.p, id + "/empfang", bad);
      if (!(await primaryInFirstScreen(R.p, '[data-act="accept"]'))) bad.push(id + "/empfang: Annehmen nicht im ersten Bildschirm");
      await act(R.p, "accept");
      const s = await screen(R.p);
      assert.ok(["card-play-turn", "card-play-wait", "card-play-over", "card-play-cover"].includes(s), id + ": nach Annehmen " + s);
      await checkAll(R.p, id + "/nach-annehmen", bad);
      await R.ctx.close();
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errs, [], "Seitenfehler oder CSP-Verstoss");
  });
}

test("Z1 erster Spielschritt: Kernhandlung der Karte sichtbar und bedienbar", async () => {
  const missing = [];
  for (const id of IDS) {
    const A = await open(b, { view: "phone390" });
    await act(A.p, "open-" + id); await pickMode(A.p, "de", "link"); await act(A.p, "go");
    const s = await screen(A.p);
    if (s === "card-play-cover") await act(A.p, "cover-ok");
    const n = await A.p.locator("main :is(input.field, textarea.field, .choice .opt, .w-go, .chip)").count();
    if (!n) missing.push(id);
    await A.ctx.close();
  }
  assert.deepEqual(missing, [], "Karten ohne bedienbaren ersten Schritt");
});
