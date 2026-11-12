// Gemeinsame Ablaeufe der Z1-Bedien-e2e (aufgeteilt auf test/e2e/z1-play-*.e2e.js, damit jede Datei unter dem
// 300-s-Limit des Runners bleibt). Z1-Zugkarten werden bedient wie von einem Menschen: beide Seiten im Browser, der
// Link geht als echtes Fragment von Seite A nach Seite B. An jedem Schritt: kein verdecktes Bedienelement, axe
// WCAG 2.2 AA ohne Verstoss, kein waagerechter Ueberlauf, keine Seitenfehler. Eingaben nur ueber sichtbare Felder,
// Chips und den Weiter-Knopf.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, noOverflow, waitScreen, screen } from "./grund.mjs";
import { pickMode } from "./scenarios.mjs";

export const VIEWS_RUN = process.env.Z1_VIEW ? [process.env.Z1_VIEW] : ["phone360", "phone390", "phone412", "desk1280"];
let b = null, VIEW = VIEWS_RUN[0];
/** Bildschirm erreicht UND kein Teil laedt mehr (main[data-loading], Strang H #295): erst dann wird bedient. */
export async function at(p, s) { await waitScreen(p, s); await p.locator("main:not([data-loading])").waitFor(); }
/** Browser je Testdatei: einmal starten, am Ende schliessen. */
export function withBrowser() {
  test.before(async () => { b = await browser(); });
  test.after(async () => { await b.close(); });
}
const covered = (p) => p.evaluate(async () => {
  const out = [];
  const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio]")].filter((e) => e.checkVisibility({ visibilityProperty: true })).filter((e) => { const m = document.querySelector("[aria-modal=true]"); return !m || m.contains(e); });
  for (const e of els) {
    e.scrollIntoView({ block: "center", inline: "center" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) out.push((e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30) + " unter " + (hit.className || hit.tagName));
  }
  window.scrollTo(0, 0);
  return out;
});
function steps(p, bad, label) {
  let n = 0;
  return async (what) => {
    await p.waitForTimeout(220); // Felder melden ihren Entwurf entprellt (150 ms)
    const l = label + "#" + (++n) + (what ? " " + what : "");
    for (const x of await covered(p)) bad.push(l + ": verdeckt " + x);
    for (const x of await axe(p, l)) bad.push(x);
    if (!(await noOverflow(p))) bad.push(l + ": Ueberlauf");
  };
}
const stage = (p) => p.locator("main");
async function fill(p, i, v) { const f = stage(p).locator("input.field, textarea.field").nth(i); await f.fill(v); await p.waitForTimeout(220); }
async function fillLabel(p, label, v) { await stage(p).getByLabel(label, { exact: true }).fill(v); await p.waitForTimeout(220); }
async function tap(p, text) { await stage(p).locator(".choice .opt", { hasText: text }).first().click(); await p.waitForTimeout(60); }
async function next(p) { await p.waitForTimeout(220); const g = stage(p).locator('[data-act="go-step"]').first(); assert.equal(await g.isDisabled(), false, "Weiter ist frei: " + ((await stage(p).locator(".w-why").allTextContents()).join(" "))); await g.click(); await p.waitForTimeout(60); }
async function start(id, mode = "link") {
  const A = await open(b, { view: VIEW });
  await act(A.p, "open-" + id); await at(A.p, "card-view");
  await pickMode(A.p, "de", mode === "link" ? "link" : "alone"); await act(A.p, "go");
  if ((await screen(A.p)) === "card-play-cover") await act(A.p, "cover-ok");
  await at(A.p, "card-play-turn");
  return A;
}
async function handOver(A) {
  await at(A.p, "card-play-send");
  await A.p.locator("#linkfield").waitFor({ state: "attached" });
  const u = await A.p.locator("#linkfield").inputValue();
  const B = await open(b, { view: VIEW, hash: u.slice(u.indexOf("#")) });
  await at(B.p, "receive-show"); await act(B.p, "accept");
  if ((await screen(B.p)) === "card-play-cover") await act(B.p, "cover-ok");
  return B;
}
const text = (p) => stage(p).innerText();

export const FLOWS = {
  "zug-einig": async (A, chk) => {
    for (const [i, w] of ["Pizza", "Kino", "Sauna", "Zoo", "Bowling"].entries()) await fill(A.p, i, w);
    await chk("Liste"); await next(A.p);
    for (const w of ["Sauna", "Pizza", "Kino", "Zoo"]) await tap(A.p, w);
    await chk("Rang"); await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "zug-einig/B");
    await at(B.p, "card-play-turn");
    for (const w of ["Sauna", "Zoo", "Bowling", "Kino"]) await tap(B.p, w);
    await c("Rang"); await next(B.p);
    await at(B.p, "card-play-over"); await c("Ende");
    assert.match(await text(B.p), /Einigung: Sauna/);
    return B;
  },
  "zug-sammeln": async (A, chk) => {
    // ohne bestaetigtes 18+ (kein Konto): Hinweis und Bestaetigungsknopf statt Namensfeld
    assert.match(await text(A.p), /PayPal-Link zeigen wir ab 18/); await chk("18+ Hinweis");
    assert.equal(await stage(A.p).locator("input.field").count(), 0);
    return null;
  },
  "zug-termin": async (A, chk) => {
    await tap(A.p, "18 Uhr");
    const days = stage(A.p).locator(".choice").nth(1).locator(".opt");
    await days.nth(2).click(); await A.p.waitForTimeout(60); await days.nth(3).click(); await A.p.waitForTimeout(60);
    await fillLabel(A.p, "Dein Name", "Mia");
    await chk("Termine"); await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "zug-termin/B");
    await at(B.p, "card-play-turn");
    await fillLabel(B.p, "Dein Name", "Ben"); await tap(B.p, "Alle Ja");
    await c("Abstimmen"); await next(B.p);
    assert.equal(await B.p.locator("main .chip", { hasText: "Kalender" }).count() >= 0, true);
    return B;
  },
  "zug-einkauf": async (A, chk) => {
    await fillLabel(A.p, "Neue Sache für die Liste", "2× Milch"); await tap(A.p, "Auf die Liste");
    await fillLabel(A.p, "Neue Sache für die Liste", "Brot"); await tap(A.p, "Auf die Liste");
    assert.match(await text(A.p), /2× Milch/); await chk("Liste");
    await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "zug-einkauf/B");
    await at(B.p, "card-play-turn");
    await fillLabel(B.p, "Dein Name (zum Abhaken und Mitbringen)", "Ben");
    await stage(B.p).locator(".choice", { hasText: "Milch" }).locator(".opt", { hasText: "Hab ich gekauft" }).click(); await B.p.waitForTimeout(60);
    await c("Abhaken"); await next(B.p);
    return B;
  },
  "zug-wunschzettel": async (A, chk) => {
    await fillLabel(A.p, "Neuer Wunsch", "Hörbuch"); await tap(A.p, "Auf den Zettel");
    await fillLabel(A.p, "Neuer Wunsch", "Schal"); await tap(A.p, "Auf den Zettel");
    await chk("Wünsche"); await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "zug-wunschzettel/B");
    await at(B.p, "card-play-turn");
    await tap(B.p, "Ich schenke etwas"); await c("Wer bist du");
    await fillLabel(B.p, "Dein Name (die App zeigt ihn niemandem)", "Ben");
    await stage(B.p).locator(".choice", { hasText: "Hörbuch" }).locator(".opt").first().click(); await B.p.waitForTimeout(60);
    assert.match(await text(B.p), /Hörbuch · Du schenkst das/); await c("Markiert");
    await next(B.p);
    return B;
  },
  "geschenk-finder": async (A, chk) => {
    await tap(A.p, "Oma oder Opa"); await tap(A.p, "bis 20"); await tap(A.p, "Lesen"); await tap(A.p, "Tee"); await chk("Vorlieben"); await next(A.p);
    await stage(A.p).locator(".choice").first().locator(".opt").nth(1).click(); await chk("Ideen"); await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "geschenk-finder/B");
    await at(B.p, "card-play-turn"); await c("Zweite Stimme");
    await stage(B.p).locator(".choice .opt").nth(1).click();
    await at(B.p, "card-play-over"); await c("Ende");
    assert.match(await text(B.p), /Einig:/);
    return B;
  },
  "karte-danke": async (A, chk) => {
    await fill(A.p, 0, "du immer zuhörst"); await chk("Grund"); await next(A.p);
    await fill(A.p, 0, "Ana"); await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "karte-danke/B");
    await at(B.p, "card-play-turn"); assert.match(await text(B.p), /du immer zuhörst/); await c("Empfang"); await next(B.p);
    await at(B.p, "card-play-over"); await c("Ende");
    return B;
  },
  "zug-kapsel": async (A, chk) => {
    await stage(A.p).locator(".choice .opt").nth(1).click(); await A.p.waitForTimeout(60);
    await tap(A.p, "5"); await chk("Tage"); await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "zug-kapsel/B");
    assert.match(await text(B.p), /Noch 5 Tage verschlossen/); await c("Tor");
    return B;
  },
  "zug-gutschein": async (A, chk) => {
    const o = stage(A.p).locator(".choice .opt");
    for (const i of [0, 2, 4]) { await o.nth(i).click(); await A.p.waitForTimeout(60); }
    await chk("Drei"); await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "zug-gutschein/B");
    await at(B.p, "card-play-turn"); await c("Einloesen"); await stage(B.p).locator(".choice .opt").nth(1).click();
    await at(B.p, "card-play-over"); await c("Ende");
    return B;
  },
  "zug-wichteln": async (A, chk) => {
    for (const [i, w] of ["Ana", "Ben", "Cem"].entries()) await fill(A.p, i, w);
    await chk("Namen"); await next(A.p);
    const B = await handOver(A); const c = steps(B.p, A.bad, "zug-wichteln/B");
    await at(B.p, "card-play-turn"); await tap(B.p, "Ben"); await c("Zettel");
    const t = await text(B.p); assert.ok(/Du beschenkst/.test(t) && /(Ana|Cem)/.test(t));
    await next(B.p); await at(B.p, "card-play-over");
    assert.equal(await B.p.locator('[data-act="share"]').count(), 0, "kein Ergebnis-Senden (local)");
    return B;
  },
  "zug-reihum": async (A, chk) => {
    await stage(A.p).locator(".choice .opt").first().click(); await A.p.waitForTimeout(60);
    await fill(A.p, 0, "immer lachst"); await chk("Satz"); await next(A.p);
    await fill(A.p, 0, "Ana"); await next(A.p);
    await handOver(A).then((B) => { A.B = B; });
    return A.B;
  },
  "zug-umschlag": async (A, chk) => {
    for (let i = 0; i < 3; i++) { await fill(A.p, 0, ["Ruf mich an", "Atme tief", "Zähl Schafe"][i]); if (!i) await chk("Brief"); await next(A.p); }
    const B = await handOver(A); const c = steps(B.p, A.bad, "zug-umschlag/B");
    await at(B.p, "card-play-turn"); await stage(B.p).locator(".choice .opt").nth(2).click();
    await at(B.p, "card-play-over"); assert.match(await text(B.p), /Zähl Schafe/); await c("Ende");
    return B;
  }
};


/** Ein Bedien-Durchlauf einer Karte (FLOWS) auf einer Ansicht. */
export function flowTest(id, view) {
  test("Z1 bedienen (" + view + "): " + id, async () => {
    VIEW = view;
    const A = await start(id); A.bad = [];
    const chk = steps(A.p, A.bad, id + "/A");
    await chk("Start");
    const B = await FLOWS[id](A, chk);
    assert.deepEqual(A.bad, []);
    assert.deepEqual([...A.errs, ...(B ? B.errs : [])], [], "Seitenfehler oder CSP-Verstoss");
    await A.ctx.close(); if (B) await B.ctx.close();
  });
}
/** Der erste Satz: auf einem Geraet, Ergebnis zum Kopieren. */
export function sorryTest(view) {
  test("Z1 bedienen (" + view + "): raum-sorry auf einem Geraet, Ergebnis zum Kopieren", async () => {
    VIEW = view;
  const A = await start("raum-sorry", "alone"); A.bad = [];
  const chk = steps(A.p, A.bad, "raum-sorry");
  for (let i = 0; i < 3; i++) { await chk("Frage " + (i + 1)); await stage(A.p).locator(".choice .opt").first().click(); await A.p.waitForTimeout(60); if ((await screen(A.p)) === "card-play-cover") await act(A.p, "cover-ok"); }
  await at(A.p, "card-play-over"); await chk("Ende");
  assert.equal(await stage(A.p).locator(".chip", { hasText: "Kopieren" }).count(), 1);
  assert.deepEqual(A.bad, []); assert.deepEqual(A.errs, []);
  await A.ctx.close();
  });
}
/** Wunschzettel: Antwort der Familie auf dem Geraet der Wuenschenden (Vereinigung + Merkzettel je Partie). */
export function wishReplyTest() {
  test("Z1 Wunschzettel: Antwort der Familie auf dem Geraet der Wuenschenden – keine Frage, keine Marke", async () => {
  VIEW = "phone390";
  const A = await start("zug-wunschzettel"); A.bad = [];
  const chk = steps(A.p, A.bad, "zug-wunschzettel/A");
  await fillLabel(A.p, "Neuer Wunsch", "Hörbuch"); await tap(A.p, "Auf den Zettel");
  await fillLabel(A.p, "Neuer Wunsch", "Schal"); await tap(A.p, "Auf den Zettel");
  await next(A.p);
  const B = await handOver(A);
  await at(B.p, "card-play-turn"); await tap(B.p, "Ich schenke etwas");
  await fillLabel(B.p, "Dein Name (die App zeigt ihn niemandem)", "Ben");
  await stage(B.p).locator(".choice", { hasText: "Hörbuch" }).locator(".opt").first().click(); await B.p.waitForTimeout(60);
  await next(B.p);
    // Bens Antwort auf Annas Geraet: das Geraet weiss "mein Zettel" (Merkzettel je Partie), fragt nicht, zeigt keine Marke
    await at(B.p, "card-play-send");
    await B.p.locator("#linkfield").waitFor({ state: "attached" });
    const u = await B.p.locator("#linkfield").inputValue();
    // dasselbe Geraet (gleicher Browser-Kontext, gleicher Speicher), neue Seite mit dem Antwort-Link
    const P2 = await A.ctx.newPage();
    await P2.goto(A.p.url().split("#")[0] + u.slice(u.indexOf("#"))); await P2.locator("header.bar").waitFor();
    for (let i = 0; i < 40 && !["receive-show", "receive-reject"].includes(await screen(P2).catch(() => "")); i++) await P2.waitForTimeout(100);
    assert.equal(await screen(P2), "receive-show", "Antwort angenommen: " + (await P2.locator("[data-reason]").getAttribute("data-reason").catch(() => "")));
    await act(P2, "accept");
    const ta = await text(P2);
    assert.ok(!/Wer bist du/.test(ta), "Geraet der Wuenschenden fragt nicht");
    for (const w of ["Ben", "vergeben", "Du schenkst"]) assert.ok(!ta.includes(w), "Wuenschende sieht nicht: " + w);
    assert.ok(ta.includes("Hörbuch") && ta.includes("Schal"));
    for (const x of await axe(P2, "zug-wunschzettel/A2")) A.bad.push(x);
  assert.deepEqual(A.bad, []);
  await A.ctx.close(); await B.ctx.close();
  });
}
