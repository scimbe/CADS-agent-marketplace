// Quiz-Karten im echten Browser (Strang S): zug-abfragen als Variante zug-quiz mit Paket per Link (beide Seiten bis zum
// Ergebnis), quiz-preis mit dem Schieber per Touch und per Pfeiltasten (beide Seiten), raum-schaetzen allein, zug-typen
// per Link. Bedienung nur ueber die sichtbaren Widgets (pick, slide, list, show); je neuem Zustand: nichts verdeckt, axe 0.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, noOverflow, waitScreen, screen, leftView, URL_MODE } from "./lib/grund.mjs";
import { texts } from "../../src/app/texts.js";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const settle = (p) => p.evaluate(() => new Promise((res) => {
  let t; const done = () => { mo.disconnect(); res(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 200); });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(done, 200); setTimeout(done, 3000);
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

// Parameter ueber die Blasen des Editors setzen (Teil -> Radio mit dem Wert)
async function customize(p, sets) {
  await act(p, "customize");
  for (const [part, value] of sets) {
    await p.locator('.bubble[data-for="' + part + '"]').click();
    await p.locator("#dialog").getByRole("radio", { name: value, exact: true }).first().click();
    await act(p, "close");
  }
  await act(p, "done");
}

// Ein Tipp per Touch (CDP), sonst Maus
async function tapAt(p, touch, x, y) {
  if (!touch) { await p.mouse.click(x, y); return; }
  const c = await p.context().newCDPSession(p);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
}

/**
 * Spielt ueber die sichtbaren Widgets, bis das Geraet nicht mehr am Zug ist. slider: "touch" | "keys".
 * Liefert den Bildschirm danach. Je Widget-Art wird der erste Zustand geprueft (audit).
 */
async function play(P, { slider = "keys", touch = false, label, bad, seen = new Set(), max = 40 }) {
  const p = P.p;
  for (let i = 0; i < max; i++) {
    const s = await screen(p);
    if (s === "card-play-cover") { await act(p, "cover-ok"); continue; }
    if (s !== "card-play-turn") return s;
    await settle(p);
    const kind = await p.evaluate(() => { const w = document.querySelector("main section.widget"); return w ? [...w.classList].find((c) => c.startsWith("wg-")) : null; });
    if (!kind) { await p.waitForTimeout(50); continue; }
    if (!seen.has(kind)) { seen.add(kind); await audit(p, label + " " + kind, bad); }
    const w = p.locator("main section.widget").first();
    if (kind === "wg-pick") { await w.locator(".opt").first().click(); continue; }
    if (kind === "wg-slide") {
      const range = w.locator('input[type="range"]');
      const before = Number(await range.inputValue());
      if (slider === "keys") { await range.focus(); for (let k = 0; k < 3; k++) await p.keyboard.press("ArrowRight"); }
      else { await range.scrollIntoViewIfNeeded(); const r = await range.boundingBox(); await tapAt(p, touch, r.x + r.width * 0.7, r.y + r.height / 2); }
      await p.waitForFunction((b0) => Number(document.querySelector('main section.wg-slide input[type="range"]').value) !== b0, before);
    }
    if (kind === "wg-list") { const ins = w.locator("input.tlist"); const n = await ins.count(); for (let k = 0; k < n; k++) await ins.nth(k).fill("Antwort " + (k + 1)); }
    await w.locator('[data-act^="w-"]').click();
    await p.waitForTimeout(30);
  }
  return screen(p);
}
async function startLink(o, id, sets) {
  const A = await open(b, o);
  await act(A.p, "open-" + id); await waitScreen(A.p, "card-view");
  if (sets.length) await customize(A.p, sets);
  await A.p.getByRole("radio", { name: texts(o.lang).modes.link, exact: true }).click(); await act(A.p, "go");
  return A;
}
async function hop(from, to, o) {
  const link = await linkOf(from.p);
  if ((await screen(from.p)) === "card-play-send") await act(from.p, "sent");
  if (!to) to = await open(b, { ...o, hash: link });
  else await to.p.goto(to.p.url().split("#")[0] + link);
  await waitScreen(to.p, "receive-show"); await act(to.p, "accept");
  if (URL_MODE) await leftView(to.p); // Kartenteil vom Server
  return to;
}
const result = (p) => p.locator("main .t-big").first().textContent();

for (const o of [{ view: "phone390", lang: "de" }, { view: "desk1280", lang: "en" }]) {
  const touch = o.view !== "desk1280";
  test("zug-quiz (zug-abfragen, Paket planeten) per Link, beide Seiten bis zum Ergebnis – " + o.view, async () => {
    const bad = [];
    const A = await startLink(o, "zug-abfragen", [["regeln", "quiz"], ["paket", "planeten"]]);
    assert.equal(await play(A, { label: "A", bad }), "card-play-send");
    const B = await hop(A, null, o);
    const sb = await play(B, { label: "B", bad });
    assert.ok(["card-play-over", "card-play-send"].includes(sb), sb);
    if (sb === "card-play-send") await hop(B, A, o); else await hop(B, A, o).catch(() => {});
    await waitScreen(B.p, "card-play-over").catch(() => {});
    await waitScreen(A.p, "card-play-over");
    assert.ok((await result(A.p)).trim().length > 0, "Ergebnis bei A");
    assert.deepEqual(bad, []); assert.deepEqual([...A.errs, ...B.errs], []);
    await A.ctx.close(); await B.ctx.close();
  });

  test("quiz-preis per Link: Schieber per " + (touch ? "Touch" : "Maus") + " und per Pfeiltasten, Ergebnis auf beiden Seiten – " + o.view, async () => {
    const bad = [];
    const A = await startLink(o, "quiz-preis", []);
    assert.equal(await play(A, { slider: "pointer", touch, label: "A", bad }), "card-play-send");
    const B = await hop(A, null, o);
    const sb = await play(B, { slider: "keys", label: "B", bad });
    assert.ok(["card-play-over", "card-play-send"].includes(sb), sb);
    await hop(B, A, o);
    await waitScreen(A.p, "card-play-over");
    const ra = await result(A.p);
    assert.ok(ra.trim().length > 0);
    if (sb === "card-play-over") assert.equal(await result(B.p), ra, "beide sehen dasselbe Ergebnis");
    await audit(A.p, "A Ergebnis", bad);
    assert.deepEqual(bad, []); assert.deepEqual([...A.errs, ...B.errs], []);
    await A.ctx.close(); await B.ctx.close();
  });

  test("raum-schaetzen allein (quiz-preis, Spielart schaetzen) bis zum Ergebnis – " + o.view, async () => {
    const bad = [];
    const A = await open(b, o);
    await act(A.p, "open-quiz-preis"); await waitScreen(A.p, "card-view");
    await customize(A.p, [["regeln", "schaetzen"]]);
    await A.p.getByRole("radio", { name: texts(o.lang).modes.alone, exact: true }).click(); await act(A.p, "go");
    assert.equal(await play(A, { slider: "keys", label: "A", bad }), "card-play-over");
    await audit(A.p, "Ergebnis", bad);
    assert.deepEqual(bad, []); assert.deepEqual(A.errs, []);
    await A.ctx.close();
  });

  test("zug-typen per Link bis zum Ergebnis – " + o.view, async () => {
    const bad = [];
    const A = await startLink(o, "zug-typen", []);
    const sa = await play(A, { label: "A", bad });
    assert.ok(["card-play-send", "card-play-over"].includes(sa), sa);
    const B = await hop(A, null, o);
    const sb = await play(B, { label: "B", bad });
    assert.ok(["card-play-over", "card-play-send", "card-play-wait"].includes(sb), sb);
    assert.ok(await B.p.locator("main").textContent().then((t) => t.trim().length > 0));
    assert.deepEqual(bad, []); assert.deepEqual([...A.errs, ...B.errs], []);
    await A.ctx.close(); await B.ctx.close();
  });
}
