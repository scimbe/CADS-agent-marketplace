// Hinweis „Demo – Testinstallation“ (src/ui/demo-view.js): auf Start, Regal, Karte, Echtzeitspiel und Empfang sichtbar,
// im Fluss zwischen Kopfzeile und Inhalt, verdeckt nichts, Ziel >= 44 px, Link auf „Ueber diese Demo“ (neuer Tab, ?go=demo),
// axe ohne Verstoesse. Echtzeit: die Buehne behaelt ihre Hoehe (100dvh - 9rem) und liegt ganz im ersten Bildschirm.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { browser, open, act, waitScreen, axe, ROOT } from "./lib/grund.mjs";
import { pickMode } from "./lib/scenarios.mjs";

const VEC = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/link-vectors.json"), "utf8"));
let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

// wie layout.e2e.js: jedes sichtbare Bedienelement ist an seiner Stelle selbst oben (nichts liegt darueber)
const covered = (p) => p.evaluate(async () => {
  const out = [];
  try {
    for (const e of [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio], canvas")].filter((x) => x.checkVisibility({ visibilityProperty: true }))) {
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

// Lage und Groesse des Hinweises (oben, ohne Scrollen)
const bar = (p) => p.evaluate(() => {
  window.scrollTo(0, 0);
  const q = (s) => document.querySelector(s)?.getBoundingClientRect();
  const a = document.querySelector(".demo-bar a.demo-link");
  return { head: q("header.bar"), bar: q(".demo-bar"), link: a ? a.getBoundingClientRect() : null, main: q("main"), name: a ? a.textContent : "", href: a ? a.getAttribute("href") : null, target: a ? a.getAttribute("target") : null,
    order: [...document.querySelector("#app").children].slice(0, 3).map((e) => e.tagName + "." + e.className.split(" ")[0]), fixed: a ? getComputedStyle(document.querySelector(".demo-bar")).position : null };
});

function checkBar(r, where, lang = "de") {
  assert.ok(r.link, where + ": Hinweis-Link da");
  assert.deepEqual(r.order, ["HEADER.bar", "DIV.demo-bar", "MAIN.main"], where + ": Reihenfolge Kopf, Hinweis, Inhalt");
  assert.equal(r.fixed, "static", where + ": im Fluss, nicht fixiert");
  assert.ok(r.bar.top >= r.head.bottom - 1 && r.main.top >= r.bar.bottom - 1, where + ": zwischen Kopfzeile und Inhalt");
  assert.ok(r.link.height >= 44 && r.link.width >= 44, where + ": Ziel >= 44 px (" + Math.round(r.link.width) + "x" + Math.round(r.link.height) + ")");
  assert.ok(r.bar.height <= 45, where + ": Leiste nicht hoeher als ihr Ziel (" + r.bar.height + ")");
  assert.match(r.name, lang === "en" ? /Demo – test installation/ : /Demo – Testinstallation/, where);
  assert.equal(r.href, "?go=demo"); assert.equal(r.target, "_blank");
}

for (const view of ["desk1280", "phone390"]) {
  test("Demo-Hinweis auf Start, Regal, Karte, Echtzeit, Empfang: sichtbar, im Fluss, verdeckt nichts, axe: " + view, async () => {
    const seen = [], bad = [], ax = [], errs = [];
    const look = async (p, where) => { checkBar(await bar(p), view + "/" + where); for (const x of await covered(p)) bad.push(where + ": " + x); ax.push(...(await axe(p, where))); seen.push(where); };
    const A = await open(b, { view }); errs.push(A.errs);
    await look(A.p, "start");
    await A.p.locator('[data-act="intent-alle"]').first().click(); await A.p.locator("main.h-at-regal").waitFor(); await look(A.p, "regal");
    await act(A.p, "open-gruss"); await waitScreen(A.p, "card-view"); await look(A.p, "karte");
    const F = await open(b, { view }); errs.push(F.errs);
    await act(F.p, "open-flug"); await waitScreen(F.p, "card-view"); await pickMode(F.p, "de", "alone"); await act(F.p, "go"); await waitScreen(F.p, "card-rt-ready");
    // Spielfeld: Hoehe nach der bisherigen Regel (nicht kleiner) und ganz im ersten Bildschirm (nicht verdeckt, nicht abgeschnitten)
    const st = await F.p.evaluate(() => { window.scrollTo(0, 0); const s = document.querySelector(".rt-stage").getBoundingClientRect(), c = document.querySelector(".rt-canvas").getBoundingClientRect(); return { h: s.height, bottom: s.bottom, cb: c.bottom, vh: innerHeight, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) }; });
    assert.ok(Math.abs(st.h - Math.max(st.vh - 9 * st.rem, 22 * st.rem)) < 1.5, "Buehne behaelt 100dvh - 9rem: " + JSON.stringify(st));
    assert.ok(st.cb <= st.vh && st.bottom <= st.vh + 0.5, "Spielfeld ganz im ersten Bildschirm: " + JSON.stringify(st));
    await look(F.p, "echtzeit");
    const R = await open(b, { view, hash: VEC.accept[0].hash }); errs.push(R.errs);
    await waitScreen(R.p, "receive-show"); await look(R.p, "empfang");
    assert.deepEqual(seen, ["start", "regal", "karte", "echtzeit", "empfang"]);
    assert.deepEqual(bad, []); assert.deepEqual(ax, []); assert.deepEqual(errs.flat(), []);
  });

  test("Demo-Hinweis fuehrt in neuem Tab zu „Ueber diese Demo“; die Partie bleibt stehen: " + view, async () => {
    const { p, errs } = await open(b, { view });
    await act(p, "open-gruss"); await waitScreen(p, "card-view");
    const next = p.context().waitForEvent("page");
    await p.locator('[data-act="demo-info"]').click();
    const q = await next;
    await q.locator("main.s-demoinfo").waitFor();
    assert.equal(await p.locator("main.s-card-view").count(), 1, "der erste Tab bleibt in der Kartenansicht");
    assert.equal(await q.locator("h1").textContent(), "Über diese Demo");
    const txt = await q.locator("main").textContent();
    for (const w of ["Testinstallation", "keine Garantie", "gelöscht", "nichts kaufen", "Anthropic in den USA", "Keycloak", "HAW-GitLab, Google, GitHub oder GitLab", "Strato", "Fotos bleiben auf deinem Gerät", "Kurzlink speichert", "„Melden“"]) assert.ok(txt.includes(w), "Info-Seite nennt: " + w);
    assert.equal(new URL(q.url()).search, "", "?go=demo wird nach dem Oeffnen aus der Adresse genommen");
    // auf der Info-Seite selbst ist der Hinweis nur Text
    assert.equal(await q.locator(".demo-bar a").count(), 0); assert.match(await q.locator(".demo-bar").textContent(), /Demo – Testinstallation/);
    assert.deepEqual(await axe(q, "info"), []);
    assert.deepEqual(await covered(q), []);
    await q.locator('[data-act="to-shelf"]').click(); await q.locator("main.s-shelf").waitFor();
    assert.deepEqual(errs, []);
  });
}

test("Demo-Hinweis und Info-Seite auf Englisch, dunkel: gleichwertig, axe ohne Verstoesse", async () => {
  const { p, errs } = await open(b, { view: "phone390", lang: "en", scheme: "dark" });
  checkBar(await bar(p), "en", "en");
  assert.deepEqual(await axe(p, "en-start"), []);
  const next = p.context().waitForEvent("page");
  await p.locator('[data-act="demo-info"]').click();
  const q = await next; await q.locator("main.s-demoinfo").waitFor();
  assert.equal(await q.locator("h1").textContent(), "About this demo");
  const txt = await q.locator("main").textContent();
  for (const w of ["test installation", "no guarantee", "Anthropic in the USA", "Strato", "Photos stay on your device", "“Report”"]) assert.ok(txt.includes(w), "info page says: " + w);
  assert.deepEqual(await axe(q, "en-info"), []);
  assert.deepEqual(errs, []);
});
