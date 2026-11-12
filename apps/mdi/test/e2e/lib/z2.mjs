// Gemeinsame Bausteine der Z2-e2e: Karte ueber das Regal oeffnen, einen Zug ueber die sichtbare Oberflaeche spielen
// (Felder fuellen, Auswahl antippen, "Weiter"), Pruefungen je Bildschirm (Verdeckung wie layout.e2e, axe, Ueberlauf).
import { act, screen, waitScreen, axe, noOverflow } from "./grund.mjs";
import { pickMode } from "./scenarios.mjs";
import { cardOf } from "../../../src/cards/index.js";

const WORDS = ["Apfel", "Kuchen", "Wolke", "Lampe", "Garten", "Banane", "Kerze", "Fisch", "Gabel", "Nudel", "Stern", "Eimer", "Fahne", "Glocke", "Tasse", "Brille", "Daumen", "Mantel", "Ball", "Mond", "Keks", "Hose", "Dach", "Bus"];

export function titleOf(id, lang = "de") { const m = cardOf(id).manifest; return m.title[lang] || m.title.de; }
/** Karte ueber das Regal oeffnen (Suche nach dem Titel) und die Spielweise waehlen. */
/** Variante ueber die Blase des Parameters spiel waehlen (Titel aus x-names) */
export async function pickVariant(p, id, value, lang = "de") {
  const prop = cardOf(id).manifest.params.properties.spiel, n = prop["x-names"][value];
  await act(p, "customize"); await p.locator('.bubble[data-for="spiel"]').click(); await p.locator("#dialog").waitFor();
  await p.getByRole("radio", { name: n[lang] || n.de, exact: true }).click();
  await act(p, "close"); await act(p, "done"); await waitScreen(p, "card-view");
}
export async function openCard(p, id, mode, lang = "de") {
  await p.locator("main.h-at-day").waitFor();
  await act(p, "intent-alle"); await p.locator("main.h-at-regal").waitFor();
  // Karten aus dem Altkatalog ueber die Suche; neue Karten (z. B. duell-liest) stehen ohne Suche in ihrer Familie
  if (!cardOf(id).manifest.family) await p.locator("#h-q").fill(titleOf(id, lang));
  await p.locator('[data-act="open-' + id + '"]').first().click();
  await waitScreen(p, "card-view");
  if (mode) await pickMode(p, lang, mode);
}
async function settle(p) { await p.waitForTimeout(220); }
/** Einen Bildschirm "Du bist dran" zu Ende spielen; gibt den Folgebildschirm zurueck. */
export async function playTurn(p, onScreen, extra) {
  let n = 0;
  for (let a = 0; a < 120; a++) {
    const s = await screen(p);
    if (s === "card-play-cover") { await act(p, "cover-ok"); continue; }
    if (s !== "card-play-turn") return s;
    if (onScreen && a === 0) await onScreen(p);
    if (extra && (await extra(p))) continue; // Zeit- und Ton-Widgets (lib/z2-zeit.mjs)
    const fields = p.locator("main input.field:visible, main textarea.field:visible, main input.tlist:visible");
    let filled = false;
    for (let i = 0; i < (await fields.count()); i++) { const f = fields.nth(i); if (!(await f.inputValue())) { await f.fill(WORDS[n++ % WORDS.length]); filled = true; } }
    if (filled) { await settle(p); continue; }
    const go = p.locator("main .w-go:not([disabled])");
    if (await go.count()) { await go.first().click(); await settle(p); continue; }
    const opt = p.locator('main .opt:not([disabled])[aria-pressed="false"], main .opt:not([disabled]):not([aria-pressed])');
    if (await opt.count()) { await opt.first().click(); await settle(p); continue; }
    const cell = p.locator('main button.bcell:not([disabled])[aria-pressed="false"]');
    if (await cell.count()) { await cell.first().click(); await settle(p); continue; }
    throw new Error("kein Bedienschritt gefunden: " + (await p.locator("main").innerText()).slice(0, 300));
  }
  return screen(p);
}
const linkOf = (p) => p.locator("#linkfield").inputValue().then((u) => u.slice(u.indexOf("#")));
/** Link-Rundreise zwischen zwei Seiten bis zum Ende (oder bis stop(hop) true liefert). */
export async function roundTrip(A, B, { onScreen, maxHops = 12, stop, extra } = {}) {
  let cur = A, other = B, hops = 0;
  for (; hops < maxHops; hops++) {
    const s = await playTurn(cur.p, onScreen, extra && ((pg) => extra(pg, cur)));
    if (s === "card-play-over" && !(await cur.p.locator("#linkfield").count())) return { end: cur, hops };
    if (s !== "card-play-send" && s !== "card-play-over") throw new Error("unerwartet " + s);
    const link = await linkOf(cur.p);
    if (s === "card-play-send") { await act(cur.p, "sent"); await waitScreen(cur.p, "card-play-wait"); }
    await other.p.goto(other.p.url().split("#")[0] + link);
    await waitScreen(other.p, "receive-show"); await act(other.p, "accept");
    if (s === "card-play-over") { await waitScreen(other.p, "card-play-over"); return { end: other, hops: hops + 1 }; }
    if (stop && (await stop(other.p, hops))) return { end: other, hops: hops + 1, stopped: true };
    [cur, other] = [other, cur];
  }
  throw new Error("zu viele Wechsel");
}
// Verdeckung (gleiche Pruefung wie layout.e2e.js): nichts Bedienbares liegt unter etwas anderem
export const covered = (p) => p.evaluate(async () => {
  const out = [];
  try {
    const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio]")]
      .filter((e) => e.checkVisibility({ visibilityProperty: true }) && !e.closest(".liveframe"))
      .filter((e) => { const m = document.querySelector("[aria-modal=true]"); return !m || m.contains(e); });
    for (const e of els) {
      if (!e.isConnected) continue;
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
/** Pruefungen eines Bildschirms; Befunde landen in bad. */
export async function check(p, label, bad) {
  await settle(p);
  for (const x of await covered(p)) bad.push(label + ": verdeckt " + x);
  for (const x of await axe(p, label)) bad.push(x);
  if (!(await noOverflow(p))) bad.push(label + ": waagerechter Ueberlauf");
}
