// Heimseite (Strang H): Kernhandlung (Hauptknopf des Kalenderblatts) im ersten Bildschirm auf allen Ansichten, auch beim
// Blaettern; Wischen blaettert; Satz fuehrt zur Familie; Zurueck (System) fuehrt von der Familie zum Blatt; kein Ueberlauf.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, noOverflow, URL_MODE } from "./lib/grund.mjs";

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
  // URL-Modus: das Blatt wechselt erst, wenn das Bild des Tages vom Server da ist (auf file:// sofort)
  const day = async (same) => { if (URL_MODE) await p.waitForFunction(([d, eq]) => (document.querySelector(".h-dnum").textContent === d) === eq, [d0, same], { timeout: 10000 }).catch(() => {}); return p.locator(".h-dnum").textContent(); };
  await swipe(-150); assert.notEqual(await day(false), d0);
  await swipe(150); assert.equal(await day(true), d0);
  await act(p, "day-next"); await act(p, "day-today"); assert.equal(await day(true), d0);
});

test("Desktop (desk1280): Maus-Ziehen ueber den Text blaettert, auch beim Loslassen ausserhalb; keine Textmarkierung; Klick und Pfeiltasten bleiben", async () => {
  // User-Feedback 17.11.: „das swipen des kalenders mit der maus ist nicht im browser moeglich“
  const { p, errs } = await open(b, { view: "desk1280" });
  const leaf = p.locator(".h-leaf"); await leaf.waitFor(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(500);
  const num = () => p.locator(".h-dnum").textContent();
  const wait = async (d, same) => { await p.waitForFunction(([x, eq]) => (document.querySelector(".h-dnum").textContent === x) === eq, [d, same], { timeout: 10000 }); return num(); };
  const d0 = await num();
  const t = await p.locator(".h-stamp").boundingBox();
  // vom Titel aus nach links, losgelassen weit ausserhalb des Blatts
  await p.mouse.move(t.x + t.width - 10, t.y + t.height / 2); await p.mouse.down();
  await p.mouse.move(t.x - 400 < 0 ? 2 : t.x - 400, t.y + t.height / 2 + 4, { steps: 10 });
  const mid = await p.evaluate(() => ({ drag: document.querySelector(".h-leaf").classList.contains("h-drag"), sel: String(getSelection()) }));
  await p.mouse.move(1200, t.y + t.height / 2 + 4, { steps: 2 }); await p.mouse.move(2, t.y + 10, { steps: 2 });
  await p.mouse.up();
  assert.ok(mid.drag, "Blatt folgt der Maus (h-drag)"); assert.equal(mid.sel, "", "Ziehen markiert keinen Text");
  const d1 = await wait(d0, false);
  assert.equal(await p.evaluate(() => String(getSelection())), "", "keine Textmarkierung nach dem Loslassen");
  // nach rechts zurueck
  const t2 = await p.locator(".h-stamp").boundingBox();
  await p.mouse.move(t2.x + 10, t2.y + t2.height / 2); await p.mouse.down(); await p.mouse.move(t2.x + 300, t2.y + t2.height / 2, { steps: 8 }); await p.mouse.up();
  assert.equal(await wait(d0, true), d0);
  // kleiner Wackler ist kein Wischen, ein Klick auf › blaettert weiter wie bisher
  const s = await p.locator(".h-stamp").boundingBox();
  await p.mouse.move(s.x + 40, s.y + 10); await p.mouse.down(); await p.mouse.move(s.x + 48, s.y + 12); await p.mouse.up();
  assert.equal(await num(), d0, "8 px sind kein Wischen");
  await act(p, "day-next"); assert.equal(await wait(d1, true), d1);
  // Live-Befund 17.11.: Wisch in einem Sprung (erste Bewegung schon ausserhalb des Blatts) blaettert und markiert nichts
  const s3 = await p.locator(".h-stamp").boundingBox(), d3 = await num();
  await p.mouse.move(s3.x + 10, s3.y + s3.height / 2); await p.mouse.down(); await p.mouse.move(1200, s3.y + s3.height / 2 + 5, { steps: 1 }); await p.mouse.up();
  const d4 = await wait(d3, false);
  assert.equal(d4, d0, "Sprung nach rechts blaettert einen Tag zurueck");
  assert.equal(await p.evaluate(() => String(getSelection())), "", "Sprung-Wisch markiert keinen Text");
  // danach: nur Ueberfahren ohne Taste und ein Klick blaettern nicht, keine haengende Geste
  await p.mouse.move(s3.x + 20, s3.y + 10); await p.mouse.move(s3.x + 200, s3.y + 10, { steps: 8 });
  assert.equal(await p.evaluate(() => document.querySelector(".h-leaf").classList.contains("h-drag")), false, "keine haengende Geste");
  await p.mouse.down(); await p.mouse.up();
  assert.equal(await num(), d4, "Klick nach Ueberfahren blaettert nicht");
  await act(p, "day-next"); assert.equal(await wait(d1, true), d1);
  // Review: Wisch innerhalb des Knopfs „Zu heute“ (Druecken und Loslassen auf dem Knopf) blaettert nur einen Tag,
  // der Knopf loest danach keinen zusaetzlichen Klick aus
  await act(p, "day-next"); const d2b = await wait(d1, false);
  const zh = await p.locator('[data-act="day-today"]').boundingBox();
  assert.ok(zh.width > 80, "Knopf breit genug fuer den Test: " + zh.width);
  await p.mouse.move(zh.x + 4, zh.y + zh.height / 2); await p.mouse.down();
  await p.mouse.move(zh.x + zh.width - 4, zh.y + zh.height / 2, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(600);
  assert.equal(await num(), d1, "genau ein Tag zurueck (von " + d2b + "), nicht zu heute");
  // Tastatur: Blatt fokussieren, Pfeil links/rechts
  await p.locator(".h-leaf").focus(); await p.keyboard.press("ArrowLeft"); assert.equal(await wait(d0, true), d0);
  await p.locator(".h-leaf").focus(); await p.keyboard.press("ArrowRight"); assert.equal(await wait(d1, true), d1);
  assert.deepEqual(errs, []);
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
  // ohne Server bleibt der lange Link; gegen einen echten Server (URL-Modus) legt die App den Kurzlink an
  assert.match(await p.locator(".h-inv-st").textContent(), URL_MODE ? /Kurzlink bis/ : /Langer Link|Verschickt/);
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

test("Folge-PR 2: Jetzt spielen fuehrt mit einem Tap ins Spiel; Erst ueben (wo es das gibt) ebenso; Spielkopf zeigt die Spielweise", async () => {
  const { p, errs } = await open(b, { view: "phone390" });
  await p.locator(".h-leaf").waitFor();
  // naechster Tag mit Spiel und Uebungsknopf (Blaettern ist kein Tap auf dem Weg, der Tag ist nur Testauswahl)
  for (let i = 0; i < 30 && !(await p.locator('[data-act="day-ueben"]').count()); i++) await p.locator('[data-act="day-next"]').click();
  assert.ok(await p.locator('[data-act="day-ueben"]').count(), "Tag mit Erst ueben gefunden");
  await p.locator('[data-act="day-ueben"]').click();
  await p.locator("main[class*='s-card-play'], main[class*='s-card-rt']").first().waitFor();
  await p.locator("main:not([data-loading])").waitFor();
  assert.deepEqual(errs, []);
});

// User-Feedback 17.11.: „doppelklick auf Karte im brwoser oefnet nichts“. Das Blatt oeffnet die Karte wie der Hauptknopf:
// Klick/Tipp, Doppelklick (genau einmal), Enter und Leertaste; Wischen ueber 60 px blaettert und oeffnet nicht; Ziehen unter
// der Schwelle ist ein Klick. Jede Geste auf frischer Seite; Vergleich mit der Ansicht und dem Verlauf nach dem Hauptknopf.
const state = (p) => p.evaluate(() => ({ cls: document.querySelector("main").className, hist: history.length }));
async function sheetPage(view) {
  const r = await open(b, { view });
  await r.p.locator(".h-leaf").waitFor(); await r.p.waitForLoadState("networkidle"); await r.p.waitForTimeout(500);
  return r;
}
async function opened(p) { await p.locator("main:not(.h-at-day)").waitFor({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(400); return state(p); }
async function opensLikeGo(view, how, gesture) {
  const ref = await sheetPage(view); await ref.p.locator(".h-go").first().click(); const want = await opened(ref.p); await ref.ctx.close();
  assert.doesNotMatch(want.cls, /\bh-at-day\b/, "Hauptknopf oeffnet");
  const { p, ctx, errs } = await sheetPage(view);
  await gesture(p);
  assert.deepEqual(await opened(p), want, how + ": dieselbe Ansicht und derselbe Verlauf wie nach einem Hauptknopf-Klick (genau einmal)");
  assert.deepEqual(errs, []); await ctx.close();
}
const touchDrag = async (p, x, y, dx, steps) => {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * i / steps, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

test("Desktop (desk1280): Blatt hat Rolle und Namen; Klick, Doppelklick (einmal), Enter, Leertaste und Ziehen unter der Schwelle oeffnen", async () => {
  const { p, ctx } = await sheetPage("desk1280");
  const leaf = p.locator(".h-leaf");
  assert.equal(await leaf.getAttribute("role"), "group", "kein role=button: das Blatt enthaelt Knoepfe (‹ ›)");
  const title = await p.evaluate(() => [...document.querySelectorAll(".h-stamp-l")].map((l) => l.textContent).join(" "));
  assert.equal(await leaf.getAttribute("aria-label"), "Karte öffnen: " + title);
  assert.match(await leaf.getAttribute("aria-keyshortcuts"), /Enter Space ArrowLeft ArrowRight/);
  // der zweite Klick eines Doppelklicks (detail 2) oeffnet nicht noch einmal, auch wenn das Blatt noch steht (langsames Laden)
  await p.evaluate(() => document.querySelector(".h-stamp").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 })));
  await p.waitForTimeout(400);
  assert.match((await state(p)).cls, /\bh-at-day\b/, "Klick mit detail 2 oeffnet nicht");
  await ctx.close();
  await opensLikeGo("desk1280", "Klick", (p) => p.locator(".h-stamp").click());
  await opensLikeGo("desk1280", "Doppelklick", (p) => p.locator(".h-stamp").dblclick());
  await opensLikeGo("desk1280", "Enter", async (p) => { await p.locator(".h-leaf").focus(); await p.keyboard.press("Enter"); });
  await opensLikeGo("desk1280", "Leertaste", async (p) => { await p.locator(".h-leaf").focus(); await p.keyboard.press(" "); });
  await opensLikeGo("desk1280", "Ziehen 8 px", async (p) => { const s = await p.locator(".h-stamp").boundingBox();
    await p.mouse.move(s.x + 40, s.y + 10); await p.mouse.down(); await p.mouse.move(s.x + 48, s.y + 12); await p.mouse.up(); });
});

test("Desktop (desk1280): Maus-Wisch ueber 60 px blaettert und oeffnet nicht; ‹ im Blatt oeffnet nicht", async () => {
  const { p, errs } = await sheetPage("desk1280");
  const d0 = await p.locator(".h-dnum").textContent(), s = await p.locator(".h-stamp").boundingBox(), y = s.y + s.height / 2;
  await p.mouse.move(s.x + s.width - 10, y); await p.mouse.down(); await p.mouse.move(s.x + s.width - 160, y, { steps: 8 }); await p.mouse.up();
  await p.waitForFunction((d) => document.querySelector(".h-dnum").textContent !== d, d0, { timeout: 10000 });
  await p.waitForTimeout(600);
  assert.match((await state(p)).cls, /\bh-at-day\b/, "Wischen oeffnet nicht");
  await p.locator('[data-act="day-prev"]').click(); await p.waitForTimeout(400);
  assert.equal(await p.locator(".h-dnum").textContent(), d0, "‹ blaettert");
  assert.match((await state(p)).cls, /\bh-at-day\b/, "‹ oeffnet nicht");
  assert.deepEqual(errs, []);
});

test("Handy (phone390): Tipp und Finger-Wackler unter der Schwelle oeffnen; Finger-Wisch blaettert und oeffnet nicht", async () => {
  await opensLikeGo("phone390", "Tipp", (p) => p.locator(".h-stamp").tap());
  await opensLikeGo("phone390", "Finger-Wackler 6 px", async (p) => { const s = await p.locator(".h-stamp").boundingBox(); await touchDrag(p, s.x + 40, s.y + s.height / 2, 6, 2); });
  const { p, errs } = await sheetPage("phone390");
  const d0 = await p.locator(".h-dnum").textContent(), s = await p.locator(".h-stamp").boundingBox();
  await touchDrag(p, s.x + s.width - 10, s.y + s.height / 2, -160, 8);
  await p.waitForFunction((d) => document.querySelector(".h-dnum").textContent !== d, d0, { timeout: 10000 });
  await p.waitForTimeout(600);
  assert.match((await state(p)).cls, /\bh-at-day\b/, "Finger-Wisch oeffnet nicht");
  assert.deepEqual(errs, []);
});
