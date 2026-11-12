// Editor-Felder (Folge-PR 2, Strang H fuer P und L): jeder Teil der Karten advent-tuer, beat-pausenhof und stimme-verzerren
// oeffnet seinen Dialog ohne Seitenfehler; axe 0, nichts verdeckt im Dialog, kein Ueberlauf; Sticker, Schritte und Farbe
// aendern die Vorschau; Wetter fragt den Server (hier ohne Server: ehrliche Meldung, keine Zahlen).
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, noOverflow } from "./lib/grund.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const covered = (p) => p.evaluate(() => {
  const d = document.querySelector("#dialog"), out = [];
  for (const e of d.querySelectorAll("button, input, textarea, select")) {
    if (!e.checkVisibility()) continue;
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) out.push((e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30));
  }
  return out;
});

for (const view of ["phone360", "desk1280"]) for (const id of ["advent-tuer", "beat-pausenhof", "stimme-verzerren"]) {
  test("Alle Teile oeffnen, axe 0, nichts verdeckt: " + id + " " + view, async () => {
    const { p, errs } = await open(b, { view });
    await act(p, "open-" + id); await p.locator("main.s-card-view").waitFor();
    await act(p, "customize"); await p.locator("main.s-card-customize-bubbles").waitFor();
    const parts = await p.locator(".bubble").evaluateAll((l) => l.filter((x) => x.style.display !== "none").map((x) => x.dataset.for));
    assert.ok(parts.length >= 2, "Blasen: " + parts);
    const bad = [];
    for (const part of parts) {
      await p.locator('.bubble[data-for="' + part + '"]').click(); await p.locator("#dialog").waitFor(); await p.waitForTimeout(300);
      bad.push(...(await axe(p, id + "/" + part)), ...(await covered(p)).map((x) => id + "/" + part + ": " + x + " verdeckt"));
      if (!(await noOverflow(p))) bad.push(id + "/" + part + ": Ueberlauf");
      await p.keyboard.press("Escape"); await p.locator("#dialog").waitFor({ state: "detached" });
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errs, []);
  });
}

test("Sticker dazulegen und verschieben aendert die Vorschau; Schritte schalten; ohne Server ehrliche Wettermeldung", async () => {
  const { p, errs } = await open(b, { view: "phone390" });
  await act(p, "open-advent-tuer"); await p.locator("main.s-card-view").waitFor(); await act(p, "customize");
  const pic = () => p.evaluate(() => { const c = document.querySelector("#stage canvas"); return c ? c.toDataURL() : document.querySelector("#stage").innerHTML; });
  const before = await pic();
  await p.locator('.bubble[data-for="sticker"]').click(); await p.locator("#dialog").waitFor();
  await p.locator("#dialog .seg-opt.emo").first().click(); await act(p, "sk-right"); await act(p, "sk-bigger");
  await p.keyboard.press("Escape"); await p.locator("#dialog").waitFor({ state: "detached" });
  await p.waitForTimeout(300);
  assert.notEqual(await pic(), before, "Vorschau zeigt den Sticker");
  await p.locator('.bubble[data-for="wetter"]').click(); await p.locator("#dialog").waitFor();
  await p.locator("#wx-place-w").fill("Hamburg"); await act(p, "wx-go");
  await p.locator("#dialog [role=alert]").waitFor();
  await p.keyboard.press("Escape");
  await act(p, "done"); await act(p, "back");
  await act(p, "open-beat-pausenhof"); await p.locator("main.s-card-view").waitFor(); await act(p, "customize");
  await p.locator('.bubble[data-for="beat"]').click(); await p.locator("#dialog").waitFor();
  const cell = p.locator("#dialog .ef-step").nth(1), was = await cell.getAttribute("aria-pressed");
  await cell.click(); assert.notEqual(await cell.getAttribute("aria-pressed"), was);
  assert.deepEqual(errs, []);
});

test("Foto (media.local, arcade-panzer): Foto waehlen speichert auf dem Geraet, Feld zeigt gewaehlt, Wert local:<id>, axe 0", async () => {
  const { p, errs } = await open(b, { view: "phone360" });
  await act(p, "open-arcade-panzer"); await p.locator("main.s-card-view").waitFor();
  await act(p, "customize"); await p.locator("main.s-card-customize-bubbles").waitFor();
  await p.locator('.bubble[data-for="figur"]').click(); await p.locator("#dialog").waitFor();
  await p.locator("#dialog .ef-photo").scrollIntoViewIfNeeded();
  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await p.locator("#dialog input[type=file]").setInputFiles({ name: "ich.png", mimeType: "image/png", buffer: png });
  await p.locator("#dialog .ef-photo [role=status]").waitFor();
  assert.match(await p.locator("#dialog .ef-photo").innerText(), /Foto gewählt/);
  const ids = await p.evaluate(() => new Promise((ok) => { const r = indexedDB.open("mdi.media"); r.onsuccess = () => { const q = r.result.transaction("fotos").objectStore("fotos").getAllKeys(); q.onsuccess = () => ok(q.result); }; }));
  assert.equal(ids.length, 1); assert.match(ids[0], /^[0-9a-f]{32}$/);
  assert.deepEqual(await axe(p, "foto"), []);
  assert.deepEqual(errs, []);
});
