// Heimseite (Strang H): Kernhandlung (Hauptknopf des Kalenderblatts) im ersten Bildschirm auf allen Ansichten, auch beim
// Blaettern; Wischen blaettert; Satz fuehrt zur Familie; Zurueck (System) fuehrt von der Familie zum Blatt; kein Ueberlauf.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, noOverflow } from "./lib/grund.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const firstScreen = (p) => p.evaluate(() => { window.scrollTo(0, 0); const r = document.querySelector(".h-go").getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight }; });
for (const view of ["phone360", "phone390", "phone412", "desk1280"]) {
  test("Hauptknopf des Kalenderblatts im ersten Bildschirm, kein Ueberlauf: " + view, async () => {
    const { p, errs } = await open(b, { view });
    await p.locator(".h-leaf").waitFor();
    for (let i = 0; i < 6; i++) {
      const r = await firstScreen(p);
      assert.ok(r.bottom <= r.vh, "Tag +" + i + ": Hauptknopf endet bei " + r.bottom + " > " + r.vh);
      assert.ok(await noOverflow(p), "kein waagerechter Ueberlauf");
      await act(p, "day-next");
    }
    assert.deepEqual(errs, []);
  });
}

test("Wischen nach links blaettert vor, nach rechts zurueck; Heute springt zurueck", async () => {
  const { p } = await open(b, { view: "phone390" });
  // erst wenn die Startbilder geladen sind: Wischen ueber ein echtes Bild (Befund Labor 73a76ec9, Bild-Ziehen schluckte das Wischen)
  const leaf = p.locator(".h-leaf"); await leaf.waitFor(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(500);
  const d0 = await p.locator(".h-dnum").textContent();
  const box = await leaf.boundingBox();
  const swipe = async (dx) => { await p.mouse.move(box.x + box.width / 2, box.y + 120); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + dx, box.y + 120, { steps: 6 }); await p.mouse.up(); };
  await swipe(-150); assert.notEqual(await p.locator(".h-dnum").textContent(), d0);
  await swipe(150); assert.equal(await p.locator(".h-dnum").textContent(), d0);
  await act(p, "day-next"); await act(p, "day-today"); assert.equal(await p.locator(".h-dnum").textContent(), d0);
});

test("Ein Satz fuehrt zur Familie; System-Zurueck fuehrt zum Blatt", async () => {
  const { p } = await open(b, { view: "phone390" });
  await act(p, "intent-suchen"); await p.locator("#h-sentence").fill("Termin für den Spieleabend"); await p.keyboard.press("Enter");
  await p.locator("main.h-at-family").waitFor();
  assert.match(await p.locator(".h-heard").textContent(), /Spieleabend/);
  await p.goBack(); await p.locator("main.h-at-day").waitFor();
});

test("Verschickte Karte: Wand zeigt das Werk, Einladungen den Link; Story-Bild 9:16 mit QR wird erzeugt", async () => {
  const { p, ctx, errs } = await open(b, { view: "phone390" });
  await act(p, "open-gruss"); await p.locator("main.s-card-view").waitFor(); await act(p, "go"); await p.locator("main.s-card-share").waitFor();
  for (let i = 0; i < 4 && (await p.locator('[data-act="back"]').count()); i++) await act(p, "back");
  await act(p, "meins"); await p.locator(".h-work .frame").waitFor();
  await act(p, "tab-einladungen"); await p.locator(".h-inv").waitFor();
  assert.match(await p.locator(".h-inv-st").textContent(), /Langer Link|Verschickt/);
  const dl = p.waitForEvent("download");
  await act(p, "inv-story-0");
  const d = await dl;
  assert.equal(d.suggestedFilename(), "my-daily-idea-story.png");
  const buf = await (await import("node:fs")).promises.readFile(await d.path());
  assert.equal(buf.readUInt32BE(16), 1080, "Breite"); assert.equal(buf.readUInt32BE(20), 1920, "Hoehe");
  await p.locator(".h-note").waitFor();
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Jede Karte im Register oeffnet aus dem Regal und zeigt ihre Vorschau (alle Kartenarten)", async () => {
  const { ORDER } = await import("../../src/cards/index.js");
  const { p, errs } = await open(b, { view: "phone390" });
  for (const id of ORDER) {
    await act(p, "intent-alle"); await p.locator("main.h-at-regal").waitFor();
    await p.locator('[data-act="open-' + id + '"]').first().scrollIntoViewIfNeeded();
    await act(p, "open-" + id);
    await p.locator("main.s-card-view").waitFor();
    assert.ok(await p.locator("#stage .frame, #stage canvas, #stage .stack").count() > 0, id + ": Vorschau auf der Buehne");
    for (let i = 0; i < 4 && (await p.locator('[data-act="back"]').count()); i++) await act(p, "back");
    await p.locator("main.h-at-day").waitFor();
  }
  assert.deepEqual(errs, [], "keine Seitenfehler");
});

test("Gate C: Satz in der eigenen Karte fuehrt direkt in die freie Karte (FREI mit Satz)", async () => {
  const { p, errs } = await open(b, { view: "phone390" });
  await p.locator("#frei-satz").fill("Quiz über unsere Klassenfahrt");
  await act(p, "frei");
  await p.locator("main:not(.h-at-day)").waitFor();
  assert.ok(!(await p.locator("main.s-shelf").count()) || (await p.locator("main.h-at-eigene").count()), "weg vom Kalenderblatt");
  assert.deepEqual(errs, []);
});
