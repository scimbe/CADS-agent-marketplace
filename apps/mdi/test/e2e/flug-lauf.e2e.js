// e2e der Karten flug und lauf in der echten App (Echtzeit-Host von Strang F: src/app/rt/*, rt-stage, canvas):
// Regal -> Karte -> LOS -> Countdown -> Lauf -> Ende, Tastatur und Touch, Pause, Ducken-Knopf, Geist-Duell als
// Link-Rundreise (Link-Typ ghost, Spur-Format), alle 16 Varianten als Karten-Link, reduzierte Bewegung, Verdeckung,
// Ueberlauf und axe in allen Echtzeit-Zustaenden auf 4 Ansichten.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, screen, waitScreen, axe, noOverflow } from "./lib/grund.mjs";
import { pickMode } from "./lib/scenarios.mjs";
import flug from "../../src/cards/flug/card.js";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const label = (p) => p.locator("canvas.rt-canvas").getAttribute("aria-label");
// Flug: Punkte im aria-label; Lauf: Meter (Kopfzeile Gate C "120 m · 3 Muenzen")
const points = async (p) => { const l = (await label(p)) || ""; return Number(l.match(/(\d+) (Punkte|points)/)?.[1] ?? l.match(/(\d+) m · /)?.[1] ?? NaN); };
// mode: "alone" (allein, danach Aufnahme teilen) oder "bot" (Gegen den Computer, Vorauswahl nach Gate C)
async function start(p, card, mode = "alone") {
  if (card) { await act(p, "open-" + card); await waitScreen(p, "card-view"); }
  if (mode) await pickMode(p, "de", mode);
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
  assert.match(res, /^\d+ Lücken!$/, "Ergebniszeile aus status.say (allein): " + res);
  assert.ok(!/object Object|gewinnt/i.test(await p.locator("main").innerText()));
  await act(p, "again"); await waitScreen(p, "card-rt-ready");
  assert.deepEqual(errs, []);
});

// Flugdauer in Ticks statt Wanduhr (Befund Integrator, Kandidat 4ec48b49: unter Last lastabhaengig): Nach dem Ende einer
// Allein-Partie traegt der Aufnahme-Link die Zahl der gespielten Ticks (wire.n). Ohne Tippen ist sie fest und gleich der
// Vorhersage der Karte; jedes Tippen auf die Buehne haelt den Vogel laenger oben, egal wie schnell die Maschine ist.
async function flightTicks(p) {
  await p.locator("#linkfield").waitFor({ state: "attached", timeout: 20000 });
  const url = await p.locator("#linkfield").inputValue();
  return JSON.parse(Buffer.from(url.slice(url.indexOf("#")).split(".")[2], "base64url").toString()).n;
}
test("Flug Touch: wer tippt, fliegt laenger als wer nichts tut (Tippen auf die Buehne = Flattern, gemessen in Ticks)", async () => {
  const D = Object.fromEntries(Object.entries(flug.manifest.params.properties).map(([k, d]) => [k, d.default]));
  let st = flug.init({ params: D, players: ["human", "none"] });
  for (let t = 0; t < 20000 && !flug.status(st).over; t++) st = flug.step(st, [{ b: 0 }, { b: 0 }], t).state;
  const idleWant = st.t;
  const run = async (tap) => {
    const { p, errs, ctx } = await open(b, { view: "phone360" });
    await start(p, "flug");
    const box = await p.locator("canvas.rt-canvas").boundingBox();
    while ((await screen(p)) === "card-rt-run") {
      if (tap) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 3);
      await p.waitForTimeout(tap ? 230 : 50);
    }
    await waitScreen(p, "card-rt-over", 120000);
    const n = await flightTicks(p);
    assert.deepEqual(errs, []);
    await ctx.close();
    return n;
  };
  const idle = await run(false), tapped = await run(true);
  console.log("# Flug Ticks ohne Tippen " + idle + " (Karte " + idleWant + "), mit Tippen " + tapped);
  assert.equal(idle, idleWant, "ohne Tippen: feste Flugdauer wie die Karte sie vorhersagt (" + idleWant + " Ticks)");
  assert.ok(tapped > idle, "mit Tippen " + tapped + " Ticks, ohne " + idle + " Ticks");
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
  const sent = card === "flug" ? await points(A.p) : null;
  await A.p.locator("#linkfield").waitFor({ state: "attached", timeout: 10000 });
  const url = await A.p.locator("#linkfield").inputValue(), hash = url.slice(url.indexOf("#"));
  assert.match(hash, /^#v2\.ghost\./);
  const wire = JSON.parse(Buffer.from(hash.split(".")[2], "base64url").toString());
  assert.equal(wire.c, card); assert.deepEqual(wire.rl, ["ghost", "none"]);
  if (sent !== null) assert.equal(wire.sc[0], sent, "Punkte im Link = Punkte im Spiel");
  assert.ok(!/blob:|data:/.test(JSON.stringify(wire.p)), "keine Fotos im Link");
  const B = await open(b, { view: "phone390", hash });
  await waitScreen(B.p, "receive-show");
  assert.match(await B.p.locator("main").innerText(), new RegExp(String(wire.sc[0])));
  await act(B.p, "accept");
  await waitScreen(B.p, "card-rt-run", 8000);
  await waitScreen(B.p, "card-rt-over", 120000);
  assert.match(await B.p.locator("main").innerText(), new RegExp("Aufnahme hat " + wire.sc[0]), "Host-Text „Aufnahme“ (F #303)");
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

for (const card of ["flug", "lauf"]) test("Gegen den Computer (" + card + ", Vorauswahl): Kopfzeile nennt DU und COMPUTER, der Computer laeuft mit", async () => {
  const { p, errs } = await open(b, { view: "phone390" });
  await act(p, "open-" + card); await waitScreen(p, "card-view");
  assert.ok(await p.getByRole("radio", { name: "Gegen den Computer", exact: true }).isChecked(), "Vorauswahl: Gegen den Computer");
  await start(p, null, null);
  await p.waitForTimeout(800);
  const l = await label(p);
  if (card === "flug") assert.match(l, /DU \d+ : COMPUTER \d+/); else assert.match(l, /Laufspiel/);
  assert.ok(!/Geist/.test(await p.locator("main").innerText()), "kein „Geist“ als Bedienwort");
  assert.deepEqual(errs, []);
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
    await act(p, "open-" + card); await waitScreen(p, "card-view"); await pickMode(p, "de", "alone");
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

// Eigenes Foto (Gate C Blase „Eigenes Foto“, broker/media.js): waehlen -> "local:<id>" -> die Karte zeichnet {kind:"local", id}
// -> Pixelprobe auf der Buehne (Testbild Magenta). Die geteilte Aufnahme traegt das Foto nicht (weder id noch "local:"), und
// wer sie oeffnet, sieht kein Magenta.
async function testPng(p) {
  const url = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 96; const x = c.getContext("2d"); x.fillStyle = "#ff00aa"; x.fillRect(0, 0, 96, 96); return c.toDataURL("image/png"); });
  return Buffer.from(url.split(",")[1], "base64");
}
const magenta = (p) => p.evaluate(() => {
  const c = document.querySelector("canvas.rt-canvas") || document.querySelector("#stage canvas") || document.querySelector("canvas"); if (!c) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 100 && d[i + 1] < 50 && d[i + 2] > 60 && d[i + 2] < d[i] + 10) n++;
  return n / (d.length / 4);
});
// Flug: Foto als Hintergrund (dunkler Lava-Himmel, Magenta bleibt erkennbar); Lauf: Foto als Figur (volle Deckkraft, im hellen
// Bruecken-Himmel waere der durchscheinende Hintergrund kein reines Magenta mehr)
for (const [card, slot, min] of [["flug", 1, 0.05], ["lauf", 0, 0.004]]) test("Eigenes Foto (" + card + ", " + (slot ? "Hintergrund" : "Figur") + "): im Spiel sichtbar (Pixelprobe), nicht im Aufnahme-Link, nicht beim Empfaenger", async () => {
  const A = await open(b, { view: "phone390" });
  await act(A.p, "open-" + card); await waitScreen(A.p, "card-view");
  await act(A.p, "customize"); await A.p.locator("main.s-card-customize-bubbles").waitFor();
  await A.p.locator('.bubble[data-for="foto"]').click(); await A.p.locator("#dialog").waitFor();
  const files = A.p.locator("#dialog input[type=file]");
  assert.equal(await files.count(), 2, "Figur und Hintergrund");
  await files.nth(slot).setInputFiles({ name: "test.png", mimeType: "image/png", buffer: await testPng(A.p) });
  await A.p.locator("#dialog .ef-photo [role=status]").first().waitFor();
  await A.p.waitForTimeout(450);   // der Dialog waechst aus der Blase (FLIP); axe misst erst das fertige Bild
  assert.deepEqual(await axe(A.p, card + " foto-dialog"), []);
  await A.p.keyboard.press("Escape"); await act(A.p, "done"); await waitScreen(A.p, "card-view");
  await start(A.p, null, "alone");
  await A.p.locator(".rt-pause").dispatchEvent("click"); await waitScreen(A.p, "card-rt-pause"); await A.p.waitForTimeout(200);
  const m = await magenta(A.p);
  assert.ok(m >= min, card + ": Foto auf der Buehne, Anteil " + m);
  await A.p.locator(".rt-pause").dispatchEvent("click");
  await waitScreen(A.p, "card-rt-over", 120000);
  await A.p.locator("#linkfield").waitFor({ state: "attached", timeout: 20000 });
  const url = await A.p.locator("#linkfield").inputValue(), data = Buffer.from(url.slice(url.indexOf("#")).split(".")[2], "base64url").toString();
  const ids = await A.p.evaluate(() => new Promise((ok) => { const r = indexedDB.open("mdi.media"); r.onsuccess = () => { const q = r.result.transaction("fotos").objectStore("fotos").getAllKeys(); q.onsuccess = () => ok(q.result); }; }));
  assert.equal(ids.length, 1);
  assert.ok(!data.includes(ids[0]) && !/local:|data:image|blob:/.test(data), "kein Foto im Aufnahme-Link: " + data.slice(0, 160));
  const B = await open(b, { view: "phone390", hash: url.slice(url.indexOf("#")) });
  await waitScreen(B.p, "receive-show"); await act(B.p, "accept"); await waitScreen(B.p, "card-rt-run", 8000);
  await B.p.locator(".rt-pause").dispatchEvent("click"); await waitScreen(B.p, "card-rt-pause"); await B.p.waitForTimeout(200);
  assert.ok((await magenta(B.p)) < 0.01, "Empfaenger hat das Foto nicht");
  assert.deepEqual([...A.errs, ...B.errs], []);
});

// Gate C: grosse Tipp-Taste (F #303, controls.screenKey) und „Gemuetlich spielen“ (rt.slow -> Parameter tempo 0.75), in Ticks
test("Flug: Tipp-Taste „TIPPEN = FLATTERN“ (>= 96 px) haelt den Vogel oben; „Gemütlich spielen“ = Zeitlupe 0.75 im Aufnahme-Link", async () => {
  const D = Object.fromEntries(Object.entries(flug.manifest.params.properties).map(([k, d]) => [k, d.default]));
  const idleTicks = (tempo) => { let st = flug.init({ params: { ...D, tempo }, players: ["human", "none"] }); for (let t = 0; t < 20000 && !flug.status(st).over; t++) st = flug.step(st, [{ b: 0 }, { b: 0 }], t).state; return st.t; };
  const { p, errs } = await open(b, { view: "phone390" });
  await act(p, "open-flug"); await waitScreen(p, "card-view"); await pickMode(p, "de", "alone");
  const slow = p.locator('[data-act="slow"]');
  assert.equal(await slow.getAttribute("aria-checked"), "false"); await slow.click(); assert.equal(await slow.getAttribute("aria-checked"), "true");
  await start(p, null, null);
  const key = p.locator(".rt-key");
  assert.equal(await key.textContent(), "TIPPEN = FLATTERN"); assert.ok((await key.boundingBox()).height >= 96);
  while ((await screen(p)) === "card-rt-run") { await key.dispatchEvent("pointerdown"); await key.dispatchEvent("pointerup"); await p.waitForTimeout(260); }
  await waitScreen(p, "card-rt-over", 120000);
  const n = await flightTicks(p), url = await p.locator("#linkfield").inputValue();
  const wire = JSON.parse(Buffer.from(url.slice(url.indexOf("#")).split(".")[2], "base64url").toString());
  assert.equal(wire.p.tempo, 0.75, "Zeitlupe reist mit der Aufnahme");
  assert.ok(n > idleTicks(0.75), "Tipp-Taste wirkt: " + n + " Ticks, ohne Tippen " + idleTicks(0.75));
  assert.ok(idleTicks(0.75) > idleTicks(1), "gemuetlich dauert der Fall laenger");
  assert.deepEqual(errs, []);
});
