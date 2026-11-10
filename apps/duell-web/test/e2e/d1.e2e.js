"use strict";
// Wave D1 (PLAN Durchsicht §2 Nr. 4, 5, 7, 8, 11, 15 and §5) on screen: no raw ids and no {x} gaps, what a riddle keeps is
// what its field shows and what opens it, choices and cells are announced, big type grows the instruction and the tools,
// the ticker holds still, no clock runs before "Los", the finished screen says what arrives, invitations carry a name.
// The port of the review's script dq-tools/stale.js is the first riddle test.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const T = require("../../src/turn.json").text.de;
const { ensureBuilt } = require("../../scripts/ensure-build.js");
ensureBuilt(""); ensureBuilt("business");

const GAP = /\{[a-zA-Z]+\}/;
const RAW = /^(cookie|star|heart|bolt|ring|drop|coin)$/;
const hash = (u) => u.slice(u.indexOf("#"));
// every text a person sees or hears in the editor: visible text, labels, placeholders, the line above the main button
const words = (p) => p.evaluate(() => [document.getElementById("editor").innerText, document.getElementById("edwhy").textContent]
  .concat([...document.querySelectorAll("#editor [aria-label], #editor [placeholder]")].map((e) => (e.getAttribute("aria-label") || "") + " " + (e.getAttribute("placeholder") || ""))).join("\n"));
async function person(b, o) {
  o = o || {};
  const ctx = await G.person(b, { lang: o.lang || "de", view: "phone390" });
  if (o.fs || o.nick) await ctx.addInitScript((x) => { const s = JSON.parse(localStorage.getItem("daily.v1") || "{}"); if (x.fs) s.fs = x.fs; if (x.nick) s.me = Object.assign({}, s.me, { nick: x.nick }); localStorage.setItem("daily.v1", JSON.stringify(s)); }, o);
  return ctx;
}

test("Nr. 4: Reiter Text einer Mitmach-Karte zeigt Formen als Symbole mit deutschem Namen, „Kekse“ nur beim Deal; im Business weder Formen noch Feld", async () => {
  const b = await G.launch(), ctx = await person(b);
  const p = await G.open(ctx, "#i=zug-kennst"); await p.locator("#go").click(); await p.getByRole("tab", { name: "Text" }).click();
  const btn = await p.locator("#panel button").evaluateAll((l) => l.map((x) => [x.textContent.trim(), x.getAttribute("aria-label"), x.getAttribute("aria-pressed")]));
  assert.ok(btn.every((x) => !RAW.test(x[0])), "keine Roh-ID als Knopftext: " + JSON.stringify(btn));
  assert.deepEqual(btn.map((x) => x[1]), T.shp.split("|"), "Symbole mit Namen");
  assert.equal(btn.filter((x) => x[2] === "true").length, 1, "die gewaehlte Form ist gedrueckt");
  assert.equal(await p.getByRole("heading", { name: T.fly }).count(), 1);
  assert.equal(await p.getByLabel("Kekse").count(), 0, "kein Kekse-Feld ausserhalb des Deals");
  await p.getByRole("button", { name: "Stern" }).click(); assert.equal(await p.evaluate(() => window.DailyApp.ed().doc.f), "star");
  const d = await G.open(ctx, "#i=zug-deal"); await d.locator("#go").click(); await d.getByRole("tab", { name: "Text" }).click();
  assert.equal(await d.getByLabel("Kekse").count(), 1, "beim Deal steht das Feld, das der Text nutzt");
  const z = await G.open(ctx, "#i=biz-termin", { flavor: "business" }); await z.locator("#go").click();
  assert.deepEqual(await z.locator("#tabs button").allTextContents(), ["Eintrag", "Text"], "Business: nur Reiter, die das Bild aendern");
  await z.getByRole("tab", { name: "Text" }).click();
  assert.equal(await z.locator("#panel canvas").count(), 0); assert.equal(await z.getByLabel("Kekse").count(), 0);
  // a visible tab changes the picture: the title
  const pic = () => z.evaluate(() => document.getElementById("stage").toDataURL());
  const before = await pic(); await z.locator("#panel input.field").first().fill("Jour fixe"); await z.waitForTimeout(150);
  assert.notEqual(await pic(), before, "Text aendert das Bild");
  assert.equal(await z.locator("#wishgo").isHidden(), true, "kein „Look würfeln“ im Business");
  for (const x of [p, d, z]) assert.deepEqual(x.errs, []);
  await b.close();
});

test("Nr. 4: kein {x}-Platzhalter in Text, Namen oder Hinweis bei allen Mitmach-Karten (erster Schritt), de und en", async () => {
  const b = await G.launch();
  for (const lang of ["de", "en"]) {
    const ctx = await person(b, { lang }), h = await G.open(ctx, "");
    // the shelf and the cards taken off it in the shelf clean-up (2026-11), which old links still open
    const ids = await h.evaluate(() => window.Daily.IDEAS.concat(window.Daily.RETIRED).filter((i) => i.kind === "turn").map((i) => i.id));
    assert.ok(ids.length >= 60);
    for (const id of ids) {
      const p = await G.open(ctx, "#i=" + id);
      await p.locator("#go").click(); await p.locator("#editor").waitFor();
      await p.waitForFunction(() => !document.querySelector("#panel") || !/^…$/.test(document.querySelector("#panel").innerText.trim()));
      await p.waitForTimeout(80);
      const w = await words(p); assert.doesNotMatch(w, GAP, lang + " " + id + ": " + (w.match(new RegExp(".{0,40}" + GAP.source + ".{0,20}")) || [""])[0]);
      assert.deepEqual(p.errs, [], id); await p.close();
    }
    await ctx.close();
  }
  await b.close();
});

test("Nr. 5 (dq-tools/stale.js): gesperrte Antwort – Feld und Entwurf gleich; Bauen → langer Link → Loesen mit der angezeigten Antwort oeffnet das Schloss", async () => {
  const b = await G.launch(), ctx = await person(b, { nick: "Ana" }), p = await G.open(ctx, "#i=kanal-drei");
  await p.locator("#go").click();
  const f = p.locator("#panel input.field").nth(1);
  await f.click(); await p.keyboard.type("Am Bahnhof", { delay: 20 });
  const st = () => p.evaluate(() => ({ field: document.querySelectorAll("#panel input.field")[1].value, draft: window.DailyApp.ed().draft.stops[window.DailyApp.ed().stop || 0].a }));
  assert.equal(await f.getAttribute("aria-invalid"), "true", "gesperrt, noch beim Tippen");
  await p.keyboard.press("Tab");   // leaving the field: it shows what is kept
  let s = await st();
  assert.equal(s.field, s.draft, "Feld = Entwurf: " + JSON.stringify(s)); assert.equal(s.draft, "Am Bahnho");
  await G.poll(() => p.locator("#toast").textContent(), (x) => /Treffpunkt|Nummer|Adresse/.test(x), { what: "Hinweis bei Sperre" });
  await f.fill(""); await f.click(); await p.keyboard.type("12.05.", { delay: 20 }); await p.keyboard.press("Tab");
  s = await st(); assert.equal(s.field, s.draft, "Datum: " + JSON.stringify(s));
  // a word whose first letters are blocked ("Treff") can still be finished: nothing jumps back while typing
  await f.fill(""); await f.click(); await p.keyboard.type("Treffer", { delay: 20 }); await p.keyboard.press("Tab");
  s = await st(); assert.deepEqual(s, { field: "Treffer", draft: "Treffer" });
  // the other two riddles, then the lock
  const shown = [];
  for (const [i, a] of [[0, "Am Bahnhof"], [1, "Pizza Party"], [2, "Oma Gerda"]]) {
    await p.locator("#panel .chips .chip").nth(i).click();
    const x = p.locator("#panel input.field").nth(1); await x.fill(""); await x.click(); await p.keyboard.type(a, { delay: 10 }); await p.keyboard.press("Tab");
    shown.push(await x.inputValue());
  }
  assert.deepEqual(shown, ["Am Bahnho", "Pizza Party", "Oma Gerda"]);
  await p.waitForTimeout(400); await p.locator("#edmain").click(); await p.locator("#share").waitFor();
  const url = await p.evaluate(() => window.DailyDebug.result().url);
  // the receiver
  const ctx2 = await person(b), r = await G.open(ctx2, hash(url));
  await r.locator("#from").filter({ hasText: "Ana hat dir etwas verschlossen." }).waitFor();
  assert.ok((await r.locator("#leaf .teaser").textContent()).trim().length > 0, "Teaser = Unterzeile der Karte");
  await r.locator("#go").click();
  for (let k = 0; k < shown.length; k++) {
    const x = r.getByLabel("Deine Antwort"); await x.fill(shown[k]); await x.press("Enter");   // Enter opens
    if (k === shown.length - 1) break;
    await r.locator("#shbody .lbl", { hasText: "Schloss " + (k + 2) + " von 3" }).waitFor();
    assert.equal(await r.evaluate(() => document.activeElement.getAttribute("aria-label")), "Deine Antwort", "der Fokus bleibt im Feld");
  }
  await r.locator(".qlock", { hasText: "🎉" }).waitFor();
  assert.deepEqual(p.errs.concat(r.errs), []);
  await b.close();
});

test("Nr. 7: Loese-Dialog – Enter, Fokus bleibt, „Falsch“ wird vorgelesen", async () => {
  const b = await G.launch(), ctx = await person(b, { nick: "Ana" }), p = await G.open(ctx, "#i=kanal-geheim");
  await p.locator("#go").click();
  const n = await p.evaluate(() => window.DailyApp.ed().draft.stops.length);
  for (let i = 0; i < n; i++) { if (n > 1) await p.locator("#panel .chips .chip").nth(i).click(); await p.locator("#panel input.field").nth(1).fill("Bello" + i); }
  await p.waitForTimeout(400); await p.locator("#edmain").click(); await p.locator("#share").waitFor();
  const r = await G.open(await person(b), hash(await p.evaluate(() => window.DailyDebug.result().url)));
  await r.locator("#go").click();
  const x = r.getByLabel("Deine Antwort"); await x.fill("falsch"); await x.press("Enter");
  await G.poll(() => r.locator("#sr").textContent(), (s) => s === "Falsch. Schloss bleibt zu.", { what: "Falsch vorgelesen" });
  assert.equal(await r.evaluate(() => document.activeElement.getAttribute("aria-label")), "Deine Antwort", "der Fokus bleibt im Feld");
  assert.equal(await r.locator("#shbody [role=status]", { hasText: "Falsch" }).count(), 1);
  await x.fill("Bello0"); await x.press("Enter");
  await G.poll(() => r.evaluate(() => (document.activeElement && document.activeElement.getAttribute("aria-label")) || (document.querySelector(".qlock") || {}).textContent), (s) => s === "Deine Antwort" || s === "🎉", { what: "weiter im Feld" });
  assert.deepEqual(r.errs, []); await b.close();
});

test("Nr. 7: Auswahl-Chips und Socken-Zellen sagen ihren Zustand, die Arbeitsanweisung ist eine h3", async () => {
  const b = await G.launch(), ctx = await person(b), p = await G.open(ctx, "#i=zug-lob");
  await p.locator("#go").click();
  assert.ok(await p.locator("#panel h3.lbl").count() >= 1, "Arbeitsanweisung als h3");
  const c = p.locator("#panel .chips .chip").first();
  assert.equal(await c.getAttribute("aria-pressed"), "false"); await c.click(); assert.equal(await c.getAttribute("aria-pressed"), "true");
  assert.match(await c.evaluate((e) => getComputedStyle(e, "::before").content), /✓/, "Haken fuer Sehschwache");
  assert.doesNotMatch(await c.evaluate((e) => e.textContent), /✓/, "der Haken steht nicht im Namen");
  const s = await G.open(ctx, "#i=zug-socken"); await s.locator("#go").click();
  const cells = s.locator("#panel .bcell");
  assert.equal(await cells.nth(0).getAttribute("aria-label"), "Reihe A, Spalte 1"); assert.equal(await cells.nth(7).getAttribute("aria-label"), "Reihe B, Spalte 3");
  await cells.nth(7).click(); assert.equal(await cells.nth(7).getAttribute("aria-pressed"), "true");
  assert.deepEqual(p.errs.concat(s.errs), []); await b.close();
});

test("Nr. 7: bei „Sehr groß“ wachsen Arbeitsanweisung und #tools (≥ 20 px), das Laufband laeuft nicht", async () => {
  const b = await G.launch(), ctx = await person(b, { fs: "sg" }), p = await G.open(ctx, "");
  const tools = await p.evaluate(() => [...document.querySelectorAll("#tools button")].filter((x) => x.offsetParent).map((x) => parseFloat(getComputedStyle(x).fontSize)));
  assert.ok(tools.length && tools.every((x) => x >= 20), "#tools " + tools);
  await p.waitForTimeout(3600);
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#feat .track")).animationName), "none", "kein Laufband bei grosser Schrift");
  await G.alle(p); await p.locator("#feat .lane button:not([aria-hidden])").nth(1).click({ timeout: 3000 });   // a plain click hits, no pause switch needed
  const e = await G.open(ctx, "#i=zug-lob"); await e.locator("#go").click();
  const lbl = await e.locator("#panel .lbl").first().evaluate((x) => parseFloat(getComputedStyle(x).fontSize));
  assert.ok(lbl >= 20, ".lbl " + lbl);
  assert.deepEqual(p.errs.concat(e.errs), []); await b.close();
});

test("Nr. 7: Laufband steht bei reduzierter Bewegung und nach dem ersten Tippen; ein Klick auf einen Chip gelingt ohne ⏸", async () => {
  const b = await G.launch();
  for (const how of ["reduce", "tap"]) {
    const ctx = await person(b), p = await G.open(ctx, "");
    if (how === "reduce") await p.emulateMedia({ reducedMotion: "reduce" }); else await p.locator("#brand").click();
    await p.waitForTimeout(3600);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#feat .track")).animationName), "none", how);
    await G.alle(p); await p.locator("#feat .lane button:not([aria-hidden])", { hasText: "Karte" }).click({ timeout: 3000 }); await p.locator("#editor").waitFor();
    assert.deepEqual(p.errs, []); await ctx.close();
  }
  await b.close();
});

test("Nr. 8: keine Uhr ohne „Los“ (10 s nach dem Oeffnen), Karte eingeklappt, Rein/Raus im Bild, Stimmaufnahme mit 3-2-1 und Stopp", async () => {
  const b = await G.launch(), ctx = await person(b);
  for (const id of ["raum-erklaeren", "raum-uhr", "zug-pokal", "zug-reaktion", "raum-tuer"]) {
    const p = await G.open(ctx, "#i=" + id); await p.clock.install(); await p.locator("#go").click();
    await p.getByRole("button", { name: T.rdy_go }).waitFor();
    const at = await p.locator("#panel").innerText();
    await p.clock.runFor(10000);
    assert.equal(await p.locator("#panel").innerText(), at, id + ": nichts laeuft vor dem Tipp");
    if (id === "raum-tuer") {
      assert.equal(await p.locator("#stagewrap").isHidden(), true, "Kartenbild eingeklappt");
      await p.getByRole("button", { name: T.rdy_go }).click(); await p.clock.runFor(2200);
      await p.locator(".bface").waitFor();
      assert.ok(await G.inView(p, ".doorin") && await G.inView(p, ".doorout"), "Rein/Raus bei 390x844 im Bild");
    }
    assert.deepEqual(p.errs, []); await p.close();
  }
  // a voice card: 3-2-1 read out, then a ring and Stop; a tap on Stop ends early
  const v = await G.open(ctx, "#i=stimme-monster");
  await v.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    window.MediaRecorder = class { constructor() { this.state = "inactive"; } start() { this.state = "recording"; } stop() { this.state = "inactive"; this.ondataavailable && this.ondataavailable({ data: new Blob() }); this.onstop && this.onstop(); } };
  });
  await v.locator("#go").click(); await v.getByRole("tab", { name: "Stimme" }).click();
  const rec = v.getByRole("button", { name: /Aufnehmen/ }); await rec.click();
  await G.poll(() => v.locator("#sr").textContent(), (s) => s === "3" || s === "2", { what: "3-2-1 vorgelesen" });
  await v.locator("#panel .ring").waitFor({ timeout: 5000 });
  assert.match(await v.locator("#panel .ring").textContent(), /Stopp/);
  await v.locator("#panel .ring").click(); await v.locator("#panel .ring").waitFor({ state: "detached" });
  await b.close();
});

test("Nr. 8: Bauernskat gegen den Bot ohne Auto-Countdown", async () => {
  const b = await G.launch(), ctx = await person(b), p = await G.open(ctx, "");
  await G.alle(p); await p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await p.getByRole("button", { name: "🃏 Bauernskat (2)" }).click();
  await p.getByRole("button", { name: "🤖 Gegen den Bot" }).click();
  await G.poll(() => p.locator("body").innerText(), (s) => /Du bist dran/.test(s), { what: "ich bin dran", timeout: 30000 });
  await p.waitForTimeout(2500);
  assert.doesNotMatch(await p.locator("body").innerText(), /Auto in \d+ s/);
  assert.deepEqual(p.errs, []); await b.close();
});

test("Nr. 11: Fertig – Teilen behaelt seinen Namen, Status/Story unter „Mehr“, Foto-Zeile; Business ohne 90 Tage und ohne Status", async () => {
  const b = await G.launch(), ctx = await person(b), p = await G.open(ctx, "#i=foto-alien");
  await p.locator("#go").click(); await p.locator("#edmain").click(); await p.locator("#share").waitFor();
  assert.equal(await p.locator("#tostatus").isVisible(), false, "Status unter Mehr");
  await p.locator("#dmore").click(); assert.equal(await p.locator("#tostatus").isVisible(), true);
  assert.match(await p.locator("#shnote").textContent(), /Dein Foto bleibt hier/);
  await p.locator("#share").click();
  await p.waitForFunction(() => window.DailyDebug.result().link);
  assert.equal(await p.locator("#share").textContent(), "Teilen", "gleiche Beschriftung in beiden Schritten");
  const z = await G.open(ctx, "#i=biz-termin", { flavor: "business" }); await z.locator("#go").click();
  await z.evaluate(() => window.DailyApp.finish(window.DailyApp.ed().doc)); await z.locator("#share").waitFor();
  const done = await z.locator("#done").innerText();
  assert.doesNotMatch(done, /90 Tage|Status|Story/); assert.equal(await z.locator("#dmore").isVisible(), false);
  assert.deepEqual(p.errs.concat(z.errs), []); await b.close();
});

test("Nr. 15: Abzeichen aus der Spielart; Duell-Einladung und Gegner mit Spitzname, ohne ihn „Ein Freund“", async () => {
  const b = await G.launch(), ctx = await person(b);
  // "Gegen Bot" had only raum-pommes, struck with the shelf clean-up (2026-11)
  for (const [id, want] of [["raum-uhr", "Allein"], ["beat-disco", "Ein Handy, reihum"], ["zug-deal", "Per Link"]]) {
    const p = await G.open(ctx, "#i=" + id); assert.match(await p.locator("#dkind").textContent(), new RegExp("^" + want)); await p.close();
  }
  for (const [nick, who] of [["Ana", "Ana"], ["", "Ein Freund"]]) {
    const s = await G.open(await person(b, { nick }), "#i=duell-ssp");
    await s.locator("#go").click(); await s.locator("#edmain").click();
    await s.waitForFunction(() => window.DailyApp.ed().x && window.DailyApp.ed().x.done, null, { timeout: 30000 });
    await s.locator("#edmain").click(); await s.locator("#share").waitFor();
    const r = await G.open(await person(b), hash(await s.evaluate(() => window.DailyDebug.result().url)));
    await r.locator("#from").filter({ hasText: who + " fordert deinen Agenten heraus." }).waitFor();
    await r.locator("#go").click(); await r.locator("#editor").waitFor();
    assert.equal(await r.evaluate(() => window.DailyApp.ed().doc.b.n), who, "Gegner heisst " + who);
    assert.deepEqual(s.errs.concat(r.errs), []);
  }
  await b.close();
});

test("Nr. 5 auf dem natuerlichen Weg: „Am Bahnhof“ und gleich „Abschließen“ (Touch, Maus, click() ohne Tab) versiegelt nichts, der Grund nennt das Feld", async () => {
  const b = await G.launch();
  for (const how of ["tap", "mouse", "click"]) {
    const ctx = await person(b), p = await G.open(ctx, "#i=kanal-drei"); await p.locator("#go").click();
    for (const [i, a] of [[1, "Pizza Party"], [2, "Oma Gerda"]]) { await p.locator("#panel .chips .chip").nth(i).click(); const x = p.locator("#panel input.field").nth(1); await x.fill(""); await x.click(); await p.keyboard.type(a, { delay: 5 }); await p.keyboard.press("Tab"); }
    await p.locator("#panel .chips .chip").nth(0).click();
    const f = p.locator("#panel input.field").nth(1); await f.click(); await p.keyboard.type("Am Bahnhof", { delay: 10 });
    const m = p.locator("#edmain");
    assert.equal(await m.getAttribute("aria-disabled"), "true", how + ": gesperrt, solange das Feld markiert ist");
    assert.match(await p.locator("#edwhy").textContent(), /^Noch offen: Antwort/, how);
    if (how === "tap") await m.tap({ force: true }); else if (how === "mouse") await m.click({ force: true }); else await m.evaluate((e) => e.click());
    await p.waitForTimeout(600);
    assert.equal(await p.locator("#share").isVisible(), false, how + ": nichts versiegelt");
    assert.equal(await p.evaluate(() => window.DailyDebug.result()), null, how);
    const s = await p.evaluate(() => ({ field: document.querySelectorAll("#panel input.field")[1].value, draft: window.DailyApp.ed().draft.stops[0].a }));
    if (how !== "click") assert.deepEqual(s, { field: "Am Bahnho", draft: "Am Bahnho" }, how + ": das Feld zeigt, was gilt");
    // seen again (the nudge put the focus there): now it may go out, as shown
    await f.press("Tab"); await f.focus(); await p.waitForTimeout(100);
    assert.equal(await m.getAttribute("aria-disabled"), "false", how + ": wieder frei, sobald das Feld gesehen wurde");
    await p.waitForTimeout(300); await m.click(); await p.locator("#share").waitFor();
    assert.match(await p.evaluate(() => window.DailyDebug.result().url), /#c=/);
    assert.deepEqual(p.errs, []); await ctx.close();
  }
  await b.close();
});

test("IME: das zuletzt zusammengesetzte Wort wird gespeichert (compositionend)", async () => {
  const b = await G.launch(), ctx = await person(b), p = await G.open(ctx, "#i=zug-kennst");
  await p.locator("#go").click(); await p.getByRole("tab", { name: "Text" }).click();
  const f = p.locator("#panel input.field").first(); await f.click(); await f.fill("Gute"); await p.keyboard.press("End");
  const s = await p.context().newCDPSession(p);
  await s.send("Input.imeSetComposition", { text: " Nacht", selectionStart: 6, selectionEnd: 6 });
  await s.send("Input.insertText", { text: " Nacht" });
  await p.waitForTimeout(200);
  assert.deepEqual(await p.evaluate(() => [document.querySelector("#panel input.field").value, window.DailyApp.ed().doc.t]), ["Gute Nacht", "Gute Nacht"]);
  assert.deepEqual(p.errs, []); await b.close();
});

test("Teil fehlt: Hauptknopf gesperrt mit Grund, „Nochmal versuchen“ laedt ihn; Fokus bleibt nach Enter auf einer Form", async () => {
  const b = await G.launch(), ctx = await G.person(b, { lang: "de", view: "phone390", web: true });
  let block = true; await ctx.route(/\/parts\/turnzwei\./, (r) => (block ? r.abort() : r.continue()));
  const p = await G.open(ctx, "#i=raum-tuer"); await p.locator("#go").click();
  await p.getByRole("button", { name: "Nochmal versuchen" }).waitFor();
  assert.equal(await p.locator("#edmain").getAttribute("aria-disabled"), "true");
  assert.match(await p.locator("#edwhy").textContent(), /Teil fehlt/);
  block = false; await p.getByRole("button", { name: "Nochmal versuchen" }).click();
  await p.getByRole("button", { name: T.rdy_go }).waitFor();
  await p.getByRole("tab", { name: "Text" }).click();
  await p.getByRole("button", { name: "Stern" }).focus(); await p.keyboard.press("Enter");
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute("aria-label")), "Stern", "der Fokus bleibt auf der Form");
  await b.close();
});
