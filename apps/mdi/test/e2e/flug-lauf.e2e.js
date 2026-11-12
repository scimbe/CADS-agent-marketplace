// e2e der Karten flug und lauf in der echten App (Echtzeit-Host von Strang F: src/app/rt/*, rt-stage, canvas):
// Regal -> Karte -> LOS -> Countdown -> Lauf -> Ende, Tastatur und Touch, Pause, Ducken-Knopf, Geist-Duell als
// Link-Rundreise (Link-Typ ghost, Spur-Format), alle 16 Varianten als Karten-Link, reduzierte Bewegung, Verdeckung,
// Ueberlauf und axe in allen Echtzeit-Zustaenden auf 4 Ansichten.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, screen, waitScreen, axe, noOverflow } from "./lib/grund.mjs";
import flug from "../../src/cards/flug/card.js";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const label = (p) => p.locator("canvas.rt-canvas").getAttribute("aria-label");
const points = async (p) => Number(((await label(p)) || "").match(/(\d+) (Punkte|Pkt|points)/)?.[1] ?? NaN);
async function start(p, card) {
  if (card) { await act(p, "open-" + card); await waitScreen(p, "card-view"); }
  await act(p, "go"); await waitScreen(p, "card-rt-ready");
  await waitScreen(p, "card-rt-run", 6000);
}
const covered = (p) => p.evaluate(async () => {
  const out = [];
  for (const e of [...document.querySelectorAll("button, input, a[href], summary, [role=radio], canvas")].filter((x) => x.checkVisibility({ visibilityProperty: true }))) {
    e.scrollIntoView({ block: "center" }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e.getBoundingClientRect();
    for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * 0.2, r.top + r.height / 2]]) {
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) { out.push((e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30) + " unter " + (hit.className || hit.tagName)); break; }
    }
  }
  window.scrollTo(0, 0);
  return out;
});
const b64u = (s) => Buffer.from(s).toString("base64url");

test("Flug in der App: Regal, LOS, Countdown, Lauf mit Leertaste, Pause per Knopf, Ende mit Ergebniszeile, Nochmal", async () => {
  const { p, errs } = await open(b, { view: "phone390" });
  await start(p, "flug");
  assert.match(await label(p), /Flugspiel: Bau dein Lava-Level/);
  // Pause sofort nach dem Start (unter Last kann ein Flug ohne Eingaben nach gut 1 s vorbei sein, Labor F2/F3)
  await p.locator(".rt-pause").dispatchEvent("click"); await waitScreen(p, "card-rt-pause");
  const before = await label(p); await p.waitForTimeout(400);
  assert.equal(await label(p), before, "Pause haelt das Spiel an");
  assert.equal(await screen(p), "card-rt-pause", "Pause bleibt, bis man weiterspielt");
  await p.locator(".rt-pause").dispatchEvent("click"); await waitScreen(p, "card-rt-run");
  for (let i = 0; i < 4 && (await screen(p)) === "card-rt-run"; i++) { await p.keyboard.press("Space"); await p.waitForTimeout(180); }
  await waitScreen(p, "card-rt-over", 30000);
  const res = await p.locator(".result").textContent();
  assert.match(res, /Rekord: \d+/, "Ergebniszeile aus status.say (solo): " + res);
  assert.ok(!/object Object|gewinnt/i.test(await p.locator("main").innerText()));
  await act(p, "again"); await waitScreen(p, "card-rt-ready");
  assert.deepEqual(errs, []);
});

test("Flug Touch: wer tippt, fliegt laenger als wer nichts tut (Tippen auf die Buehne = Flattern)", async () => {
  const dur = async (tap) => {
    const { p, errs } = await open(b, { view: "phone360" });
    await start(p, "flug");
    const box = await p.locator("canvas.rt-canvas").boundingBox(), t0 = Date.now();
    while ((await screen(p)) === "card-rt-run" && Date.now() - t0 < 6000) {
      if (tap) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 3);
      await p.waitForTimeout(tap ? 230 : 50);
    }
    assert.deepEqual(errs, []);
    return Date.now() - t0;
  };
  const idle = await dur(false), tapped = await dur(true);
  assert.ok(tapped > idle + 400, "mit Tippen " + tapped + " ms, ohne " + idle + " ms");
});

test("Lauf in der App: Ducken als echter Knopf (>= 60 px, aria-pressed), Pfeil runter, Leertaste springt, Ende", async () => {
  const { p, errs } = await open(b, { view: "phone412" });
  await start(p, "lauf");
  assert.match(await label(p), /Laufspiel/);
  const duck = p.locator(".rt-btn", { hasText: "Ducken" });
  assert.ok(await duck.isVisible()); const bb = await duck.boundingBox(); assert.ok(bb.height >= 60 && bb.width >= 60, "Knopf " + bb.width + "x" + bb.height);
  await duck.dispatchEvent("pointerdown"); assert.equal(await duck.getAttribute("aria-pressed"), "true");
  await duck.dispatchEvent("pointerup"); assert.equal(await duck.getAttribute("aria-pressed"), "false");
  await p.keyboard.down("ArrowDown"); await p.waitForTimeout(100); await p.keyboard.up("ArrowDown");
  const m0 = await points(p);
  for (let i = 0; i < 6; i++) { await p.keyboard.down("Space"); await p.waitForTimeout(160); await p.keyboard.up("Space"); await p.waitForTimeout(250); }
  assert.ok((await points(p)) > m0 || (await screen(p)) === "card-rt-over", "laeuft weiter");
  await waitScreen(p, "card-rt-over", 120000);
  assert.match(await p.locator(".result").textContent(), /Punkte|Meter/);
  assert.deepEqual(errs, []);
});

for (const card of ["flug", "lauf"]) test("Geist-Duell als Link-Rundreise (" + card + "): Ende -> Lauf als Geist teilen -> Empfaenger prueft und spielt gegen die Spur", async () => {
  const A = await open(b, { view: "phone390" });
  await start(A.p, card);
  for (let i = 0; i < 3; i++) { await A.p.keyboard.press("Space"); await A.p.waitForTimeout(200); }
  await waitScreen(A.p, "card-rt-over", 120000);
  const sent = await points(A.p);
  await A.p.locator("#linkfield").waitFor({ state: "attached", timeout: 10000 });
  const url = await A.p.locator("#linkfield").inputValue(), hash = url.slice(url.indexOf("#"));
  assert.match(hash, /^#v2\.ghost\./);
  const wire = JSON.parse(Buffer.from(hash.split(".")[2], "base64url").toString());
  assert.equal(wire.c, card); assert.deepEqual(wire.rl, ["ghost", "none"]); assert.equal(wire.sc[0], sent);
  assert.ok(!/blob:|data:/.test(JSON.stringify(wire.p)), "keine Fotos im Link");
  const B = await open(b, { view: "phone390", hash });
  await waitScreen(B.p, "receive-show");
  assert.match(await B.p.locator("main").innerText(), new RegExp(String(sent)));
  await act(B.p, "accept");
  await waitScreen(B.p, "card-rt-run", 8000);
  await waitScreen(B.p, "card-rt-over", 120000);
  assert.match(await B.p.locator("main").innerText(), new RegExp("Geist hat " + sent));
  assert.deepEqual(A.errs.concat(B.errs), []);
});

test("Alle 16 Flug-Varianten als Karten-Link: annehmen, LOS, Lauf mit Titel der Variante", async () => {
  const bad = [];
  const D = Object.fromEntries(Object.entries(flug.manifest.params.properties).map(([k, d]) => [k, d.default]));
  for (const v of flug.manifest.variants) {
    const p0 = Object.assign({}, D, v.params);
    const hash = "#v2.card." + b64u(JSON.stringify({ c: "flug", v: flug.manifest.version, p: p0 }));
    const { p, errs, ctx } = await open(b, { view: "phone390", hash });
    try {
      await waitScreen(p, "receive-show"); await act(p, "accept"); await waitScreen(p, "card-view");
      await start(p, null);
      const l = await label(p);
      if (v.params.mode === "agent") { if (!/:/.test(l)) bad.push(v.id + ": Agenten-Duell ohne Stand: " + l); }
      else if (!l.includes(v.params.title)) bad.push(v.id + ": Titel fehlt: " + l);
    } catch (e) { bad.push(v.id + ": " + String(e).slice(0, 120)); }
    for (const e of errs) bad.push(v.id + ": " + e);
    await ctx.close();
  }
  assert.deepEqual(bad, []);
});

test("Reduzierte Bewegung: in der Pause steht das Bild still; ohne Einstellung ziehen die Wolken weiter", async () => {
  for (const reduced of [true, false]) {
    const { p } = await open(b, { view: "phone390", reduced });
    await start(p, "flug");
    await p.locator(".rt-pause").dispatchEvent("click"); await waitScreen(p, "card-rt-pause"); await p.waitForTimeout(150);
    const a = await p.evaluate(() => document.querySelector("canvas.rt-canvas").toDataURL()); await p.waitForTimeout(600);
    const c = await p.evaluate(() => document.querySelector("canvas.rt-canvas").toDataURL());
    if (reduced) assert.equal(c, a, "reduziert: Standbild"); else assert.notEqual(c, a, "ohne Einstellung: Bewegung");
  }
});

for (const view of ["phone360", "phone390", "phone412", "desk1280"]) for (const card of ["flug", "lauf"]) test("Verdeckung, Ueberlauf, axe in Karte, Lauf, Pause und Ende (" + card + "): " + view, async () => {
  const bad = [];
  {
    const { p, errs, ctx } = await open(b, { view });
    await act(p, "open-" + card); await waitScreen(p, "card-view");
    const check = async (name) => {
      for (const x of await covered(p)) bad.push(card + " " + name + ": " + x);
      if (!(await noOverflow(p))) bad.push(card + " " + name + ": Ueberlauf");
      for (const x of await axe(p, card + " " + name)) bad.push(x);
    };
    await check("Karte");
    await act(p, "go"); await waitScreen(p, "card-rt-run", 6000);
    const vh = await p.evaluate(() => innerHeight), cv = await p.locator("canvas.rt-canvas").boundingBox();
    if (cv.y + cv.height / 2 > vh) bad.push(card + ": Spielflaeche nicht im ersten Bildschirm");
    await p.locator(".rt-pause").dispatchEvent("click"); await waitScreen(p, "card-rt-pause"); await check("Pause");
    await p.locator(".rt-pause").dispatchEvent("click"); await waitScreen(p, "card-rt-over", 120000); await check("Ende");
    for (const e of errs) bad.push(card + ": " + e);
    await ctx.close();
  }
  assert.deepEqual(bad, []);
});
