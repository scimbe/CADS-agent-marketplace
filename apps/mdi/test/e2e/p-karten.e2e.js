// Strang P im Browser: Link-Rundreise, Verdeckung, axe, reduzierte Bewegung fuer advent-tuer, zug-advent, foto-alien,
// kanal-geheim. Haengt an Renderer-Primitiven von Strang F (canvas mit ops2d, door, doors, list, field, go). Fehlt eines im
// Renderer, ist der Fall als todo mit Grund markiert (sichtbar im Bericht, kein stilles Ueberspringen).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { browser, open, act, axe, noOverflow, waitScreen, ROOT, shotsDir } from "./lib/grund.mjs";
import { pickMode } from "./lib/scenarios.mjs";

const RENDER = ["render.js", "widgets.js", "widgets-more.js"].map((f) => { try { return fs.readFileSync(path.join(ROOT, "src/render", f), "utf8"); } catch (e) { return ""; } }).join("\n");
const has = (...t) => t.every((x) => RENDER.includes('case "' + x + '"') || RENDER.includes("W." + x + " =") || RENDER.includes("M." + x + " ="));
const need = (...t) => (has(...t) ? {} : { todo: "wartet auf Renderer-Primitive von Strang F: " + t.filter((x) => !has(x)).join(", ") });
const DEC5 = new Date("2026-12-05T09:00:00Z"), DEC3 = new Date("2026-12-03T09:00:00Z");
const clock = (t) => async (ctx) => { await ctx.clock.setFixedTime(t); };
const shot = async (p, name) => { const d = shotsDir(); if (d) await p.screenshot({ path: path.join(d, "p-" + name + ".png"), fullPage: true }); };
const linkOf = (p) => p.locator("#linkfield").inputValue().then((u) => u.slice(u.indexOf("#")));
const payload = (hash) => Buffer.from(hash.split(".").slice(2).join("."), "base64url").toString("utf8");
// Verdeckung wie layout.e2e.js: kein Bedienelement liegt unter etwas anderem
const covered = (p) => p.evaluate(() => [...document.querySelectorAll("button, input, textarea, [role=radio]")].filter((e) => e.checkVisibility()).flatMap((e) => {
  e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit && hit !== e && !e.contains(hit) && !hit.contains(e) ? [(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30)] : [];
}));

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

for (const view of ["phone360", "phone390", "phone412", "desk1280"]) {
  test("advent-tuer " + view + ": gestalten 16:9, Link, Empfaenger klappt die Tuer 5 auf; axe, keine Verdeckung, kein Ueberlauf", need("canvas", "door"), async () => {
    const A = await open(b, { view, before: clock(DEC5) });
    await act(A.p, "open-advent-tuer"); await waitScreen(A.p, "card-view");
    assert.match(await A.p.locator("canvas").first().getAttribute("aria-label"), /Adventstürchen 5/);
    const box = await A.p.locator("canvas").first().boundingBox();
    assert.ok(Math.abs(box.width / box.height - 16 / 9) < 0.02, "16:9: " + box.width + "x" + box.height);
    assert.deepEqual(await axe(A.p, "advent-ansehen"), []); assert.deepEqual(await covered(A.p), []); assert.ok(await noOverflow(A.p));
    await shot(A.p, "advent-ansehen-" + view);
    await act(A.p, "go"); await waitScreen(A.p, "card-share");
    const link = await linkOf(A.p);
    assert.match(link, /^#v2\.card\./); assert.match(payload(link), /"nr":5/, "Nummer beim Absenden eingefroren");
    const B = await open(b, { view, hash: link, before: clock(DEC3) });
    await waitScreen(B.p, "receive-show");
    const door = B.p.getByRole("button", { name: "Türchen 5 öffnen" });
    await door.waitFor();
    assert.ok(await B.p.getByText("Gedacht für den 5. Dezember.").isVisible(), "zu frueh: nur ein Hinweis, nicht gesperrt");
    assert.deepEqual(await axe(B.p, "advent-zu"), []); assert.deepEqual(await covered(B.p), []);
    await shot(B.p, "advent-zu-" + view);
    // zu: keine Knoepfe; das Widget sagt „Tippen zum Oeffnen“ (alt door.js)
    assert.equal(await B.p.getByRole("button", { name: "Eigenes Türchen machen" }).count(), 0, "vor dem Aufklappen kein Hauptknopf");
    assert.equal(await B.p.getByRole("button", { name: "Weiter" }).count(), 0);
    await door.click();
    await B.p.locator("canvas").first().waitFor({ state: "visible" });
    await B.p.getByRole("button", { name: "Eigenes Türchen machen" }).waitFor();
    await B.p.getByRole("button", { name: "Weiter" }).waitFor();
    assert.deepEqual(await covered(B.p), []);
    assert.deepEqual(await axe(B.p, "advent-offen"), []); assert.ok(await noOverflow(B.p));
    await shot(B.p, "advent-offen-" + view);
    await B.p.getByRole("button", { name: "Eigenes Türchen machen" }).click();
    await waitScreen(B.p, "card-view"); // eigenes Tuerchen gestalten
    assert.match(await B.p.locator("canvas").first().getAttribute("aria-label"), /Adventstürchen/);
    assert.deepEqual([...A.errs, ...B.errs], []);
  });
}

test("advent-tuer: reduzierte Bewegung klappt ohne Bewegung auf (nur Wechsel)", need("canvas", "door"), async () => {
  const A = await open(b, { before: clock(DEC5) });
  await act(A.p, "open-advent-tuer"); await act(A.p, "go"); await waitScreen(A.p, "card-share");
  const B = await open(b, { hash: await linkOf(A.p), reduced: true, before: clock(DEC5) });
  await B.p.getByRole("button", { name: "Türchen 5 öffnen" }).click();
  const moving = await B.p.evaluate(() => document.getAnimations().flatMap((a) => a.effect.getKeyframes()).filter((k) => k.transform && k.transform !== "none").length);
  assert.equal(moving, 0, "keine Transform-Animation bei prefers-reduced-motion");
});

test("advent-tuer: „Weiter“ nach dem Aufklappen fuehrt zurueck ins Regal", need("canvas", "door"), async () => {
  const A = await open(b, { before: clock(DEC5) });
  await act(A.p, "open-advent-tuer"); await act(A.p, "go"); await waitScreen(A.p, "card-share");
  const B = await open(b, { hash: await linkOf(A.p), before: clock(DEC5) });
  await B.p.getByRole("button", { name: "Türchen 5 öffnen" }).click();
  await B.p.getByRole("button", { name: "Weiter" }).click();
  await B.p.waitForFunction(() => !document.querySelector("main.s-receive-show"));
  assert.notEqual(await B.p.locator("main").getAttribute("class").then((c) => c.split(" ").find((x) => x.startsWith("s-"))), "s-receive-show");
});

test("zug-advent: 24 Saetze per Link, im Dezember sind die Tueren bis heute offen", need("list", "doors"), async () => {
  const A = await open(b, { before: clock(DEC5) });
  await act(A.p, "open-zug-advent"); await act(A.p, "go"); await waitScreen(A.p, "card-play-turn");
  const fields = A.p.getByRole("textbox"); assert.equal(await fields.count(), 24);
  await fields.nth(0).fill("Kakao!"); await fields.nth(4).fill("Schnee?");
  await A.p.getByRole("button", { name: "Kalender verschicken" }).click();
  await waitScreen(A.p, "card-play-over");
  const link = await linkOf(A.p);
  const B = await open(b, { hash: link, before: clock(DEC5) }); await waitScreen(B.p, "receive-show"); await act(B.p, "accept");
  const doors = B.p.getByRole("button", { name: /^Tür \d+/ });
  assert.equal(await doors.count(), 24);
  assert.equal(await B.p.locator("button:disabled").filter({ hasText: /^\d+$/ }).count(), 19, "Tueren 6-24 noch zu");
  await doors.nth(0).click(); await B.p.getByText("Kakao!").waitFor();
  assert.deepEqual(await axe(B.p, "zug-advent"), []); assert.deepEqual(await covered(B.p), []);
  await shot(B.p, "zug-advent-tueren");
});

test("foto-alien: der Link traegt Text und Stil, nie das Foto", need("canvas"), async () => {
  const A = await open(b, {});
  await act(A.p, "open-foto-alien"); await waitScreen(A.p, "card-view");
  await shot(A.p, "foto-alien");
  await act(A.p, "go"); await waitScreen(A.p, "card-share");
  const data = payload(await linkOf(A.p));
  assert.match(data, /STRENG GEHEIM/); assert.ok(!/photo|data:image|blob:/.test(data));
  assert.deepEqual(await axe(A.p, "foto-alien"), []);
});

test("kanal-geheim: Antworten stehen nicht im Link; falsch, falsch, Tipp, richtig, offen", need("field", "go"), async () => {
  const A = await open(b, {});
  await act(A.p, "open-kanal-geheim"); await act(A.p, "go"); await waitScreen(A.p, "card-play-turn");
  // wie ein Mensch: nach jedem Feld kurz warten (Entwurf wird nach 150 ms uebernommen)
  await A.p.getByLabel("Antwort, nur ihr beide wisst sie").nth(0).fill("Banane"); await A.p.waitForTimeout(250);
  await A.p.getByLabel("Antwort, nur ihr beide wisst sie").nth(1).fill("Otter"); await A.p.waitForTimeout(250);
  await A.p.locator("[data-act=go-step]").click();
  await waitScreen(A.p, "card-play-send");
  const link = await linkOf(A.p);
  assert.ok(!/banane|otter/i.test(payload(link)), "keine Antwort im Link");
  const B = await open(b, { hash: link }); await waitScreen(B.p, "receive-show"); await act(B.p, "accept");
  const ans = B.p.getByLabel("Deine Antwort"), go = B.p.locator("[data-act=go-step]");
  for (const w of ["Apfel", "Birne"]) { await ans.fill(w); await B.p.waitForTimeout(250); await go.click(); }
  await B.p.getByText("Tipp: fängt mit B an, 6 Zeichen").waitFor();
  await ans.fill("banane"); await B.p.waitForTimeout(250); await go.click(); await B.p.getByText("Welches Tier wären wir zusammen?").waitFor();
  await ans.fill("OTTER"); await B.p.waitForTimeout(250); await go.click(); await B.p.getByText("Offen!").waitFor();
  assert.deepEqual(await axe(B.p, "kanal-offen"), []);
  await shot(B.p, "kanal-offen");
});
