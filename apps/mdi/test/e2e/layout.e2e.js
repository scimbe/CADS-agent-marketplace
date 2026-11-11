// Layout: nichts Bedienbares liegt unter etwas anderem (Befund 2026-11-11: feste Knopfleiste verdeckte „Wie verschickst du?“),
// und auf Telefonen passen Karte, Wahl und Hauptknopf der Kartenansicht in den ersten Bildschirm.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act } from "./lib/grund.mjs";
import { visitAll } from "./lib/states.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

// Wartet, bis der DOM ruhig ist: Teilen laeuft beim Betreten von Teilen/Senden asynchron (autoShare) und rendert
// danach neu. Ohne Warten misst die Pruefung abgehaengte Knoten (Rechteck 0,0 -> trifft scheinbar die Kopfleiste).
const settle = (p) => p.evaluate(() => new Promise((res) => {
  let t; const done = () => { mo.disconnect(); res(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 300); });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(done, 300); setTimeout(done, 3000);
}));

const covered = (p) => p.evaluate(async () => {
  const out = [];
  try {
    const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio]")]
      // nur, was gerendert ist: checkVisibility schliesst u. a. den Inhalt zugeklappter <details> aus (der hat in Chromium
      // ein Layout-Rechteck, wird aber nicht gezeichnet und ist nicht bedienbar)
      .filter((e) => e.checkVisibility({ visibilityProperty: true }) && !e.closest(".liveframe"))
      // offener modaler Dialog: der Hintergrund ist bewusst gesperrt (inert), nur der Dialog zaehlt
      .filter((e) => { const m = document.querySelector("[aria-modal=true]"); return !m || m.contains(e); });
    for (const e of els) {
      if (!e.isConnected) { out.push("abgehaengt waehrend der Messung: " + e.tagName); continue; }
      e.scrollIntoView({ block: "center", inline: "center" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = e.getBoundingClientRect();
      for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * .2, r.top + r.height / 2], [r.right - r.width * .2, r.top + r.height / 2]]) {
        const hit = document.elementFromPoint(x, y);
        if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) { out.push((e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30) + " unter " + (hit.className || hit.tagName)); break; }
      }
    }
  } finally { window.scrollTo(0, 0); }
  return out;
});

// je Zustand: zugeklappt pruefen, dann jedes zugeklappte <details> aufklappen (der Link-Rueckfall) und erneut pruefen
async function check(p) {
  await settle(p);
  const bad = await covered(p);
  const n = await p.evaluate(() => { const d = [...document.querySelectorAll("details:not([open])")].filter((x) => x.checkVisibility()); d.forEach((x) => { x.open = true; x.dataset.layoutOpened = "1"; }); return d.length; });
  if (n) {
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    for (const x of await covered(p)) bad.push("aufgeklappt: " + x);
    await p.evaluate(() => { for (const x of document.querySelectorAll("details[data-layout-opened]")) { x.open = false; delete x.dataset.layoutOpened; } window.scrollTo(0, 0); });
  }
  return bad;
}

for (const view of ["phone360", "phone390", "phone412", "desk1280"]) {
  test("kein Bedienelement verdeckt: " + view, async () => {
    const bad = [];
    const errs = await visitAll(b, { view, lang: "de", scheme: "light" }, async (name, p) => { for (const x of await check(p)) bad.push(name + ": " + x); });
    assert.deepEqual(bad, []);
    assert.deepEqual(errs, []);
  });
}

for (const view of ["phone360", "phone390", "phone412"]) {
  test("Kartenansicht passt in den ersten Bildschirm: " + view, async () => {
    const { p } = await open(b, { view });
    await act(p, "open-gruss");
    await p.locator("main.s-card-view").waitFor();
    // erster Bildschirm = oben, ohne Scrollen (der Klick davor darf die Seite verschoben haben)
    const r = await p.evaluate(() => {
      window.scrollTo(0, 0);
      const vh = innerHeight, q = (s) => document.querySelector(s)?.getBoundingClientRect();
      const btn = [...document.querySelectorAll(".btn.primary")].pop()?.getBoundingClientRect();
      return { vh, frame: q(".frame"), seg: q(".seg"), btn };
    });
    assert.ok(r.frame && r.btn, "Karte und Hauptknopf da");
    // verkleinert, nicht beschnitten: Seitenverhaeltnis 3:4 bleibt, Karte bleibt brauchbar gross
    assert.ok(Math.abs(r.frame.width / r.frame.height - .75) < .01, "Karte behaelt 3:4: " + Math.round(r.frame.width) + "x" + Math.round(r.frame.height));
    assert.ok(r.frame.height >= 220, "Karte nicht winzig: " + Math.round(r.frame.height));
    assert.ok(r.btn.bottom <= r.vh, "Hauptknopf sichtbar ohne Scrollen: " + Math.round(r.btn.bottom) + " > " + r.vh);
    if (r.seg) assert.ok(r.seg.bottom <= r.btn.top, "Wahl liegt ueber dem Knopf, nicht darunter");
  });
}
