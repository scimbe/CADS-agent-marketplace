// Layout: nichts Bedienbares liegt unter etwas anderem (Befund 2026-11-11: feste Knopfleiste verdeckte „Wie verschickst du?“),
// und auf Telefonen passen Karte, Wahl und Hauptknopf der Kartenansicht in den ersten Bildschirm.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act } from "./lib/grund.mjs";
import { visitAll } from "./lib/states.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const covered = (p) => p.evaluate(async () => {
  const out = [];
  const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio]")]
    .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && !e.closest(".liveframe"));
  for (const e of els) {
    e.scrollIntoView({ block: "center", inline: "center" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e.getBoundingClientRect();
    for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]]) {
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) { out.push((e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30) + " unter " + (hit.className || hit.tagName)); break; }
    }
  }
  window.scrollTo(0, 0);
  return out;
});

for (const view of ["phone360", "phone390", "phone412", "desk1280"]) {
  test("kein Bedienelement verdeckt: " + view, async () => {
    const bad = [];
    const errs = await visitAll(b, { view }, async (name, p) => { for (const x of await covered(p)) bad.push(name + ": " + x); });
    assert.deepEqual(bad, []);
    assert.deepEqual(errs, []);
  });
}

for (const view of ["phone360", "phone390", "phone412"]) {
  test("Kartenansicht passt in den ersten Bildschirm: " + view, async () => {
    const { p } = await open(b, { view });
    await act(p, "open-gruss");
    const r = await p.evaluate(() => {
      const vh = innerHeight, q = (s) => document.querySelector(s)?.getBoundingClientRect();
      const btn = [...document.querySelectorAll(".btn.primary")].pop()?.getBoundingClientRect();
      return { vh, frame: q(".frame"), seg: q(".seg"), btn };
    });
    assert.ok(r.frame && r.btn, "Karte und Hauptknopf da");
    assert.ok(r.btn.bottom <= r.vh, "Hauptknopf sichtbar ohne Scrollen: " + Math.round(r.btn.bottom) + " > " + r.vh);
    if (r.seg) assert.ok(r.seg.bottom <= r.btn.top, "Wahl liegt ueber dem Knopf, nicht darunter");
  });
}
